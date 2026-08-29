#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -g simkeeper)" != "$PGID" ]; then
  groupmod -o -g "$PGID" simkeeper
fi

if [ "$(id -u simkeeper)" != "$PUID" ]; then
  usermod -o -u "$PUID" simkeeper
fi

mkdir -p /app/data/backups
chown -R simkeeper:simkeeper /app/data

exec gosu simkeeper "$@"
