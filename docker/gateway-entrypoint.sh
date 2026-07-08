#!/bin/sh
set -eu

mkdir -p /data /codex-home
chown 10001:10001 /data /codex-home 2>/dev/null || true
find /codex-home -mindepth 1 ! -name auth.json -exec chown -R 10001:10001 {} + 2>/dev/null || true

exec runuser -u mainspring -- "$@"
