import { Prisma, PrismaClient } from '@prisma/client'

// Connection settings for Neon, applied here unless the URL sets its own, so every environment gets
// them without editing env vars:
// - connect_timeout: Neon suspends an idle database and takes a few seconds to wake it, longer over a
//   slow link; Prisma's default 5 s turns that wake-up into "Can't reach database server".
// - max_idle_connection_lifetime: Prisma keeps idle pooled connections for 300 s by default, about
//   when Neon suspends and closes them, so requests kept picking up dead connections ("Server has
//   closed the connection", then pool timeouts while they hung). Closing them after 60 s idle means
//   a quiet spell ends with a fresh connection instead.
// - socket_timeout: a connection the network has silently dropped never answers, so its query hung
//   until every pooled connection was stuck ("Timed out fetching a new connection from the connection
//   pool"). Failing such a query after 10 s frees the connection, and withDatabaseRetry then runs it on
//   a fresh one. The app's queries take well under a second, so this never cuts off real work.
const connectionDefaults = { connect_timeout: '15', max_idle_connection_lifetime: '60', socket_timeout: '10' }

function withConnectionDefaults(url: string | undefined) {
  if (!url) return undefined
  const parsed = new URL(url)
  for (const [key, value] of Object.entries(connectionDefaults)) if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value)
  return parsed.toString()
}

/**
 * Single Prisma client shared by every module so they reuse one connection pool. Transactions get
 * more time than Prisma's 5 s default: each step is a round-trip to Neon, which from a slow or
 * distant link can take seconds, and a save that would finish in 12 s must not be thrown away.
 */
export const prisma = new PrismaClient({ datasourceUrl: withConnectionDefaults(process.env.DATABASE_URL), transactionOptions: { maxWait: 10_000, timeout: 20_000 } })

// Failures that mean the database could not be reached or a pooled connection dropped, as
// opposed to a bad query; only these are worth retrying.
const connectionErrorCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])

function isConnectionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true
  // A raw query cut off by socket_timeout reports P2010 ("Raw query failed") with this message; model
  // queries report the same timeout as P1008.
  if (error instanceof Prisma.PrismaClientKnownRequestError) return connectionErrorCodes.has(error.code) || (error.code === 'P2010' && error.message.includes('Timed out during query execution'))
  return false
}

/**
 * Retries a read up to three times when the database was unreachable, because Neon's pooled
 * endpoint occasionally drops connections and wakes slowly. The shared client is deliberately not
 * disconnected between attempts: that pulls the pool from under every other in-flight request, and
 * a reconnect that fails while Neon is still down left the client stuck ("Engine is not yet
 * connected") until the server restarted. Prisma replaces dead connections on the next query by
 * itself. Only use it for idempotent operations.
 */
export async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= 3 || !isConnectionError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }
}
