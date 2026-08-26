export type { Ctx, Db } from '@/lib/auth/ctx'

export class ServiceError extends Error {
  constructor(public readonly code: 'not_found' | 'forbidden' | 'conflict' | 'validation', message: string) {
    super(message)
  }
}
