# Security Audit Report - 2026-03-05

## Scope
- Backend runtime/auth configuration
- Secret handling in tracked files
- `.env` ignore coverage for frontend/backend

## Commands
- `cd backend && npm run audit:security`

## Implemented Hardening
- Added centralized env helpers in `backend/utils/env.js`:
  - strict JWT secret policy (`getJwtSecret`)
  - controlled CORS allow-list (`getCorsOptions`)
- Applied helper usage in:
  - `backend/server.js`
  - `backend/routes/authRoutes.js`
  - `backend/middleware/auth.js`
- Added secret hygiene:
  - `frontend/.gitignore` includes `.env`
  - `backend/.gitignore` includes `.env`
  - `backend/.env.example` added as sanitized template
- Added automated scanner:
  - `backend/scripts/securityAudit.js`
  - npm script: `audit:security`

## Findings Timeline
- Initial run: 3 high findings
  - weak local `JWT_SECRET`
  - hardcoded seed password in seed script
  - false positives from scanning prior report output
- Final run (after fixes): 0 findings
  - Source: `docs/security/security-audit-latest.json`

## Actions Taken
- Removed hardcoded password from `backend/scripts/setUsersAndRoles.js`
  - now requires `SEED_PASSWORD` env var (min length 8)
- Updated scanner to ignore its own output file to prevent recursive false positives
- Rotated local backend `JWT_SECRET` to a strong random value

## Status
- `P0-OT-05`: Completed
