import { type createDb, getTenant, type Tenant } from '@wym/db'
import { ApiError } from '@wym/shared'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * URL のテナント ID から、データ削除前のテナントを取る。
 * UUID の形でない・ない・データ削除済みなら TENANT_NOT_FOUND。
 */
export async function requireActiveTenant(
  db: ReturnType<typeof createDb>,
  tenantId: string,
): Promise<Tenant> {
  if (!UUID_PATTERN.test(tenantId)) throw new ApiError('TENANT_NOT_FOUND', 'tenant not found')
  const tenant = await getTenant(db, tenantId)
  if (!tenant || tenant.dataDeletedAt !== null) {
    throw new ApiError('TENANT_NOT_FOUND', 'tenant not found')
  }
  return tenant
}
