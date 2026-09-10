#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${SIMKEEPER_DATA_DIR:-/app/data}"
RUNTIME_HOME="$DATA_DIR/runtime-home"
VOXI_PROFILE_ROOT="$DATA_DIR/carrier-browser/voxi"

validate_id() {
  name="$1"
  value="$2"
  case "$value" in
    ''|*[!0-9]*)
      echo "SIMKeeper: $name must be a positive integer, got '$value'" >&2
      exit 1
      ;;
  esac
  if [ "$value" -le 0 ]; then
    echo "SIMKeeper: $name must be greater than 0, got '$value'" >&2
    exit 1
  fi
}

prepare_runtime_dirs() {
  if ! mkdir -p \
    "$DATA_DIR/backups" \
    "$VOXI_PROFILE_ROOT" \
    "$RUNTIME_HOME/.cache" \
    "$RUNTIME_HOME/.config" \
    "$RUNTIME_HOME/tmp"; then
    echo "SIMKeeper: unable to create runtime directories under $DATA_DIR" >&2
    exit 1
  fi
}

validate_id PUID "$PUID"
validate_id PGID "$PGID"

if [ "$(id -u)" -eq 0 ]; then
  if [ "$(id -g simkeeper)" != "$PGID" ]; then
    if ! groupmod -g "$PGID" simkeeper; then
      echo "SIMKeeper: cannot change the service group to PGID=$PGID; the ID may already be used inside the container" >&2
      exit 1
    fi
  fi

  if [ "$(id -u simkeeper)" != "$PUID" ]; then
    if ! usermod -u "$PUID" simkeeper; then
      echo "SIMKeeper: cannot change the service user to PUID=$PUID; the ID may already be used inside the container" >&2
      exit 1
    fi
  fi

  # Keep both the primary group and Unix account home aligned after UID/GID
  # remapping. Chromium and some libc helpers may consult /etc/passwd directly.
  if ! usermod -g "$PGID" -d "$RUNTIME_HOME" simkeeper; then
    echo "SIMKeeper: cannot update the service account runtime home/group" >&2
    exit 1
  fi

  prepare_runtime_dirs

  if ! chown -R simkeeper:simkeeper "$DATA_DIR"; then
    echo "SIMKeeper: unable to apply PUID=$PUID PGID=$PGID ownership to $DATA_DIR" >&2
    exit 1
  fi

  if ! gosu simkeeper test -w "$DATA_DIR" \
    || ! gosu simkeeper test -x "$DATA_DIR" \
    || ! gosu simkeeper test -w "$RUNTIME_HOME" \
    || ! gosu simkeeper test -x "$RUNTIME_HOME" \
    || ! gosu simkeeper test -w "$VOXI_PROFILE_ROOT" \
    || ! gosu simkeeper test -x "$VOXI_PROFILE_ROOT"; then
    echo "SIMKeeper: /app/data runtime paths are not writable by PUID=$PUID PGID=$PGID; check the bind-mount permissions" >&2
    exit 1
  fi

  # Set HOME/XDG after the privilege drop. This is deliberately later than
  # `gosu simkeeper`: runtimes that restore HOME from /etc/passwd can no longer
  # send Chromium back to an unwritable /home/* directory.
  exec gosu simkeeper env \
    HOME="$RUNTIME_HOME" \
    XDG_CACHE_HOME="$RUNTIME_HOME/.cache" \
    XDG_CONFIG_HOME="$RUNTIME_HOME/.config" \
    TMPDIR="${TMPDIR:-/tmp}" \
    "$@"
fi

# Also support deployments that intentionally set Docker's `user:` option.
# In that mode we cannot chown or remap IDs, but a writable bind mount is enough.
prepare_runtime_dirs
for dir in "$DATA_DIR" "$RUNTIME_HOME" "$VOXI_PROFILE_ROOT"; do
  if [ ! -w "$dir" ] || [ ! -x "$dir" ]; then
    echo "SIMKeeper: $dir is not writable by container uid=$(id -u) gid=$(id -g); remove the Docker user override or fix host permissions" >&2
    exit 1
  fi
done

exec env \
  HOME="$RUNTIME_HOME" \
  XDG_CACHE_HOME="$RUNTIME_HOME/.cache" \
  XDG_CONFIG_HOME="$RUNTIME_HOME/.config" \
  TMPDIR="${TMPDIR:-/tmp}" \
  "$@"
