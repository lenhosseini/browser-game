## Tooling

### Shell environment

`vp` (vite-plus) and `spacetime` (SpacetimeDB CLI) are installed per-user, not system-wide, and agent shells are not interactive, so neither is on `PATH` by default. Start any shell session, or prefix a command, with:

```sh
. scripts/env.sh
```

Claude Code does this itself through a `SessionStart` hook in `.claude/settings.json`. Codex has no equivalent: run `. scripts/env.sh && <command>`.

Sourcing it also puts vite-plus's `node`/`npm`/`pnpm` shims first on `PATH`; that is intended, `vp` manages the Node and pnpm versions.

Never run `spacetime init` at the repo root: it overwrites `AGENTS.md` and adds rules files for other editors.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `lenhosseini/browser-game` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
