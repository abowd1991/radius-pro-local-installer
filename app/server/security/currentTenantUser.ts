type TenantBoundUser = {
  id: number;
  role: string;
  tenantId?: number | null;
  resellerId?: number | null;
};

/** يستبدل بيانات المستأجر المتغيرة للموظف من سجل قاعدة البيانات الحالي فقط. */
export function mergeCurrentStaffTenant<T extends TenantBoundUser>(sessionUser: T, persistedUser?: TenantBoundUser | null): T {
  if (sessionUser.role !== "client_staff" || !persistedUser || persistedUser.role !== "client_staff") {
    return sessionUser;
  }

  return {
    ...sessionUser,
    tenantId: persistedUser.tenantId ?? null,
    resellerId: persistedUser.resellerId ?? null,
  } as T;
}
