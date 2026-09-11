#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${SIMKEEPER_DATA_DIR:-/app/data}"
RUNTIME_HOME="$DATA_DIR/runtime-home"
VOXI_PROFILE_ROOT="$DATA_DIR/carrier-browser/voxi"
XVFB_DISPLAY="${SIMKEEPER_XVFB_DISPLAY:-:99}"
XVFB_LOG="$RUNTIME_HOME/xvfb.log"

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

validate_xvfb_display() {
  value="$1"
  case "$value" in
    :[0-9]*|:[0-9]*.[0-9]*) ;;
    *)
      echo "SIMKeeper: SIMKEEPER_XVFB_DISPLAY must look like :99, got '$value'" >&2
      exit 1
      ;;
  esac
  number="${value#:}"
  number="${number%%.*}"
  case "$number" in
    ''|*[!0-9]*)
      echo "SIMKeeper: invalid Xvfb display '$value'" >&2
      exit 1
      ;;
  esac
  if [ "$number" -gt 9999 ]; then
    echo "SIMKeeper: Xvfb display number is too large: '$value'" >&2
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

xvfb_display_number() {
  display_number="${XVFB_DISPLAY#:}"
  display_number="${display_number%%.*}"
  printf '%s' "$display_number"
}

xvfb_socket_path() {
  printf '/tmp/.X11-unix/X%s' "$(xvfb_display_number)"
}

xvfb_lock_path() {
  printf '/tmp/.X%s-lock' "$(xvfb_display_number)"
}

wait_for_xvfb() {
  pid="$1"
  socket="$2"
  attempts=0
  while [ "$attempts" -lt 50 ]; do
    if [ -S "$socket" ]; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    attempts=$((attempts + 1))
    sleep 0.1
  done

  echo "SIMKeeper: Xvfb failed to become ready on $XVFB_DISPLAY" >&2
  if [ -f "$XVFB_LOG" ]; then
    echo "----- Xvfb log -----" >&2
    tail -n 30 "$XVFB_LOG" >&2 || true
  fi
  exit 1
}

remove_stale_xvfb_artifacts() {
  lock_path="$(xvfb_lock_path)"
  socket_path="$(xvfb_socket_path)"

  if ! rm -f "$lock_path" "$socket_path" 2>/dev/null; then
    echo "SIMKeeper: unable to remove stale Xvfb artifacts for $XVFB_DISPLAY" >&2
    echo "SIMKeeper: lock=$lock_path socket=$socket_path uid=$(id -u) gid=$(id -g)" >&2
    exit 1
  fi
}

prepare_x11_runtime_root() {
  if ! chmod 1777 /tmp; then
    echo "SIMKeeper: unable to apply mode 1777 to /tmp" >&2
    exit 1
  fi
  if ! mkdir -p /tmp/.X11-unix; then
    echo "SIMKeeper: unable to create /tmp/.X11-unix" >&2
    exit 1
  fi
  if ! chmod 1777 /tmp/.X11-unix; then
    echo "SIMKeeper: unable to apply mode 1777 to /tmp/.X11-unix" >&2
    exit 1
  fi
  remove_stale_xvfb_artifacts
}

prepare_x11_runtime_current_user() {
  if [ ! -d /tmp/.X11-unix ]; then
    if ! mkdir -p /tmp/.X11-unix 2>/dev/null; then
      echo "SIMKeeper: unable to create /tmp/.X11-unix as uid=$(id -u) gid=$(id -g)" >&2
      exit 1
    fi
  fi

  if [ ! -w /tmp ] || [ ! -x /tmp ]; then
    echo "SIMKeeper: /tmp is not writable/executable by container uid=$(id -u) gid=$(id -g)" >&2
    exit 1
  fi
  if [ ! -w /tmp/.X11-unix ] || [ ! -x /tmp/.X11-unix ]; then
    echo "SIMKeeper: /tmp/.X11-unix is not writable/executable by container uid=$(id -u) gid=$(id -g)" >&2
    exit 1
  fi

  remove_stale_xvfb_artifacts
}

start_xvfb_root() {
  if [ -n "${DISPLAY:-}" ]; then
    return 0
  fi

  validate_xvfb_display "$XVFB_DISPLAY"
  prepare_x11_runtime_root
  : > "$XVFB_LOG"
  chown simkeeper:simkeeper "$XVFB_LOG"

  # -nolock is deliberate. Docker images can otherwise retain an Xvfb lock
  # owned by the image-time UID; after PUID remapping that stale lock is no
  # longer removable by the service user even though /tmp itself is 1777.
  gosu simkeeper Xvfb "$XVFB_DISPLAY" \
    -nolock \
    -screen 0 1365x900x24 \
    -nolisten tcp \
    -ac \
    >"$XVFB_LOG" 2>&1 &
  xvfb_pid=$!
  wait_for_xvfb "$xvfb_pid" "$(xvfb_socket_path)"
  DISPLAY="$XVFB_DISPLAY"
  export DISPLAY
}

start_xvfb_current_user() {
  if [ -n "${DISPLAY:-}" ]; then
    return 0
  fi

  validate_xvfb_display "$XVFB_DISPLAY"
  prepare_x11_runtime_current_user
  : > "$XVFB_LOG"

  Xvfb "$XVFB_DISPLAY" \
    -nolock \
    -screen 0 1365x900x24 \
    -nolisten tcp \
    -ac \
    >"$XVFB_LOG" 2>&1 &
  xvfb_pid=$!
  wait_for_xvfb "$xvfb_pid" "$(xvfb_socket_path)"
  DISPLAY="$XVFB_DISPLAY"
  export DISPLAY
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

  start_xvfb_root

  exec gosu simkeeper env \
    HOME="$RUNTIME_HOME" \
    XDG_CACHE_HOME="$RUNTIME_HOME/.cache" \
    XDG_CONFIG_HOME="$RUNTIME_HOME/.config" \
    TMPDIR="${TMPDIR:-/tmp}" \
    DISPLAY="$DISPLAY" \
    "$@"
fi

# Support deployments that intentionally set Docker's `user:` option. In this
# mode IDs cannot be remapped, so the bind-mounted data directory must already
# be writable by the configured container user.
prepare_runtime_dirs
for dir in "$DATA_DIR" "$RUNTIME_HOME" "$VOXI_PROFILE_ROOT"; do
  if [ ! -w "$dir" ] || [ ! -x "$dir" ]; then
    echo "SIMKeeper: $dir is not writable by container uid=$(id -u) gid=$(id -g); remove the Docker user override or fix host permissions" >&2
    exit 1
  fi
done

start_xvfb_current_user

exec env \
  HOME="$RUNTIME_HOME" \
  XDG_CACHE_HOME="$RUNTIME_HOME/.cache" \
  XDG_CONFIG_HOME="$RUNTIME_HOME/.config" \
  TMPDIR="${TMPDIR:-/tmp}" \
  DISPLAY="$DISPLAY" \
  "$@"
