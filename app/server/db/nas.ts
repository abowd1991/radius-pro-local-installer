import { eq, desc, and, isNotNull, isNull, or, ne } from "drizzle-orm";
import { getDb } from "../db";
import { nasDevices, InsertNasDevice, radcheck, radreply, radgroupcheck, radhuntgroup } from "../../drizzle/schema";
import { TenantContext, buildTenantFilter } from "../tenant-isolation";
import { sql } from "drizzle-orm";

// Get all NAS devices (for super_admin only)
export async function getAllNasDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(nasDevices).orderBy(desc(nasDevices.createdAt));
}

// Get NAS devices by owner (for multi-tenancy)
export async function getNasDevicesByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(nasDevices)
    .where(eq(nasDevices.ownerId, ownerId))
    .orderBy(desc(nasDevices.createdAt));
}

// Get NAS devices with tenant isolation (supports sub-admins)
export async function getNasDevicesByTenant(tenantContext: TenantContext) {
  const db = await getDb();
  if (!db) return [];
  
  const filter = buildTenantFilter(tenantContext, nasDevices.ownerId);
  
  if (!filter) {
    // No filtering needed (owner/super_admin)
    return db.select().from(nasDevices).orderBy(desc(nasDevices.createdAt));
  }
  
  return db.select().from(nasDevices)
    .where(filter)
    .orderBy(desc(nasDevices.createdAt));
}

export async function getActiveNasDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(nasDevices).where(eq(nasDevices.status, "active"));
}

export async function getNasById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(nasDevices).where(eq(nasDevices.id, id)).limit(1);
  return result[0] || null;
}

export async function getNasByIp(ipAddress: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(nasDevices).where(eq(nasDevices.nasname, ipAddress)).limit(1);
  return result[0] || null;
}

export async function getNasByVpnUsername(vpnUsername: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(nasDevices).where(eq(nasDevices.vpnUsername, vpnUsername)).limit(1);
  return result[0] || null;
}

// Get NAS by actual IP (searches in nasname, allocatedIp, or vpnTunnelIp)
// Useful for VPN provisioning where IP may be in different fields
export async function getNasByActualIp(ipAddress: string) {
  const db = await getDb();
  if (!db) return null;
  
  // Search in nasname, allocatedIp, or vpnTunnelIp
  const result = await db.select()
    .from(nasDevices)
    .where(
      or(
        eq(nasDevices.nasname, ipAddress),
        eq(nasDevices.allocatedIp, ipAddress),
        eq(nasDevices.vpnTunnelIp, ipAddress)
      )
    )
    .limit(1);
  
  return result[0] || null;
}

// Create NAS device (FreeRADIUS compatible)
// For VPN connections: nasname=NULL, status='inactive', provisioningStatus='pending'
// For public_ip: nasname=actual IP, status='active', provisioningStatus='ready'
export async function createNas(data: {
  name: string;
  ipAddress: string;
  secret: string;
  type?: string;
  connectionType?: "public_ip" | "vpn_l2tp" | "vpn_sstp" | "vpn_pptp";
  description?: string;
  location?: string;
  ports?: number;
  mikrotikApiPort?: number;
  mikrotikApiUser?: string;
  mikrotikApiPassword?: string;
  vpnUsername?: string;
  vpnPassword?: string;
  lanCidr?: string;
  apiEnabled?: boolean;
  ownerId: number; // Required for multi-tenancy
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Determine initial status based on connection type
  const isVpnConnection = data.connectionType === 'vpn_l2tp' || data.connectionType === 'vpn_sstp' || data.connectionType === 'vpn_pptp';
  
  // For VPN connections: start with 'inactive' status until provisioned
  // This prevents FreeRADIUS from loading this NAS until it has a real IP
  const initialStatus = isVpnConnection ? 'inactive' : 'active';
  const initialProvisioningStatus = isVpnConnection ? 'pending' : 'ready';
  const initialNasname = isVpnConnection ? null : data.ipAddress;
  
  const result = await db.insert(nasDevices).values({
    nasname: initialNasname, // NULL for VPN (until provisioned), actual IP for public_ip
    shortname: data.name,
    secret: data.secret,
    type: data.type || "other",
    connectionType: data.connectionType || "public_ip",
    description: data.description,
    location: data.location,
    ports: data.ports,
    mikrotikApiPort: data.mikrotikApiPort,
    mikrotikApiUser: data.mikrotikApiUser,
    mikrotikApiPassword: data.mikrotikApiPassword,
    vpnUsername: data.vpnUsername,
    vpnPassword: data.vpnPassword,
    lanCidr: data.lanCidr,
    apiEnabled: data.apiEnabled || false,
    ownerId: data.ownerId, // Multi-tenancy owner
    status: initialStatus as "active" | "inactive",
    provisioningStatus: initialProvisioningStatus as "pending" | "provisioning" | "ready" | "error",
  });
  
  const nasId = result[0].insertId;

  // NAS Isolation: register NAS in radhuntgroup and radgroupcheck
  // For VPN: register radgroupcheck immediately (radhuntgroup will be added after provisioning)
  // For public_ip: register both radhuntgroup and radgroupcheck immediately
  const groupname = `owner_${data.ownerId}`;
  try {
    // Always ensure radgroupcheck exists for the owner group (idempotent)
    await db.execute(
      sql`INSERT INTO radgroupcheck (groupname, attribute, op, value)
          VALUES (${groupname}, 'Huntgroup-Name', '==', ${groupname})
          ON DUPLICATE KEY UPDATE value = VALUES(value)`
    );
    console.log(`[NAS Isolation] Ensured radgroupcheck for group ${groupname}`);

    if (!isVpnConnection && data.ipAddress) {
      // For public_ip: also register radhuntgroup immediately
      await db.execute(
        sql`INSERT INTO radhuntgroup (groupname, nasipaddress)
            VALUES (${groupname}, ${data.ipAddress})
            ON DUPLICATE KEY UPDATE groupname = VALUES(groupname)`
      );
      console.log(`[NAS Isolation] Registered NAS ${data.ipAddress} → group ${groupname}`);
    } else {
      console.log(`[NAS Isolation] VPN NAS created — radgroupcheck ready, radhuntgroup will be added after provisioning`);
    }
  } catch (err) {
    console.error(`[NAS Isolation] Failed to register NAS isolation:`, err);
    // Non-fatal: NAS is created, isolation will be fixed by auto-fix cron
  }

  return { success: true, id: nasId, status: initialStatus, provisioningStatus: initialProvisioningStatus };
}

/**
 * Update NAS after VPN provisioning completes
 * This is called when VPN connects and we have the actual IP and MAC
 */
export async function finalizeNasProvisioning(
  nasId: number,
  actualIp: string,
  macAddress: string
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not available" };
  
  const nas = await getNasById(nasId);
  if (!nas) return { success: false, message: "NAS not found" };
  
  // Check if already provisioned with same IP (idempotency)
  if (nas.provisioningStatus === 'ready' && nas.nasname === actualIp) {
    console.log(`[NAS Provisioning] NAS ${nasId} already provisioned with IP ${actualIp}`);
    return { success: true, message: "Already provisioned" };
  }
  
  // Update NAS with actual IP and activate it
  // Only update nasname if it's different (avoid UNIQUE constraint error)
  const updateData: any = {
    status: 'active',
    provisioningStatus: 'ready',
    allocatedIp: actualIp,
    lastMac: macAddress,
    vpnTunnelIp: actualIp,
    provisionedAt: new Date(),
    provisioningError: null,
  };
  
  // Only update nasname if it's different
  if (nas.nasname !== actualIp) {
    updateData.nasname = actualIp;
  }
  
  await db.update(nasDevices)
    .set(updateData)
    .where(eq(nasDevices.id, nasId));
  
  // NAS Isolation: register VPN NAS in radhuntgroup after provisioning
  if (nas.ownerId) {
    const groupname = `owner_${nas.ownerId}`;
    try {
      // If IP changed, remove old IP from radhuntgroup first
      if (nas.nasname && nas.nasname !== actualIp) {
        await db.execute(
          sql`DELETE FROM radhuntgroup WHERE nasipaddress = ${nas.nasname}`
        );
        console.log(`[NAS Isolation] Removed old IP ${nas.nasname} from radhuntgroup`);
      }
      // Register new IP in owner group
      await db.execute(
        sql`INSERT INTO radhuntgroup (groupname, nasipaddress)
            VALUES (${groupname}, ${actualIp})
            ON DUPLICATE KEY UPDATE groupname = VALUES(groupname)`
      );
      await db.execute(
        sql`INSERT INTO radgroupcheck (groupname, attribute, op, value)
            VALUES (${groupname}, 'Huntgroup-Name', '==', ${groupname})
            ON DUPLICATE KEY UPDATE value = VALUES(value)`
      );
      console.log(`[NAS Isolation] VPN NAS ${actualIp} registered → group ${groupname}`);
    } catch (err) {
      console.error(`[NAS Isolation] Failed to register VPN NAS ${actualIp}:`, err);
    }
  }

  // Plan Isolation: update radhuntgroup for any plan-level restrictions on this NAS
  // If this NAS is in any plan's restriction list, update radhuntgroup with new IP
  if (nas.nasname && nas.nasname !== actualIp) {
    try {
      // Find all plans that restrict this NAS (by old IP)
      await db.execute(
        sql`UPDATE radhuntgroup
            SET nasipaddress = ${actualIp}
            WHERE nasipaddress = ${nas.nasname}
              AND groupname LIKE 'HG_plan_%'`
      );
      console.log(`[Plan Isolation] Updated radhuntgroup: old IP ${nas.nasname} → new IP ${actualIp} for HG_plan_* groups`);
    } catch (err) {
      console.error(`[Plan Isolation] Failed to update radhuntgroup for plan restrictions:`, err);
    }
  }

  console.log(`[NAS Provisioning] NAS ${nasId} finalized: nasname=${actualIp}, MAC=${macAddress}`);
  return { success: true, message: `Provisioned with IP ${actualIp}` };
}

/**
 * Mark NAS provisioning as failed
 */
export async function markNasProvisioningError(
  nasId: number,
  errorMessage: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.update(nasDevices)
    .set({
      provisioningStatus: 'error',
      provisioningError: errorMessage,
    })
    .where(eq(nasDevices.id, nasId));
  
  console.log(`[NAS Provisioning] NAS ${nasId} marked as error: ${errorMessage}`);
}

/**
 * Get pending NAS devices that need provisioning
 */
export async function getPendingNasDevices() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(nasDevices)
    .where(
      and(
        eq(nasDevices.provisioningStatus, 'pending'),
        ne(nasDevices.connectionType, 'public_ip')
      )
    );
}

export async function updateNas(id: number, data: {
  name?: string;
  ipAddress?: string;
  secret?: string;
  type?: string;
  description?: string;
  location?: string;
  ports?: number;
  status?: "active" | "inactive";
  connectionType?: "public_ip" | "vpn_l2tp" | "vpn_sstp" | "vpn_pptp";
  mikrotikApiPort?: number;
  mikrotikApiUser?: string;
  mikrotikApiPassword?: string;
  apiEnabled?: boolean;
  lanCidr?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get current NAS to check if nasname is changing
  const currentNas = await getNasById(id);
  if (!currentNas) throw new Error("NAS not found");
  
  const updateData: any = {};
  if (data.name) updateData.shortname = data.name;
  // Only update nasname if it's different from current value (avoid UNIQUE constraint error)
  if (data.ipAddress && data.ipAddress !== currentNas.nasname) {
    updateData.nasname = data.ipAddress;
  }
  if (data.secret) updateData.secret = data.secret;
  if (data.type) updateData.type = data.type;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.ports !== undefined) updateData.ports = data.ports;
  if (data.status) updateData.status = data.status;
  if (data.connectionType) updateData.connectionType = data.connectionType;
  if (data.mikrotikApiPort !== undefined) updateData.mikrotikApiPort = data.mikrotikApiPort;
  if (data.mikrotikApiUser !== undefined) updateData.mikrotikApiUser = data.mikrotikApiUser;
  if (data.mikrotikApiPassword !== undefined) updateData.mikrotikApiPassword = data.mikrotikApiPassword;
  if (data.apiEnabled !== undefined) updateData.apiEnabled = data.apiEnabled;
  if (data.lanCidr !== undefined) updateData.lanCidr = data.lanCidr || null;
  
  await db.update(nasDevices).set(updateData).where(eq(nasDevices.id, id));
  return { success: true };
}

export async function deleteNas(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // First, get the NAS device to retrieve VPN username
  const nasDevice = await db.select().from(nasDevices).where(eq(nasDevices.id, id)).limit(1);
  const nas = nasDevice[0];
  
  if (!nas) {
    throw new Error("NAS device not found");
  }
  
  // Store VPN username for cleanup
  const vpnUsername = nas.vpnUsername;
  
  // Remove NAS from radhuntgroup (NAS Isolation cleanup)
  if (nas.nasname) {
    try {
      await db.execute(
        sql`DELETE FROM radhuntgroup WHERE nasipaddress = ${nas.nasname}`
      );
      console.log(`[NAS Isolation] Removed NAS ${nas.nasname} from radhuntgroup`);
    } catch (err) {
      console.error(`[NAS Isolation] Failed to remove NAS ${nas.nasname} from radhuntgroup:`, err);
    }
  }

  // Delete the NAS device from database
  await db.delete(nasDevices).where(eq(nasDevices.id, id));
  
  // Return with VPN username for cleanup in router
  return { success: true, vpnUsername };
}

export async function updateLastSeen(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(nasDevices)
    .set({ lastSeen: new Date() })
    .where(eq(nasDevices.id, id));
}

// Get NAS for FreeRADIUS (returns in FreeRADIUS format)
// IMPORTANT: Only returns NAS with status='active' AND provisioningStatus='ready'
// This ensures FreeRADIUS only loads fully provisioned NAS devices
export async function getNasForRadius() {
  const db = await getDb();
  if (!db) return [];
  
  const devices = await db.select().from(nasDevices)
    .where(
      and(
        eq(nasDevices.status, "active"),
        eq(nasDevices.provisioningStatus, "ready")
      )
    );
  
  return devices.map((d: typeof nasDevices.$inferSelect) => ({
    nasname: d.nasname,
    shortname: d.shortname,
    type: d.type,
    ports: d.ports,
    secret: d.secret,
    server: d.server,
    community: d.community,
    description: d.description,
  }));
}
