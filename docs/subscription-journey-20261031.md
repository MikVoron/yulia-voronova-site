# Subscription journey changes, 31 October 2026

Prepared on `fix/subscription-journey-20261031` from `origin/main` at `959303ef`.
The original dirty checkout is preserved. Production installation and subsequent
installed/served verification are tracked separately from the Git release.

## Behavior

- An active subscriber stays in the cabinet and can renew. A pending payment's
  confirmation refreshes access and the subscription card without navigating away.
  The preserved return URL is a normal link; recipe links say "Открыть ваш рецепт"
  when full access is active. Other return destinations are not labelled recipes.
- One pending status replaces the payment wizard after the API accepts the request.
  It explains the usual 30-minute review, automatic status refresh, and that another
  submission is unnecessary. The renewal button says "Платёж на проверке" and is
  disabled while pending. A rejected payment permits a retry as before.
- Each 15-second poll makes one history request. Overlapping history requests are
  skipped; failed requests leave polling running. After a terminal status, access
  is checked again and the visible subscription card is refreshed.
- Tariff links carry only the chosen period (1, 3, or 12 months) through the existing
  login return URL. Recipe context comes from an explicit safe `return`, or a
  same-origin recipe referrer. If the referrer is unavailable, period selection
  still works; recipe context cannot be recovered from that referrer.
- The cabinet uses current API prices, never a price supplied by a query string.
  Manually selecting a period also updates the cabinet URL so login can restore it.
- `payment_confirmed` requires an observed `pending` to `confirmed` transition for
  the same payment ID. The pending ID is stored per account, survives reloads,
  and is cleared for terminal states. Existing confirmation deduplication keys are
  respected. Loading an old confirmed payment on a new browser emits no conversion.

This remains browser telemetry: a confirmation on a device that never observed
the pending payment is not counted. It is not authoritative revenue accounting.
Auth implementation, server payment writes, access rules, tariffs, bank details,
and the database were not changed.

## Frontend release scope

- `platform/cabinet.js`
- `platform/cabinet.html` (script version and fallback acknowledgement)
- `platform/how-subscription-works.js`
- `platform/how-subscription-works.html` (period links and script version)

Use the current static-release workflow for those four files only. Recheck the
production preimages before installation and retain a four-file rollback copy.
No API restart or migration is needed for this change. A production release still
requires installed/served hash comparison and desktop/mobile browser verification.

## Validation

`node --check` passed for both changed runtime scripts and the browser test.
`git diff --check` passed.

Run the browser regression from the isolated repository root:

```powershell
node scripts/test-subscription-journey-browser.cjs
```

Result: **14 scenarios passed, zero JavaScript errors**. The suite uses real
frontend scripts and HTML with all API/analytics traffic intercepted. It sends
no real email, submits no real payment, and changes no production account.
Coverage includes 390px/1366px layouts, active renewal with recipe/home return,
pending and confirmed states, reload deduplication, an interrupted history request,
explicit recipe navigation, rejected-payment retry and escaped comments, actual
wizard submission, preservation of all three tariff periods, email-code login,
external return rejection, invalid period rejection, HTTP 503 retry without losing
input, and HTTP 409 recovery to the existing pending payment.

Reports/screenshots: `tmp/subscription-journey-browser/` in this worktree.

Existing Vitest suites: **93 passed, 5 failed out of 98** across cabinet user state,
cabinet tabs, feedback plan 3, CSP external scripts, subscriptions, admin payments,
cross-tab refresh, and login UX. All five failures were reproduced on the exact
`origin/main` preimages; the sets of failing test names match. They are existing
assertions about login styles, homepage action counts, the recipe editor's script
version, cabinet action counts, and recipe-card styles. No new failures were found.
The regression report is `tmp/subscription-journey-browser/regression.json`.
The baseline report is in the parent repository's
`tmp/subscription-ux-baseline-20261031/report.json`.

## Installation handoff

The four installed files were read back over SSH before packaging. Their contents
match the base commit; the live tariff HTML uses different line endings, which the
exact preimage hash in the manifest preserves. API/database health was `ok`.
`sudo -n true` returned `sudo: a password is required`; no privileged installation
was attempted. Staging and the live version must not be conflated.

The release package is staged at
`/home/smartplate-admin/release-staging/subscription-journey-20261031/`.
Its manifest pins the four exact old/new SHA-256 hashes. The installer verifies
scope, hashes and syntax, snapshots the old/new files under `/root`, installs the
scripts before HTML, checks installed/HTTPS hashes and API health/PID, and restores
the old files on verification failure. It does not restart the API or reload nginx.

After a successful unprivileged `--check`, installation uses one interactive command:

```sh
sudo bash /home/smartplate-admin/release-staging/subscription-journey-20261031/run.sh
```

Completion requires `SUBSCRIPTION_JOURNEY_LIVE_OK` and independent installed/served
hash checks plus mobile/desktop browser verification. The staged wrapper and
manifest hashes are recorded in the local package's `package-proof.json`.

## Production verification, 31 October 2026

Runtime commit `e1f8813ac62394b89f4a590687a80e159c8e5ce0` was installed with
`SUBSCRIPTION_JOURNEY_LIVE_OK`. The retained rollback snapshot is
`/root/smartplate-subscription-journey-20261031-4c4uybqe`.

Independent SSH readback confirmed the four installed SHA-256 hashes and
`root:root`, mode 0644. Eight browser HTTPS checks (ordinary and versioned URLs)
matched the committed payload hashes. Public API/database health is `ok`;
the process remains PID 37508, UID/GID 997. Anonymous `/subscription` returns 401.

All **14 served-frontend browser scenarios passed** at 390px/1366px with zero
JavaScript errors. API/analytics requests were intercepted for controlled states;
no real email or payment was submitted. Login testing explicitly waits for page
load before clicking, avoiding a test click before the external script is ready.
The production login implementation was not changed.

Local evidence: the release package's `live-verification.json` and this worktree's
`tmp/subscription-journey-live/report.json` and screenshots. Staging and rollback
files are retained; no other worktree files were installed.
