import { parseMigrationArgs, runMigration } from './import-migration'

const args = parseMigrationArgs('tandoor', process.argv.slice(2))
runMigration(args)
  .then((r) => {
    console.log(`Tandoor: ${r.created} importadas, ${r.duplicated} ya estaban, ${r.skipped} omitidas, ${r.failed.length} fallidas`)
    if (r.failed.length > 0) console.log(`fallidas: ${r.failed.join(', ')}`)
  })
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
