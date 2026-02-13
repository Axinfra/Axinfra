/**
 * Script to run follow-up checks manually or via cron
 * Usage: pnpm cron:follow-ups
 */

import { PrismaClient } from '@prisma/client';
import { FollowUpScheduler } from '../services/FollowUpScheduler';

const prisma = new PrismaClient();

async function main() {
  console.log('Running follow-up checks...');
  console.log('Time:', new Date().toISOString());
  console.log('---');

  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
  });

  console.log(`Found ${projects.length} project(s)`);

  let totalCreated = 0;

  for (const project of projects) {
    console.log(`\nProcessing: ${project.name}`);

    try {
      const result = await FollowUpScheduler.runProjectChecks(project.id);

      console.log(`  Created: ${result.created} follow-up(s)`);

      if (result.created > 0) {
        console.log('  Breakdown:');
        for (const [type, count] of Object.entries(result.types)) {
          if (count > 0) {
            console.log(`    - ${type}: ${count}`);
          }
        }
      }

      totalCreated += result.created;
    } catch (error) {
      console.error(`  Error:`, error);
    }
  }

  console.log('\n---');
  console.log(`Total follow-ups created: ${totalCreated}`);
  console.log('Done.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
