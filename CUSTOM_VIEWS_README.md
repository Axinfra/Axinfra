# Custom Views Feature - CC-OS

## Overview

Custom Views provide **READ-ONLY projections** of milestone data. They allow users to filter, group, and sort milestones in different ways without modifying any data.

## Safety Guarantees

### ✅ What Custom Views CAN Do:
- Filter milestones by state, payment status, completion %, due dates
- Group milestones by state, payment status, completion bucket, trade
- Sort milestones by due date, completion %, value, created date
- Save custom view configurations per user
- Preview templates before saving

### ❌ What Custom Views CANNOT Do:
- Modify milestone state (DRAFT → IN_PROGRESS → etc.)
- Edit milestone data
- Drag & drop to change order or state
- Create new milestones
- Delete milestones
- Modify payment status
- Change any CC-OS core data

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOM VIEWS (READ-ONLY)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │ View Config │───▶│ CustomViewService│───▶│ Milestone Data │  │
│  │  (saved)    │    │  (filter/sort)   │    │  (read-only)   │  │
│  └─────────────┘    └─────────────────┘    └────────────────┘  │
│                                                                 │
│  SAFETY: Service only reads milestones, never writes           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Display Only
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CC-OS CORE (LOCKED)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  State Machine │ Payments │ Evidence │ Audit │ Permissions      │
│                                                                 │
│  ❌ NEVER MODIFIED BY CUSTOM VIEWS                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## UI Safety Measures

1. **No Drag Handles**: Cards in custom views cannot be dragged
2. **Read-Only Banner**: Every custom view shows "Read-only View – CC-OS state enforced"
3. **Click to View Only**: Clicking a card opens the standard milestone detail page
4. **Tooltip Warning**: Hover shows "This view is read-only. State changes must be done via the main board."
5. **Visual Distinction**: Custom views have different styling from the main board

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/[id]/views` | List user's saved views + templates |
| POST | `/api/projects/[id]/views` | Save a new view configuration |
| GET | `/api/projects/[id]/views/[id]` | Get view with milestone projections |
| PUT | `/api/projects/[id]/views/[id]` | Update view configuration |
| DELETE | `/api/projects/[id]/views/[id]` | Delete view configuration |
| GET | `/api/projects/[id]/views/preview?config=...` | Preview a view without saving |

## Predefined Templates

1. **Delayed Milestones** - Shows only milestones past due date
2. **Payment Ready** - Shows ELIGIBLE and DUE_SOON payment statuses
3. **Blocked Payments** - Shows BLOCKED payment status
4. **Near Completion (70%+)** - Shows milestones 70%+ complete
5. **Not Started (<30%)** - Shows IN_PROGRESS milestones under 30%
6. **By State** - Groups by milestone state
7. **By Completion** - Groups by completion bucket (0-30, 30-70, 70-100)

## Database Model

```prisma
model CustomView {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  name      String
  config    Json     // Stores filters, groupBy, sortBy
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([projectId, userId, name])
}
```

## Config Schema

```typescript
interface CustomViewConfig {
  filters: {
    trade?: string;
    vendor?: string;
    paymentStatus?: PaymentStatus[];
    milestoneState?: MilestoneState[];
    isDelayed?: boolean;
    completionMin?: number;
    completionMax?: number;
    dueDateFrom?: string;
    dueDateTo?: string;
  };
  groupBy?: 'trade' | 'vendor' | 'zone' | 'paymentStatus' | 'milestoneState' | 'completionBucket';
  sortBy?: 'dueDate' | 'completion' | 'value' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}
```

## Setup Instructions

After adding the Custom Views feature, you need to regenerate Prisma client:

1. Stop the dev server (Ctrl+C)
2. Run: `npx prisma db push`
3. Run: `npx prisma generate`
4. Restart: `npm run dev`

## Safety Verification Checklist

- [x] No mutation endpoints in custom views API
- [x] CustomViewService only uses `findMany` (read) operations
- [x] No state transition logic in custom views
- [x] Cards are non-draggable (no drag handles)
- [x] Read-only warning banner displayed
- [x] Audit logs untouched
- [x] Payment logic untouched
- [x] Clicking cards opens standard milestone detail (no custom actions)
