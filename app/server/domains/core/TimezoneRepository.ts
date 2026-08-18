import { and, eq } from "drizzle-orm";
import { nasDevices, systemSettings, users } from "../../../drizzle/schema";
import { DEFAULT_SYSTEM_TIMEZONE, assertTimezone } from "../../core/TimezoneService";
import { getDb } from "../../db";

const SYSTEM_TIMEZONE_KEY = "system_timezone";

function validOrDefault(value: string | null | undefined, fallback = DEFAULT_SYSTEM_TIMEZONE): string {
  if (!value) return fallback;
  try { assertTimezone(value); return value; } catch { return fallback; }
}

export class TimezoneRepository {
  async getSystemTimezone(): Promise<string> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [row] = await db.select({ value: systemSettings.value })
      .from(systemSettings).where(eq(systemSettings.key, SYSTEM_TIMEZONE_KEY)).limit(1);
    return validOrDefault(row?.value);
  }

  async setSystemTimezone(timezone: string): Promise<void> {
    assertTimezone(timezone);
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.insert(systemSettings).values({
      key: SYSTEM_TIMEZONE_KEY,
      value: timezone,
      description: "المنطقة الزمنية الافتراضية للنظام؛ تُستخدم فقط عند عدم وجود إعداد للمالك أو الشبكة",
    }).onDuplicateKeyUpdate({ set: { value: timezone } });
  }

  async getOwnerTimezone(ownerId: number): Promise<string> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const systemTimezone = await this.getSystemTimezone();
    const [owner] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, ownerId)).limit(1);
    return validOrDefault(owner?.timezone, systemTimezone);
  }

  async setOwnerTimezone(ownerId: number, timezone: string): Promise<void> {
    assertTimezone(timezone);
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(users).set({ timezone }).where(eq(users.id, ownerId));
  }

  async getNetworkTimezone(ownerId: number, nasId: number): Promise<string> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const ownerTimezone = await this.getOwnerTimezone(ownerId);
    const [nas] = await db.select({ timezone: nasDevices.timezone }).from(nasDevices)
      .where(and(eq(nasDevices.id, nasId), eq(nasDevices.ownerId, ownerId))).limit(1);
    return validOrDefault(nas?.timezone, ownerTimezone);
  }

  async listNetworks(ownerId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db.select({ id: nasDevices.id, name: nasDevices.shortname, address: nasDevices.nasname, timezone: nasDevices.timezone })
      .from(nasDevices).where(eq(nasDevices.ownerId, ownerId));
  }

  async setNetworkTimezone(ownerId: number, nasId: number, timezone: string | null): Promise<void> {
    if (timezone) assertTimezone(timezone);
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(nasDevices).set({ timezone }).where(and(eq(nasDevices.id, nasId), eq(nasDevices.ownerId, ownerId)));
  }
}

export const timezoneRepository = new TimezoneRepository();
