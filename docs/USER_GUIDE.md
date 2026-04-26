# User Guide

Last update: 2026-03-07
Audience: Student, instructor, admin, finance operator

## Student

Primary pages:
- dashboard
- my attendance
- my homework
- my grades
- my finance
- chat

Typical flow:
1. Log in.
2. Check dashboard widgets for schedule and weekly attendance.
3. Open homework to submit text or file.
4. Open grades to review detailed scores and download the PDF report card.
5. Open finance to review bills and submit a receipt.
6. Use chat for direct or class-group communication.

## Instructor

Primary pages:
- instructor dashboard
- attendance manager
- homework manager
- grade manager
- chat

Typical flow:
1. Check today’s schedule from the dashboard.
2. Record attendance.
3. Create homework and review submissions separately.
4. Enter grades and attach the grade-sheet file.
5. Start or join class communication from chat/virtual class.

## Admin

Primary pages:
- admin panel
- admin logs
- admin settings
- admin schedule
- admin finance

Typical flow:
1. Use the admin panel for global search and priority alerts.
2. Review logs and export CSV when needed.
3. Update menus, home page content, and footer content from admin settings.
4. Manage schedules, education core data, and finance operations from the dedicated admin pages.

## Finance Operator

Primary pages:
- admin finance
- admin panel alerts

Typical flow:
1. Review pending receipts in stage order.
2. Confirm receipt file, amount, and approval trail.
3. Approve or reject based on the current stage.
4. Use reports, reminders, and CSV export from the finance center.

## Common Support Notes

- Uploaded files are served from `/uploads/` and should remain reachable after deployment and backup/restore.
- If a user reports missing data after a release, verify the latest backup first before taking corrective action.
- If chat reports connection problems, verify websocket proxying before debugging the UI.
