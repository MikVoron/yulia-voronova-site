#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PHOTO_WORK=$(mktemp -d /tmp/smartplate-review-photos.XXXXXX)
case "$PHOTO_WORK" in /tmp/smartplate-review-photos.*) ;; *) exit 2;; esac
PG_BIN=/usr/lib/postgresql/16/bin
cleanup() {
  "$PG_BIN/pg_ctl" -D "$PHOTO_WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$PHOTO_WORK"
}
trap cleanup EXIT INT TERM
mkdir -m 700 "$PHOTO_WORK/socket"
"$PG_BIN/initdb" -D "$PHOTO_WORK/data" --auth=trust --no-locale -E UTF8 >"$PHOTO_WORK/init.log"
"$PG_BIN/pg_ctl" -D "$PHOTO_WORK/data" -l "$PHOTO_WORK/postgres.log" -o "-c listen_addresses='' -c unix_socket_directories='$PHOTO_WORK/socket' -c shared_buffers=16MB -c max_connections=10 -p 59479" -w start >/dev/null
export REVIEW_PHOTOS_TEST_SOCKET="$PHOTO_WORK/socket"
cd "$ROOT/server"
nice -n 10 node --max-old-space-size=256 node_modules/vitest/vitest.mjs run __tests__/review-photos.test.mjs --maxWorkers=1 --no-file-parallelism
