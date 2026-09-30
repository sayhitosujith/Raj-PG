import { Prisma, PrismaClient } from '@prisma/client'

// Neon suspends an idle database and takes a few seconds to wake it, longer over a slow link;
// Prisma's default 5 s connect timeout turns that wake-up into "Can't reach database server".
// Applied here, unless the URL sets its own, so every environment gets it without editing env vars.
const connectTimeoutSeconds = '15'

function withConnectTimeout(url: string | undefined) {
  if (!url) return undefined
  const parsed = new URL(url)
  if (!parsed.searchParams.has('connect_timeout')) parsed.searchParams.set('connect_timeout', connectTimeoutSeconds)
  return parsed.toString()
}

/**
 * Single Prisma client shared by every module so they reuse one connection pool. Transactions get
 * more time than Prisma's 5 s default: each step is a round-trip to Neon, which from a slow or
 * distant link can take seconds, and a save that would finish in 12 s must not be thrown away.
 */
export const prisma = new PrismaClient({ datasourceUrl: withConnectTimeout(process.env.DATABASE_URL), transactionOptions: { maxWait: 10_000, timeout: 20_000 } })

// Failures that mean the database could not be reached or a pooled connection dropped, as
// opposed to a bad query; only these are worth retrying.
const connectionErrorCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])

function isConnectionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true
  if (error instanceof Prisma.PrismaClientKnownRequestError) return connectionErrorCodes.has(error.code)
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
