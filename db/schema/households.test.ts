import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { households, sessions, users, webauthnCredentials } from './households'

describe('schema households', () => {
  it('households no tiene ai_spent_this_month_cents (se calcula de ai_usage_log)', () => {
    expect(Object.keys(getTableColumns(households))).not.toContain('aiSpentThisMonthCents')
  })
  it('sessions guarda hogar activo y user_agent', () => {
    const cols = Object.keys(getTableColumns(sessions))
    expect(cols).toEqual(expect.arrayContaining(['householdId', 'userId', 'expiresAt', 'lastSeenAt', 'userAgent']))
  })
  it('users.email es opcional y display_name obligatorio', () => {
    expect(getTableColumns(users).email.notNull).toBe(false)
    expect(getTableColumns(users).displayName.notNull).toBe(true)
  })
  it('nombres de tabla en snake_case', () => {
    expect(getTableName(webauthnCredentials)).toBe('webauthn_credentials')
  })
})
