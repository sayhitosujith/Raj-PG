import { PrismaClient } from '@prisma/client'

/** Single Prisma client shared by every module so they reuse one connection pool. */
export const prisma = new PrismaClient()

/**
 * Retries a read up to three times, reconnecting between attempts, because Neon's pooled
 * endpoint occasionally drops idle connections. Only use it for idempotent operations.
 */
export async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      await prisma.$disconnect()
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
      await prisma.$connect()
    }
  }
  throw lastError
}
