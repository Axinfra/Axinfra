# CC-OS Manual QA Checklist

This checklist verifies that all spec requirements are correctly implemented.

## Core Laws Verification

### 1. Progress without evidence is invalid
- [ ] Create milestone, move to IN_PROGRESS
- [ ] Attempt to move to SUBMITTED without evidence -> **MUST FAIL**
- [ ] Submit evidence, then move to SUBMITTED -> **MUST SUCCEED**

### 2. Evidence without verification is incomplete
- [ ] Submit evidence as VENDOR
- [ ] Evidence shows as SUBMITTED (not APPROVED)
- [ ] Payment status shows NOT_ELIGIBLE
- [ ] Approve evidence as PMC/OWNER
- [ ] Verify milestone
- [ ] Payment status changes to ELIGIBLE

### 3. Verification must be attributable to a role
- [ ] Verify milestone as PMC
- [ ] Check audit log shows PMC role and actor name
- [ ] Check verification record has verifiedBy user

### 4. Payment eligibility is computed, not declared
- [ ] Milestone in DRAFT -> Payment NOT_ELIGIBLE
- [ ] Milestone VERIFIED -> Payment ELIGIBLE (computed value shown)
- [ ] Due date approaching -> Payment DUE_SOON

### 5. Blocking a payment requires explicit reason
- [ ] Attempt to block without reason -> **MUST FAIL**
- [ ] Block with predefined reason + explanation -> **MUST SUCCEED**
- [ ] Check audit log shows reason
- [ ] Check blocked item visible in Owner dashboard

### 6. History must be immutable
- [ ] Check audit log entries cannot be deleted via UI
- [ ] Verify all mutations create audit entries

### 7. No silent edits, deletions, or overrides
- [ ] All BOQ changes logged
- [ ] All milestone transitions logged
- [ ] All evidence reviews logged
- [ ] All payment status changes logged

---

## Role-Based Access Control

### Owner Role
- [ ] Can create projects
- [ ] Can manage roles (add/remove users)
- [ ] Can approve BOQ
- [ ] Can verify milestones
- [ ] Can block payments
- [ ] Can unblock payments (with reason)
- [ ] Can mark payments as paid
- [ ] Can export audit log

### PMC Role
- [ ] Can edit BOQ (DRAFT only)
- [ ] CANNOT approve BOQ -> **MUST FAIL**
- [ ] Can review evidence
- [ ] Can verify milestones
- [ ] Can block payments
- [ ] CANNOT unblock payments -> **MUST FAIL**
- [ ] Can mark payments as paid
- [ ] Can export audit log

### Vendor Role
- [ ] Can submit evidence
- [ ] CANNOT approve own evidence -> **MUST FAIL**
- [ ] CANNOT verify milestones -> **MUST FAIL**
- [ ] CANNOT block payments -> **MUST FAIL**
- [ ] CANNOT mark payments as paid -> **MUST FAIL**
- [ ] Can view payment status (read-only)

### Viewer Role
- [ ] Read-only access to all data
- [ ] CANNOT perform any mutations -> **MUST FAIL**

---

## Milestone State Machine

### Valid Transitions
- [ ] DRAFT -> IN_PROGRESS (any role except VIEWER)
- [ ] IN_PROGRESS -> SUBMITTED (VENDOR only, with evidence)
- [ ] SUBMITTED -> VERIFIED (OWNER/PMC only)
- [ ] SUBMITTED -> IN_PROGRESS (rejection by OWNER/PMC, requires reason)
- [ ] VERIFIED -> CLOSED (OWNER/PMC only)

### Invalid Transitions (All Must Fail)
- [ ] DRAFT -> SUBMITTED (skip)
- [ ] DRAFT -> VERIFIED (skip)
- [ ] DRAFT -> CLOSED (skip)
- [ ] IN_PROGRESS -> VERIFIED (skip)
- [ ] IN_PROGRESS -> CLOSED (skip)
- [ ] IN_PROGRESS -> DRAFT (backward)
- [ ] SUBMITTED -> DRAFT (backward except rejection to IN_PROGRESS)
- [ ] VERIFIED -> SUBMITTED (backward)
- [ ] VERIFIED -> IN_PROGRESS (backward)
- [ ] CLOSED -> any state (terminal)

---

## Evidence Management

### Submission Rules
- [ ] At least one file required
- [ ] Qty/Percent must be provided
- [ ] Evidence frozen immediately after submission
- [ ] Evidence cannot be edited after frozen

### Review Rules
- [ ] Only OWNER/PMC can review
- [ ] VENDOR cannot approve own evidence (self-approval check)
- [ ] Rejection requires reason
- [ ] Approved evidence enables verification

### Resubmission Rules
- [ ] After rejection, milestone returns to IN_PROGRESS
- [ ] New evidence can be submitted
- [ ] Old evidence remains frozen (immutable)

---

## BOQ Management

### Draft Phase
- [ ] Items can be added/edited/removed
- [ ] Total value computed correctly

### Approval
- [ ] Only OWNER can approve
- [ ] Cannot approve empty BOQ
- [ ] After approval, BOQ is locked

### Revision
- [ ] Reason required for revision
- [ ] Revision creates version record
- [ ] Audit log captures before/after

---

## Payment Eligibility

### Status Computation
- [ ] NOT_ELIGIBLE: Milestone not verified
- [ ] ELIGIBLE: Milestone verified, value computed
- [ ] DUE_SOON: Verified and within threshold of due date

### Manual Marking
- [ ] BLOCKED: By OWNER/PMC with reason
- [ ] PAID_MARKED: By OWNER/PMC
- [ ] Cannot mark paid if blocked

### Payment Models
- [ ] ADVANCE: Eligible when milestone starts
- [ ] PROGRESS_BASED: Proportional to verified qty
- [ ] MILESTONE_COMPLETE: 100% only after verification
- [ ] RETENTION: Base minus retention %

---

## Follow-ups

### Automatic Generation
- [ ] Pending evidence review (older than threshold)
- [ ] Pending verification (evidence approved but not verified)
- [ ] Payment due soon
- [ ] Payment blocked too long
- [ ] High vendor exposure
- [ ] BOQ overrun

### Resolution
- [ ] Only OWNER/PMC can resolve
- [ ] Resolution note required
- [ ] Logged in audit trail

---

## Dashboards

### Owner Dashboard
- [ ] Shows verified vs unpaid value
- [ ] Shows advance exposure
- [ ] Shows blocked payments summary
- [ ] Shows high-risk vendors
- [ ] Shows BOQ overruns

### PMC Dashboard
- [ ] Shows pending evidence reviews
- [ ] Shows due payments
- [ ] Shows blocked items
- [ ] Shows upcoming deadlines

### Vendor Dashboard
- [ ] Shows milestone status summary
- [ ] Shows rejections with reasons
- [ ] Shows pending approvals
- [ ] Shows payment status (read-only)

---

## Audit Log

### Content Verification
- [ ] Every mutation logged
- [ ] Actor, role, timestamp captured
- [ ] Before/after state captured
- [ ] Reason captured when applicable

### Export
- [ ] CSV export works
- [ ] All fields included
- [ ] Proper formatting

---

## API Security

### Authentication
- [ ] Unauthenticated requests return 401
- [ ] Invalid session returns 401
- [ ] Session expires correctly

### Authorization
- [ ] Role checks on every endpoint
- [ ] Project membership verified
- [ ] FORBIDDEN returned for unauthorized actions

---

## Data Integrity

### Immutability
- [ ] Audit logs cannot be modified
- [ ] State transitions are append-only
- [ ] Evidence frozen after submission

### Validation
- [ ] Required fields enforced
- [ ] Value ranges validated
- [ ] State machine rules enforced

---

## End-to-End Scenarios

### Scenario 1: Complete Milestone Lifecycle
1. [ ] Create project
2. [ ] Add roles
3. [ ] Create and approve BOQ
4. [ ] Create milestone with BOQ link
5. [ ] Move to IN_PROGRESS
6. [ ] Submit evidence (as Vendor)
7. [ ] Review and approve evidence (as PMC)
8. [ ] Verify milestone (as PMC)
9. [ ] Payment becomes ELIGIBLE
10. [ ] Mark as paid (as Owner)
11. [ ] Close milestone

### Scenario 2: Rejection and Resubmission
1. [ ] Vendor submits evidence
2. [ ] PMC rejects with reason
3. [ ] Milestone returns to IN_PROGRESS
4. [ ] Vendor submits new evidence
5. [ ] PMC approves
6. [ ] Verification proceeds

### Scenario 3: Payment Blocking
1. [ ] Milestone verified, payment ELIGIBLE
2. [ ] PMC blocks with reason
3. [ ] Payment shows BLOCKED
4. [ ] Owner unblocks with reason
5. [ ] Payment returns to ELIGIBLE
6. [ ] Mark as paid

---

## Notes

- All failed operations should show clear error messages
- All actions should be reflected in audit log
- Refresh pages to verify state persisted correctly
- Test with multiple browser sessions for different roles
