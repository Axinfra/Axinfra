import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendSupportEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(2000),
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

    const { name, email, subject, message } = parsed.data;
    await sendSupportEmail(name, email, subject, message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[contact] email send failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to send message. Please try emailing dev@axinfra.in directly.' },
      { status: 500 }
    );
  }
}
