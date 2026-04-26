# UI Consistency Matrix

Last update: 2026-03-05 (sync after menu/drawer stabilization)

## Scope
- Global header layout consistency (topbar + midbar + nav shell)
- Desktop navigation behavior (mega menu structure and overflow)
- Mobile drawer behavior (open/close, visibility, and route click close)
- Typography/spacing/interaction consistency in public and dashboard pages
- Responsive behavior across `320/375/768/1024/1280/1440`

## Matrix
| Area | Surface | Status | Responsive | Notes |
|---|---|---|---|---|
| Header composition | `App.jsx` header (`topbar`, `midbar`, `main-nav-shell`) | PASS | PASS | Search/language/logo/hours/contact blocks collapse correctly by breakpoints. |
| Desktop menu rail | `.desktop-nav`, `.main-nav-list` in `App.css` | PASS | PASS | Horizontal nav kept single-row; overflow handled by horizontal scroll without layout break. |
| Desktop mega menu | `.nav-menu-mega`, `.nav-menu-grid-sections` | PASS | PASS | Mega panel has bounded height and inner scroll; long submenus remain reachable. |
| Mobile trigger bar | `.mobile-nav-bar`, `.mobile-nav-toggle` | PASS | PASS | Hamburger appears at `<=1280px`; desktop nav hides at same breakpoint. |
| Mobile drawer visibility | `.mobile-nav-drawer`, `.mobile-nav-backdrop` | PASS | PASS | Drawer is fully hidden in closed state (`opacity:0`, `visibility:hidden`, `pointer-events:none`, translated off-canvas). |
| Mobile close behavior | drawer click handlers in `App.jsx` | PASS | PASS | Drawer closes on backdrop click and any valid link click (including same-route links). |
| Public pages consistency | `Home`, `Courses`, `News`, `Gallery`, `About`, `FAQ`, `Terms`, `Contact` | PASS | PASS | Card rhythm, CTA behavior, and section spacing aligned. |
| Auth consistency | `Login`, `Register`, `AdminLogin`, `InstructorLogin` | PASS | PASS | Form sizing, button styles, and focus states are unified. |
| Dashboard consistency | student/instructor/admin panels and child pages | PASS | PASS | Dashboard cards, action buttons, and readable contrast are aligned. |

## Navigation Rules (Current Baseline)
- Desktop: mega menu opens on hover/focus and keeps keyboard accessibility.
- Desktop: mega menu uses centered panel with bounded viewport height.
- Mobile: right-side drawer only appears via hamburger button.
- Mobile: drawer auto-closes after navigation click.
- Global: no permanent off-canvas white gap; root/app horizontal overflow is clipped.

## Interaction Baseline
- `focus-visible` rings are present for interactive controls.
- Hover states use consistent lift/background/border feedback.
- Mobile action buttons keep minimum tap target sizes.
- Unread indicators use shared badge patterns (`news`, `chat`, `dot`, `pulse`).

## Performance/Behavior Notes
- Lazy route loading with `Suspense` in `App.jsx`.
- Prefetch on hover/focus for menu/search links.
- Dev proxy routing in `vite.config.js` for `/api`, `/uploads`, `/socket.io`.
- Dashboard health monitor in `App.jsx` checks `/api/health` (periodic + manual re-check).
