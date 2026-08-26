import { loginOptions } from '@/lib/services/auth'

export async function POST(): Promise<Response> {
  return Response.json(await loginOptions())
}
