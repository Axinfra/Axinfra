import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendSupportEmail } from '@/lib/email';
import { publicFormRateLimiter } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const rateCheck = await publicFormRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.', retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

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
