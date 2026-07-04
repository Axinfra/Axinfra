/**
 * Convert raw audit log entries into natural human-readable sentences.
 * Format: [Actor] [verb phrase] [object/context] · [relative timestamp]
 *
 * The relative timestamp is rendered client-side; this module only builds the
 * subject + predicate, plus an optional secondary "detail" line built from the
 * before/after JSON (e.g. "Draft → Approved", "₹12,000", a rejection reason)
 * so callers can show a clear description without exposing raw IDs/JSON.
 */

import { BlockingReasonLabels, type BlockingReasonCode } from '@/types';

export interface AuditEntryInput {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  role: string;
  reason: string | null;
  createdAt: Date;
  actorName: string;
  /** Resolved entity label (e.g. milestone title, vendor name). Optional. */
  contextLabel?: string;
  /** Parsed before/after snapshots, used only to build the secondary detail line. */
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}

export interface FormattedActivity {
  id: string;
  actor: string;
  role: string;
  sentence: string;
  /** Secondary descriptive line (values changed, reason given, etc.) — optional. */
  detail?: string;
  createdAt: string;
}

/** Strip a trailing "by {actor}" clause and capitalize the first letter. */
function clean(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/** "PMC" stays an acronym; other roles read as a normal capitalized word. */
function roleLabel(role: string): string {
  return role.toUpperCase() === 'PMC' ? 'PMC' : role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function money(v: unknown): string | undefined {
  const n = typeof v === 'number' ? v : undefined;
  if (n === undefined) return undefined;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function titleCaseState(s: unknown): string | undefined {
  const v = str(s);
  if (!v) return undefined;
  return v.toLowerCase().split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * Architecture (drawings) module reuses BOQ/Evidence/Eligibility action-type
 * constants rather than having its own. entityType disambiguates those rows
 * from genuine BOQ/Evidence/Eligibility ones.
 */
const ARCH_ENTITY_TYPES = new Set(['DrawingSet', 'DrawingRow', 'DrawingVersion']);

function describeArchAction(e: AuditEntryInput): { fragment: string; standalone: boolean } | null {
  if (!ARCH_ENTITY_TYPES.has(e.entityType)) return null;
  const ctx = e.contextLabel?.trim();

  if (e.actionType === 'PROJECT_UPDATE' && e.entityType === 'DrawingSet') {
    const status = str(e.afterJson?.status);
    return status
      ? { fragment: `marked drawing set${ctx ? ` "${ctx}"` : ''} as ${titleCaseState(status)}`, standalone: false }
      : { fragment: `created a drawing set${ctx ? ` "${ctx}"` : ''}`, standalone: false };
  }
  if (e.actionType === 'EVIDENCE_APPROVE' && e.entityType === 'DrawingVersion') {
    return { fragment: `approved a drawing${ctx ? ` for "${ctx}"` : ''}`, standalone: false };
  }
  if (e.actionType === 'EVIDENCE_REJECT' && e.entityType === 'DrawingVersion') {
    return {
      fragment: `rejected a drawing${ctx ? ` for "${ctx}"` : ''}${e.reason ? ` (${e.reason})` : ''}`,
      standalone: false,
    };
  }
  if (e.actionType === 'ELIGIBILITY_MARKED_PAID' && (e.entityType === 'DrawingSet' || e.entityType === 'DrawingRow')) {
    return { fragment: `released payment${ctx ? ` for "${ctx}"` : ''}`, standalone: false };
  }
  return null;
}

/**
 * Build the verb phrase + object portion of the sentence from an action.
 * Returns a fragment without the actor's name and without the timestamp.
 *
 * Rule: if the action implicitly identifies a different actor (e.g.
 * "A new vendor, X, was onboarded"), the formatter returns a complete
 * sentence and the caller should NOT prepend the actor.
 */
function describeAction(e: AuditEntryInput): { fragment: string; standalone: boolean } {
  const archMatch = describeArchAction(e);
  if (archMatch) return archMatch;

  const ctx = e.contextLabel?.trim();
  const ctxOrEntity = ctx || e.entityType.toLowerCase();

  switch (e.actionType) {
    // ── Project ─────────────────────────────────────────
    case 'PROJECT_CREATE':
      return { fragment: `created the project${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'PROJECT_UPDATE':
      return { fragment: `updated project settings${ctx ? ` for "${ctx}"` : ''}`, standalone: false };
    case 'PROJECT_DELETE':
      return { fragment: `deleted project${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'PROJECT_STATUS_CHANGE':
      return { fragment: `changed the project status${ctx ? ` of "${ctx}"` : ''}`, standalone: false };

    // ── Roles / vendor onboarding ───────────────────────
    case 'ROLE_ASSIGN': {
      // Use the role the person was *assigned* (afterJson.role), not e.role — that's
      // the actor's own role (whoever performed the assignment), a different thing.
      const assignedRole = str(e.afterJson?.role) || e.role;
      return {
        fragment: `A new ${assignedRole ? roleLabel(assignedRole) : 'team member'}${ctx ? `, ${ctx},` : ''} was added to the project`,
        standalone: true,
      };
    }
    case 'ROLE_REMOVE':
      return {
        fragment: `removed ${ctx ? ctx : 'a team member'} from the project`,
        standalone: false,
      };

    // ── BOQ ─────────────────────────────────────────────
    case 'BOQ_CREATE': {
      // Bulk Excel import logs one summary row (entityType 'Project') instead of one
      // row per phase — ctx there resolves to the project name, not a phase name.
      if (e.entityType === 'Project' && e.afterJson && 'boqsCreated' in e.afterJson) {
        const n = e.afterJson.boqsCreated as number;
        const p = e.afterJson.phasesCreated as number;
        return {
          fragment: `created ${n} BOQ${n === 1 ? '' : 's'}${p > 0 ? ` and ${p} new phase${p === 1 ? '' : 's'}` : ''} via Excel import`,
          standalone: false,
        };
      }
      return { fragment: `created a BOQ${ctx ? ` for phase "${ctx}"` : ''}`, standalone: false };
    }
    case 'BOQ_SUBMIT':
      return { fragment: `sent the BOQ${ctx ? ` for "${ctx}"` : ''} for approval`, standalone: false };
    case 'BOQ_APPROVE':
      return { fragment: `approved the BOQ${ctx ? ` for "${ctx}"` : ''}`, standalone: false };
    case 'BOQ_REVISE':
      return { fragment: `requested a revision on the BOQ${ctx ? ` for "${ctx}"` : ''}`, standalone: false };
    case 'BOQ_ITEM_ADD':
      return { fragment: `added ${ctx ? `"${ctx}"` : 'an item'} to the BOQ`, standalone: false };
    case 'BOQ_ITEM_UPDATE':
      return { fragment: `updated ${ctx ? `"${ctx}"` : 'an item'} in the BOQ`, standalone: false };
    case 'BOQ_ITEM_REMOVE': {
      // The item row is already gone by the time this is read, so the entity-lookup
      // context label never resolves — fall back to the description captured in beforeJson.
      const label = ctx || str(e.beforeJson?.description);
      return { fragment: `removed ${label ? `"${label}"` : 'an item'} from the BOQ`, standalone: false };
    }

    // ── Phases ──────────────────────────────────────────
    // Falls back to the name captured in before/afterJson at the time of the action —
    // if the phase is later deleted, the live entity lookup behind `ctx` can no longer
    // resolve it, and without this every prior Create/Update entry would go unlabeled too.
    case 'PHASE_CREATE': {
      const label = ctx || str(e.afterJson?.name);
      return { fragment: `created phase${label ? ` "${label}"` : ''}`, standalone: false };
    }
    case 'PHASE_UPDATE': {
      const label = ctx || str(e.afterJson?.name);
      return { fragment: `updated phase${label ? ` "${label}"` : ''}`, standalone: false };
    }
    case 'PHASE_DELETE': {
      const label = ctx || str(e.beforeJson?.name);
      return { fragment: `deleted phase${label ? ` "${label}"` : ''}`, standalone: false };
    }

    // ── Milestones ──────────────────────────────────────
    case 'MILESTONE_CREATE':
      return { fragment: `created milestone${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'MILESTONE_UPDATE':
      return { fragment: `updated milestone${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'MILESTONE_DELETE': {
      // Same issue as BOQ_ITEM_REMOVE — the milestone row is already gone.
      const label = ctx || str(e.beforeJson?.title);
      return { fragment: `deleted milestone${label ? ` "${label}"` : ''}`, standalone: false };
    }
    case 'MILESTONE_STATE_TRANSITION':
      return {
        fragment: `updated milestone${ctx ? ` "${ctx}"` : ''}`,
        standalone: false,
      };
    case 'MILESTONE_BOQ_LINK':
      return { fragment: `linked BOQ items to milestone${ctx ? ` "${ctx}"` : ''}`, standalone: false };

    // ── Evidence ────────────────────────────────────────
    case 'EVIDENCE_SUBMIT':
      return {
        fragment: `submitted payment evidence${ctx ? ` for ${ctx}` : ''}`,
        standalone: false,
      };
    case 'EVIDENCE_APPROVE':
      return { fragment: `approved evidence${ctx ? ` for ${ctx}` : ''}`, standalone: false };
    case 'EVIDENCE_REJECT':
      return {
        fragment: `rejected evidence${ctx ? ` for ${ctx}` : ''}`,
        standalone: false,
      };
    case 'EVIDENCE_FREEZE':
      return { fragment: `froze evidence${ctx ? ` on ${ctx}` : ''}`, standalone: false };

    // ── Verification ────────────────────────────────────
    case 'VERIFICATION_CREATE':
      return { fragment: `verified work${ctx ? ` on ${ctx}` : ''}`, standalone: false };

    // ── Eligibility / payments ──────────────────────────
    case 'ELIGIBILITY_RECALCULATED':
      return {
        fragment: `triggered a payment eligibility recalculation${ctx ? ` on ${ctx}` : ''}`,
        standalone: false,
      };
    case 'ELIGIBILITY_BLOCKED':
      return {
        fragment: `blocked the payment${ctx ? ` for ${ctx}` : ''}`,
        standalone: false,
      };
    case 'ELIGIBILITY_UNBLOCKED':
      return { fragment: `unblocked the payment${ctx ? ` for ${ctx}` : ''}`, standalone: false };
    case 'ELIGIBILITY_MARKED_PAID':
      return { fragment: `marked the payment${ctx ? ` for ${ctx}` : ''} as paid`, standalone: false };

    // ── Follow-ups ──────────────────────────────────────
    case 'FOLLOWUP_CREATE':
      return { fragment: `raised a follow-up${ctx ? ` on ${ctx}` : ''}`, standalone: false };
    case 'FOLLOWUP_RESOLVE':
      return { fragment: `resolved a follow-up${ctx ? ` on ${ctx}` : ''}`, standalone: false };
    case 'FOLLOWUP_ESCALATE':
      return { fragment: `escalated a follow-up${ctx ? ` on ${ctx}` : ''}`, standalone: false };

    // ── Cash module ─────────────────────────────────────
    case 'CASH_ADJUSTMENT_CREATE':
      return {
        fragment: `recorded a cash adjustment${ctx ? ` (${ctx})` : ''}`,
        standalone: false,
      };
    case 'PRIVATE_COST_CREATE':
      return { fragment: `logged a private cost entry${ctx ? ` (${ctx})` : ''}`, standalone: false };

    // ── Vendor requests ──────────────────────────────────
    case 'VENDOR_REQUEST_SUBMIT':
      return { fragment: `submitted a request${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'VENDOR_REQUEST_RESPOND':
      return { fragment: `responded to a request${ctx ? ` "${ctx}"` : ''}`, standalone: false };
  }

  // ── Fallbacks for unknown action types ────────────────
  const verb =
    e.actionType.startsWith('CREATE') || e.actionType.endsWith('_CREATE')
      ? 'created'
      : e.actionType.startsWith('UPDATE') || e.actionType.endsWith('_UPDATE')
        ? 'updated'
        : e.actionType.startsWith('DELETE') || e.actionType.endsWith('_DELETE')
          ? 'removed'
          : e.actionType.startsWith('APPROVE') || e.actionType.endsWith('_APPROVE')
            ? 'approved'
            : e.actionType.startsWith('SUBMIT') || e.actionType.endsWith('_SUBMIT')
              ? 'submitted'
              : e.actionType.startsWith('VIEW') || e.actionType.endsWith('_VIEW')
                ? 'viewed'
                : e.actionType.startsWith('FLAG') || e.actionType.endsWith('_FLAG')
                  ? 'flagged'
                  : 'performed an action on';

  return {
    fragment: `${verb} ${ctxOrEntity}`,
    standalone: false,
  };
}

/**
 * Build a short secondary line from the before/after snapshot — the plain-English
 * replacement for showing raw JSON. Only covers the fields that are actually
 * meaningful to read; anything not called out here is intentionally left out
 * rather than dumping the whole object.
 */
function describeDetail(e: AuditEntryInput): string | undefined {
  const before = e.beforeJson ?? undefined;
  const after = e.afterJson ?? undefined;
  const reason = e.reason?.trim();

  switch (e.actionType) {
    case 'PROJECT_UPDATE': {
      if (ARCH_ENTITY_TYPES.has(e.entityType)) return undefined; // handled by sentence
      if (!after) return undefined;
      const changed = Object.keys(after).filter((k) => k !== 'changedBy');
      if (changed.length === 0) return undefined;
      return `Updated: ${changed.join(', ')}`;
    }
    case 'PROJECT_STATUS_CHANGE': {
      const from = str(before?.status);
      const to = str(after?.status);
      return from && to ? `${titleCaseState(from)} → ${titleCaseState(to)}` : undefined;
    }
    case 'ROLE_ASSIGN': {
      const email = str(after?.email);
      const role = str(after?.role);
      return email ? `${email}${role ? ` · ${role}` : ''}` : undefined;
    }
    case 'ROLE_REMOVE': {
      const email = str(before?.email);
      return email || undefined;
    }
    case 'BOQ_SUBMIT':
    case 'BOQ_APPROVE':
    case 'BOQ_REVISE': {
      const from = str(before?.status);
      const to = str(after?.status);
      const transition = from && to ? `${titleCaseState(from)} → ${titleCaseState(to)}` : undefined;
      return [transition, reason].filter(Boolean).join(' — ') || undefined;
    }
    case 'BOQ_ITEM_ADD': {
      // Bulk Excel import writes a batch summary instead of one item's fields.
      if (after && 'itemsAdded' in after) {
        const added = after.itemsAdded;
        const dupes = after.duplicatesSkipped;
        const parts = [`${added} item${added === 1 ? '' : 's'} imported from Excel`];
        if (typeof dupes === 'number' && dupes > 0) parts.push(`${dupes} duplicate${dupes === 1 ? '' : 's'} skipped`);
        return parts.join(' · ');
      }
      const qty = after?.plannedQty;
      const unit = str(after?.unit);
      const rate = money(after?.rate);
      const value = money(after?.plannedValue);
      const parts = [qty && unit ? `${qty} ${unit}` : undefined, rate ? `@ ${rate}` : undefined, value ? `= ${value}` : undefined];
      return parts.filter(Boolean).join(' ') || undefined;
    }
    case 'BOQ_ITEM_UPDATE': {
      const value = money(after?.plannedValue);
      return value ? `New value: ${value}` : undefined;
    }
    case 'BOQ_ITEM_REMOVE': {
      const value = money(before?.plannedValue);
      return value ? `Removed value: ${value}` : undefined;
    }
    case 'PHASE_UPDATE': {
      if (!after) return undefined;
      const changed = Object.keys(after);
      return changed.length ? `Updated: ${changed.join(', ')}` : undefined;
    }
    case 'MILESTONE_CREATE': {
      const value = money(after?.value);
      return value ? `Value: ${value}` : undefined;
    }
    case 'MILESTONE_STATE_TRANSITION': {
      const from = str(before?.state);
      const to = str(after?.state);
      const transition = from && to ? `${titleCaseState(from)} → ${titleCaseState(to)}` : undefined;
      return [transition, reason].filter(Boolean).join(' — ') || undefined;
    }
    case 'EVIDENCE_SUBMIT': {
      const pct = after?.qtyOrPercent;
      const files = after?.fileCount;
      const parts = [
        typeof pct === 'number' ? `${pct}%` : undefined,
        typeof files === 'number' ? `${files} file${files === 1 ? '' : 's'}` : undefined,
      ];
      return parts.filter(Boolean).join(' · ') || undefined;
    }
    case 'EVIDENCE_APPROVE':
    case 'EVIDENCE_REJECT': {
      const note = str(after?.reviewNote) || reason;
      return note || undefined;
    }
    case 'VERIFICATION_CREATE': {
      const notes = str(after?.notes);
      const value = money(after?.valueEligibleComputed);
      return [value ? `Eligible value: ${value}` : undefined, notes].filter(Boolean).join(' — ') || undefined;
    }
    case 'ELIGIBILITY_RECALCULATED': {
      const amt = money(after?.eligibleAmount);
      return amt ? `Eligible amount: ${amt}` : undefined;
    }
    case 'ELIGIBILITY_BLOCKED': {
      const code = str(after?.reasonCode) as BlockingReasonCode | undefined;
      const label = code ? BlockingReasonLabels[code] : undefined;
      return [label, reason].filter(Boolean).join(' — ') || undefined;
    }
    case 'ELIGIBILITY_UNBLOCKED':
    case 'ELIGIBILITY_MARKED_PAID': {
      const amt = money(after?.eligibleAmount);
      return [amt, reason].filter(Boolean).join(' — ') || undefined;
    }
    case 'FOLLOWUP_RESOLVE': {
      const note = str(after?.resolutionNote);
      return note || undefined;
    }
    case 'CASH_ADJUSTMENT_CREATE': {
      const amt = money(after?.amount);
      const type = str(after?.type);
      return [amt, type].filter(Boolean).join(' · ') || undefined;
    }
    case 'PRIVATE_COST_CREATE': {
      const amt = money(after?.amount);
      const vendor = str(after?.vendor);
      return [amt, vendor].filter(Boolean).join(' · ') || undefined;
    }
    case 'VENDOR_REQUEST_SUBMIT': {
      const type = str(after?.type);
      const priority = str(after?.priority);
      return [type, priority].filter(Boolean).join(' · ') || undefined;
    }
    case 'VENDOR_REQUEST_RESPOND': {
      const status = str(after?.status);
      const note = str(after?.responseNote);
      return [status ? titleCaseState(status) : undefined, note].filter(Boolean).join(' — ') || undefined;
    }
    default:
      return reason || undefined;
  }
}

export function formatAuditEntry(entry: AuditEntryInput): FormattedActivity {
  const { fragment, standalone } = describeAction(entry);
  const sentence = standalone ? clean(fragment) : `${entry.actorName} ${fragment}`;
  return {
    id: entry.id,
    actor: entry.actorName,
    role: entry.role,
    sentence,
    detail: describeDetail(entry),
    createdAt: entry.createdAt.toISOString(),
  };
}
