# CC-OS - Construction Control Operating System

**Evidence-first construction execution control system**

CC-OS tracks execution progress, enforces evidence-first completion, applies role-based verification, calculates payment eligibility, flags financial and execution risk, and records immutable decision history.

> **Important**: CC-OS certifies what work is verified and what value is eligible for payment. It does NOT move money - it certifies what is allowed to be paid, what is blocked, and why.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- pnpm (recommended) or npm

### Setup

1. **Clone and install dependencies**
   ```bash
   cd cc-os
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL and settings
   ```

3. **Setup database**
   ```bash
   pnpm db:generate    # Generate Prisma client
   pnpm db:push        # Push schema to database
   pnpm db:seed        # Seed demo data
   ```

4. **Start development server**
   ```bash
   pnpm dev
   ```

5. **Open browser**
   Navigate to http://localhost:3000

### Demo Accounts

| Role   | Email                | Password    |
|--------|---------------------|-------------|
| Owner  | owner@example.com   | password123 |
| PMC    | pmc@example.com     | password123 |
| Vendor | vendor@example.com  | password123 |
| Viewer | viewer@example.com  | password123 |

## Environment Variables

```env
# Database (required)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ccos?schema=public"

# Auth
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
SESSION_EXPIRY_HOURS=24

# File Storage
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE_MB=10

# Follow-up Thresholds (in days)
PENDING_REVIEW_THRESHOLD_DAYS=3
PENDING_VERIFICATION_THRESHOLD_DAYS=5
PAYMENT_DUE_SOON_THRESHOLD_DAYS=7
PAYMENT_BLOCKED_THRESHOLD_DAYS=14

# Cron (optional, for automated follow-ups)
CRON_SECRET="your-cron-secret"
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + React 18 + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT-based session authentication

### Core Services

| Service | Location | Purpose |
|---------|----------|---------|
| AuditLogger | `src/services/AuditLogger.ts` | Immutable audit trail for all actions |
| RoleGuard | `src/services/RoleGuard.ts` | Server-side role enforcement |
| MilestoneStateMachine | `src/services/MilestoneStateMachine.ts` | Strict state transition enforcement |
| EvidenceService | `src/services/EvidenceService.ts` | Evidence submission with freeze rules |
| BOQService | `src/services/BOQService.ts` | BOQ management with revision tracking |
| PaymentEligibilityEngine | `src/services/PaymentEligibilityEngine.ts` | Payment status computation |
| FollowUpScheduler | `src/services/FollowUpScheduler.ts` | Automated follow-up generation |

### Milestone State Machine

```
Draft -> In Progress -> Submitted -> Verified -> Closed
                            |
                            v (rejection)
                       In Progress
```

**Rules:**
- States cannot be skipped
- Backdating is not allowed
- All transitions are logged
- Rejection returns to In Progress (not Draft)

### Payment Status Flow

```
System-computed:     Human-marked:
NOT_ELIGIBLE  ─┐     ┌─> BLOCKED
               ├──>──┤
ELIGIBLE      ─┤     └─> PAID_MARKED
               │
DUE_SOON      ─┘
```

## Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm start        # Start production server
pnpm test         # Run tests
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Push schema to database
pnpm db:seed      # Seed demo data
pnpm db:studio    # Open Prisma Studio
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get current session

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/[id]` - Get project details
- `PATCH /api/projects/[id]` - Update project

### Roles
- `GET /api/projects/[id]/roles` - List roles
- `POST /api/projects/[id]/roles` - Assign role
- `DELETE /api/projects/[id]/roles` - Remove role

### BOQ
- `GET /api/projects/[id]/boq` - List BOQs
- `POST /api/projects/[id]/boq` - Create BOQ
- `POST /api/projects/[id]/boq/[boqId]/items` - Add item
- `POST /api/projects/[id]/boq/[boqId]/approve` - Approve BOQ
- `POST /api/projects/[id]/boq/[boqId]/revise` - Create revision

### Milestones
- `GET /api/projects/[id]/milestones` - List milestones
- `POST /api/projects/[id]/milestones` - Create milestone
- `GET /api/projects/[id]/milestones/[msId]` - Get milestone
- `POST /api/projects/[id]/milestones/[msId]/transition` - State transition

### Evidence
- `GET /api/projects/[id]/milestones/[msId]/evidence` - List evidence
- `POST /api/projects/[id]/milestones/[msId]/evidence` - Submit evidence
- `POST /api/projects/[id]/milestones/[msId]/evidence/[evId]/review` - Review

### Verification
- `POST /api/projects/[id]/milestones/[msId]/verify` - Verify milestone

### Payments
- `GET /api/projects/[id]/milestones/[msId]/payment` - Get payment status
- `POST /api/projects/[id]/milestones/[msId]/payment/mark` - Block/Unblock/Mark paid

### Dashboard
- `GET /api/projects/[id]/dashboard` - Get role-specific dashboard

### Audit Log
- `GET /api/projects/[id]/audit-log` - Get audit logs
- `GET /api/projects/[id]/audit-log/export` - Export CSV

### Follow-ups
- `GET /api/projects/[id]/follow-ups` - List follow-ups
- `POST /api/projects/[id]/follow-ups` - Resolve follow-up

### Cron
- `POST /api/cron/follow-ups` - Run follow-up checks (protected by CRON_SECRET)

## Role Permissions Matrix

| Action | Owner | PMC | Vendor | Viewer |
|--------|-------|-----|--------|--------|
| Read project | ✓ | ✓ | ✓ | ✓ |
| Manage project | ✓ | - | - | - |
| Manage roles | ✓ | - | - | - |
| Edit BOQ | ✓ | ✓ | - | - |
| Approve BOQ | ✓ | - | - | - |
| Create milestones | ✓ | ✓ | - | - |
| Submit evidence | - | - | ✓ | - |
| Review evidence | ✓ | ✓ | - | - |
| Verify milestones | ✓ | ✓ | - | - |
| Block payments | ✓ | ✓ | - | - |
| Unblock payments | ✓ | - | - | - |
| Mark paid | ✓ | ✓ | - | - |
| Export audit log | ✓ | ✓ | - | - |

## License

Proprietary - All rights reserved
