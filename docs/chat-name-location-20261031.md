# Chat name and location copy, 31 October 2026

Use the existing name "Чат с Юлией" consistently in the active SmartPlate UI.
Cabinet payment help and login help explicitly say:
"Кнопка чата находится в правом нижнем углу страницы."
The links themselves continue to open the existing Jivo dialog directly.

Scope: `platform/cabinet.js` plus the floating button's title/accessible label in
`cabinet.html`, `category.html`, `index.html`, `ingredient.html`, `login.html`,
and `recipe.html`. Login help also uses the new name and location instruction.
The cabinet script URL is versioned `20261031-chat-name-location`.
Payment states, login implementation, access rules, chat implementation, and button
position are unchanged. The unused legacy Tawk implementation is not deployed.

Validation: syntax and `git diff --check` pass. Six controlled Chrome scenarios
cover pending/rejected payment help and login help at 390px and 1366px; the new
wording fits, the floating button is in the lower right, and help links open and
close the existing "Чат с Юлией" dialog. Zero JavaScript errors; no messages sent.
Screenshots/report are in this worktree's `tmp/chat-copy-browser/`.

The seven live preimages match base `fcb751a8` after line-ending normalization.
Exact byte hashes are pinned in the staged manifest. API/database health is ok.
SSH `sudo -n true` requires a password, so installation uses the server console:

```sh
sudo bash /home/smartplate-admin/release-staging/chat-copy-20261031/run.sh
```

The package installs only these seven frontend files, retains a root-owned backup,
and rolls back on failed installed/public hash or health verification. No API
restart or migration is needed. Completion requires `CHAT_COPY_LIVE_OK` followed
by independent hashes and browser verification; Git push/staging is not deployment.
