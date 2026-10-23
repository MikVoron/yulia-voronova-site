# Email login: recoverable code entry

Approved on 23 October 2026 after desktop/mobile preview. VK and Yandex login remain a separate task. No newsletter prompt is introduced; the existing email-account creation and automatic newsletter default remain unchanged.

Runtime scope: `platform/login.html`, `platform/login.css`, `platform/login.js`, and `server/src/routes/auth.js`. No migrations, dependency changes, PM2 profile edits, or infrastructure changes.

## Behavior

- Restore the pending code screen in the same tab after a reload. Store only email, deadlines and UI flags in a namespaced sessionStorage key. Never persist the email code, TOTP, or access token there. A blocked sessionStorage does not prevent login.
- Use server deadlines for expiration and repeat-mail timing. Separate limits on mail delivery requests from limits on verification. Normalize pasted codes and preserve leading zeros. Verification happens on an explicit click/Enter.
- Do not resubmit an unchanged rejected code; a network error permits retrying the same value. Retain MFA and recipe return context. Changing the address resets MFA inferred from a previous account, while an administrative entry still requires MFA.
- Always verify against the latest code request, including its expired/used/exhausted status. Never reactivate a previous code after the latest is used or locked. Consume a code once, with expiry, attempt limit, and latest-request checks in the same UPDATE.
- Keep the 10-minute code expiry, three failed attempts per code, three mail requests per address/15 minutes and ten per IP/15 minutes. Enforce the one-minute repeat-mail cooldown on the server as well as in the form. Diagnostic rejection logs contain a reason and request ID, without email or entered codes.
- Keep recipe/pro/trial success copy, registration metrics, secure cookies, existing sessions, and welcome messages.

## Validation

Run the focused Vitest suites for login UX, auth, auth crypto, session refresh, MFA, admin authorization, trial handling, and Metrika. `scripts/test-login-ux-browser.cjs` exercises the real HTML/CSS/JS with local API fixtures and blocked external analytics; it does not send real mail. Check widths 320–1440 px.

`scripts/test-login-ux-postgres.sh` launches an ephemeral PostgreSQL cluster as smartplate-admin, with its own private Unix socket and no TCP listener. It exercises the actual route SQL with email/session/trial dependencies stubbed. It never loads the production environment or connects to the production DB. Test cluster cleanup is automatic. This is SQL/route evidence, not real inbox delivery or full production registration evidence.

## Scoped release

Follow `docs/smartplate-release-checklist.md`. Use the established code-only process; do not invoke or change unfinished `server/ops/release` work.

1. Snapshot reviewed files using `scripts/build-login-comfort-release.py` from the isolated release checkout. Upload only the package to `/home/smartplate-admin/release-staging/login-comfort-20261023/` and verify every SHA-256.
2. Run `python3 install.py check --manifest-sha <verified SHA-256>` without sudo. It checks source/target hashes, JS syntax, local health and API UID/GID 997.
3. User runs the existing checkpoint helper with interactive sudo. Verify the reported checkpoint before the API phase.
4. User runs `sudo python3 install.py api --manifest-sha <SHA-256> --checkpoint <verified checkpoint directory>`. This backs up and installs only the route, restarts the existing PM2 app without changing its environment/profile, checks health/UID/GID and the new malformed-code response. A failed API install restores the backed-up route and restarts it.
5. Independently verify installed hash, local/public health and new validation behavior, without sending mail. Then user runs the frontend phase with the same manifest hash. CSS/JS are installed before HTML; no API restart is made. Frontend failure restores the backed-up files.
6. Independently compare public file hashes and cache markers; open the actual public page at desktop/mobile widths. Public rendering and malformed-input validation are separate evidence from a completed real registration or inbox delivery.

The installer accepts exactly four fixed targets. Unexpected production changes stop installation. Backups remain root-only under `/root/smartplate-login-comfort-*`.
