#!/bin/sh
set -eu
PHOTO_STAGE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$PHOTO_STAGE" in /home/smartplate-admin/release-staging/review-photos-readiness-*) ;; *) echo 'Unexpected photo staging directory' >&2; exit 2;; esac
cd "$PHOTO_STAGE"
python3 readiness.py --manifest-sha "$1"
export npm_config_cache="$PHOTO_STAGE/npm-cache"
cd "$PHOTO_STAGE/codecs"
npm ci --ignore-scripts --omit=dev --no-audit --no-fund
npm audit --omit=dev --audit-level=low
cd "$PHOTO_STAGE"
nice -n 10 node --max-old-space-size=192 scripts/linux-probe.cjs
python3 readiness.py --manifest-sha "$1"
echo REVIEW_PHOTOS_LINUX_READINESS_COMPLETE
