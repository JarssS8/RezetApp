import { parseMigrationArgs, runMigration } from './import-migration'

const args = parseMigrationArgs('tandoor', process.argv.slice(2))
runMigration(args)
  .then((r) => console.log(`Tandoor: ${r.created} recetas importadas, ${r.skipped} omitidas`))
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
