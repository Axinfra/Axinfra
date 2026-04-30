/**
 * Convert raw audit log entries into natural human-readable sentences.
 * Format: [Actor] [verb phrase] [object/context] · [relative timestamp]
 *
 * The relative timestamp is rendered client-side; this module only builds the
 * subject + predicate.
 */

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
}

export interface FormattedActivity {
  id: string;
  actor: string;
  role: string;
  sentence: string;
  createdAt: string;
}

/** Strip a trailing "by {actor}" clause and capitalize the first letter. */
function clean(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    case 'ROLE_ASSIGN':
      if (e.role === 'VENDOR' || ctx) {
        return {
          fragment: `A new ${(e.role || 'team member').toLowerCase()}${ctx ? `, ${ctx},` : ''} was added to the project`,
          standalone: true,
        };
      }
      return { fragment: `assigned a new role${ctx ? ` to ${ctx}` : ''}`, standalone: false };
    case 'ROLE_REMOVE':
      return {
        fragment: `removed ${ctx ? ctx : 'a team member'} from the project`,
        standalone: false,
      };

    // ── BOQ ─────────────────────────────────────────────
    case 'BOQ_CREATE':
      return { fragment: `created the BOQ`, standalone: false };
    case 'BOQ_APPROVE':
      return { fragment: `approved the BOQ`, standalone: false };
    case 'BOQ_REVISE':
      return { fragment: `revised the BOQ`, standalone: false };
    case 'BOQ_ITEM_ADD':
      return { fragment: `added a BOQ line item${ctx ? ` (${ctx})` : ''}`, standalone: false };
    case 'BOQ_ITEM_UPDATE':
      return { fragment: `updated a BOQ line item${ctx ? ` (${ctx})` : ''}`, standalone: false };
    case 'BOQ_ITEM_REMOVE':
      return { fragment: `removed a BOQ line item${ctx ? ` (${ctx})` : ''}`, standalone: false };

    // ── Milestones ──────────────────────────────────────
    case 'MILESTONE_CREATE':
      return { fragment: `created milestone${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'MILESTONE_UPDATE':
      return { fragment: `updated milestone${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'MILESTONE_DELETE':
      return { fragment: `deleted milestone${ctx ? ` "${ctx}"` : ''}`, standalone: false };
    case 'MILESTONE_STATE_TRANSITION':
      return {
        fragment: `moved milestone${ctx ? ` "${ctx}"` : ''} to a new state`,
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
        fragment: `rejected evidence${ctx ? ` for ${ctx}` : ''}${e.reason ? ` (${e.reason})` : ''}`,
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
        fragment: `blocked the payment${ctx ? ` for ${ctx}` : ''}${e.reason ? ` (${e.reason})` : ''}`,
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

export function formatAuditEntry(entry: AuditEntryInput): FormattedActivity {
  const { fragment, standalone } = describeAction(entry);
  const sentence = standalone ? clean(fragment) : `${entry.actorName} ${fragment}`;
  return {
    id: entry.id,
    actor: entry.actorName,
    role: entry.role,
    sentence,
    createdAt: entry.createdAt.toISOString(),
  };
}
