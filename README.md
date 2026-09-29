# Browser Game

A third-person, open-world multiplayer action roguelite for the browser. See `CONTEXT.md` for the domain language and `docs/adr/` for decisions.

## Layout

- `apps/client`: React + react-three-fiber client (Vite).
- `apps/server`: the SpacetimeDB TypeScript module. Built by the `spacetime` CLI, not by `vp`.
- `packages/shared`: pure TypeScript shared by client, module and tests.
- `packages/bindings`: generated client bindings (`vp run stdb:generate`). Committed; never edit by hand.

## Prerequisites

`vp` (Vite+) and `spacetime` (SpacetimeDB CLI 2.10.1) on your `PATH`.

## Commands

```sh
vp install            # install dependencies (also enables git hooks)
vp check              # format, lint and type-check
vp test               # run tests
vp run ready          # the pre-merge gate: check, test, build
```

## Local dev loop

```sh
vp run dev
```

This starts a local SpacetimeDB server on `127.0.0.1:3000` and runs `spacetime dev` next to it. `spacetime dev` builds and publishes the module as the `browser-game` database, regenerates the bindings, starts the client dev server (<http://localhost:5173>, the `@game/client#dev` task), and then watches `apps/server` to rebuild, republish and regenerate on every change. Ctrl+C stops everything.

`spacetime dev` does not start a server itself; it relies on the module build taking longer than the server takes to come up. If it ever fails with "connection refused", run `vp run dev` again.

All SpacetimeDB tasks live in the root `vite.config.ts`, and `spacetime.json` configures the CLI (`spacetime.local.json` is gitignored and written by `spacetime dev`). One-off tasks: `vp run stdb:start`, `vp run stdb:publish` and `vp run stdb:generate`.
