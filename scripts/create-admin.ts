/**
 * Creates the Axinfra platform admin account.
 * Run once in production: npx tsx scripts/create-admin.ts
 *
 * Credentials:
 *   Email   : admin@axinfra.local
 *   Password: admin123   ← change after first login
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@axinfra.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { name: 'Admin', email, hashedPassword },
  });

  console.log('✓ Platform admin created');
  console.log(`  Email   : ${email}`);
  console.log(`  Password: ${password}`);
  console.log('\n  ⚠  Change the password after first login.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
