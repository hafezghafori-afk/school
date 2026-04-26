# Timetable Generation Publish Gates

Date: 2026-04-14
Owner: Scheduling Admin Team
Scope: /timetable/generation for one school + one academic year + one shift

## 1) Purpose
Use this gate before pressing "Publish" so timetable releases are consistent and safe.

## 2) Non-Negotiable Preconditions
All items below must be true before generation:
- Active academic year is selected.
- Correct shift is selected.
- Period definitions exist for the selected year and shift.
- Teacher assignments exist and are active.
- Core teacher availability is recorded.

If any precondition fails, stop and fix data first.

## 3) Numeric Acceptance Thresholds
Release can be published only when all thresholds pass:

| Metric | Source | Accept | Warn | Block |
| --- | --- | --- | --- | --- |
| Teacher conflicts | conflicts summary | 0 | 1-2 | >=3 |
| Class conflicts | conflicts summary | 0 | 1-2 | >=3 |
| Total conflicts | conflicts summary | 0 | 1-3 | >=4 |
| Unscheduled assignments (core subjects) | generation result | 0 | 1 | >=2 |
| Unscheduled assignments (all subjects) | generation result | <=1% of required periods | >1% and <=3% | >3% |
| Generated coverage | scheduledEntries / required periods | >=99% | >=97% and <99% | <97% |

Core subjects for blocking: Language, Mathematics, Science (and school-specific mandatory subjects).

## 4) Decision Rule
- Publish: all metrics in Accept band.
- Publish with approval note: metrics only in Warn band and principal approves.
- Do not publish: any metric in Block band.

## 5) Standard Execution Flow
1. Select year and shift.
2. Open conflict view and record baseline counts.
3. Press "Generate".
4. Record generated entries, conflicts, and unscheduled assignments.
5. Verify class and teacher views for at least:
- 2 primary grades
- 2 secondary grades
- 3 teachers from different subjects
6. Apply decision rule (Publish / Publish with approval / Block).
7. If published, record release note with timestamp and operator.

## 6) Release Note Template
Use this in operation log or admin note:

- School: <school name>
- Academic year: <year>
- Shift: <shift>
- Generated entries: <count>
- Teacher conflicts: <count>
- Class conflicts: <count>
- Unscheduled core: <count>
- Unscheduled total: <count> (<percent>%)
- Coverage: <percent>%
- Decision: <Publish | Publish with approval | Block>
- Approved by: <name/role>
- Operator: <name>
- Time: <ISO timestamp>
- Notes: <short reason>

## 7) Fast Troubleshooting Guide
If conflicts are high:
- Recheck teacher availability day/period constraints.
- Recheck duplicate teacher assignments per same slot pressure.
- Recheck period definitions (lab/computer labels for special subjects).

If unscheduled is high:
- Increase available class periods where possible.
- Balance teacher load limits (max per day/week).
- Add backup teacher assignment for overloaded subjects.

## 8) Governance
- Keep this gate unchanged during active term unless approved by principal + scheduling owner.
- Review thresholds at term boundary using real outcomes.
