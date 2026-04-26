# Exam Mark Entry Runbook

This runbook keeps mark entry on the canonical exam engine and avoids direct edits in MongoDB.

## Preview the current roster

```bash
cd backend
npm run preview:exam-session-marks -- --session=<sessionId>
```

The output includes a mark-entry template for each `studentMembershipId`.

## Apply marks from a JSON file

Create a JSON file with either:

- an array of entries
- or an object with `entries`

Example:

```json
{
  "entries": [
    {
      "studentMembershipId": "membership-id-1",
      "markStatus": "recorded",
      "obtainedMark": 86,
      "totalMark": 100,
      "note": "first pass"
    }
  ]
}
```

Apply it with:

```bash
cd backend
npm run apply:exam-session-marks -- --session=<sessionId> --file=./path/to/marks.json
```

## Notes

- The script updates marks through `upsertExamMark`, not direct collection writes.
- Each update automatically recomputes canonical `ExamResult` rows.
- Use backup before applying marks to a live session.
