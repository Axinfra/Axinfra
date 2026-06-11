# Axinfra

Evidence-first project intelligence for construction teams. Axinfra tracks project roles, milestones, BOQs, evidence, payments, follow-ups, audit logs, vendor views, and admin operations in a Next.js app backed by PostgreSQL and Prisma.

## Stack

- Next.js 14 App Router
- React 18 and Tailwind CSS
- PostgreSQL with Prisma
- JWT cookie sessions
- Resend for transactional email
- Vercel Blob, Supabase Storage, Cloudflare R2, or local disk for file storage
- Upstash Redis for production cache

## Local Setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

Demo users created by `npm run db:seed`:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@axinfra.local | admin123 |
| Client | client@example.com | password123 |
| PMC | pmc@example.com | password123 |
| Vendor | vendor@example.com | password123 |
| Viewer | viewer@example.com | password123 |
| Consultant | consultant@example.com | password123 |

## Environment Variables

Copy `.env.example` to `.env` for local development. Never commit `.env`, `.env.local`, `.env.production`, Vercel tokens, database URLs, API keys, or service-role keys. The current `.gitignore` already excludes those files.

Required for local app startup:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/axinfra?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/axinfra?schema=public"
JWT_SECRET="generate-a-long-random-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Required for production on Vercel:

```env
DATABASE_URL="pooled Neon PostgreSQL connection string"
DIRECT_URL="direct Neon PostgreSQL connection string"
JWT_SECRET="48+ random bytes"
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
ADMIN_EMAILS="admin@yourdomain.com"
CRON_SECRET="32+ random bytes"
BLOB_READ_WRITE_TOKEN="Vercel Blob token"
UPSTASH_REDIS_REST_URL="Upstash REST URL"
UPSTASH_REDIS_REST_TOKEN="Upstash REST token"
RESEND_API_KEY="Resend API key"
EMAIL_FROM="Axinfra <dev@axinfra.in>"
SUPPORT_EMAIL="dev@axinfra.in"
```

Optional:

```env
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="https://your-app.vercel.app/api/auth/google/callback"
```

Use the generator comments in `.env.example` to create strong `JWT_SECRET` and `CRON_SECRET` values.

## GitHub Push Checklist

1. Confirm secrets are not staged:

   ```bash
   git status --short
   git diff --cached --name-only
   ```

2. Confirm only the example env file is committed:

   ```bash
   git check-ignore .env .env.local .env.production
   ```

3. Commit application files, `README.md`, `.env.example`, Prisma schema/migrations, and lockfiles. Do not commit `.next/`, `node_modules/`, `uploads/`, `.env`, or `.vercel/`.

4. Push to GitHub:

   ```bash
   git add README.md .env.example
   git commit -m "docs: update deployment setup"
   git push origin main
   ```

If you also changed app code, include those files in the same commit only when they belong to the same deploy fix.

## Vercel Deployment

1. Import the GitHub repository into Vercel.

2. Set the project root to this app directory if the repository contains a parent folder. In this workspace, the app lives in `Axinfra/`.

3. Use the default framework preset:

   - Framework: Next.js
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: leave empty

4. Add every production environment variable from `.env.example` in Vercel Project Settings.

5. Add a Neon PostgreSQL database:

   - `DATABASE_URL`: pooled connection string with PgBouncer for runtime.
   - `DIRECT_URL`: direct connection string for Prisma migrations.

6. Run database setup after the first deploy:

   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```

   If you use `db push` instead of migrations for the current project state, run:

   ```bash
   npx prisma db push
   npx prisma db seed
   ```

7. Create Vercel Blob storage and connect it to the project so `BLOB_READ_WRITE_TOKEN` is available in production.

8. Create Upstash Redis and set `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN`.

9. Keep `vercel.json` committed. It sets the Singapore region and runs `/api/cron/follow-ups` every day at 08:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set, and the route requires that secret.

## Production Email Setup

Email is sent through Resend from `src/lib/email.ts`.

Required Vercel env vars:

```env
RESEND_API_KEY="re_..."
EMAIL_FROM="Axinfra <dev@axinfra.in>"
SUPPORT_EMAIL="dev@axinfra.in"
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
```

Resend production checklist:

1. Verify the sending domain in Resend.
2. Add the DNS records Resend provides for SPF, DKIM, and DMARC.
3. Keep existing Gmail/Google Workspace MX records unchanged if Gmail receives mail for the domain. Resend sending records do not replace Gmail MX records.
4. Set `EMAIL_FROM` to an address on the verified domain.
5. Set `SUPPORT_EMAIL` to the inbox that should receive homepage contact form submissions.
6. Redeploy after changing Vercel env vars.

How to verify email in production:

1. Open the deployed homepage.
2. Submit the contact form with a real test email address.
3. Confirm `SUPPORT_EMAIL` receives the support request.
4. Confirm the test sender receives the confirmation email.
5. Check Vercel Function Logs for `/api/contact` if either email is missing.

The app now throws a clear configuration error when `RESEND_API_KEY` is missing. If Resend returns a domain or sender error, fix the Resend domain verification or `EMAIL_FROM` value.

## Common Vercel Problems

- `DATABASE_URL is not set`: add `DATABASE_URL` to Vercel env vars and redeploy.
- Prisma migration errors with pooled URLs: use `DIRECT_URL` for Prisma direct connections.
- Admin login goes to `/projects`: set `ADMIN_EMAILS` in Vercel and redeploy.
- Cron returns 401 or 503: set `CRON_SECRET` in Vercel env vars.
- Uploads disappear or fail: connect Vercel Blob, or configure Supabase/R2. Local disk is only for development.
- Contact form returns 500: check `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL`, and Resend domain verification.
- Google sign-in says not configured: set all Google OAuth vars and make the Google redirect URI exactly match `/api/auth/google/callback`.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run test
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:studio
npm run seed:stress
```

## License

Proprietary. All rights reserved.
