#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${INKWELL_APP:-$ROOT_DIR/scripts/run-linux.sh}"
DURATION="${INKWELL_SECURITY_RUNTIME_SECONDS:-4}"
TMP_DIR="$(mktemp -d)"
DOC="$TMP_DIR/security-runtime.md"

cleanup() {
  if [[ -n "${APP_PID:-}" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    sleep 1
    pkill -P "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

collect_process_tree() {
  local root_pid="$1"
  local queue=("$root_pid")
  local all=()
  local child

  while [[ "${#queue[@]}" -gt 0 ]]; do
    local pid="${queue[0]}"
    queue=("${queue[@]:1}")
    all+=("$pid")

    while IFS= read -r child; do
      if [[ -n "$child" ]]; then
        queue+=("$child")
      fi
    done < <(pgrep -P "$pid" 2>/dev/null || true)
  done

  printf '%s\n' "${all[@]}"
}

cat > "$DOC" <<'MARKDOWN'
# Inkwell Security Runtime Check

This document is local test input.
MARKDOWN

if command -v strace >/dev/null 2>&1; then
  TRACE_PREFIX="$TMP_DIR/trace"
  set +e
  timeout "$DURATION" strace -ff -e trace=network -o "$TRACE_PREFIX" "$APP" "$DOC" >/dev/null 2>"$TMP_DIR/app.stderr"
  status=$?
  set -e

  if [[ "$status" -ne 0 && "$status" -ne 124 ]]; then
    cat "$TMP_DIR/app.stderr" >&2 || true
    printf 'Inkwell exited unexpectedly during runtime security check: %s\n' "$status" >&2
    exit 1
  fi

  if rg -n "AF_INET|AF_INET6|connect\\(|sendto\\(|recvfrom\\(" "$TRACE_PREFIX".* >/dev/null 2>&1; then
    printf 'Runtime security check failed: network syscall detected.\n' >&2
    rg -n "AF_INET|AF_INET6|connect\\(|sendto\\(|recvfrom\\(" "$TRACE_PREFIX".* >&2 || true
    exit 1
  fi

  printf 'security runtime check passed with strace\n'
  exit 0
fi

"$APP" "$DOC" >/dev/null 2>"$TMP_DIR/app.stderr" &
APP_PID=$!
sleep "$DURATION"

if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
  cat "$TMP_DIR/app.stderr" >&2 || true
  printf 'Inkwell exited unexpectedly during runtime security check.\n' >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  mapfile -t pids < <(collect_process_tree "$APP_PID")
  if [[ "${#pids[@]}" -gt 0 ]]; then
    pid_csv="$(IFS=,; printf '%s' "${pids[*]}")"
    lsof_out="$TMP_DIR/lsof.txt"
    if lsof -Pan -p "$pid_csv" -iTCP -iUDP > "$lsof_out" 2>/dev/null; then
      if [[ -s "$lsof_out" ]] && [[ "$(wc -l < "$lsof_out")" -gt 1 ]]; then
        printf 'Runtime security check failed: active network socket detected.\n' >&2
        cat "$lsof_out" >&2
        exit 1
      fi
    fi
  fi
  printf 'security runtime check passed with lsof fallback\n'
  exit 0
fi

printf 'Runtime security check could not run: install strace or lsof.\n' >&2
exit 1
