import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type * as schema from './schema'

// Conexión o transacción: toda función de servicio acepta ambas para poder componerse dentro de db.transaction()
export type Db = NodePgDatabase<typeof schema> | PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>
