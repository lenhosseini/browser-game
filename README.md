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
vp run dev            # local SpacetimeDB + module publish + bindings + client dev server
```

This starts SpacetimeDB on `127.0.0.1:3000`, publishes the module as the `browser-game` database, regenerates the bindings, and serves the client on <http://localhost:5173>. Ctrl+C stops everything.

The pieces also run separately: `vp run stdb:start`, `vp run stdb:publish`, `vp run stdb:generate`, and `vp run @game/client#dev`. After changing the module's tables or reducers, run `vp run stdb:publish` then `vp run stdb:generate` (or restart `vp run dev`).
