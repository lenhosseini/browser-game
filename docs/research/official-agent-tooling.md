# Official agent tooling for SpacetimeDB, pmndrs and vite-plus

Research for [#4](https://github.com/lenhosseini/browser-game/issues/4), feeding the agent setup task ([#10](https://github.com/lenhosseini/browser-game/issues/10)).
Checked 2026-09-29 against primary sources only: official docs sites, the vendors' GitHub orgs, and the installed `vp` v1.0.0-rc.1 package source.

## Summary

| Stack | First-party MCP | First-party skills | LLM docs | AGENTS.md / CLAUDE.md | Packaged plugin |
| --- | --- | --- | --- | --- | --- |
| **SpacetimeDB** (Clockwork Labs) | Yes: `spacetime mcp` (stdio, marked unstable) | Yes: 11 skills in `clockworklabs/SpacetimeDB/skills` | `spacetimedb.com/llms.txt` | `spacetime init` writes them (and overwrites existing ones) | Yes, for **both** Claude Code and Codex |
| **pmndrs** (Poimandres) | Yes: `https://docs.pmnd.rs/api/mcp` (streamable HTTP), covering R3F, drei, zustand, react-postprocessing, a11y and the examples gallery | `docs` and `examples` (in the Claude plugin); `koota` (in `pmndrs/koota`) | `llms.txt` and `llms-full.txt` on each generator-built docs site | None for users | Claude Code only (`pmndrs/claude-code-plugin`) |
| **vite-plus** (VoidZero) | None | None for users (only maintainer skills inside the repo) | `viteplus.dev/llms.txt` and `llms-full.txt`, plus docs bundled in `node_modules/vite-plus/docs` | Yes: a marked `<!--VITE PLUS START/END-->` block, written by `vp create`/`vp migrate --agent` and refreshed by `vp config` | None |

The only third-party items that came up were community SpacetimeDB skill and MCP repos (for example `douglance/stdb-skills`, `DanMossa/spacetimedb-skills`, `fractaloutlook/spacetimedb-mcp-server`). They are out of scope and not needed now that official versions exist.

---

## 1. SpacetimeDB (first-party, Clockwork Labs)

### Where to start: `agent-setup.md`

Clockwork Labs publishes agent-facing setup instructions at <https://spacetimedb.com/agent-setup.md> (source: [`docs/static/agent-setup.md`](https://github.com/clockworklabs/SpacetimeDB/blob/master/docs/static/agent-setup.md)). The page describes itself as "official SpacetimeDB instructions for preparing an AI coding agent". Its main recommendations:

- **Prefer the full plugin** for Claude Code or Codex. The plugin already includes the skills and the MCP config: "do not install duplicate skills or register a second MCP server when the plugin succeeds."
- MCP needs the `spacetime` CLI on `PATH`. Check with `spacetime --version` and `spacetime mcp --help`. Install with `curl -sSf https://install.spacetimedb.com | sh -s -- --yes` ([install page](https://spacetimedb.com/install)).
- "MCP is an unstable feature." If `spacetime mcp` is missing, skills still work on their own.
- `spacetime init` "can generate AI rules when creating a project, but it is not an update command for an existing project's instructions." Don't rerun it to set up agents.

### MCP server: `spacetime mcp`

Source: [MCP reference](https://github.com/clockworklabs/SpacetimeDB/blob/master/docs/docs/00300-resources/00200-reference/00150-mcp.md).

- stdio bridge to the host's HTTP MCP endpoint (`POST /v1/mcp` for the whole host, `POST /v1/database/<name>/mcp` for one database).
- Tools: `list_databases` (host-wide mode only), `ping`, `get_schema`, `sql`, and `call` (invokes a reducer).
- Runs as the saved `spacetime login` identity. `--anonymous` is optional.
- Pass a database argument (or set `SPACETIMEDB_DB_NAME`) to scope it to one database. If `spacetime.json` names a single server, the command uses that server.
- It ships in the released CLI: `crates/cli/src/subcommands/mcp.rs` exists at tag [`v2.10.1`](https://github.com/clockworklabs/SpacetimeDB/releases/tag/v2.10.1), the latest release (2026-09-15). The docs still mark it unstable.

Server definition (the same for every agent):

```json
{ "command": "spacetime", "args": ["mcp"] }
```

### Skills

[`skills/`](https://github.com/clockworklabs/SpacetimeDB/tree/master/skills) contains `cli`, `concepts`, `cpp-server`, `csharp-client`, `csharp-server`, `mcp`, `rust-server`, `typescript-client`, `typescript-server`, `unity` and `unreal`. Each is a standard `SKILL.md`, and their frontmatter also carries Cursor globs (for example, [`typescript-server`](https://github.com/clockworklabs/SpacetimeDB/blob/master/skills/typescript-server/SKILL.md) has `cursor_globs: "**/*.ts"` and `cursor_always_apply: true`).

This repo needs `concepts`, `cli`, `mcp`, `typescript-server` and `typescript-client`.

### Claude Code plugin

Catalog: [`.claude-plugin/marketplace.json`](https://github.com/clockworklabs/SpacetimeDB/blob/master/.claude-plugin/marketplace.json). The marketplace is `spacetimedb-plugins` and the plugin is `spacetimedb`, with `strict: false`, the 11 skills and an inline `mcpServers.spacetimedb` entry running `spacetime mcp`.

```sh
claude plugin marketplace add clockworklabs/SpacetimeDB
claude plugin install spacetimedb@spacetimedb-plugins --scope user
claude plugin details spacetimedb     # verify skills + MCP
# then /reload-plugins inside Claude Code
```

Sources: [`.claude-plugin/README.md`](https://github.com/clockworklabs/SpacetimeDB/blob/master/.claude-plugin/README.md) and [agent-setup.md](https://spacetimedb.com/agent-setup.md).

### Codex plugin

Catalog: [`.agents/plugins/marketplace.json`](https://github.com/clockworklabs/SpacetimeDB/blob/master/.agents/plugins/marketplace.json), which points to [`codex-plugin/plugins/spacetimedb`](https://github.com/clockworklabs/SpacetimeDB/tree/master/codex-plugin/plugins/spacetimedb). That folder holds `.codex-plugin/plugin.json`, `.mcp.json` and a copy of `skills/`.

```sh
codex plugin marketplace add clockworklabs/SpacetimeDB --sparse .agents --sparse codex-plugin
codex plugin add spacetimedb@spacetimedb-plugins
codex plugin list --json               # verify; restart Codex if needed
```

Sources: [`codex-plugin/README.md`](https://github.com/clockworklabs/SpacetimeDB/blob/master/codex-plugin/README.md) and [agent-setup.md](https://spacetimedb.com/agent-setup.md).

### Without the plugin (any agent)

- Skills: `npx -y skills add https://github.com/clockworklabs/SpacetimeDB/tree/master/skills --skill '*' --yes --global` ([agent-setup.md](https://spacetimedb.com/agent-setup.md)). `--global` is optional. Dropping it and naming skills gives a repo install, which matches this repo's `skills-lock.json` convention.
- MCP for Claude Code: add `{"mcpServers":{"spacetimedb":{"command":"spacetime","args":["mcp"]}}}` to `.mcp.json` or user config ([codex-plugin/README.md](https://github.com/clockworklabs/SpacetimeDB/blob/master/codex-plugin/README.md) gives this exact shape for Claude). The equivalent command is `claude mcp add --scope project spacetimedb -- spacetime mcp` ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp)).
- MCP for Codex: a `[mcp_servers.spacetimedb]` table in `~/.codex/config.toml` or the project's `.codex/config.toml` (see the Codex notes below).

### LLM docs

- <https://spacetimedb.com/llms.txt>: an index of the docs, generated by [`docs/scripts/generate-llms.mjs`](https://github.com/clockworklabs/SpacetimeDB/blob/master/docs/scripts/generate-llms.mjs). `/llms-full.txt` returns 404.
- The docs site also has an "Ask AI" chat page (Inkeep), which is not useful to agents ([source](https://github.com/clockworklabs/SpacetimeDB/blob/master/docs/docs/00000-ask-ai/00100-ask-ai.mdx)).

### Caution: `spacetime init` overwrites agent files

`install_ai_rules` in [`crates/cli/src/subcommands/init.rs`](https://github.com/clockworklabs/SpacetimeDB/blob/master/crates/cli/src/subcommands/init.rs) runs on every template init. It uses plain `fs::write` to write these files into the project path:

- `CLAUDE.md` and `AGENTS.md` (concatenated skills)
- `.cursor/rules/*.mdc`
- `.windsurfrules`
- `.github/copilot-instructions.md`

It does not check for existing files. In this repo `CLAUDE.md` is a symlink to `AGENTS.md`, so running `spacetime init` at the repo root would replace `AGENTS.md`. Run it in a subdirectory or a temp dir, or restore those files afterwards.

---

## 2. pmndrs (first-party, Poimandres)

### MCP server: `https://docs.pmnd.rs/api/mcp`

Documented on the pmndrs docs [Agents page](https://docs.pmnd.rs/agents/introduction) (also embedded in <https://docs.pmnd.rs/llms-full.txt>).

- One streamable-HTTP endpoint for all libraries. No auth, no install.
- Resources: `docs://pmndrs/manifest`, `docs://{lib}/index` and `examples://index`. Tools: `get_page_content(lib, path)` and `get_example(name)`. The examples cover the 167 demos at <https://pmndrs.github.io/examples>.
- Libraries served: **react-three-fiber, drei, zustand, a11y, react-postprocessing, docs**. I checked this by calling the live server (`serverInfo: pmndrs-docs 4.1.2`) and reading `docs://pmndrs/manifest`, which says "these, and only these".
- The list is driven by `llms_full: true` in [`pmndrs/docs` `src/libs.ts`](https://github.com/pmndrs/docs/blob/main/src/libs.ts). **Koota is not served.** It isn't in `libs.ts`, and `koota.docs.pmnd.rs` does not resolve.
- Content is fetched at request time and revalidated every 5 minutes ([Agents page](https://docs.pmnd.rs/agents/introduction)).
- The official config snippet, from [docs.pmnd.rs/llms.txt](https://docs.pmnd.rs/llms.txt) and [drei.docs.pmnd.rs/llms.txt](https://drei.docs.pmnd.rs/llms.txt):

```json
{ "mcpServers": { "pmndrs": { "type": "http", "url": "https://docs.pmnd.rs/api/mcp" } } }
```

- Stale snippet: [r3f.docs.pmnd.rs/llms.txt](https://r3f.docs.pmnd.rs/llms.txt) still advertises an older SSE endpoint (`https://docs.pmnd.rs/api/sse` via `npx @modelcontextprotocol/client-sse`), and my probe of it hung with no response. Use `/api/mcp`.

### Claude Code plugin: `pmndrs/claude-code-plugin`

[Repo](https://github.com/pmndrs/claude-code-plugin), created 2026-08-09 in the pmndrs org. Its README says "What it actually carries is still being defined."

Contents:
- [`.mcp.json`](https://github.com/pmndrs/claude-code-plugin/blob/main/.mcp.json): the `pmndrs` HTTP server above.
- [`skills/docs`](https://github.com/pmndrs/claude-code-plugin/blob/main/skills/docs/SKILL.md): makes the agent look up the R3F/drei/zustand docs by reading the index before fetching a page.
- [`skills/examples`](https://github.com/pmndrs/claude-code-plugin/blob/main/skills/examples/SKILL.md): makes the agent start from a gallery demo.

Install ([README](https://github.com/pmndrs/claude-code-plugin/blob/main/README.md)):

```
/plugin marketplace add pmndrs/claude-code-plugin
/plugin install pmndrs@pmndrs
```

The manifest has no `version`, so every commit on `main` counts as a release. Update with `/plugin marketplace update pmndrs` and then `/plugin update pmndrs@pmndrs`.

### Codex (no official plugin)

pmndrs publishes no Codex plugin or instructions. Configure the MCP server by hand:

```toml
# ~/.codex/config.toml or .codex/config.toml
[mcp_servers.pmndrs]
url = "https://docs.pmnd.rs/api/mcp"
```

Codex supports streamable-HTTP servers through a `url` key ([Codex MCP docs](https://developers.openai.com/codex/mcp)).

Two things I could not verify:
- Whether `codex plugin marketplace add pmndrs/claude-code-plugin` works. OpenAI says Codex reads a "legacy-compatible marketplace at `$REPO_ROOT/.claude-plugin/marketplace.json`" ([Build plugins](https://developers.openai.com/plugins/build/plugins)), but I did not test it.
- How well the two skills work in Codex. Their text names Claude tool identifiers (`ReadMcpResourceTool`, `mcp__pmndrs__get_page_content`), though the steps they describe don't depend on Claude.

### Koota: official skill, no MCP

[`pmndrs/koota`](https://github.com/pmndrs/koota) ships [`skills/koota/SKILL.md`](https://github.com/pmndrs/koota/blob/main/skills/koota/SKILL.md) plus `references/` (architecture, queries, react-hooks, react-patterns, relations, runtime). The README says: "The official AI agent skill can be installed from this repo" with `npx skills add pmndrs/koota` ([README](https://github.com/pmndrs/koota#readme)).

The skills CLI installs it to `.agents/skills` for Codex and links it for Claude, the same way the existing skills here are installed.

### Other pmndrs skills (not in our stack)

`pmndrs/xr`, `pmndrs/viverse`, `pmndrs/math` and `pmndrs/react-three-start` each ship a `skills/<name>/SKILL.md` ([GitHub code search](https://github.com/search?q=org%3Apmndrs+path%3ASKILL.md&type=code)). None is needed unless we adopt those libraries.

The rest of the pmndrs repos have no user-facing skills, `AGENTS.md` templates or `llms.txt` files beyond what the docs generator emits. I checked the react-three-fiber, drei and zustand trees for skills and `llms` files.

---

## 3. vite-plus (first-party, VoidZero)

### No MCP server and no user skills

- `viteplus.dev/llms.txt` has no MCP or skills entries ([llms.txt](https://viteplus.dev/llms.txt)).
- The only skills in [`voidzero-dev/vite-plus`](https://github.com/voidzero-dev/vite-plus/tree/main/.claude/skills) are maintainer skills (`release-manager`, `bump-vite-task`, and so on) for developing Vite+ itself.
- The installed package contains no MCP code: grepping `node_modules/vite-plus/dist` for "mcp" finds nothing.

### LLM docs

- <https://viteplus.dev/llms.txt> (index) and <https://viteplus.dev/llms-full.txt> (full text, about 270 KB).
- The same guide ships offline in `node_modules/vite-plus/docs/`. The Vite+ `AGENTS.md` template points agents there.

### `AGENTS.md` template and what `vp config` actually does

I read the installed source, `~/.local/share/vite-plus/1.0.0-rc.1/node_modules/vite-plus/dist/{agent-*.js,config/bin.js}`. The upstream sources are [`packages/cli/src/utils/agent.ts`](https://github.com/voidzero-dev/vite-plus/blob/main/packages/cli/src/utils/agent.ts), [`packages/cli/src/config/bin.ts`](https://github.com/voidzero-dev/vite-plus/blob/main/packages/cli/src/config/bin.ts) and the template [`packages/cli/AGENTS.md`](https://github.com/voidzero-dev/vite-plus/blob/main/packages/cli/AGENTS.md).

**The template.** It sits between `<!--VITE PLUS START-->` and `<!--VITE PLUS END-->` and covers:
- built-in `vp <cmd>` versus `vp run <script>`
- `vp toolchain`
- a review checklist: `vp install`, `vp check`, `vp test`, `vp env doctor`

**Creating it: `vp create --agent <name>` and `vp migrate --agent <name>`.**
- Targets are `agents` (AGENTS.md, which also covers Codex, Amp, OpenCode and others), `claude` (CLAUDE.md), `gemini`, `copilot`, `cursor` and `jetbrains`.
- When `AGENTS.md` is among the targets, the others become **symlinks to `AGENTS.md`**. That is the layout this repo already has.
- For an existing file without markers: interactive runs ask whether to append or skip; non-interactive runs skip.
- Picking `copilot` also writes `.github/workflows/copilot-setup-steps.yml`.
- Docs: [create](https://viteplus.dev/guide/create), [migrate](https://viteplus.dev/guide/migrate), `vp create --help` and `vp migrate --help`.
- On a project that is already on Vite+, `vp migrate` skips agent files unless you pass `--full` or `--agent` ([migrate-rules](https://viteplus.dev/guide/migrate-rules)).

**Keeping it current: `vp config`** ("Configure hooks and agent integration") does two things:
1. **Hooks:** installs the Git hook dispatcher, sets `core.hooksPath` and uses `.vite-hooks` by default ([commit-hooks guide](https://viteplus.dev/guide/commit-hooks)).
2. **Agent:** calls `updateExistingAgentInstructions`. It **only rewrites the marked Vite+ section in files that already contain the markers**. It never creates files, skips symlinks, and does nothing to `.mcp.json`, skills or Codex config. `--no-agent` turns this step off.

For this repo, running `vp config` today would not touch `AGENTS.md` (no markers yet) or `CLAUDE.md` (a symlink). The Vite+ block has to be added once, by `vp create --agent agents` or `vp migrate --agent agents` during scaffolding, or pasted in with its markers. After that, `vp config` (typically run from the `prepare` script) keeps it up to date.

---

## 4. Agent-side mechanics (Claude Code and Codex)

**Claude Code** ([MCP docs](https://code.claude.com/docs/en/mcp), [settings reference](https://code.claude.com/docs/en/settings-reference)):
- **Project MCP:** `.mcp.json` at the repo root, committed. Each server needs approval after you trust the workspace. `claude mcp add --scope project …` writes the file for you. `"type": "http"` (or `"streamable-http"`) covers pmndrs.
- **Skills:** `.claude/skills/<name>/SKILL.md`. In this repo these are symlinks into `.agents/skills`.
- **Sharing plugins with the repo:** commit `extraKnownMarketplaces` (for example `{"spacetimedb-plugins":{"source":{"source":"github","repo":"clockworklabs/SpacetimeDB"}}}`) and `enabledPlugins` (`"spacetimedb@spacetimedb-plugins": true`) in `.claude/settings.json`. Both apply only after workspace trust.

**Codex** ([MCP](https://developers.openai.com/codex/mcp), [skills](https://developers.openai.com/codex/skills), [plugins](https://developers.openai.com/codex/plugins), [build plugins](https://developers.openai.com/plugins/build/plugins)):
- **MCP:** `[mcp_servers.<name>]` in `~/.codex/config.toml` or the project's `.codex/config.toml`. The project file is loaded **only for trusted projects**. stdio servers use `command`/`args`; HTTP servers use `url`. `codex mcp add <name> -- <cmd>` writes the user config.
- **Skills:** Codex scans `.agents/skills` from the CWD up to the repo root, plus `$HOME/.agents/skills` and `/etc/codex/skills`. It follows symlinks.
- **Plugins:** `codex plugin marketplace add owner/repo [--sparse …]`, then `codex plugin add name@marketplace`. User choices are saved in `~/.codex/config.toml`. The project `.codex/config.toml` can hold `[plugins."name@marketplace"] enabled = true`, but that setting is documented for repo or local marketplaces.

---

## Recommended setup for this repo

The goal is for Claude Code and Codex to get **the same** integrations, committed to the repo, following the existing `.agents/skills` + `.claude/skills` symlink + `skills-lock.json` convention. That favours the vendored-skills + committed-MCP-config route over per-user plugins. **Pick one route per stack**; SpacetimeDB warns against installing the plugin and the loose skills/MCP together.

1. **Prerequisite (global, record in AGENTS.md):** install the SpacetimeDB CLI with `curl -sSf https://install.spacetimedb.com | sh -s -- --yes`. Confirm that `spacetime mcp --help` works.
2. **Skills (repo, via the skills CLI that manages `skills-lock.json`):**
   - SpacetimeDB: `concepts`, `cli`, `mcp`, `typescript-server`, `typescript-client` from `https://github.com/clockworklabs/SpacetimeDB/tree/master/skills`. Leave out the other languages.
   - Koota: `npx skills add pmndrs/koota`.
   - pmndrs `docs` and `examples` skills from `pmndrs/claude-code-plugin`. Loading these with the skills CLI is **unverified**; the fallback is to rely on the MCP server alone.
3. **MCP servers (repo, committed):**
   - `.mcp.json` (Claude Code):
     ```json
     { "mcpServers": {
         "spacetimedb": { "command": "spacetime", "args": ["mcp"] },
         "pmndrs": { "type": "http", "url": "https://docs.pmnd.rs/api/mcp" } } }
     ```
   - `.codex/config.toml` (Codex; the project must be trusted):
     ```toml
     [mcp_servers.spacetimedb]
     command = "spacetime"
     args = ["mcp"]

     [mcp_servers.pmndrs]
     url = "https://docs.pmnd.rs/api/mcp"
     ```
   - Leave `spacetime mcp` host-wide for now. Once a dev database name exists, pin it with `args = ["mcp", "<db>"]` or `SPACETIMEDB_DB_NAME`.
4. **vite-plus:**
   - During scaffolding, run `vp create`/`vp migrate` with `--agent agents` so the marked Vite+ block lands in `AGENTS.md` and `CLAUDE.md` stays a symlink. Or paste `packages/cli/AGENTS.md` in with its markers.
   - Afterwards, let `vp config` in `prepare` keep the block current.
   - Nothing else to install: there's no MCP or skill, and the docs are local in `node_modules/vite-plus/docs`.
5. **Don't** run `spacetime init` at the repo root. Scaffold the module in a subdirectory, then delete or restore the `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.windsurfrules` and `.github/copilot-instructions.md` it writes.
6. **Alternative (per-user, lower maintenance, Claude Code only for pmndrs):** install the plugins instead of steps 2–3. That is `spacetimedb@spacetimedb-plugins` in both agents and `pmndrs@pmndrs` in Claude Code, plus the manual pmndrs MCP entry in Codex. For teammates, the Claude side can be committed via `extraKnownMarketplaces` and `enabledPlugins` in `.claude/settings.json`. Plugins update themselves, but the two agents would no longer get the same skill set.

## Not verified

- Whether the skills CLI (`npx skills add`) can install the two skills from `pmndrs/claude-code-plugin`, and whether Codex can install that plugin through its `.claude-plugin/marketplace.json` compatibility path.
- End-to-end behaviour of `spacetime mcp`. The CLI isn't installed here, so I didn't run it. The claims above come from docs and source.
- `vp create`/`vp migrate --agent` was read from source, not run, because the task was read-only.
