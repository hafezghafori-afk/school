# Responsive QA Checklist

Last update: 2026-03-05
Owner: Frontend QA

## Target Breakpoints
- `320x900` (small mobile)
- `375x900` (standard mobile)
- `768x1024` (tablet)
- `1024x900` (small laptop / tablet landscape)
- `1440x900` (desktop)

## Critical Routes
- `/`
- `/login`
- `/register`
- `/contact`
- `/dashboard`
- `/admin`
- `/chat`

## Core Checks
- Page is not blank (`#root` visible and meaningful text visible).
- No horizontal overflow (`scrollWidth - clientWidth <= 2`).
- Header/nav behavior is correct:
  - `<=1280`: mobile nav toggle is shown on public-header routes.
  - `>1280`: desktop nav is shown.
- Mobile drawer behavior:
  - opens from hamburger button
  - closes after clicking a menu link
- Desktop dropdown behavior:
  - mega menu appears on hover

## Notes
- Some routes call backend APIs during render. When backend is offline in QA runs, proxy errors may appear in logs but should not break layout checks.
- Physical-device verification is moved to the Phase 1 pre-release QA gate (Android/iOS/Desktop real-device pass).
