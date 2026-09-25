import 'dotenv/config'
import { prisma } from './db.js'
import { createSuperAdmin } from './superAdmins.js'

// Bootstraps the first super admin; there is deliberately no public signup, so every
// later admin is added from the dashboard by an existing one.
try {
  const result = await createSuperAdmin({ name: process.env.SUPER_ADMIN_NAME ?? 'Super admin', email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD })
  if (result.ok) console.log(`Created super admin ${result.admin.email}.`)
  else if (result.status === 409) console.log('A super admin with this email already exists; nothing changed.')
  else { console.error(`${result.error} Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD in backend/.env.`); process.exitCode = 1 }
} finally {
  await prisma.$disconnect()
}
