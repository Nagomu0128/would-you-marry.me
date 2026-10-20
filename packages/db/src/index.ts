import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export { schema }

/** D1 バインディングから Drizzle のクライアントを作る */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>

export { isUniqueConstraintError, newId } from './lib'
export * from './r2'
export * from './repositories'
export {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditLog,
  type CoupleAccess,
  type CourseMenuImage,
  type Guest,
  type JoinToken,
  type Like,
  type Photo,
  type SeatingChart,
  type Tenant,
  type VisitorSession,
} from './schema'
