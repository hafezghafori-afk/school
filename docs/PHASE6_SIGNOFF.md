# Phase 6 - Signoff

Signoff date: 2026-03-06
Scope: Detailed grading with `40` points across four `10`-point assessment parts, `60`-point final exam, attachment-backed grade edits, and PDF report card output.

## Validation Evidence
| Check | Command | Result |
|---|---|---|
| Backend smoke chain | `npm run test:smoke` (in `backend`) | PASS |
| Backend grade route smoke | `npm run check:grade-routes` (in `backend`) | PASS (`9` route-smoke cases) |
| Frontend lint | `npm run lint` (in `frontend`) | PASS |
| Frontend production build | `npm run build` (in `frontend`) | PASS (`vite build` completed successfully) |
| Grade Playwright workflow | `npm run test:e2e:grades` (in `frontend`) | PASS (`2/2` tests) |

## Scenario Coverage
- Grade schema now stores the `40`-point section as four distinct `10`-point assessments plus a computed section total, alongside the `60`-point final exam.
- Grade create/edit requires uploading the grade-sheet attachment and stores attachment metadata for the latest edit.
- Existing legacy `40/60` rows are normalized on read so current data does not break while the detailed model is rolled out.
- Instructor grade management UI supports entering all four `10`-point assessment scores, the `60`-point final exam score, and the grade-sheet file in one reviewable workflow.
- Student grades UI shows the detailed `40`-point breakdown, final exam score, total score, grade-sheet link, and report-card PDF link.
- Backend report-card route returns a PDF attachment response for the course/student report card.

## Decision
Phase 6 is COMPLETE as of 2026-03-06.

## Carry-over
No roadmap blocker remains for Phase 6.

Future grading changes should update:
- `backend/models/Grade.js`
- `backend/routes/gradeRoutes.js`
- `backend/scripts/checkGradeRoutes.js`
- `frontend/src/pages/GradeManager.jsx`
- `frontend/src/pages/MyGrades.jsx`
- `frontend/tests/e2e/grade.workflow.spec.js`

## Stakeholder Approval
- Approval status: CONFIRMED
- Confirmed by: Product owner / operator (chat confirmation)
- Confirmation date: 2026-03-06

## Notes
- Route smoke explicitly covers both the new detailed grading model and backward-compatible reads for legacy `term1Score / term2Score` records.
