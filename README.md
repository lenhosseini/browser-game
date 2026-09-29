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

Run each in its own terminal:

```sh
vp run stdb:start     # local SpacetimeDB on 127.0.0.1:3000
vp run stdb:publish   # build and publish the module as the `browser-game` database
vp run dev            # client dev server
```

After changing the module's tables or reducers, run `vp run stdb:publish` then `vp run stdb:generate` to refresh the bindings.
