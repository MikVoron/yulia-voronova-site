#!/bin/sh
# Run only after explicit approval for the dedicated GitHub write deploy key.
set -eu
umask 077
collector_root=/home/smartplate-admin/blog-vk-sync
test "$(id -un)" = smartplate-admin
test -f "$collector_root/private/github-deploy-key"
test -f "$collector_root/private/github-known-hosts"
cd "$collector_root/repo"
test -z "$(git status --porcelain)"
git pull --ff-only origin main
git remote set-url origin git@github.com:MikVoron/yulia-voronova-site.git
cp scripts/run-blog-vk-server.sh "$collector_root/run.sh"
chmod 700 "$collector_root/run.sh"
# Confirm a real publication before installing recurring jobs.
"$collector_root/run.sh" publish
cron_file=$(mktemp "$collector_root/private/cron.XXXXXX")
trap 'rm -f "$cron_file"' EXIT
{ crontab -l 2>/dev/null || true; } | awk '!/ # blog-vk-sync$/' > "$cron_file"
printf '* * * * * %s/run.sh reader >> %s/private/collector.log 2>&1 # blog-vk-sync\n' "$collector_root" "$collector_root" >> "$cron_file"
printf '*/5 * * * * %s/run.sh publish >> %s/private/publisher.log 2>&1 # blog-vk-sync\n' "$collector_root" "$collector_root" >> "$cron_file"
crontab "$cron_file"
printf 'VK_COLLECTOR_AUTOMATION_ENABLED\n'
