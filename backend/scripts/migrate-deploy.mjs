// Runs `prisma migrate deploy` over Neon's DIRECT connection, not its pooler.
//
// Why: migrate takes a Postgres session lock (pg_advisory_lock) for the whole run. Through the
// pooler (PgBouncer, "-pooler" host) the lock and its release can land on different server
// connections, so the lock is never released and every later deploy times out waiting for it
// (Prisma P1002). The app itself keeps using the pooled DATABASE_URL, as Neon recommends.
//
// DIRECT_URL wins when set; otherwise the direct host is derived by dropping "-pooler" from the
// DATABASE_URL host, so no extra setting is needed on the host (e.g. Render).
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

function directUrl(pooledUrl) {
  if (!pooledUrl) return pooledUrl
  try {
    const url = new URL(pooledUrl)
    url.hostname = url.hostname.replace('-pooler.', '.')
    url.searchParams.delete('pgbouncer')
    return url.toString()
  } catch {
    return pooledUrl
  }
}

const url = process.env.DIRECT_URL || directUrl(process.env.DATABASE_URL)
if (url) console.log(`Migrating via ${new URL(url).hostname}`)
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: true, env: { ...process.env, DATABASE_URL: url } })
process.exit(result.status ?? 1)
