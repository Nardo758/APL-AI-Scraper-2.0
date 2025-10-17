# Repository TODO

This TODO tracks the remaining conservative lint cleanup, validation, and release steps.

- [ ] Fix top-10 ESLint offenders (minimal reversible edits: void, _-prefix, safe import removal)
- [ ] Re-run ESLint on patched files and capture JSON output
- [ ] Run unit & integration tests locally
- [ ] Commit cleanup edits and TODO
- [ ] Push commits to remote and open draft PR
- [ ] Iterate next batches until lint warnings are below target threshold

Notes:
- Edits should be minimal and not change runtime behavior.
- For any change touching database migrations, require manual review before applying to production.
