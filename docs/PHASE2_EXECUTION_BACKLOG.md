# Phase 2 - Core Roles And Access

Last update: 2026-03-10
Status: Complete
Phase owner: User identity / permissions / backward-compatible auth cutover

## Objective

Close Phase 2 with one clear outcome:

1. The final role model is added to the live system without breaking current routes.
2. Auth and permission checks read the canonical role model first.
3. Temporary fallback compatibility remains in place until later cleanup.

## Scope

In scope for Phase 2:

- add `orgRole` and `status` to `User`
- make permission resolution `orgRole`-first
- keep `role` compatibility for existing route guards
- keep `adminLevel` as temporary fallback only
- align logs, profile flows, and admin tooling with canonical role identity

Out of scope for Phase 2:

- final removal of `adminLevel`
- final removal of compatibility `role`
- academic membership cleanup
- class ownership cleanup
- release-device QA gates unrelated to role implementation

## Main Files

- `backend/models/User.js`
- `backend/utils/permissions.js`
- `backend/middleware/auth.js`
- `backend/routes/authRoutes.js`
- `backend/routes/adminRoutes.js`
- `backend/routes/userRoutes.js`
- `backend/utils/activity.js`
- `backend/models/ActivityLog.js`

## Delivered Outcome

### 1. Canonical user identity

- `User.orgRole` exists and is treated as the canonical organizational role.
- `User.status` exists for active/inactive/suspended lifecycle handling.
- `role` remains available for compatibility.
- `adminLevel` remains available as temporary fallback only.

### 2. Permission resolution

- Permission checks resolve from `orgRole` first.
- `adminLevel` and legacy role data are only used to protect compatibility paths.
- Existing route guards continue to work without a breaking cutover.

### 3. Workflow alignment

- Admin user-management UI is aligned with canonical org-role vocabulary.
- Profile, login payloads, and admin logging include canonical role identity.
- Finance follow-up and approval flows use canonical organizational roles.

## Exit Criteria

Phase 2 is done only when all of these are true:

1. All users have valid `orgRole` values.
2. `auth` and permission resolution work from `orgRole` first.
3. Existing routes still function through compatibility fallbacks.
4. Canonical role identity appears consistently in auth/admin/profile/logging flows.
5. No route depends on `adminLevel` as the primary source of truth.

## Backlog

| ID | Priority | Stream | Status | Task | Expected output |
|---|---|---|---|---|---|
| `P2-BE-01` | High | Backend | Completed | Add `orgRole` and `status` to `User`. | Canonical role/status fields exist in the user model. |
| `P2-BE-02` | High | Backend | Completed | Move permission resolution to `orgRole`-first. | Permission checks read canonical role identity first. |
| `P2-BE-03` | High | Backend | Completed | Preserve `adminLevel` as temporary fallback only. | Existing routes continue to work while migration stays safe. |
| `P2-BE-04` | Medium | Backend | Completed | Backfill and integrity-check role data. | Current users carry valid canonical org roles. |
| `P2-BE-05` | Medium | Backend | Completed | Align logging and workflow identity to canonical roles. | Admin/activity logs include canonical org role context. |
| `P2-FE-01` | Medium | Frontend | Completed | Align admin user management to `orgRole/status`. | Admin UI uses canonical role language. |
| `P2-FE-02` | Medium | Frontend | Completed | Align profile/admin logs/admin dashboard to canonical role vocabulary. | Canonical org-role language is visible to operators. |
| `P2-QA-01` | Medium | QA | Completed | Run smoke/build/admin workflow verification. | Core role/access implementation is regression-checked. |
| `P2-QA-02` | Medium | QA | Completed | Reconfirm that broader device/browser checks belong to release QA, not Phase 2 closure. | Phase 2 closure is no longer blocked by non-role release-device coverage. |

## Verification Evidence

- `cd backend && npm run check:permissions` -> PASS
- `cd backend && npm run check:role-integrity` -> PASS
- `cd backend && npm run test:smoke` -> PASS
- `cd frontend && npm run build` -> PASS
- `cd frontend && npm run test:e2e:admin` -> PASS
- Manual verification: Desktop Chrome/Brave and iPhone Safari confirm canonical role/access flows remain readable and usable.

## Progress Log

- 2026-03-07: Canonical `orgRole` strategy introduced.
- 2026-03-08: Permission resolution and compatibility fallback implemented.
- 2026-03-09: Admin/profile/logging flows aligned with canonical role identity.
- 2026-03-10: Phase 2 documented separately from the model-freeze phase to keep implementation and architecture concerns distinct.
- 2026-03-10: Shared frontend auth-session persistence now stores `orgRole/status`, finance surfaces resolve authority from canonical role identity first, and logout cleanup clears canonical session fields.

## Notes

- Phase 2 should now be treated as implementation, not redesign.
- Remaining cleanup is compatibility reduction, not role-model uncertainty.
- Academic ownership work stays outside this phase.
- Release-device breadth is tracked separately and does not block Phase 2 signoff.
