#!/bin/bash
# SessionStart hook (lives in the Toolbox repo): clone the KILN repo into the
# session as a read-only reference so Claude can study the real implementation.
# Idempotent: clones once, then fast-forward-refreshes on later/resumed sessions.
set -euo pipefail

# Only run in Claude Code on the web; skip local dev sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_URL="https://github.com/riverwest-mike/steinerdeveloperscostreporting.git"
DEST="${HOME}/kiln-reference"

# Never hang waiting for credentials; fail fast if the account lacks access.
export GIT_TERMINAL_PROMPT=0

if [ -d "${DEST}/.git" ]; then
  echo "[kiln-reference] refreshing existing clone at ${DEST}"
  git -C "${DEST}" pull --ff-only --quiet || echo "[kiln-reference] pull skipped (non-fast-forward or offline)"
else
  echo "[kiln-reference] cloning ${REPO_URL} -> ${DEST}"
  git clone --depth 1 "${REPO_URL}" "${DEST}"
fi

echo "[kiln-reference] ready at ${DEST}"
if [ -f "${DEST}/KILN-FULL-SPEC.md" ]; then
  echo "[kiln-reference] full reconstruction spec: ${DEST}/KILN-FULL-SPEC.md"
else
  echo "[kiln-reference] note: KILN-FULL-SPEC.md not on the default branch yet (merge it to main to include it)"
fi
