#!/bin/sh
set -eu
PHOTO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PHOTO_WORK=$(mktemp -d /tmp/smartplate-photo-backup.XXXXXX)
case "$PHOTO_WORK" in /tmp/smartplate-photo-backup.*) ;; *) exit 2;; esac
PHOTO_PG=/usr/lib/postgresql/16/bin
cleanup(){ "$PHOTO_PG/pg_ctl" -D "$PHOTO_WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$PHOTO_WORK"; }
trap cleanup EXIT INT TERM
mkdir -m 700 "$PHOTO_WORK/socket"
"$PHOTO_PG/initdb" -D "$PHOTO_WORK/data" --auth=trust --no-locale -E UTF8 >"$PHOTO_WORK/init.log"
"$PHOTO_PG/pg_ctl" -D "$PHOTO_WORK/data" -l "$PHOTO_WORK/postgres.log" -o "-c listen_addresses='' -c unix_socket_directories='$PHOTO_WORK/socket' -c shared_buffers=16MB -c max_connections=10 -p 59481" -w start >/dev/null
export PHOTO_BACKUP_TEST_SOCKET="$PHOTO_WORK/socket"
python3 -B "$PHOTO_ROOT/review-photos-backup-fixture.py"
