# Performance Baselines

This folder stores Lighthouse baseline outputs and trend history.

## Files
- `lighthouse-history.json`: rolling timeline of Lighthouse results (mobile + desktop).
- `lighthouse-latest.json`: latest run snapshot.
- `lighthouse-baseline-YYYY-MM-DD.md`: human-readable report for each baseline run.

## Run
From `frontend`:

```bash
npm run perf:lighthouse
```

Optional:
- `LIGHTHOUSE_TARGET_URL`: run against an already running URL instead of launching `vite preview`.
- `LIGHTHOUSE_CHROME_PATH`: force a custom Chrome/Chromium executable.

Windows note:
- Lighthouse may print temporary-folder cleanup `EPERM` warnings after finishing.
- The script keeps the run valid if JSON output is produced successfully.
