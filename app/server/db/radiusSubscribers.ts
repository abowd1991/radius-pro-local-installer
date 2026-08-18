import { eq, and, or, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { subscribers, plans, nasDevices, radcheck, radreply, radusergroup, radgroupcheck, radhuntgroup, radacct, radiusCards, onlineSessions } from "../../drizzle/schema";
import { formatFreeRadiusExpiration } from "../core/FreeRadiusTime";

// Create RADIUS entries for a PPPoE subscriber
export async function createSubscriberRadiusEntries(
  username: string,
  password: string,
  planId: number,
  subscriptionEndDate: Date,
  options: {
    simultaneousUse?: number;
    staticIp?: string;
    subscriberGroup?: string;
    createdBy?: number;  // Owner ID for NAS isolation
  } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get plan details
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new Error("Plan not found");

  // Delete existing entries for this username (if any)
  await db.delete(radcheck).where(eq(radcheck.username, username));
  await db.delete(radreply).where(eq(radreply.username, username));
  await db.delete(radusergroup).where(eq(radusergroup.username, username));

  // Insert Cleartext-Password
  await db.insert(radcheck).values({
    username,
    attribute: 'Cleartext-Password',
    op: ':=',
    value: password,
  });

  // Insert Expiration
  const expirationStr = formatFreeRadiusExpiration(subscriptionEndDate);
  await db.insert(radcheck).values({
    username,
    attribute: 'Expiration',
    op: ':=',
    value: expirationStr,
  });

  // Insert Auth-Type
  await db.insert(radcheck).values({
    username,
    attribute: 'Auth-Type',
    op: ':=',
    value: 'Accept',
  });

  // Insert Simultaneous-Use
  const simultaneousUse = options.simultaneousUse || plan.simultaneousUse || 1;
  await db.insert(radcheck).values({
    username,
    attribute: 'Simultaneous-Use',
    op: ':=',
    value: simultaneousUse.toString(),
  });

  // Insert radreply values
  const radreplyValues = [];

  // MikroTik Rate-Limit (download/upload)
  if (plan.mikrotikRateLimit) {
    radreplyValues.push({
      username,
      attribute: 'Mikrotik-Rate-Limit',
      op: '=',
      value: plan.mikrotikRateLimit,
    });
  } else if (plan.downloadSpeed || plan.uploadSpeed) {
    // Speed is already stored in Kbps in the plans table
    const download = plan.downloadSpeed ? `${plan.downloadSpeed}k` : '0';
    const upload = plan.uploadSpeed ? `${plan.uploadSpeed}k` : '0';
    radreplyValues.push({
      username,
      attribute: 'Mikrotik-Rate-Limit',
      op: '=',
      value: `${upload}/${download}`,
    });
  }

  // Framed-Pool (IP Pool)
  if (plan.mikrotikAddressPool) {
    radreplyValues.push({
      username,
      attribute: 'Framed-Pool',
      op: '=',
      value: plan.mikrotikAddressPool,
    });
  }

  // Static IP (Framed-IP-Address)
  if (options.staticIp) {
    radreplyValues.push({
      username,
      attribute: 'Framed-IP-Address',
      op: '=',
      value: options.staticIp,
    });
  }

  // Port-Limit: overrides MikroTik Hotspot's local "Shared Users" restriction
  // MikroTik respects Port-Limit from RADIUS over its own Shared Users setting
  radreplyValues.push({
    username,
    attribute: 'Port-Limit',
    op: ':=',
    value: simultaneousUse.toString(),
  });

  // Insert all radreply values
  if (radreplyValues.length > 0) {
    await db.insert(radreply).values(radreplyValues);
  }

  // Insert Framed-Protocol in radcheck ONLY (PPPoE lock - prevents Hotspot cards from using PPPoE)
  // Must be in radcheck with := operator so FreeRADIUS enforces it during authentication
  await db.insert(radcheck).values({
    username,
    attribute: 'Framed-Protocol',
    op: ':=',
    value: 'PPP',
  });

  // Insert into radusergroup
  // - مشترك على باقة مقيدة على NAS محدد → HG_plan_X (مجموعة واحدة فقط)
  // - مشترك عادي → owner_X
  const { sql: sqlTag } = await import('drizzle-orm');

  // فحص NAS restriction للباقة
  let planNasIds: number[] = [];
  if (plan.restrictedNasIds) {
    try { planNasIds = JSON.parse(plan.restrictedNasIds as string); } catch { planNasIds = []; }
  } else if (plan.restrictedNasId) {
    planNasIds = [plan.restrictedNasId];
  }

  if (planNasIds.length > 0) {
    // باقة مقيدة: استخدم HG_plan_X كمجموعة وحيدة
    const huntGroupName = `HG_plan_${planId}`;
    // 1. أضف المشترك إلى HG_plan_X في radusergroup
    await db.execute(
      sqlTag`INSERT INTO radusergroup (username, groupname, priority)
             VALUES (${username}, ${huntGroupName}, 1)
             ON DUPLICATE KEY UPDATE groupname = ${huntGroupName}`
    );
    // 2. مصدر واحد للشرط: INSERT IGNORE لا يمنع التكرار من دون فهرس فريد.
    await db.execute(sqlTag`DELETE FROM radgroupcheck
      WHERE groupname = ${huntGroupName} AND attribute = 'Huntgroup-Name'`);
    await db.execute(sqlTag`INSERT INTO radgroupcheck (groupname, attribute, op, value)
      VALUES (${huntGroupName}, 'Huntgroup-Name', '==', ${huntGroupName})`);
    // 3. تأكد من وجود radhuntgroup لكل NAS في القائمة
    const huntGroupNasIps = await db.select({ nasname: nasDevices.nasname })
      .from(nasDevices)
      .where(inArray(nasDevices.id, planNasIds));
    for (const nas of huntGroupNasIps) {
      if (nas.nasname) {
        await db.execute(
          sqlTag`INSERT IGNORE INTO radhuntgroup (nasipaddress, nasportid, groupname)
                 VALUES (${nas.nasname}, NULL, ${huntGroupName})`
        );
      }
    }
    console.log(`[RadiusSubscribers] Subscriber ${username} → restricted group ${huntGroupName} (plan ${planId})`);
  } else {
    // باقة عادية: استخدم owner_X
    const groupName = options.createdBy
      ? `owner_${options.createdBy}`
      : (options.subscriberGroup || 'pppoe-subscribers');
    await db.execute(
      sqlTag`INSERT IGNORE INTO radusergroup (username, groupname, priority) VALUES (${username}, ${groupName}, 1)`
    );
    console.log(`[RadiusSubscribers] Subscriber ${username} → owner group ${groupName}`);
  }

  return { success: true };
}

// Update RADIUS entries for a subscriber (e.g., after renewal or plan change)
export async function updateSubscriberRadiusEntries(
  username: string,
  subscriptionEndDate: Date,
  planId?: number,
  options: {
    simultaneousUse?: number;
    staticIp?: string;
    password?: string;
  } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update Expiration
  const expirationStr = formatFreeRadiusExpiration(subscriptionEndDate);
  await db.update(radcheck)
    .set({ value: expirationStr })
    .where(and(
      eq(radcheck.username, username),
      eq(radcheck.attribute, 'Expiration')
    ));

  // Update password if provided
  if (options.password) {
    await db.update(radcheck)
      .set({ value: options.password })
      .where(and(
        eq(radcheck.username, username),
        eq(radcheck.attribute, 'Cleartext-Password')
      ));
  }

  // Update plan-related attributes if planId is provided
  if (planId) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (plan) {
      // Update rate limit
      let rateLimit: string;
      if (plan.mikrotikRateLimit) {
        rateLimit = plan.mikrotikRateLimit;
      } else if (plan.downloadSpeed || plan.uploadSpeed) {
        const download = plan.downloadSpeed ? `${plan.downloadSpeed * 1000}k` : '0';
        const upload = plan.uploadSpeed ? `${plan.uploadSpeed * 1000}k` : '0';
        rateLimit = `${upload}/${download}`;
      } else {
        rateLimit = '0/0';
      }

      // Check if rate limit exists, update or insert
      const [existingRateLimit] = await db.select()
        .from(radreply)
        .where(and(
          eq(radreply.username, username),
          eq(radreply.attribute, 'Mikrotik-Rate-Limit')
        ))
        .limit(1);

      if (existingRateLimit) {
        await db.update(radreply)
          .set({ value: rateLimit })
          .where(and(
            eq(radreply.username, username),
            eq(radreply.attribute, 'Mikrotik-Rate-Limit')
          ));
      } else {
        await db.insert(radreply).values({
          username,
          attribute: 'Mikrotik-Rate-Limit',
          op: '=',
          value: rateLimit,
        });
      }
    }
  }

  // Update static IP if provided
  if (options.staticIp) {
    const [existingIp] = await db.select()
      .from(radreply)
      .where(and(
        eq(radreply.username, username),
        eq(radreply.attribute, 'Framed-IP-Address')
      ))
      .limit(1);

    if (existingIp) {
      await db.update(radreply)
        .set({ value: options.staticIp })
        .where(and(
          eq(radreply.username, username),
          eq(radreply.attribute, 'Framed-IP-Address')
        ));
    } else {
      await db.insert(radreply).values({
        username,
        attribute: 'Framed-IP-Address',
        op: '=',
        value: options.staticIp,
      });
    }
  }

  // Update Simultaneous-Use if provided
  if (options.simultaneousUse !== undefined && options.simultaneousUse >= 1) {
    const { sql: sqlTagSim } = await import('drizzle-orm');
    await db.execute(
      sqlTagSim`INSERT INTO radcheck (username, attribute, op, value)
             VALUES (${username}, 'Simultaneous-Use', ':=', ${String(options.simultaneousUse)})
             ON DUPLICATE KEY UPDATE value = ${String(options.simultaneousUse)}`
    );
  }

  // Ensure Framed-Protocol := PPP always exists in radcheck (PPPoE lock)
  // This guarantees PPPoE-only access even after renewal or plan change
  const { sql: sqlTag } = await import('drizzle-orm');
  await db.execute(
    sqlTag`INSERT INTO radcheck (username, attribute, op, value)
           VALUES (${username}, 'Framed-Protocol', ':=', 'PPP')
           ON DUPLICATE KEY UPDATE value = 'PPP'`
  );

  return { success: true };
}

// Delete only current credentials for a subscriber. Accounting history and an
// existing V2 live-session record must never be erased by an administrative delete.
export async function deleteSubscriberRadiusEntries(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Keep radacct / radpostauth / online_sessions for audit and SessionEngine cleanup.
  await Promise.all([
    db.delete(radcheck).where(eq(radcheck.username, username)),
    db.delete(radreply).where(eq(radreply.username, username)),
    db.delete(radusergroup).where(eq(radusergroup.username, username)),
  ]);

  return { success: true };
}

// Suspend subscriber (set Auth-Type to Reject)
export async function suspendSubscriberRadius(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update Auth-Type to Reject
  await db.update(radcheck)
    .set({ value: 'Reject' })
    .where(and(
      eq(radcheck.username, username),
      eq(radcheck.attribute, 'Auth-Type')
    ));

  return { success: true };
}

// Activate subscriber (set Auth-Type to Accept)
export async function activateSubscriberRadius(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update Auth-Type to Accept
  await db.update(radcheck)
    .set({ value: 'Accept' })
    .where(and(
      eq(radcheck.username, username),
      eq(radcheck.attribute, 'Auth-Type')
    ));

  return { success: true };
}

// Check if username exists in RADIUS
export async function checkRadiusUsernameExists(username: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db.select()
    .from(radcheck)
    .where(and(
      eq(radcheck.username, username),
      eq(radcheck.attribute, 'Cleartext-Password')
    ))
    .limit(1);

  return !!existing;
}
