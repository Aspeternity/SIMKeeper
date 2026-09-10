#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${SIMKEEPER_DATA_DIR:-/app/data}"
RUNTIME_HOME="$DATA_DIR/runtime-home"

if [ "$(id -g simkeeper)" != "$PGID" ]; then
  groupmod -o -g "$PGID" simkeeper
fi

if [ "$(id -u simkeeper)" != "$PUID" ]; then
  usermod -o -u "$PUID" simkeeper
fi

mkdir -p \
  "$DATA_DIR/backups" \
  "$DATA_DIR/carrier-browser/voxi" \
  "$RUNTIME_HOME/.cache" \
  "$RUNTIME_HOME/.config"
chown -R simkeeper:simkeeper "$DATA_DIR"

export HOME="$RUNTIME_HOME"
export XDG_CACHE_HOME="$RUNTIME_HOME/.cache"
export XDG_CONFIG_HOME="$RUNTIME_HOME/.config"
export TMPDIR="${TMPDIR:-/tmp}"

exec gosu simkeeper "$@"
