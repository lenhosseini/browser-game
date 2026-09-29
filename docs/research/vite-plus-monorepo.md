# vite-plus monorepo setup

Research for [#5](https://github.com/lenhosseini/browser-game/issues/5), part of the map in [#1](https://github.com/lenhosseini/browser-game/issues/1).

**Question:** How should a vite-plus (`vp`, v1.0.0-rc.1) + pnpm monorepo be set up for a React client app, a SpacetimeDB TypeScript module package and shared/generated code? The areas covered are `vp create` templates and workspace support, how `vp` drives pnpm, oxlint/oxfmt config, `vp check`/`vp test`, `vp run` tasks and caching, `vp hooks`/`vp staged`, and what breaks for a package that is not a Vite app.

## How this was researched

- **Primary docs:** the viteplus.dev guide and config pages, fetched as Markdown via `https://viteplus.dev/<page>.md` (the index is at <https://viteplus.dev/llms.txt>).
- **Source code:** the SpacetimeDB CLI's TypeScript build ([`crates/cli/src/tasks/javascript.rs`](https://github.com/clockworklabs/SpacetimeDB/blob/e3582131fe2f5181e3b67725fa4775edca639670/crates/cli/src/tasks/javascript.rs)), the SpacetimeDB `react-ts` template ([`templates/react-ts/`](https://github.com/clockworklabs/SpacetimeDB/tree/master/templates/react-ts)) and the oxc allocator ([`crates/oxc_allocator/src/pool/fixed_size.rs`](https://github.com/oxc-project/oxc/blob/main/crates/oxc_allocator/src/pool/fixed_size.rs)).
- **npm and GitHub metadata:** `curl https://registry.npmjs.org/vite-plus`, `.../typescript` and `.../spacetimedb`, plus `gh release view v1.0.0 --repo voidzero-dev/vite-plus`.
- **Hands-on checks with the local `vp` v1.0.0-rc.1** (Node 24.21.0, pnpm 12.6.0):
  - A scratch monorepo in `/tmp/vpresearch/mono` from `vp create vite:monorepo --directory mono --no-interactive --package-manager pnpm --no-agent --no-editor --no-hooks`.
  - A React app added with `vp create vite --no-interactive --no-agent --no-editor --no-hooks -- client --template react-ts`.
  - A hand-written SpacetimeDB-style module package (`apps/server`, which depends on `spacetimedb@^2.10.1`) and a source-only `packages/shared`.
  - A second scaffold made with `--git --hooks --agent claude` to see how hooks are set up.
  - The `spacetime` CLI is **not installed**, so a fake `spacetime` shell script stood in for it when testing tasks and caching. No real `spacetime build`/`publish` was run.

> **Version note.** `vite-plus@1.0.0` went stable on 2026-09-28. Its release notes say it "promotes v1.0.0-rc.1 to stable with no code changes" ([release v1.0.0](https://github.com/voidzero-dev/vite-plus/releases/tag/v1.0.0)). So everything below applies to 1.0.0 too. Pin `vite-plus: 1.0.0` in the catalog rather than the RC.

Bundled tool versions (`vp --version` and `vp toolchain` inside the scratch repo): vite 8.3.1, rolldown 1.2.11, vitest 5.0.1, oxfmt 0.70.0, oxlint 1.85.0, oxlint-tsgolint 7.0.2003, tsdown 0.23.0.

---

## 1. `vp create`: templates and monorepo support

- **Built-in templates:** `vite:monorepo`, `vite:application`, `vite:library` and `vite:generator` (monorepo only). There are also shorthands for third-party templates (`vite` = create-vite, `@tanstack/start`, `react-router`, …). You can pass options to a template after `--`, for example `vp create vite -- --template react-ts`. Sources: `vp create --list`; <https://viteplus.dev/guide/create>.
- **What `vite:monorepo` creates** (verified by scaffolding):
  - A root `package.json` that is `private`, with:
    - `devDependencies: { "vite-plus": "catalog:" }`
    - `devEngines.packageManager: { name: "pnpm", version: "12.6.0", onFail: "download" }`
    - `engines.node: ">=22.18.0"`
    - a `ready` script: `vp check && vp run -r test && vp run -r build`
  - `pnpm-workspace.yaml` with:
    - `packages: [apps/*, packages/*, tools/*]`
    - `catalogMode: prefer`
    - a `catalog` containing `vite-plus: 1.0.0-rc.1`, `vite: npm:@voidzero-dev/vite-plus-core@1.0.0-rc.1`, `typescript: ^7.0.2` and `@types/node: ^24`
    - `overrides: { "vite@*": "catalog:" }`
    - `peerDependencyRules` that allow any `vite` version

    Together these alias every `vite` in the tree to vite-plus-core.
  - A root `vite.config.ts` that sets `fmt: {}`, `lint` (with `typeAware`/`typeCheck` on, plus the `vite-plus/oxlint-plugin` JS plugin) and `run: { cache: true }`.
  - A root `tsconfig.json`, an example `apps/website` (vanilla TS) and an example `packages/utils` (a library built with `vp pack` and tested with `vp test`).
  - With `--hooks`, also `.vite-hooks/pre-commit` (containing `vp staged`), a `staged: { "*": "vp check --fix" }` block and `"prepare": "vp config"`.
  - With `--agent claude`, also a `CLAUDE.md` holding a `<!--VITE PLUS START-->…<!--VITE PLUS END-->` block.
- **Adding apps inside the monorepo:** `vp create vite -- client --template react-ts` run at the workspace root put the app in **`apps/client`** by itself. It then did "Monorepo integration":
  - "Merged apps/client/.oxlintrc.json into apps/client/vite.config.ts"
  - "Wrapped inline Vite plugins with lazyPlugins"
  - installed dependencies and ran the formatter

  (Observed output.) `--directory` only works with built-in or bundled @org templates. With `vite` it fails with "The --directory option is only available for builtin and bundled @org templates" (observed).
- **What create-vite's React app still needs fixing:**
  - It pins `typescript: ~6.0.2` and `@types/node` itself, where the catalog uses `typescript ^7.0.2`.
  - Its `vite.config.ts` imports `defineConfig` from `"vite"`.
  - It keeps a package-level `lint` block, which `vp check` ignores (see §3).
  - The `build` script is `tsc -b && vp build`.

  Normalise these after scaffolding (observed in `apps/client/package.json` and `vite.config.ts`).
- **Local generators:** `vp create vite:generator` sets up Bingo-based generators under `tools/` and registers them in `create.templates` ([guide/create#code-generators](https://viteplus.dev/guide/create#code-generators)). This repo doesn't need them now.
- **Agent files:** `vp create`/`vp migrate` can write agent instructions (`--agent <name>`). `vp config --agent` refreshes them ([guide/commit-hooks#vp-config](https://viteplus.dev/guide/commit-hooks#vp-config)). The block is short (27 lines, observed). It tells agents to use `vp check`, `vp test` and `vp run <script>`, and says that `vp <builtin>` is not the same as `vp run <script>`.

## 2. How `vp` drives pnpm

- **Choosing the package manager:** `vp` checks, in order, `packageManager`, then `devEngines.packageManager`, then `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and so on. If it finds nothing it uses pnpm. It **downloads the declared version** itself (`onFail: "download"`) and never rewrites `package.json`. Source: [guide/install](https://viteplus.dev/guide/install).
  - Observed: `vp install` ran pnpm 12.6.0 from `~/.local/share/vite-plus/package_manager/pnpm/12.6.0` (visible in the PATH printed by a failed task).
- **Commands:** `vp install|add|remove|update|dedupe|outdated|why|info|link|rebuild|dlx` wrap the package manager. They accept `--filter`, `-w`, `--frozen-lockfile` and `--save-catalog`. `vp pm <cmd>` passes a raw pnpm command through ([guide/install](https://viteplus.dev/guide/install); `vp install --help`).
- **Build scripts:** pnpm 12 blocks dependency build scripts until you approve them. `vp create --approve-builds`, or `vp pm approve-builds`, records them in pnpm's `allowBuilds` ([guide/create#dependency-build-scripts](https://viteplus.dev/guide/create#dependency-build-scripts)).
- **Node version:** `vp env pin <version>` pins Node for the project. `vp` puts shims for `node`, `pnpm`, `npx` and others in `~/.local/share/vite-plus/bin` (seen with `ls`, and in `vp env --help`).
- **Package filters:** `vp run` and `vp exec` accept pnpm's `--filter` syntax (`name`, `./dir`, `name...`, `...name`, `!name`) ([guide/run#filter](https://viteplus.dev/guide/run)).

## 3. oxlint and oxfmt through `vp`

- **Where config lives:** in the `lint` and `fmt` blocks of the **root** `vite.config.ts`. The docs advise against `.oxlintrc.json`, `oxlint.config.ts` and `.oxfmtrc.json` ([guide/lint](https://viteplus.dev/guide/lint), [guide/fmt](https://viteplus.dev/guide/fmt)). Per-package rules go in `lint.overrides[]` and `fmt.overrides[]`, using workspace globs such as `apps/client/**` ([guide/monorepo](https://viteplus.dev/guide/monorepo)). Config can be split into files and pulled in with imports; the `OxlintOverride` type comes from `vite-plus/lint`.
- **Nested package `lint`/`fmt` blocks don't apply.**
  - The docs say: "`vp check` uses the workspace-root `lint` and `fmt` blocks … Package configs cannot replace root format settings, lint rules, or type-check options." Also: "Oxlint disables nested configs in Vite+ mode" ([config/lint](https://viteplus.dev/config/lint), [guide/troubleshooting](https://viteplus.dev/guide/troubleshooting#nested-lint-or-format-config-is-not-applied)).
  - **Verified:** I put a `react/rules-of-hooks` violation in `apps/client`, whose create-vite `vite.config.ts` has a `lint` block enabling the React plugin.
    - `vp check` passed, both at the root and inside `apps/client`.
    - `vp lint` passed at the root.
    - Only `vp lint` run *inside* `apps/client` reported it.
    - After moving the rule to a root `lint.overrides` entry (`files: ["apps/client/**"], plugins: ["react"]`), root `vp check` failed with `react-hooks(rules-of-hooks)`, exit 1.
  - **So: delete the package `lint` block that create-vite adds and move it to the root overrides.**
- **Type checking comes with lint.** With `lint.options.typeAware` and `typeCheck` on, lint also type-checks through tsgolint on TypeScript 7 ([guide/lint#type-aware-linting](https://viteplus.dev/guide/lint#type-aware-linting)).
  - Verified: a TS2322 error in `apps/client/src` and another in `apps/server/src` each made root `vp check` fail.
  - `compilerOptions.baseUrl` is not supported on this path ([troubleshooting](https://viteplus.dev/guide/troubleshooting)).
- **Ignoring generated code:** use `lint.ignorePatterns` and `fmt.ignorePatterns`. Verified: with `["**/module_bindings/**"]` in both, `vp lint --debug=files` stopped listing the bindings and `vp fmt` left a badly formatted file there untouched. Without the patterns, `vp check` formatted and linted the generated files (observed).
- **oxfmt defaults:** `printWidth` 100, `sortPackageJson` on, `sortImports`/`sortTailwindcss` off. `overrides` is supported ([oxfmt config](https://oxc.rs/docs/guide/usage/formatter/config.html)). oxfmt aims to be fully Prettier-compatible ([guide/fmt](https://viteplus.dev/guide/fmt)). The root template's `fmt: {}` means defaults: double quotes and semicolons, as seen in the scaffolded files.
- **JS plugins crash on this VPS.** Both the monorepo template and create-vite enable `lint.jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }]`, which provides the rule `vite-plus/prefer-vite-plus-imports`. On this host, `vp check` and `vp lint` then **panic before linting starts**, even with `--threads=1` (observed, exit 134):
  ```
  thread 'tokio-rt-worker' panicked at crates/oxc_allocator/src/pool/fixed_size.rs:112:67:
  called `Result::unwrap()` on an `Err` value: ()
  ```
  - That line is `FixedSizeAllocator::try_new(i).unwrap()`. When JS plugins are used, oxlint reserves one **4 GiB** fixed-size arena per thread. On Linux it relies on virtual-memory overcommit to do so ([source](https://github.com/oxc-project/oxc/blob/main/crates/oxc_allocator/src/pool/fixed_size.rs)).
  - This host has 3.8 GiB RAM, no swap and `vm.overcommit_memory=0` (from `free -m` and `/proc/sys/vm/overcommit_memory`).
  - Upstream tracks this as open issue [oxc#20331 "Out of memory with JS plugins on some Linux distros"](https://github.com/oxc-project/oxc/issues/20331), and related [#22095](https://github.com/oxc-project/oxc/issues/22095) (ubuntu-slim runners).
  - Removing `jsPlugins` (and the rule) from **both** the root and `apps/client` configs made `vp check` pass (verified).
  - **Recommendation: don't enable `lint.jsPlugins` for now.** The only thing lost is the `prefer-vite-plus-imports` rule. Write `vite-plus` imports by hand instead: `vite-plus/test`, and `defineConfig` from `vite-plus`.

## 4. `vp check`

- `vp check` runs, in one command: oxfmt `--check`, then oxlint, then the type check (when `typeCheck` is on). It supports `--fix`, `--no-fmt`, `--no-lint` and `--quiet`. A `check: { fmt?: false, lint?: false }` block changes the defaults ([guide/check](https://viteplus.dev/guide/check), [config/check](https://viteplus.dev/config/check)).
- Run from anywhere in the workspace, it uses the root `lint`/`fmt` blocks. File paths and TS projects are resolved from the package working directory (same sources).
- Type checking needs each package to have a proper `tsconfig.json`. Nothing about the SpacetimeDB module's tsconfig caused problems (§8).

## 5. `vp test` (Vitest 5)

- `vp test` runs bundled Vitest 5.0.1 **once** by default. Use `vp test watch` for watch mode. Import APIs from `vite-plus/test`; don't install `vitest` directly. Put config in the `test` block of `vite.config.ts`; the docs discourage `vitest.config.ts`. Node must be `^22.18.0 || ^24.11.0 || >=26` ([guide/test](https://viteplus.dev/guide/test)).
- **Monorepo behaviour (verified):**
  - Root `vp test` finds test files in every package but uses **only the root config**. A package's `test` block (for example `globals: true` in `apps/server/vite.config.ts`) was ignored and the test failed with `ReferenceError: test is not defined`.
  - Adding `test: { projects: ["apps/*", "packages/*"] }` to the root config made root `vp test` respect each package's config (3/3 passed).
  - `vp run -r test`, which runs each package's `test` script in that package's own directory, also respects package configs, and it is cached.
- **Packages that aren't Vite apps can be tested:** `apps/server` has no Vite app, and `vp test` ran its tests fine (verified).
- **But the SpacetimeDB module entry can't be imported under Vitest.** Importing `apps/server/src/index.ts`, which imports `spacetimedb/server`, failed with `Only URLs with a scheme in: file, data, and node are supported … Received protocol 'spacetime:'` (verified). The module runtime provides `spacetime:sys*` imports that the CLI's bundler marks external ([javascript.rs](https://github.com/clockworklabs/SpacetimeDB/blob/e3582131fe2f5181e3b67725fa4775edca639670/crates/cli/src/tasks/javascript.rs)). So unit-test pure game logic in `packages/shared`, or in server files that don't import `spacetimedb/server`. How to test reducers is for the testing-strategy ticket.

## 6. `vp run`: tasks and caching

- **Built-in commands vs scripts:** `vp run <name>` (alias `vpr`) runs a `package.json` script **or** a `run.tasks` entry from that package's `vite.config.ts`. It never runs a built-in: `vp build` is always Vite, while `vp run build` is your script ([guide/run](https://viteplus.dev/guide/run)).
- **Selecting packages:** `-r` (all packages, in dependency order), `-t` (a package plus its dependencies), `--filter`, `-w`, and `pkg#task`. `dependsOn` accepts `"pkg#task"` or `{ task, from: "dependencies" }`. The default concurrency limit is 4. `--parallel` is available ([guide/run](https://viteplus.dev/guide/run), [config/run](https://viteplus.dev/config/run)).
- **What gets cached:**
  - `vite.config.ts` tasks are cached by default; `package.json` scripts are not.
  - `run.cache` (root only) changes those defaults. The template's `run: { cache: true }` turns on caching for scripts too.
  - Commands joined with `&&` are cached separately. Nested `vp run` calls are expanded inline.
  - The cache lives in `node_modules/.vite/task-cache` and is cleared with `vp cache clean`.

  Sources: [guide/cache](https://viteplus.dev/guide/cache), [config/run](https://viteplus.dev/config/run).
- **How inputs and outputs are tracked:**
  - Files read and written are tracked automatically by watching the filesystem.
  - Use `cache.input` and `cache.output` to override. A pattern can be `{ pattern, base: "workspace" }` when a task writes outside its package.
  - **Tasks run in a clean environment.** Only `PATH`, `HOME`, `CI` and a few other variables pass through. Other variables must be listed in `cache.env` (part of the cache key) or `cache.untrackedEnv` (passed through, not part of the key).
  - `cache: false` is for tasks like dev servers and deploys.

  Source: [guide/automatic-data-tracking](https://viteplus.dev/guide/automatic-data-tracking).
- **Verified with a fake `spacetime` binary** and tasks in `apps/server/vite.config.ts`:
  - The second run of `stdb:generate` was a cache hit ("cache hit, replaying").
  - After deleting the generated `apps/client/src/module_bindings`, the next run restored it from the cache. This worked because the output was declared as `{ pattern: "apps/client/src/module_bindings/**", base: "workspace" }`.
  - After editing `apps/server/src/index.ts`, the next run was a miss ("cache miss: 'apps/server/src/index.ts' modified").
  - `stdb:publish` with `cache: false` printed "cache disabled".
  - `vp run -r test` was cached ("vp run: cache hit, 884ms saved").
- **App commands at the root:** `vp dev`, `vp build` and `vp preview` never act on the root package by accident.
  - In a non-interactive shell with several packages, `vp build` exits 1 and lists the candidates (verified; all packages were listed, including `server` and `shared`).
  - Setting `defaultPackage: "./apps/client"` in the root config made plain `vp build` build the client (verified).
  - `defaultPackage` has to be a plain string literal, because it is read without running the config ([config#defaultpackage](https://viteplus.dev/config/#defaultpackage), [guide/monorepo#app-commands](https://viteplus.dev/guide/monorepo#app-commands)).
  - `vp -C apps/client dev` always works.

## 7. `vp hooks` / `vp staged` (git hooks)

- **Installing the hooks:** `vp hooks enable` installs a dispatcher in `.vite-hooks/_` (which ignores itself) and sets `core.hooksPath=.vite-hooks/_`. `vp config`, typically run from `"prepare": "vp config"`, does the same on install. `vp hooks status` and `vp hooks disable` are also available; `disable` records its choice in local git config. Source: [guide/commit-hooks](https://viteplus.dev/guide/commit-hooks).
  - Verified: `vp hooks enable` followed by `vp hooks status` printed `core.hooksPath: .vite-hooks/_ (Vite+ dispatcher)`.
  - `enable` does **not** create project hook scripts. You write and commit `.vite-hooks/pre-commit` (containing `vp staged`) yourself, or get it from `vp create --hooks`.
- **What the hooks run:** `vp staged` runs the `staged` block in `vite.config.ts` using a bundled lint-staged 17. It needs Node ≥22.22.1 or ≥24.11.0 and Git ≥2.32 ([guide/commit-hooks#vp-staged](https://viteplus.dev/guide/commit-hooks#vp-staged)).
  - Verified: I committed a badly formatted `packages/shared/src/ugly.ts`, the `"*": "vp check --fix"` rule reformatted it, and the fix was re-staged into the commit.
- **Agents that don't have `vp` on PATH:** the dispatcher (`.vite-hooks/_/h`) puts `<repo>/node_modules/.bin` first on PATH. It also adds `$VP_HOME/bin`, falling back to `~/.vite-plus/bin`.
  - Verified: a commit made with PATH reduced to the git and system dirs still ran `vp staged` through the local `vite-plus` bin, as long as `node` was on PATH.
  - So keep `vite-plus` as a root devDependency. Hooks then work even in shells that never source `~/.config/vite-plus/env`, which the map notes as a tooling fact.
- **Skipping hooks:** set `VP_GIT_HOOKS=0` (or `HUSKY=0`), or export it from `~/.config/vite-plus/hooks-init.sh`.

## 8. What breaks (or doesn't) for the SpacetimeDB module package

**How `spacetime build` builds a TS module** (from [javascript.rs](https://github.com/clockworklabs/SpacetimeDB/blob/e3582131fe2f5181e3b67725fa4775edca639670/crates/cli/src/tasks/javascript.rs)):

- If `<module>/node_modules/.bin/tsc` exists, it runs `tsc --noEmit` in the module directory. If it doesn't, it prints a warning asking you to add `typescript` as a devDependency.
- It then bundles **`./src/index.ts`** with its *own embedded* Rolldown, to `./dist/bundle.js`:
  - ESM output, `platform: browser`
  - `tsconfig: <module>/tsconfig.json`
  - externals match `spacetime:sys.*`
  - `resolve.symlinks: true`
- It does **not** use Vite, `vite.config.ts` or `vp`.

**What SpacetimeDB's own template uses:** the module lives in a `spacetimedb/` subfolder and depends on `spacetimedb`, with `typescript` as a devDependency. The tsconfig options that "are required by SpacetimeDB" are `target: ESNext`, `lib: [ES2021, dom]`, `module: ESNext`, `isolatedModules: true` and `noEmit: true` ([template](https://github.com/clockworklabs/SpacetimeDB/tree/master/templates/react-ts/spacetimedb)).

**Verified in the scratch monorepo with `apps/server`:**

- **`vp install`:** installing into the workspace works. pnpm puts `node_modules/.bin/tsc` inside the package, and it resolves to the catalog's TypeScript 7.0.2 (`tsc --version` → 7.0.2). `tsc --noEmit` exited 0 on the sample module. So the CLI's tsc step should work with TS 7 too.
- **`vp check`:** type-checks and lints the module with the SpacetimeDB-required tsconfig without problems, and catches type errors in reducer code.
- **`vp test`:** works for pure logic. Importing the module entry fails (§5).
- **`vp build` / `vp dev` at the root:** without `defaultPackage`, they list `server` and `shared` as candidates and exit 1 in non-interactive shells. Setting `defaultPackage: "./apps/client"` fixes this.
- **`vp run -r build`:** fails if the module's `build` script is `spacetime build` and the CLI isn't on PATH ("Failed to find executable spacetime"). The CLI isn't installed here yet and won't be in CI unless it is added. **Don't name the module's script `build`.** Use names like `stdb:build`, `stdb:generate` and `stdb:publish`, so `vp run -r build` and the template's `ready` script only build the client.
- **`vp pack`:** don't use it on the module. It is tsdown for libraries, and the CLI does its own bundling.
- **Workspace dependencies from the module:** these should bundle fine, because the CLI's Rolldown follows symlinks and transpiles `.ts`, so a source-only `packages/shared` with `"exports": { ".": "./src/index.ts" }` should work. **Not verified** end-to-end without the CLI; check it in the scaffolding ticket with a real `spacetime build`.
- **The `spacetime` CLI inside tasks:** tasks get a clean environment. If the CLI needs anything besides `HOME` and `PATH` (for example a server URL or token from env vars), list it under `cache.untrackedEnv`. By default the CLI keeps its config under `HOME`, which is passed through.
- **Generated bindings:**
  - `spacetime generate --lang typescript --out-dir <dir>`, or a `spacetime.json` `generate` array ([spacetime.json reference](https://spacetimedb.com/docs/cli-reference/spacetime-json)), writes into a directory outside the module.
  - Exclude that directory with `lint.ignorePatterns` and `fmt.ignorePatterns`.
  - Declare it as a `base: "workspace"` output if the generate task is cached.

## Gotchas (short list)

1. **JS plugins crash oxlint on this 3.8 GiB, no-swap VPS** ([oxc#20331](https://github.com/oxc-project/oxc/issues/20331)). Strip the `jsPlugins` and `vite-plus/prefer-vite-plus-imports` lines that the templates add.
2. **Package-level `lint`/`fmt` blocks are silently ignored by `vp check`.** create-vite's React app adds one. Move it to root `lint.overrides`.
3. **Root `vp test` ignores package `test` blocks** unless you set `test.projects`.
4. **`vp build`/`vp dev` at the root need `defaultPackage`** (or `-C`) once there is more than one package.
5. **Don't call a script `build` unless `vp run -r build` should run it.** Keep SpacetimeDB CLI steps under `stdb:*` names.
6. **Generated bindings get formatted and linted** unless ignored.
7. **`vp run` tasks see a clean environment.** Declare the env vars a task needs.
8. **TypeScript versions differ:** the create-vite React template pins `typescript ~6.0.2` and the SpacetimeDB template pins `~5.6.2`, while the vite-plus catalog uses `^7.0.2` (tsgolint needs TS 7). Use `typescript: "catalog:"` everywhere. TS 7 with `tsc -b` in the client's build script was not tested separately. `vp check` already type-checks, so change the client `build` to just `vp build`.

## Not verified / open

- A real `spacetime build`/`publish`/`generate` from inside the workspace, including bundling a workspace dependency. The CLI isn't installed yet.
- Whether a `spacetime.json` at the repo root (`module-path: ./apps/server`) works well with `spacetime dev` next to `vp dev`. That belongs to the SpacetimeDB/dev-loop ticket.
- CI: the docs recommend `voidzero-dev/setup-vp@<exact version>`, then `vp install`, `vp check`, `vp test` and `vp build` ([guide/ci](https://viteplus.dev/guide/ci)). This wasn't tried.

---

## Recommended layout for this repo

```
browser-game/
├── package.json              # private; devDeps: vite-plus (catalog:); devEngines pnpm; prepare: "vp config"
├── pnpm-workspace.yaml       # packages: apps/*, packages/*; catalog (vite-plus 1.0.0, vite alias, typescript ^7, react, three, @react-three/*, spacetimedb)
├── vite.config.ts            # the ONLY lint/fmt/staged config; defaultPackage; test.projects; run.cache
├── tsconfig.json             # root (from template)
├── .vite-hooks/
│   └── pre-commit            # "vp staged"   (committed; .vite-hooks/_ is generated and ignored)
├── spacetime.json            # (optional, decided by the SpacetimeDB ticket) module-path ./apps/server, generate → packages/bindings/src
├── apps/
│   ├── client/               # React + three.js/R3F, Vite app (created via `vp create vite -- client --template react-ts`)
│   │   ├── vite.config.ts    # plugins: lazyPlugins(() => [react()]); NO lint/fmt block; optional test block
│   │   ├── index.html, src/, tsconfig*.json
│   │   └── package.json      # deps: react, three, @react-three/fiber, @game/bindings, @game/shared, spacetimedb
│   └── server/               # SpacetimeDB TypeScript module (NOT a Vite app)
│       ├── src/index.ts      # module entry expected by `spacetime build`
│       ├── tsconfig.json     # SpacetimeDB-required options (ESNext, lib ES2021+dom, isolatedModules, noEmit)
│       ├── vite.config.ts    # only `run.tasks` (stdb:build / stdb:generate / stdb:publish) and optional `test`
│       └── package.json      # deps: spacetimedb, @game/shared; devDeps: typescript (catalog:) — needed for the CLI's tsc step
└── packages/
    ├── shared/               # pure TS game logic/constants shared by client, server and tests; source-only ("exports": "./src/index.ts")
    └── bindings/             # generated `spacetime generate --lang typescript` output in src/; dep: spacetimedb; ignored by lint/fmt
```

Placing the bindings in their own `packages/bindings` package, rather than SpacetimeDB's default `client/src/module_bindings`, lets both the client and any future headless bot or test clients import them. If the SpacetimeDB ticket prefers its default location, change `out-dir` and the ignore glob to match.

**Root `vite.config.ts`**

```ts
import { defineConfig } from "vite-plus";

const generated = ["packages/bindings/src/**", "**/dist/**"];

export default defineConfig({
  defaultPackage: "./apps/client",
  staged: { "*": "vp check --fix" },
  fmt: { ignorePatterns: generated },
  lint: {
    // No jsPlugins: oxlint's JS-plugin allocator panics on this host (oxc#20331).
    ignorePatterns: generated,
    plugins: ["typescript", "oxc"],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["apps/client/**"],
        plugins: ["react"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/only-export-components": ["warn", { allowConstantExport: true }],
        },
      },
      { files: ["**/*.test.ts", "**/*.test.tsx"], plugins: ["vitest"] },
    ],
  },
  test: { projects: ["apps/*", "packages/*"] },
  run: { cache: true },
});
```

**`apps/server/vite.config.ts`**

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "stdb:build": { command: "spacetime build", cache: { output: ["dist/**"] } },
      "stdb:generate": {
        command:
          "spacetime generate --lang typescript --out-dir ../../packages/bindings/src --module-path .",
        cache: {
          input: [{ auto: true }, "!dist/**"],
          output: [{ pattern: "packages/bindings/src/**", base: "workspace" }],
        },
      },
      "stdb:publish": { command: "spacetime publish", cache: false, dependsOn: ["stdb:build"] },
    },
  },
});
```

This root config was verified in the scratch repo (with the bindings glob adjusted): `vp check` passed, `vp test` passed, and the React override caught a hooks violation. Check the exact `spacetime` flags (`--module-path`, server and database names) against the CLI once it is installed. The tasks above were only exercised with a fake binary.

**Command set** (after `. ~/.config/vite-plus/env`, or through `node_modules/.bin`)

| Purpose | Command |
| --- | --- |
| Install / add deps | `vp install`, `vp add <pkg> --filter @game/client`, `vp add -D <pkg> -w`, `vp add <pkg> --save-catalog` |
| Client dev server | `vp dev` (uses `defaultPackage`), same as `vp -C apps/client dev` |
| Client production build | `vp build`, or `vp run -r build` (only packages with a `build` script) |
| Format + lint + type-check | `vp check` / `vp check --fix` |
| Tests | `vp test` (all projects via `test.projects`), `vp test watch`, `vp run -r test` (cached, per package) |
| Module build / bindings / publish | `vp run @game/server#stdb:build`, `vp run @game/server#stdb:generate`, `vp run @game/server#stdb:publish` |
| Pre-merge gate | `vp run ready` → `vp check && vp run -r test && vp run -r build` |
| Hooks | `vp config` (runs on `prepare`), `vp hooks status`, `VP_GIT_HOOKS=0 git commit …` to skip |
| Cache | `vp run --last-details`, `vp cache clean` |
| Toolchain info | `vp --version`, `vp toolchain`, `vp env doctor` |

**Scaffolding steps for the task ticket (#9):**

1. Scaffold into a temp directory with `vp create vite:monorepo --directory /tmp/x --no-interactive --package-manager pnpm --hooks --agent claude`, then copy the files into the repo. `--directory .` doesn't work here: it fails with `Target directory "…" is not empty` (verified in a directory holding only `CLAUDE.md` and `AGENTS.md`). Merge the generated `CLAUDE.md` `VITE PLUS` block into the existing `CLAUDE.md`/`AGENTS.md` by hand; `vp config --agent` can refresh it later.
2. Delete `apps/website` and `packages/utils`.
3. Bump the catalog to `vite-plus: 1.0.0` and `vite: npm:@voidzero-dev/vite-plus-core@1.0.0`. Drop `tools/*` if no generators are planned.
4. Remove the `jsPlugins` and `prefer-vite-plus-imports` lines from the root config.
5. Run `vp create vite -- client --template react-ts` at the root. Then:
   - move its `lint` block to the root overrides
   - change `import { defineConfig } from "vite"` to `"vite-plus"`
   - set `typescript` to `catalog:`
   - change `build` to `vp build`
   - drop the `lint` script
6. Create `apps/server` by hand, or copy `apps/server` from `spacetime init --lang typescript` once the CLI is installed. Also create `packages/shared` and `packages/bindings`.
7. Replace the root `dev` script (`vp run website#dev`) and set `defaultPackage`.
8. Run `vp install`, `vp check`, `vp test` and `vp build`.
