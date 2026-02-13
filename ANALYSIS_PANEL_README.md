# Project Analysis Panel - CC-OS

## Overview

The Analysis Panel provides **READ-ONLY decision-grade insights** derived strictly from existing CC-OS data. It is a projection layer only - no mutations, no new states, no manual inputs.

## Access Control

| Role | Access |
|------|--------|
| OWNER | ✅ Full access |
| PMC | ✅ Full access |
| VENDOR | ❌ No access |
| VIEWER | ❌ No access |

## Safety Guarantees

### ✅ What Analysis Panel DOES:
- Aggregates existing milestone, evidence, payment, audit data
- Computes statistics (averages, percentages, counts)
- Groups and sorts data for visualization
- Identifies SLA breaches based on time thresholds
- Calculates risk scores from deterministic rules

### ❌ What Analysis Panel DOES NOT DO:
- Modify any CC-OS data
- Create new states or statuses
- Add manual inputs or overrides
- Bypass CC-OS business logic
- Introduce new business rules
- Allow inline editing

## Tab Structure

### 1️⃣ Execution Analysis
**Question:** "Where is work actually moving, and where is it stuck?"

**Metrics:**
- % milestones VERIFIED
- Avg time spent in each state
- Avg evidence review time
- Evidence rejection rate
- SLA breaches (state > X days)
- Breakdown by trade

### 2️⃣ Financial Analysis
**Question:** "What money is safe, blocked, or exposed right now?"

**Metrics:**
- Total project value
- Certified value
- Paid marked value
- Blocked value
- Uncovered exposure
- Retention held vs eligible
- Stacked bar visualization

### 3️⃣ Vendor Analysis
**Question:** "Which vendors are risky, slow, or over-exposed?"

**Per-Vendor Metrics:**
- Contract value
- Certified value
- Avg verification delay
- Evidence rejection count
- Exposure %
- Risk level (LOW/MEDIUM/HIGH)

### 4️⃣ Delay & Risk Analysis
**Question:** "Where will this project blow up if I don't act?"

**Signals:**
- Delayed milestones
- Critical delays
- Payments blocked > 14 days
- Over-exposed vendors
- BOQ overruns (>10%)

**Risk Buckets:**
- 🟢 Safe
- 🟠 Attention
- 🔴 Immediate Action

### 5️⃣ Compliance & Audit Analysis
**Question:** "Are procedures being followed, and by whom?"

**Metrics:**
- Evidence SLA compliance
- Repeated rejections per vendor
- Late approvals by role
- Audit completeness score

## API Endpoint

```
GET /api/projects/[projectId]/analysis
GET /api/projects/[projectId]/analysis?tab=execution
GET /api/projects/[projectId]/analysis?tab=financial
GET /api/projects/[projectId]/analysis?tab=vendor
GET /api/projects/[projectId]/analysis?tab=delay-risk
GET /api/projects/[projectId]/analysis?tab=compliance
```

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "generatedAt": "2025-01-15T10:30:00Z"
}
```

## SLA Thresholds (Configurable)

| Threshold | Value |
|-----------|-------|
| IN_PROGRESS max days | 30 |
| SUBMITTED max days | 7 |
| Evidence review max days | 3 |
| Blocked payment max days | 14 |
| High exposure threshold | 20% |
| BOQ overrun threshold | 10% |

## Risk Score Calculation

The Overall Risk Score (0-100) is computed from:
- % of delayed milestones
- % of blocked payments
- Number of BOQ overruns

Formula: `min(100, delayedPercent + blockedPercent + overruns × 5)`

## Risk Level Classification

**Vendor Risk Level:**
- HIGH: Exposure >30% OR Rejection rate >30% OR Avg verification >14 days
- MEDIUM: Exposure >15% OR Rejection rate >15% OR Avg verification >7 days
- LOW: All metrics below thresholds

**Milestone Delay Severity:**
- CRITICAL: >30 days overdue
- MAJOR: >14 days overdue
- MINOR: 1-14 days overdue

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYSIS PANEL (READ-ONLY)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                    ┌────────────────────────┐  │
│  │ Analysis    │                    │ Existing CC-OS Data    │  │
│  │ Service     │───READ ONLY───────▶│ - Milestones           │  │
│  │ (aggregate) │                    │ - Evidence             │  │
│  └─────────────┘                    │ - Payments             │  │
│         │                           │ - Audit Logs           │  │
│         │                           └────────────────────────┘  │
│         │ Statistics Only                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ Analysis    │                                                │
│  │ Panel UI    │                                                │
│  │ (display)   │                                                │
│  └─────────────┘                                                │
│                                                                 │
│  ❌ NO WRITES    ❌ NO STATE CHANGES    ❌ NO NEW LOGIC         │
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
│  ❌ NEVER MODIFIED BY ANALYSIS PANEL                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Files Created

| File | Purpose |
|------|---------|
| `src/services/AnalysisService.ts` | Read-only aggregation service |
| `src/app/api/projects/[projectId]/analysis/route.ts` | GET-only API endpoint |
| `src/app/projects/[projectId]/analysis/page.tsx` | Analysis panel UI with 5 tabs |

## Safety Verification Checklist

- [x] AnalysisService uses only `findMany` (read) operations
- [x] API endpoint is GET-only (no POST/PUT/DELETE)
- [x] No mutation methods in service
- [x] No state transition logic
- [x] No payment logic modifications
- [x] Audit logs untouched
- [x] Access restricted to OWNER and PMC only
- [x] All metrics derived from existing data
- [x] No editable fields in UI
- [x] No manual overrides or inputs
- [x] Risk classification is deterministic and rule-based

## UI Design Principles

1. **Numbers > Charts** - Prioritize clear metrics
2. **Decision-oriented** - Each tab answers a specific question
3. **Actionable insights** - Show what needs attention
4. **No decoration** - Every element serves a purpose
5. **Read-only indicators** - Clear labeling that data cannot be edited
