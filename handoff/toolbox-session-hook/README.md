# Toolbox session hook: clone the KILN repo as a read-only reference

These files belong in the **Toolbox repo** (the other repo you open Claude Code
web sessions against), *not* in this KILN repo. They are kept here only as a
version-controlled master copy so they're easy to find and update.

## What it does

On every Claude Code **web** session (`startup` and `resume`), the hook clones
`riverwest-mike/steinerdeveloperscostreporting` into `~/kiln-reference` so Claude
can study the real KILN implementation while working in the Toolbox repo. It is:

- **Web-only** — no-ops locally (guards on `CLAUDE_CODE_REMOTE=true`), so it never
  slows down `next dev` sessions.
- **Idempotent** — clones once, then `git pull --ff-only` on resume.
- **Non-blocking** — `GIT_TERMINAL_PROMPT=0` means it fails fast instead of
  hanging on a credential prompt if the account lacks access.

## Installation (in the Toolbox repo)

1. Copy both files into the Toolbox repo, preserving paths:
   - `.claude/hooks/clone-kiln-reference.sh`
   - `.claude/settings.json`  (merge the `hooks.SessionStart` block if the file
     already exists)
2. Ensure the script stays executable: `chmod +x .claude/hooks/clone-kiln-reference.sh`
3. Commit and push. The next web session will clone the reference automatically.

## Notes

- The clone pulls the repo's **default branch (`main`)**. `KILN-FULL-SPEC.md`
  only appears in the reference once it's merged to `main`; until then the hook
  prints a note instead of pointing at a missing file.
- The Toolbox account must have read access to the (private) KILN repo, which it
  does via the GitHub integration used for web sessions.
