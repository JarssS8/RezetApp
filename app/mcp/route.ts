import { handleMcpRequest } from '@/lib/mcp/server'

// authenticateApiToken usa node:crypto (sha256): no funciona en el runtime edge.
export const runtime = 'nodejs'
// El endpoint hace su propia autenticación y E/S por petición; nada que cachear.
export const dynamic = 'force-dynamic'

export { handleMcpRequest as GET, handleMcpRequest as POST, handleMcpRequest as DELETE }
