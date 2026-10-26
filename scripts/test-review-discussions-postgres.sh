#!/bin/bash
set -euo pipefail
testroot=$(mktemp -d /tmp/smartplate-review-discussions.XXXXXXXX)
case "$testroot" in /tmp/smartplate-review-discussions.*) ;; *) exit 1 ;; esac
pgbin=/usr/lib/postgresql/16/bin
cleanup() {
  "$pgbin/pg_ctl" -D "$testroot/data" -m immediate stop >/dev/null 2>&1 || true
  case "$testroot" in /tmp/smartplate-review-discussions.*) rm -rf -- "$testroot" ;; esac
}
trap cleanup EXIT
mkdir "$testroot/socket"
"$pgbin/initdb" -D "$testroot/data" --auth=trust --no-locale --encoding=UTF8 >"$testroot/init.log"
"$pgbin/pg_ctl" -D "$testroot/data" -l "$testroot/postgres.log" -o "-F -k $testroot/socket -p 59474 -c listen_addresses='' -c max_connections=10 -c shared_buffers=16MB" -w start >/dev/null
export REVIEW_DISCUSSIONS_TEST_SOCKET="$testroot/socket"
export NODE_PATH=/var/www/smartplate-api/node_modules
node "$(dirname "$0")/test-review-discussions-postgres.cjs"
