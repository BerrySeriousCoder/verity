#!/bin/sh
set -eu
# Railway volumes are mounted as root. Initialize only the configured blob
# directory, then run all application processes as the unprivileged node user.
mkdir -p "${BLOB_DIRECTORY:-/data/blobs}"
if [ "$(id -u)" = 0 ]; then
  chown node:node "${BLOB_DIRECTORY:-/data/blobs}"
  exec gosu node node scripts/runtime/start.mjs
fi
exec node scripts/runtime/start.mjs
