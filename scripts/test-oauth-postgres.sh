#!/bin/bash
set -euo pipefail
if [ "$(id -un)" != smartplate-admin ] || [ "$(id -u)" = 0 ]; then
  echo 'Run as smartplate-admin without sudo' >&2; exit 1
fi
testroot=$(mktemp -d /tmp/smartplate-oauth-test.XXXXXXXX)
case "$testroot" in /tmp/smartplate-oauth-test.*) ;; *) exit 1 ;; esac
chmod 700 "$testroot"
pgbin=/usr/lib/postgresql/16/bin
cleanup() {
  "$pgbin/pg_ctl" -D "$testroot/data" -m immediate stop >/dev/null 2>&1 || true
  case "$testroot" in /tmp/smartplate-oauth-test.*) rm -rf -- "$testroot" ;; esac
}
trap cleanup EXIT
mkdir "$testroot/socket"
"$pgbin/initdb" -D "$testroot/data" --auth=trust --no-locale --encoding=UTF8 >"$testroot/init.log"
"$pgbin/pg_ctl" -D "$testroot/data" -l "$testroot/postgres.log" -o "-F -k $testroot/socket -p 59477 -c listen_addresses='' -c max_connections=12 -c shared_buffers=16MB" -w start >/dev/null
export OAUTH_TEST_SOCKET="$testroot/socket"
export NODE_PATH=/var/www/smartplate-api/node_modules
node "$(dirname "$0")/test-oauth-postgres.cjs" "$1" "$2"
