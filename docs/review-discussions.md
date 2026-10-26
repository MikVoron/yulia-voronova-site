# Recipe review discussions

Each user keeps one editable rated review per recipe. Discussion messages have no stars and do not contribute to review counts or average ratings. Editing a review preserves its ID, original creation date, author reply and discussion. Quick star changes omit `text` and preserve the existing review text; an explicit text edit may clear it.

Registered users can add multiple messages under any review and edit/delete their own messages. Administrators can delete messages from other users. Authentication checks blocked accounts; moderation checks the current database role. Deleting a review also deletes its discussion, with an explicit warning in the UI.

The existing single author reply and its helpful reactions remain in their original tables. They appear in the same chronological discussion as new messages. Additional author messages use the new comment endpoint. The shared component is used by recipe pages and review modals on category and ingredient pages.

The initial review response includes up to five messages per review, fetched in one batch query, plus `commentCount`. Further pages contain at most 20 messages. The cursor is a comment ID within that review. A newly posted message appears immediately without advancing the cursor past unread messages. Each submission has a UUID request ID, unique per user, to prevent duplication on a network retry. Requests with a reused ID and different content or review are rejected.

## Files and deployment order

1. Apply `server/migrations/041_review_comments.sql` before installing the API. It creates only the new table, its index and grants, and can be rerun.
2. Install `server/src/review-discussions.js` with the updated `server/src/routes/content.js`, then use the established API release procedure.
3. Install `platform/review-discussions.js`, `platform/review-discussions.css`, and the updated recipe/category/ingredient HTML and page JS together.
4. Verify anonymous reading and a real authenticated discussion on desktop and mobile, including unchanged rating/count, moderation, legacy author replies and helpful reactions. Local fixtures do not prove production installation.

Rollback: restore the prior frontend and API together. Keep the additive comments table so messages are preserved. The API update requires the migration; publishing frontend assets alone does not enable writes.

The scoped release uses `scripts/build-review-discussions-release.cjs` to package exact committed Git blobs for 11 named files. `scripts/install-review-discussions-20261026.py check --manifest-sha <hash>` verifies staging and current production hashes without sudo. Its `apply` phase requires interactive sudo, validates the existing avatar module and DB prerequisites, creates a protected full DB dump and file checkpoint, dry-runs the additive migration with rollback, applies it, installs and checks the API before publishing frontend assets, and verifies the installed hashes. Failures roll back only the files installed by this run and retain the additive table. It restarts only the existing `smartplate-api` PM2 entry and never edits its profile/environment or the release/recovery subsystem. Keep the root-owned checkpoint for recovery; task scratch files and staging can be removed after live verification.

Installer guard and rollback tests: `python3 scripts/test-review-discussions-release.py` (temporary files only).

## Verification

Existing regression tests:

```powershell
cd server
node node_modules/vitest/vitest.mjs run __tests__/content.test.mjs __tests__/review-replies-ui.test.mjs __tests__/review-avatars.test.mjs
```

Browser scenarios use the actual three HTML/JS pages with local API fixtures. They cover desktop/mobile, owner/other/admin/guest, escaped text, an uncertain network outcome followed by retry, editing/deletion, pagination after posting, and editing the original review without creating another rating:

```powershell
node scripts/test-review-discussions-browser.cjs
```

The PostgreSQL integration script exercises actual SQL, JWT middleware and handlers, migration reruns, role grants, validation, ownership, anonymous avatar assignment, pagination, review editing and unchanged legacy data. It supports a disposable native PostgreSQL cluster with no TCP listener via `scripts/test-review-discussions-postgres.sh`. Never use a production connection string. No production environment file is loaded.

Native multiconnection verification passed on 2026-10-26 in a disposable PostgreSQL 16 cluster on the VPS, after explicit authorization to transfer the test package. The archive and all 12 files passed SHA-256 checks. Two overlapping authenticated requests with one request ID returned 200/201 and created one message. The same integration script passed migration reruns, database role grants, JWT authentication, blocked-user handling, validation, ownership, admin moderation, pagination, unchanged ratings, review editing, legacy reply/reaction preservation and cascade deletion. Audit writes and the database module are replaced with isolated test dependencies; no production database or email is used.

Evidence: `tmp/review-discussions-20261026/native-postgres-results.txt` and `native-postgres-postcheck.txt`. The disposable cluster was removed by the runner. The installed API file hash, API/PM2/nginx process IDs and start times remained unchanged; local health returned `status: ok, db: ok`. Production installation has not been performed.
