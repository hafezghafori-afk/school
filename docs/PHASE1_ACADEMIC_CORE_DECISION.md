# Phase 1 Academic Core Decision

Status: adopted for implementation
Last update: 2026-03-12
Scope: canonical academic core for year, class, student, membership, and teacher assignment.

## Canonical Decisions

- `AcademicYear` is the canonical school year model.
- `SchoolClass` is the canonical academic class model.
- `Course` remains a compatibility carrier during cutover.
- `User` remains the authentication and authorization identity.
- `StudentCore` is the canonical student identity record.
- `StudentProfile` stores the extended non-transactional student profile.
- `StudentMembership` is the canonical student-year-class membership record.
- `TeacherAssignment` is the canonical teacher-to-class / subject assignment record.
- `AcademicTerm` is the canonical calendar segment for term / assessment-period usage.

## Compatibility Strategy

During cutover, the old models stay readable:

- `Course(kind='academic_class')` keeps serving existing routes.
- `StudentMembership.student`, `course`, `academicYear`, `joinedAt`, and `leftAt` remain in place.
- New canonical fields are added beside the old ones:
  - `studentId`
  - `classId`
  - `academicYearId`
  - `enrolledAt`
  - `endedAt`
  - `endedReason`
  - `promotedFromMembershipId`
- `InstructorSubject` remains a compatibility source for backfilling `TeacherAssignment`.

## Final Ownership Table

| Domain question | Final owner | Compatibility owner during cutover |
|---|---|---|
| What is the school year? | `AcademicYear` | none |
| What is the academic class? | `SchoolClass` | `Course(kind='academic_class')` |
| Who is the student as a person? | `StudentCore` | `User(role='student')` |
| Where is extended student profile data? | `StudentProfile` | `Enrollment` request-only fields |
| Which class is the student in for a year? | `StudentMembership` | `StudentMembership.student/course` legacy fields |
| Which teacher teaches which class/subject? | `TeacherAssignment` | `InstructorSubject`, `Course.homeroomInstructor`, `Schedule` |
| What is the canonical term / assessment period segment? | `AcademicTerm` | free-text `term` fields |

## StudentMembership Target Shape

Canonical target fields:

- `studentId`
- `academicYearId`
- `classId`
- `status`
- `enrolledAt`
- `endedAt`
- `endedReason`
- `source`
- `promotedFromMembershipId`

Compatibility fields kept during cutover:

- `student`
- `course`
- `academicYear`
- `joinedAt`
- `leftAt`
- `legacyOrder`

## Current To Target Mapping

| Current model / field | Target model / field |
|---|---|
| `Course(kind='academic_class')` | `SchoolClass` |
| `Course.schoolClassRef` | compatibility link to `SchoolClass` |
| `User(role='student')` | `StudentCore.userId` |
| `Enrollment` family / intake data | `StudentProfile` or dedicated student profile sub-models later |
| `StudentMembership.student` | `StudentMembership.studentId` via `StudentCore` |
| `StudentMembership.course` | `StudentMembership.classId` via `SchoolClass` |
| `StudentMembership.academicYear` | `StudentMembership.academicYearId` |
| `StudentMembership.joinedAt` | `StudentMembership.enrolledAt` |
| `StudentMembership.leftAt` | `StudentMembership.endedAt` |
| `InstructorSubject` | `TeacherAssignment` |
| free-text `term` in finance / result domains | `AcademicTerm` |

## Implementation Sequence

1. Create canonical models.
2. Backfill `AcademicYear` from legacy year strings where possible.
3. Backfill `SchoolClass` from `Course(kind='academic_class')`.
4. Backfill `StudentCore` and `StudentProfile` from student users.
5. Backfill canonical fields inside `StudentMembership`.
6. Backfill `TeacherAssignment` from `InstructorSubject` and homeroom links.
7. Migrate read/write paths in later phases.

## Done Criteria For Phase 1

- canonical academic models exist in the database schema
- compatibility mapping is documented
- backfill tooling exists for first-wave data alignment
- future phases can build on `SchoolClass`, `StudentCore`, `StudentMembership`, and `TeacherAssignment` without redesigning ownership again
