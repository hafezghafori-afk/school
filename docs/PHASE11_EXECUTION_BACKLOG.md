# Phase 11 - Finalization and Deployment Execution Backlog

Last update: 2026-03-07
Status: Complete
Phase owner: Release operations / deployment / backup and restore / user-operational readiness

## Objective

Close Phase 11 with these deliverables:

1. Final release verification across backend and frontend
2. Security audit evidence captured for the release candidate
3. Backup and restore scripts plus an operator runbook
4. Deployment runbook and release checklist
5. User and operator documentation
6. Final signoff with production-readiness evidence

## Current Baseline

- CI already existed for backend syntax/smoke and frontend smoke/responsive coverage.
- Security audit and Lighthouse baseline tooling already existed.
- Missing items before closure were operational rather than feature-level:
  - no first-class backup script
  - no first-class restore script or restore drill instructions
  - no deployment runbook
  - no release checklist
  - no final user guide
  - no Phase 11 signoff doc

## Exit Criteria

Phase 11 is done only when all of these are true:

1. Backup and restore commands exist in the repo and are documented.
2. Backup output includes database content and uploaded files.
3. Restore workflow is documented with destructive-action safety gates.
4. Deployment steps and rollback expectations are documented.
5. A release checklist exists for operators.
6. User-facing guidance exists for student, instructor, admin, and finance operator flows.
7. Backend operational readiness checks and release verification commands pass.
8. Frontend release verification commands pass.
9. Final signoff is documented.

## Backlog

| ID | Priority | Stream | Status | Task | Expected output | Depends on | Key files |
|---|---|---|---|---|---|---|---|
| `P11-BE-01` | High | Backend | Completed | Add first-class backup script. | `npm run backup:create` produces a manifest, per-collection database dump, and upload-file copy under `backend/backups/`. | None | `backend/scripts/backupDatabase.js`, `backend/scripts/backupRestoreShared.js`, `backend/package.json` |
| `P11-BE-02` | High | Backend | Completed | Add first-class restore script with safety gates. | `npm run backup:restore -- --in <dir> --force` restores collections and uploads from a backup manifest. | `P11-BE-01` | `backend/scripts/restoreDatabase.js`, `backend/scripts/backupRestoreShared.js`, `backend/package.json` |
| `P11-BE-03` | High | Backend | Completed | Add operational readiness check and release preflight command. | Required docs/scripts are validated by `npm run check:operations`, and `npm run release:preflight` chains backend verification. | `P11-BE-01`, `P11-BE-02` | `backend/scripts/checkOperationalReadiness.js`, `backend/package.json`, `backend/.gitignore` |
| `P11-DOC-01` | High | Docs | Completed | Write backup and restore runbook. | Operators have a clear backup, validation, and restore drill guide. | `P11-BE-01`, `P11-BE-02` | `docs/BACKUP_RESTORE_RUNBOOK.md` |
| `P11-DOC-02` | High | Docs | Completed | Write deployment runbook and release checklist. | Release and rollback flow are documented for production deployment. | `P11-BE-03` | `docs/DEPLOYMENT_RUNBOOK.md`, `docs/RELEASE_CHECKLIST.md` |
| `P11-DOC-03` | High | Docs | Completed | Write user and operator guide. | Student, instructor, admin, and finance operator workflows are documented. | None | `docs/USER_GUIDE.md` |
| `P11-QA-01` | High | QA | Completed | Execute backend release preflight. | Backend syntax, permissions, route smokes, security audit, backup planning, and operations checks are green. | Backend tasks | `backend/package.json`, `backend/scripts/checkOperationalReadiness.js`, `docs/security/SECURITY_AUDIT_2026-03-05.md` |
| `P11-QA-02` | High | QA | Completed | Execute frontend release verification. | Frontend lint, build/smoke, Playwright smoke/responsive, and Lighthouse baseline are green. | Doc tasks | `frontend/package.json`, `docs/performance/lighthouse-baseline-2026-03-06.md` |
| `P11-DOC-04` | Medium | Docs | Completed | Sync progress matrix and signoff. | Phase 11 completion is reflected in the roadmap matrix and signoff evidence. | All tasks | `docs/PROJECT_PROGRESS_MATRIX.md`, `docs/PHASE11_SIGNOFF.md` |

## Recommended Implementation Order

All tracked Phase 11 backlog items are complete.

## Progress Log

- 2026-03-07: Opened the finalization backlog around missing operations work: backup/restore, deployment guide, release checklist, user docs, and signoff.
- 2026-03-07: Completed `P11-BE-01`, `P11-BE-02`, and `P11-BE-03` by adding backup/restore scripts, a release preflight command, and an operational readiness checker.
- 2026-03-07: Completed `P11-DOC-01`, `P11-DOC-02`, and `P11-DOC-03` by adding the backup/restore runbook, deployment guide, release checklist, and user guide.
- 2026-03-07: Completed `P11-QA-01` and `P11-QA-02` with backend and frontend release verification.
- 2026-03-07: Completed `P11-DOC-04` with matrix sync and final signoff.

## Notes

- Backup output lives under `backend/backups/` and is ignored by git via `backend/.gitignore`.
- Restore remains intentionally destructive and therefore requires the explicit `--force` flag outside dry-run mode.
- Final release verification reuses earlier phase-specific signoffs and focuses on cross-cutting operational readiness.
