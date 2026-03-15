# Job Runtime Helpers

This folder is for shared runtime plumbing used by standalone jobs.

Current contents:

- env loading and normalization
- settings-backed env hydration
- workspace resolution
- DB client helpers for CLI jobs
- shared date-window or CLI parsing helpers

Do not place connector-specific API logic here.
