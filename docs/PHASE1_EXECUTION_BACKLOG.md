# Phase 1 - Final Data Model Freeze

Last update: 2026-03-10
Status: Completed
Phase owner: Data-model decisions / domain ownership / migration target

## Objective

Close Phase 1 with one clear outcome:

1. The final target model is frozen for roles, class ownership, student membership, and finance boundaries.
2. The current implementation no longer has architectural ambiguity about which model owns which truth.
3. Phase 2 can proceed as implementation work, not redesign work.

## Final Decisions Frozen In Phase 1

### 1. Role ownership

- `orgRole` is the canonical organizational identity.
- `role` remains a compatibility field for existing route guards.
- `adminLevel` remains a temporary fallback only during migration.
- Final canonical `orgRole` values:
  - `student`
  - `instructor`
  - `finance_manager`
  - `finance_lead`
  - `general_president`

### 2. Academic ownership

- `Enrollment` is only a request or intake record.
- `StudentMembership` is the real student-class membership record.
- `Order` is no longer the intended long-term source of truth for academic access.
- `Course` remains the current compatibility carrier for the class concept until later cleanup; the project does not rename or replace it in this phase.
- `AcademicYear`, `Subject`, and `InstructorSubject` remain canonical base-academic models.

### 3. Finance ownership

- Canonical finance truth belongs to `FinanceBill` and `FinanceReceipt`.
- `Order` may remain as a compatibility workflow or bridge, but not as the final owner of finance truth.
- Academic access and finance approval are separate domains and must not share one source of truth going forward.

## Mapping From Current Model To Final Model

| Current model / field | Interim meaning in old system | Final target meaning |
|---|---|---|
| `User.role` | broad route role (`student` / `instructor` / `admin`) | compatibility only |
| `User.orgRole` | new canonical org identity | final organizational role |
| `User.adminLevel` | finance/admin hierarchy | temporary fallback only |
| `Enrollment` | mixed understanding in earlier flows | request / intake only |
| `Order` | enrollment + payment + access shortcut | compatibility workflow only |
| `StudentMembership` | not present in old system | real student-class membership |
| `Course` | class/course mixed container | current compatibility class carrier |
| `FinanceBill` | canonical billing | final finance obligation |
| `FinanceReceipt` | canonical receipt approval | final finance payment proof |

## Ownership Table To Remove Ambiguity

| Domain question | Final owner |
|---|---|
| Who is this user organizationally? | `User.orgRole` |
| Is this person an active student of this class? | `StudentMembership` |
| Did this person submit an enrollment/request flow? | `Enrollment` or compatibility `Order` flow |
| Can this student access class data academically? | `StudentMembership` first |
| What is the current compatibility class container? | `Course` |
| What is the finance bill/obligation? | `FinanceBill` |
| What is the approved receipt/payment proof? | `FinanceReceipt` |

## Scope Boundaries

In scope for Phase 1:

- freeze final ownership of roles
- freeze final ownership of class versus request versus membership
- freeze final finance boundary
- publish current-to-final mapping
- remove architectural ambiguity before implementation continues

Out of scope for Phase 1:

- full route cutover to the new role model
- full UI migration
- final class-versus-course rename/refactor
- full legacy `Order` removal
- release QA or device testing as a signoff gate for this phase

## Exit Criteria

Phase 1 is done only when all of these are true:

1. `orgRole` is explicitly documented as canonical role identity.
2. `Enrollment` is explicitly frozen as request-only.
3. `StudentMembership` is explicitly frozen as real membership.
4. `Order` is explicitly frozen as non-canonical for academic access.
5. Finance ownership is explicitly separated into canonical finance models.
6. No unresolved ambiguity remains in `role / class / membership / finance ownership`.

## Backlog

| ID | Priority | Stream | Status | Task | Expected output |
|---|---|---|---|---|---|
| `P1-ARC-01` | High | Architecture | Completed | Freeze canonical role ownership. | `orgRole` is approved as final organizational identity. |
| `P1-ARC-02` | High | Architecture | Completed | Freeze academic request versus membership ownership. | `Enrollment`, `StudentMembership`, `Order`, and `Course` each have one clear meaning. |
| `P1-ARC-03` | High | Architecture | Completed | Freeze finance ownership boundary. | Canonical finance ownership is separated from academic access ownership. |
| `P1-DOC-01` | Medium | Docs | Completed | Publish final mapping from current model to target model. | Phase 2 can proceed without reopening model decisions. |

## Progress Log

- 2026-03-07: Role-model compatibility strategy was introduced around `orgRole`, `role`, and `adminLevel`.
- 2026-03-09: Access, profile, admin, and logging flows were aligned to the canonical role vocabulary in implementation.
- 2026-03-10: `StudentMembership` was introduced in backend as the concrete implementation target for the frozen membership model.
- 2026-03-10: Phase 1 was formally reframed and closed as the model-freeze phase so that later work can be treated as implementation, not redesign.

## Notes

- This phase is intentionally a decision-freeze phase.
- The existence of partial implementation does not change the ownership decisions above.
- All further work on roles/access belongs to Phase 2.
- All further work on academic data cleanup must respect this frozen ownership model.
