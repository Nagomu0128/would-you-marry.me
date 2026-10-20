// テナント API（docs/spec/api.md「admin Worker」）
import {
  createDb,
  createTenant,
  getTenant,
  getTenantStats,
  listTenantsWithStats,
  recordAuditLog,
  type Tenant,
  type TenantStats,
  updateTenant,
} from '@wym/db'
import {
  type AdminMeResponse,
  type AdminTenant,
  type AdminTenantDetailResponse,
  type AdminTenantListResponse,
  type AdminTenantResponse,
  ApiError,
  countNicknameChars,
  type ErrorFields,
  getPhaseBoundaries,
  getTenantPhase,
  isValidEventDate,
  TENANT_NAME_MAX_LENGTH,
} from '@wym/shared'
import { Hono } from 'hono'
import { deleteTenant } from '../lib/delete-tenant'
import { log } from '../lib/log'
import type { AppBindings } from '../types'

export const tenantRoutes = new Hono<AppBindings>()

function toAdminTenant(tenant: Tenant, stats: TenantStats, now: Date): AdminTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    eventDate: tenant.eventDate,
    phase: getTenantPhase(tenant.eventDate, now),
    suspended: tenant.suspended,
    createdAt: new Date(tenant.createdAt).toISOString(),
    dataDeletedAt:
      tenant.dataDeletedAt === null ? null : new Date(tenant.dataDeletedAt).toISOString(),
    stats,
  }
}

const EMPTY_STATS: TenantStats = { guestCount: 0, photoCount: 0, likeCount: 0, storageBytes: 0 }

function validationError(fields: ErrorFields): ApiError {
  return new ApiError('VALIDATION_ERROR', 'invalid input', { fields })
}

async function readJsonObject(req: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw validationError({})
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw validationError({})
  return Object.fromEntries(Object.entries(body))
}

/** テナント名: 前後の空白を除いて 1〜50 文字 */
function validateName(value: unknown): { value: string } | { error: string } {
  if (typeof value !== 'string') return { error: 'REQUIRED' }
  const name = value.trim()
  const count = countNicknameChars(name)
  if (count === 0) return { error: 'REQUIRED' }
  if (count > TENANT_NAME_MAX_LENGTH) return { error: 'TOO_LONG' }
  return { value: name }
}

/** 開催日: 実在する YYYY-MM-DD */
function validateEventDate(value: unknown): { value: string } | { error: string } {
  if (typeof value !== 'string' || value === '') return { error: 'REQUIRED' }
  if (!isValidEventDate(value)) return { error: 'INVALID' }
  return { value }
}

async function loadActiveTenant(db: ReturnType<typeof createDb>, tenantId: string) {
  const tenant = await getTenant(db, tenantId)
  if (!tenant || tenant.dataDeletedAt !== null) {
    throw new ApiError('TENANT_NOT_FOUND', 'tenant not found')
  }
  return tenant
}

tenantRoutes.get('/me', (c) => {
  const body: AdminMeResponse = { email: c.var.adminEmail, name: c.var.adminName }
  return c.json(body)
})

tenantRoutes.get('/tenants', async (c) => {
  const db = createDb(c.env.DB)
  const now = new Date()
  const rows = await listTenantsWithStats(db)
  const body: AdminTenantListResponse = {
    tenants: rows.map(({ stats, ...tenant }) => toAdminTenant(tenant, stats, now)),
  }
  return c.json(body)
})

tenantRoutes.post('/tenants', async (c) => {
  const body = await readJsonObject(c.req)
  const name = validateName(body.name)
  const eventDate = validateEventDate(body.eventDate)
  if ('error' in name || 'error' in eventDate) {
    const fields: ErrorFields = {}
    if ('error' in name) fields.name = name.error
    if ('error' in eventDate) fields.eventDate = eventDate.error
    throw validationError(fields)
  }

  const db = createDb(c.env.DB)
  const tenant = await createTenant(db, {
    name: name.value,
    eventDate: eventDate.value,
    createdBy: c.var.adminEmail,
  })
  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'tenant.create',
    detail: { name: tenant.name, eventDate: tenant.eventDate },
  })
  log('info', 'tenant.create', { tenantId: tenant.id })

  const res: AdminTenantResponse = { tenant: toAdminTenant(tenant, EMPTY_STATS, new Date()) }
  return c.json(res, 201)
})

tenantRoutes.get('/tenants/:tenantId', async (c) => {
  const db = createDb(c.env.DB)
  const tenantId = c.req.param('tenantId')
  const tenant = await getTenant(db, tenantId)
  // データ削除済みも履歴として返す（dataDeletedAt で画面が削除済みと表示する）
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'tenant not found')
  const stats = (await getTenantStats(db, tenantId)) ?? EMPTY_STATS
  const b = getPhaseBoundaries(tenant.eventDate)
  const body: AdminTenantDetailResponse = {
    tenant: toAdminTenant(tenant, stats, new Date()),
    boundaries: {
      joiningStart: b.joiningStart.toISOString(),
      viewingStart: b.viewingStart.toISOString(),
      coupleOnlyStart: b.coupleOnlyStart.toISOString(),
      deletionAt: b.deletionAt.toISOString(),
    },
  }
  return c.json(body)
})

tenantRoutes.patch('/tenants/:tenantId', async (c) => {
  const db = createDb(c.env.DB)
  const tenantId = c.req.param('tenantId')
  const body = await readJsonObject(c.req)

  const fields: ErrorFields = {}
  const input: { name?: string; eventDate?: string; suspended?: boolean } = {}
  if (body.name !== undefined) {
    const name = validateName(body.name)
    if ('error' in name) fields.name = name.error
    else input.name = name.value
  }
  if (body.eventDate !== undefined) {
    const eventDate = validateEventDate(body.eventDate)
    if ('error' in eventDate) fields.eventDate = eventDate.error
    else input.eventDate = eventDate.value
  }
  if (body.suspended !== undefined) {
    if (typeof body.suspended === 'boolean') input.suspended = body.suspended
    else fields.suspended = 'INVALID'
  }
  if (Object.keys(fields).length > 0) throw validationError(fields)

  const before = await loadActiveTenant(db, tenantId)
  const after = await updateTenant(db, tenantId, input)
  if (!after) throw new ApiError('TENANT_NOT_FOUND', 'tenant not found')

  const actor = c.var.adminEmail
  if (before.name !== after.name || before.eventDate !== after.eventDate) {
    await recordAuditLog(db, {
      tenantId,
      actor,
      action: 'tenant.update',
      detail: {
        before: { name: before.name, eventDate: before.eventDate },
        after: { name: after.name, eventDate: after.eventDate },
      },
    })
  }
  if (before.suspended !== after.suspended) {
    await recordAuditLog(db, {
      tenantId,
      actor,
      action: after.suspended ? 'tenant.suspend' : 'tenant.resume',
      detail: { before: { suspended: before.suspended }, after: { suspended: after.suspended } },
    })
  }
  log('info', 'tenant.update', { tenantId })

  const stats = (await getTenantStats(db, tenantId)) ?? EMPTY_STATS
  const res: AdminTenantResponse = { tenant: toAdminTenant(after, stats, new Date()) }
  return c.json(res)
})

tenantRoutes.post('/tenants/:tenantId/deletion', async (c) => {
  const db = createDb(c.env.DB)
  const tenantId = c.req.param('tenantId')
  const body = await readJsonObject(c.req)
  const tenant = await loadActiveTenant(db, tenantId)

  if (typeof body.confirmName !== 'string' || body.confirmName !== tenant.name) {
    throw new ApiError('CONFIRMATION_MISMATCH', 'confirmation name does not match')
  }

  await deleteTenant(c.env, tenantId, c.var.adminEmail)
  log('info', 'tenant.delete', { tenantId })
  return c.body(null, 204)
})
