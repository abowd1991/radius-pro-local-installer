/**
 * Security Monitor Router
 * Provides security statistics from radpostauth and firewall (ipset)
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users } from "../../drizzle/schema";
import { notifyOwnerEvent } from "../services/notificationService";

// Only owner/super_admin can access security data
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "owner" && ctx.user.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Only owner can perform critical actions
const ownerOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can perform this action" });
  }
  return next({ ctx });
});

export const securityRouter = router({
  // Get attack statistics from radpostauth (last 30 days)
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    try {
      // Overall stats last 30 days
      const overall = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN reply = 'Access-Accept' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN reply = 'Access-Reject' THEN 1 ELSE 0 END) as rejected
        FROM radpostauth
        WHERE authdate >= NOW() - INTERVAL 30 DAY
      `);

      // Top attacked usernames (not in radcheck = bots)
      const topAttacked = await db.execute(sql`
        SELECT 
          p.username,
          COUNT(*) as attempts,
          MAX(p.authdate) as lastAttempt
        FROM radpostauth p
        WHERE p.reply = 'Access-Reject'
          AND p.authdate >= NOW() - INTERVAL 7 DAY
          AND p.username NOT IN (SELECT DISTINCT username FROM radcheck)
        GROUP BY p.username
        ORDER BY attempts DESC
        LIMIT 10
      `);

      // Hourly distribution (last 24h)
      const hourlyDist = await db.execute(sql`
        SELECT 
          HOUR(authdate) as hour,
          SUM(CASE WHEN reply = 'Access-Accept' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN reply = 'Access-Reject' THEN 1 ELSE 0 END) as rejected
        FROM radpostauth
        WHERE authdate >= NOW() - INTERVAL 24 HOUR
        GROUP BY HOUR(authdate)
        ORDER BY hour
      `);

      // Daily trend (last 7 days)
      const dailyTrend = await db.execute(sql`
        SELECT 
          DATE(authdate) as day,
          SUM(CASE WHEN reply = 'Access-Accept' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN reply = 'Access-Reject' THEN 1 ELSE 0 END) as rejected
        FROM radpostauth
        WHERE authdate >= NOW() - INTERVAL 7 DAY
        GROUP BY DATE(authdate)
        ORDER BY day
      `);

      // Real users with failed logins (wrong password)
      const realUserFails = await db.execute(sql`
        SELECT 
          p.username,
          COUNT(*) as failCount,
          MAX(p.authdate) as lastAttempt
        FROM radpostauth p
        WHERE p.reply = 'Access-Reject'
          AND p.authdate >= NOW() - INTERVAL 7 DAY
          AND p.username IN (SELECT DISTINCT username FROM radcheck)
        GROUP BY p.username
        ORDER BY failCount DESC
        LIMIT 10
      `);

      // TiDB/MySQL2 returns [rows, fields] from db.execute
      const overallRows = ((overall as any)[0] as any[]) || (overall as any[]);
      const topAttackedRows = ((topAttacked as any)[0] as any[]) || (topAttacked as any[]);
      const hourlyDistRows = ((hourlyDist as any)[0] as any[]) || (hourlyDist as any[]);
      const dailyTrendRows = ((dailyTrend as any)[0] as any[]) || (dailyTrend as any[]);
      const realUserFailsRows = ((realUserFails as any)[0] as any[]) || (realUserFails as any[]);

      const stats = overallRows[0] || {};
      const total = Number(stats.total) || 0;
      const accepted = Number(stats.accepted) || 0;
      const rejected = Number(stats.rejected) || 0;

      return {
        summary: {
          total,
          accepted,
          rejected,
          acceptRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
          rejectRate: total > 0 ? Math.round((rejected / total) * 100) : 0,
        },
        topAttacked: topAttackedRows.map((r: any) => ({
          username: r.username,
          attempts: Number(r.attempts),
          lastAttempt: r.lastAttempt,
        })),
        hourlyDist: hourlyDistRows.map((r: any) => ({
          hour: Number(r.hour),
          accepted: Number(r.accepted),
          rejected: Number(r.rejected),
        })),
        dailyTrend: dailyTrendRows.map((r: any) => ({
          day: r.day,
          accepted: Number(r.accepted),
          rejected: Number(r.rejected),
        })),
        realUserFails: realUserFailsRows.map((r: any) => ({
          username: r.username,
          failCount: Number(r.failCount),
          lastAttempt: r.lastAttempt,
        })),
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch security stats",
      });
    }
  }),

  // Get NAS IPs from radhuntgroup
  getAllowedIPs: adminProcedure.query(async () => {
    const db = await getDb();
    try {
      const nasIPs = await db.execute(sql`
        SELECT DISTINCT 
          h.nasipaddress as ip,
          h.groupname,
          n.nasname as name,
          n.description
        FROM radhuntgroup h
        LEFT JOIN nas n ON n.nasname = h.nasipaddress
        ORDER BY h.nasipaddress
      `);

      const nasIPRows = ((nasIPs as any)[0] as any[]) || (nasIPs as any[]);
      return {
        nasIPs: nasIPRows.map((r: any) => ({
          ip: r.ip,
          groupname: r.groupname,
          name: r.name || r.ip,
          description: r.description || "",
        })),
        internalNetworks: ["192.168.30.0/24", "192.168.31.0/24"],
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch allowed IPs",
      });
    }
  }),

  // Check if there's an ongoing attack and send Telegram alert
  checkAttackAlert: adminProcedure.mutation(async () => {
    const db = await getDb();
    try {
      // Count rejects in last 1 hour
      const rejectStats = await db.execute(sql`
        SELECT 
          COUNT(*) as totalRejects,
          COUNT(DISTINCT username) as uniqueUsernames
        FROM radpostauth
        WHERE reply = 'Access-Reject'
          AND authdate >= NOW() - INTERVAL 1 HOUR
          AND username NOT IN (SELECT DISTINCT username FROM radcheck)
      `);

      const rejectRows = ((rejectStats as any)[0] as any[]) || (rejectStats as any[]);
      const stats = rejectRows[0] || {};
      const totalRejects = Number(stats.totalRejects) || 0;
      const uniqueUsernames = Number(stats.uniqueUsernames) || 0;

      const ATTACK_THRESHOLD = 100; // More than 100 bot rejects per hour = attack

      if (totalRejects < ATTACK_THRESHOLD) {
        return {
          attackDetected: false,
          totalRejects,
          uniqueUsernames,
          message: `No attack detected (${totalRejects} bot rejects in last hour)`,
        };
      }

      // Attack detected — notify owner only (not super_admin)
      const ownerRows = await db.execute(sql`
        SELECT id FROM users WHERE role = 'owner'
      `);

      const ownerIds = (ownerRows as any[]).map((r: any) => Number(r.id));

      const alertPayload = {
        title: `🚨 هجوم مكثف على RADIUS`,
        message: `تم رصد ${totalRejects.toLocaleString()} محاولة دخول مرفوضة من ${uniqueUsernames} username مختلف في آخر ساعة.\n\nيُنصح بمراجعة لوحة مراقبة الأمان.`,
        emoji: '🚨',
      };

      let notifiedCount = 0;
      for (const ownerId of ownerIds) {
        try {
          await notifyOwnerEvent(ownerId, 'ownerRouterDown', alertPayload);
          notifiedCount++;
        } catch {
          // ignore per-owner errors
        }
      }

      return {
        attackDetected: true,
        totalRejects,
        uniqueUsernames,
        notifiedOwners: notifiedCount,
        message: `Attack detected! ${totalRejects} bot rejects in last hour. Notified ${notifiedCount} owner(s).`,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to check attack alert",
      });
    }
  }),

  // Refresh ipset on VPS via SSH (owner only)
  refreshIpset: ownerOnlyProcedure.mutation(async () => {
    try {
      const { Client: SshClient } = await import("ssh2");
      const { ENV } = await import("../_core/env");

      const result = await new Promise<{ success: boolean; output: string; error?: string }>(
        (resolve) => {
          const conn = new SshClient();
          let stdout = "";
          let stderr = "";

          const timeout = setTimeout(() => {
            conn.destroy();
            resolve({ success: false, output: "", error: "SSH connection timeout (20s)" });
          }, 20000);

          conn.on("ready", () => {
            // Run the ipset update script or inline command
            const cmd = [
              // Flush and rebuild ipset from nas table in FreeRADIUS DB
              `ipset flush allowed_nas 2>/dev/null || true`,
              // Re-add all NAS IPs from the nas table
              `mysql -u freeradius -pfreeradius_pass freeradius -N -e "SELECT nasname FROM nas WHERE is_active=1" 2>/dev/null | while read ip; do ipset add allowed_nas \"$ip\" 2>/dev/null || true; done`,
              // Also run the update script if it exists
              `[ -f /root/update_ipset.sh ] && bash /root/update_ipset.sh 2>&1 || echo 'no script'`,
              `echo DONE`,
            ].join(" && ");

            conn.exec(cmd, (err: any, stream: any) => {
              if (err) {
                clearTimeout(timeout);
                conn.end();
                resolve({ success: false, output: "", error: err.message });
                return;
              }
              stream.on("close", () => {
                clearTimeout(timeout);
                conn.end();
                const success = stdout.includes("DONE");
                resolve({ success, output: stdout.trim(), error: stderr.trim() || undefined });
              });
              stream.on("data", (data: Buffer) => { stdout += data.toString(); });
              stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
            });
          });

          conn.on("error", (err: any) => {
            clearTimeout(timeout);
            resolve({ success: false, output: "", error: err.message });
          });

          conn.connect({
            host: ENV.VPS_SSH_HOST,
            port: parseInt(ENV.VPS_SSH_PORT || "1991", 10),
            username: ENV.VPS_SSH_USER,
            password: ENV.VPS_SSH_PASS,
            readyTimeout: 15000,
            hostVerifier: () => true,
          });
        }
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "ipset refresh failed",
        });
      }

      return {
        success: true,
        output: result.output,
        message: "ipset updated successfully on VPS",
      };
    } catch (error: any) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to refresh ipset",
      });
    }
  }),

  // Get radpostauth and radacct table size info
  getTableInfo: adminProcedure.query(async () => {
    const db = await getDb();
    try {
      const sizeInfo = await db.execute(sql`
        SELECT 
          COUNT(*) as rowCount,
          MIN(authdate) as oldest,
          MAX(authdate) as newest
        FROM radpostauth
      `);

      const radacctInfo = await db.execute(sql`
        SELECT 
          COUNT(*) as rowCount,
          MIN(acctstarttime) as oldest,
          MAX(acctstarttime) as newest
        FROM radacct
      `);

      // Phase 2C: active sessions count from online_sessions (realtime source)
      const activeInfo = await db.execute(sql`SELECT COUNT(*) as activeSessions FROM online_sessions`);

      const sizeRows = ((sizeInfo as any)[0] as any[]) || (sizeInfo as any[]);
      const acctRows = ((radacctInfo as any)[0] as any[]) || (radacctInfo as any[]);
      const activeRows = ((activeInfo as any)[0] as any[]) || (activeInfo as any[]);
      return {
        radpostauth: {
          rowCount: Number(sizeRows[0]?.rowCount) || 0,
          oldest: sizeRows[0]?.oldest,
          newest: sizeRows[0]?.newest,
        },
        radacct: {
          rowCount: Number(acctRows[0]?.rowCount) || 0,
          oldest: acctRows[0]?.oldest,
          newest: acctRows[0]?.newest,
          activeSessions: Number(activeRows[0]?.activeSessions) || 0,
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch table info",
      });
    }
  }),
});
