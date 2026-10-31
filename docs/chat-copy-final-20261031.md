# Minimal chat copy installation, 31 October 2026

The old seven-file package failed preflight because the login page had newer
OAuth/layout work. The six-file revision installed and then rolled back when its
raw-file/public-hash comparison reached category.html. Nginx serves that URL
through an SEO renderer, so its public HTML differs from the on-disk template.
Independent hashes confirmed the six original files were restored and login was
preserved. The rollback snapshot is
`/root/smartplate-chat-copy-20261031-r2-3o7h4kf5`.

The homepage received an independent layout update during diagnosis. The final
installation is reduced to three static files: `cabinet.js`, `cabinet.html`, and
`jivo-chat-modal.js`. The cabinet copy already committed in e0c2c572 is retained;
the shared chat script also sets the floating button's title and accessible label
from the existing "Чат с Юлией" name, including on older HTML markup. Existing
main-page, login, category, ingredient and recipe HTML files are not overwritten.
Links still open the same dialog. Chat delivery code, API, database and access
rules do not change.

Six browser checks cover pending/rejected help and login at 390px/1366px, with old
floating-button labels deliberately supplied in the fixture to test the shared
script. The button remains lower right; help links open/close the correctly named
dialog. Reports are in `tmp/chat-copy-browser/` in this worktree.

The final installer verifies the three public static responses before any writes,
then checks installed and public bytes again afterward. It snapshots and atomically
replaces only those files; a failed post-check rolls them back. Other page hashes
are audited, never written or used to block an unrelated update. A synthetic unprivileged
rehearsal models file metadata/root admission but writes only temporary files;
it exercises positive installation, preflight rejection, public failure rollback,
and preservation of a concurrent login edit. This is not a privileged production
rehearsal. Production success still requires installer output and independent
served/browser verification.

## Installed release and responsive hint follow-up

Runtime commit 84d229e6 installed successfully with `CHAT_COPY_LIVE_OK`, three
files, API PID 178073, no unrelated changes. Backup:
`/root/smartplate-chat-copy-20261031-final-4nwta7b1`. Independent installed and
ordinary/versioned public hashes matched all three files. Public API/database
health is ok; anonymous subscription access returns 401. Six served-frontend
fixture scenarios pass with zero JS errors. Ten further mobile/desktop checks
confirmed the shared button name across home/category/ingredient/recipe/login.

The login stylesheet deliberately hides the floating button on mobile. The shared
script therefore makes login help say "ссылка под формой входа" when the button is
hidden, and "кнопка в правом нижнем углу страницы" when visible. The detailed login
help matches. These descriptions update on resize. The existing help link still
opens the same dialog. This follow-up modifies only the shared chat script; it
does not replace login HTML/CSS, OAuth, or any other page template.

The responsive follow-up in commit `14bfcb4d4ec7425278ffbd2166492f6f696ecdb2`
is installed and independently verified. Only `jivo-chat-modal.js` changed in
this pass. Backup: `/root/smartplate-chat-copy-20261031-final-zptqwjdi`.
All three installed hashes and six ordinary/versioned HTTPS hashes match the
manifest. API/database are healthy; PID remains 178073 with UID/GID 997.
Login and homepage hashes remain exactly as observed before this installation.
Six served-frontend scenarios pass with no JavaScript errors, including chat
opening/closing and hint changes on resize. Ten cross-page checks confirm the
button name at mobile/desktop sizes; mobile login deliberately uses the help
link instead of its hidden floating button. No real messages or payments sent.
Local evidence is the release package's `live-verification.json` and
`page-label-verification.json`, plus this worktree's `tmp/chat-copy-live/`.
The deployment is complete; staging and all rollback snapshots are retained.
