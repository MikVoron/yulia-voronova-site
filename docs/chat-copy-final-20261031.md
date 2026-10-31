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
replaces only those files; a failed post-check rolls them back. The newer login
HTML is observed and checked before/after, never written. A synthetic unprivileged
rehearsal models file metadata/root admission but writes only temporary files;
it exercises positive installation, preflight rejection, public failure rollback,
and preservation of a concurrent login edit. This is not a privileged production
rehearsal. Production success still requires installer output and independent
served/browser verification.
