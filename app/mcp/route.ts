import { handleMcpRequest } from '@/lib/mcp/server'

// W10-R4: se retira `export const runtime = 'nodejs'`. Era redundante desde
// el principio -es el runtime por defecto en este servidor standalone, no
// edge- y con `cacheComponents` puesto, Next rechaza la config explícita del
// segmento en tiempo de build. `authenticateApiToken` (node:crypto) sigue
// funcionando igual: nada en el árbol declara `runtime = 'edge'`.
export { handleMcpRequest as GET, handleMcpRequest as POST, handleMcpRequest as DELETE }
