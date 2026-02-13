import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { FollowUpScheduler } from '@/services/FollowUpScheduler';

// POST /api/cron/follow-ups - Run follow-up checks for all projects
// This endpoint should be called by a cron job (e.g., daily)
export async function POST(request: NextRequest) {
  try {
    // Simple API key auth for cron jobs
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all projects
    const projects = await prisma.project.findMany({
      select: { id: true, name: true },
    });

    const results: Record<string, { created: number; types: Record<string, number> }> = {};

    // Run follow-up checks for each project
    for (const project of projects) {
      const result = await FollowUpScheduler.runProjectChecks(project.id);
      results[project.id] = {
        created: result.created,
        types: result.types,
      };
    }

    const totalCreated = Object.values(results).reduce((sum, r) => sum + r.created, 0);

    return NextResponse.json({
      success: true,
      data: {
        projectsProcessed: projects.length,
        totalFollowUpsCreated: totalCreated,
        details: results,
      },
    });
  } catch (error) {
    console.error('Cron follow-ups error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
