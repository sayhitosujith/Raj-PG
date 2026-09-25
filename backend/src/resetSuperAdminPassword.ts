import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { prisma } from './db.js'
import { isAcceptablePassword, passwordRequirement } from './credentials.js'
import { normalizeEmail, resetSuperAdminPassword } from './superAdmins.js'

// Lockout recovery for when no signed-in admin can use the dashboard's reset form.
// Usage: SUPER_ADMIN_EMAIL=you@example.com [SUPER_ADMIN_PASSWORD=chosen] npm run reset-super-admin-password
// Without SUPER_ADMIN_PASSWORD a random temporary password is generated and printed once.
try {
  const email = process.env.SUPER_ADMIN_EMAIL
  const chosenPassword = process.env.SUPER_ADMIN_PASSWORD || undefined
  if (!email?.trim()) { console.error('Set SUPER_ADMIN_EMAIL to the account to reset.'); process.exitCode = 1 }
  else if (chosenPassword !== undefined && !isAcceptablePassword(chosenPassword)) { console.error(passwordRequirement); process.exitCode = 1 }
  else {
    const { admin, password } = await resetSuperAdminPassword({ email: normalizeEmail(email) }, { password: chosenPassword })
    console.log(`Reset password for ${admin.email}; all their sessions were signed out.`)
    if (!chosenPassword) console.log(`Temporary password (shown once): ${password}`)
  }
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { console.error('No super admin has that email.'); process.exitCode = 1 }
  else throw error
} finally {
  await prisma.$disconnect()
}
