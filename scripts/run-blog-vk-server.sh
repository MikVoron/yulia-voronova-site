#!/bin/sh
set -eu
export BLOG_TELEGRAM_SOURCE=github
umask 077
collector_root=/home/smartplate-admin/blog-vk-sync
test "$(id -un)" = smartplate-admin
cd "$collector_root/repo"
export LD_LIBRARY_PATH="$collector_root/runtime-libs/usr/lib/x86_64-linux-gnu:$collector_root/runtime-libs/lib/x86_64-linux-gnu"
export BLOG_VK_STATE_FILE="$collector_root/private/vk-state.json"
export BLOG_VK_HEALTH_FILE="$collector_root/private/health.json"
case "${1:-}" in
    reader)
        exec flock -n -E 0 "$collector_root/private/collector.lock" node scripts/blog-vk-collector.js --preview
        ;;
    publish)
        export GIT_SSH_COMMAND="ssh -i $collector_root/private/github-deploy-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$collector_root/private/github-known-hosts"
        exec flock -n -E 0 "$collector_root/private/publisher.lock" node scripts/blog-vk-collector.js --publish-snapshot
        ;;
    *) exit 2 ;;
esac
