/**
 * GET /api/milestones/search — Search milestones with filters
 *
 * Query params:
 *   q          - text search on title/description (contains, insensitive)
 *   status     - filter by milestone state
 *   vendorId   - filter by assigned vendor ID
 *   vendorName - search vendor by name
 *   dateFrom   - dueDate >= dateFrom (ISO string)
 *   dateTo     - dueDate <= dateTo (ISO string)
 *   projectId  - required, scopes search to one project
 *   page       - pagination (default 1)
 *   limit      - page size (default 20, max 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { Role } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Auth guard
    const auth = await requireProjectAuth(projectId);

    // Parse query params
    const q = url.searchParams.get('q')?.trim() || '';
    const status = url.searchParams.get('status') || '';
    const vendorId = url.searchParams.get('vendorId') || '';
    const vendorName = url.searchParams.get('vendorName')?.trim() || '';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

    // Build dynamic where clause
    const where: Record<string, unknown> = { projectId };

    // Role-based scoping: Vendors see only their assigned milestones
    if (auth.role === Role.VENDOR) {
      where.OR = [
        { vendorUserId: auth.userId },
        { evidence: { some: { submittedById: auth.userId } } },
      ];
    }

    // Text search on title/description
    if (q) {
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : []),
      ];
      // If vendor scoping is active, wrap in AND
      if (auth.role === Role.VENDOR) {
        where.AND = [
          {
            OR: [
              { vendorUserId: auth.userId },
              { evidence: { some: { submittedById: auth.userId } } },
            ],
          },
          {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
        ];
        delete where.OR;
      } else {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ];
      }
    }

    // Status filter
    if (status) {
      where.state = status;
    }

    // Vendor ID filter
    if (vendorId) {
      where.vendorUserId = vendorId;
    }

    // Vendor name filter (search by vendor user name)
    if (vendorName) {
      where.vendorUser = {
        name: { contains: vendorName, mode: 'insensitive' },
      };
    }

    // Date range filters
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.plannedEnd = dateFilter;
    }

    // Count total for pagination
    const total = await prisma.milestone.count({ where: where as any });
    const totalPages = Math.ceil(total / limit);

    // Fetch milestones with includes
    const milestones = await prisma.milestone.findMany({
      where: where as any,
      include: {
        vendorUser: {
          select: { id: true, name: true, email: true },
        },
        project: {
          select: { id: true, name: true },
        },
        _count: {
          select: { evidence: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Map response
    const results = milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.state,
      dueDate: m.plannedEnd,
      completionPercentage: m.state === 'CLOSED' || m.state === 'VERIFIED' ? 100
        : m.state === 'SUBMITTED' ? 80
        : m.state === 'IN_PROGRESS' ? 40
        : 0,
      contractValue: m.value,
      assignedVendor: m.vendorUser ? {
        id: m.vendorUser.id,
        name: m.vendorUser.name,
        email: m.vendorUser.email,
      } : null,
      project: {
        id: m.project.id,
        name: m.project.name,
      },
      _count: {
        evidence: m._count.evidence,
      },
    }));

    return NextResponse.json({
      success: true,
      data: {
        milestones: results,
        total,
        page,
        totalPages,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Milestone search error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
