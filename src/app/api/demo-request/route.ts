import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendDemoRequestEmail } from '@/lib/email';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  company: z.string().min(1).max(200),
  phone: z.string().max(30).optional().default(''),
  message: z.string().max(1000).optional().default(''),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, email, company, phone, message } = parsed.data;

    // Fire email (non-blocking on failure)
    await sendDemoRequestEmail(name, email, company, phone, message);

    // Log as a SystemEvent so admins see it in the admin panel
    await prisma.systemEvent.create({
      data: {
        eventType: 'DEMO_REQUEST',
        severity: 'INFO',
        message: `Demo request from ${name} (${email}) — ${company}`,
        metadata: JSON.stringify({ name, email, company, phone, message }),
      },
    }).catch((e) => console.error('[demo-request] systemEvent create failed:', e));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[demo-request] failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to submit request. Please email dev@axinfra.in directly.' },
      { status: 500 }
    );
  }
}
