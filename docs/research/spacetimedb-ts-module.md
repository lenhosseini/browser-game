# SpacetimeDB TypeScript module & client SDK capabilities

Research for [#2](https://github.com/lenhosseini/browser-game/issues/2) (parent map: #1). Researched 2026-09-29.

**Pinned version.** Everything below was checked against the **v2.10.1** release (tag commit `3d76070`), which is the latest GitHub release and the `latest` tag of the `spacetimedb` npm package. `master` already reports `2.11.0` (unreleased), and its docs differ in places, so re-check anything marked *version-dependent* when upgrading.

**Source abbreviations used in citations**
- `docs:/x`: `https://spacetimedb.com/docs/x` (official docs site; the site labels its current docs "2.0.0")
- `src:path#Ln`: `https://github.com/clockworklabs/SpacetimeDB/blob/v2.10.1/path#Ln`
- `rel:vX`: `https://github.com/clockworklabs/SpacetimeDB/releases/tag/vX`

---

## 1. Current version and how mature TS modules are

| Fact | Source |
|---|---|
| Latest release: **v2.10.1** (2026-09-15). npm `spacetimedb@2.10.1`, `dist-tags.latest = 2.10.1`. Releases have come out roughly weekly (2.8.0 through 2.10.1 in Aug to Sep 2026). | `rel:v2.10.1`; https://www.npmjs.com/package/spacetimedb (`npm view spacetimedb`) |
| TS/JS modules launched as **beta in v1.6.0** (Oct 2025) and **left beta with 2.0** (v2.0.1, 2026-02-20). | `rel:v1.6.0` ("TypeScript Modules (Beta)"); `rel:v2.0.1` ("with the release of 2.0 TypeScript support is leaving beta!") |
| TS modules **run on V8**; Rust, C#, and C++ modules compile to WASM. | `docs:/intro/language-support`; `docs:/databases/building-publishing` |
| Claimed throughput: "well over 100k transactions per second for TypeScript modules and up to 170k for Rust". This is a vendor benchmark, not verified here. | `rel:v2.0.1` |
| One npm package, `spacetimedb`, provides both the server library (`spacetimedb/server`) and the client SDK (`spacetimedb`, `spacetimedb/react`, plus vue, svelte, solid, angular, and tanstack). The old `@clockworklabs/spacetimedb-sdk` package is deprecated. | `src:crates/bindings-typescript/package.json`; `docs:/clients/typescript` |

**Signs the TS module path is maturing but still moving.** Since 2.0 there have been breaking or behavioural changes that affect TS users:
- 2.7.0: generated client table handles became camelCase. The old snake_case names remain as deprecated aliases. (`rel:v2.7.0-hotfix3`)
- 2.7.0: added `onSchedule`. (`rel:v2.7.0-hotfix3`)
- 2.8.0: fixed composite-index range scans in TS modules. (`rel:v2.8.0`)
- 2.2.0 and 2.3.0: fixed V8 crashes and segfaults, and added "near-heap-limit termination" and isolate rotation. (`rel:v2.2.0`, `rel:v2.3.0`)
- 2.10.1: changed how the scheduler orders calls. (`rel:v2.10.1`)

Expect to pin exact versions of both the CLI and the npm package, and to read release notes on every bump.

The official agent skills ship in-repo under `skills/` (`typescript-server`, `typescript-client`, `cli`, `concepts`, and others) on `master`. This matters for the agent-setup task, but I did not check whether a given release pins them (*unverified*).

---

## 2. Tables, indexes, and reducers (TS module API)

### Tables
- Define a table with `table({ name, public?, event?, indexes? }, { col: t.xxx()... })`, then export `schema({ tableA, tableB })` as the module's default export. The key you pass to `schema({...})` becomes the `ctx.db.<key>` accessor, and the `name` is used verbatim in SQL. (`docs:/tables`)
- Tables are **private by default**. Private tables are visible only to reducers, views, and the owner. Public tables can be read by clients through subscriptions but can only be written by reducers. (`docs:/tables/access-permissions`)
- All data lives **in memory** and is persisted to disk through a commit log. (`docs:/tables`)
- Column types include:
  - integers `t.u8` through `t.u256` and `t.i8` through `t.i256` (64-bit and wider map to `bigint`)
  - `t.f32` and `t.f64`
  - `t.bool` and `t.string`
  - `t.object`, `t.enum` (tagged union), `t.array`, and `t.option`
  - `t.identity`, `t.connectionId`, `t.timestamp` (µs since epoch), `t.timeDuration`, and `t.scheduleAt`

  (`docs:/tables/column-types`)
- Constraints:
  - `.primaryKey()`: at most one per table. **Composite primary keys are not supported.** Use an auto-increment key plus a multi-column index instead.
  - `.unique()`
  - `.autoInc()`: sequences allocate values in batches of 4096, so expect gaps after a restart. Insert `0` to trigger auto-increment.

  (`docs:/tables/constraints`, `docs:/tables/auto-increment`)
- **Event tables** (`event: true`, new in 2.0): rows exist only for the transaction that inserts them. On commit they are broadcast to subscribers and then dropped. On the client they fire **only `onInsert`** and never sit in the cache. The docs name combat and damage events, VFX, and sounds as intended uses. (`docs:/tables/event-tables`)
  - Limitation: an event table cannot be the right/inner side of a subscription join, and views cannot read event tables.
- The docs explicitly recommend splitting data **by access pattern and update frequency**, for example a 60 Hz position table separate from rarely-changing stats. The stated reason is that clients subscribed to positions then don't receive updates for the other columns. (`docs:/tables`, "Table Decomposition")

### Indexes
- Index types:
  - **B-tree**: the default. Single or multi-column, supports equality and range queries, and matches on a leftmost prefix with a range only on the last column.
  - **Direct**: O(1) array lookup, single column, `u8` to `u64` only, best when keys are dense and start near 0.

  (`docs:/tables/indexes`)
- The TS bindings also accept `'hash'` as an algorithm. It is **undocumented**, so treat it as unstable. (`src:crates/bindings-typescript/src/lib/indexes.ts#L16`; release note "TypeScript modules: Expose hash indices" in `rel:v2.0.1`)
- **You cannot index `f32` or `f64` columns**, nor `Timestamp`, `TimeDuration`, or `ScheduleAt`. The docs' workaround for positions is to store scaled integers, for example `x*1000` as `i32`. (`docs:/tables/indexes`)
- You can declare an index on the column (`t.u32().index('btree')`) or on the table (`indexes: [{ accessor, algorithm, columns }]`).
  - Queries: `ctx.db.t.col.find(v)` for unique columns, `.filter(v | Range | [prefix..., Range])`, and `.delete(...)`. Full scans use `.iter()` and `.count()`.

  (`docs:/tables/indexes`, `docs:/functions/reducers`)

### Reducers
- Define one with `export const name = spacetimedb.reducer({ argsSchema }, (ctx, args) => {...})`. The exported const name becomes the reducer name. (`docs:/functions/reducers`)
- **Every reducer is one ACID transaction.** Throwing rolls back every change it made. Nested reducer calls share the caller's transaction. The docs describe this as "SpacetimeDB currently executes transactions serially", while reserving the right to run them concurrently later. (`docs:/databases/transactions-atomicity`, `docs:/tables/auto-increment`)
- Errors: throw `SenderError` for bad client input and a plain `Error` for bugs. On the client, the reducer call's Promise rejects with `SenderError`. (`docs:/functions/reducers/error-handling`, `docs:/clients/typescript`)
- Reducers **have no network, filesystem, or syscall access**. Module-level or global state is **undefined behaviour**: a fresh V8 instance may be used, reducers may be re-executed, and isolates get rotated. All state must live in tables. (`docs:/functions/reducers`)
- For randomness, use `ctx.random()`, `ctx.random.integerInRange()`, and `ctx.random.fill()`, which are deterministic and seeded by the host. (`docs:/functions/reducers/reducer-context`)
- Related function kinds:
  - **Procedures** can make HTTP calls (`ctx.http.fetch`) and open their own transactions (`ctx.withTx`). They became stable without opt-in in 2.5.0. (`rel:v2.5.0`)
  - **Views** are read-only, computed per caller, and can only use index lookups. (`docs:/functions/views`, `docs:/tables/access-permissions`)

---

## 3. Scheduled reducers as a fixed game tick

**How.** Create a schedule table with a `scheduledId: t.u64().primaryKey().autoInc()` column and a `scheduledAt: t.scheduleAt()` column. Bind the reducer with `spacetimedb.reducer({ onSchedule: tickTable }, { arg: tickTable.rowType }, handler)`, then insert one row with `ScheduleAt.interval(50_000n)` (the value is in µs). Usually you insert that row in `init`. (`docs:/tables/schedule-tables`)
- `ScheduleAt` is imported from `'spacetimedb'`, not from `'spacetimedb/server'`.
- The older `scheduled: () => reducer` table option still works but forces the table and reducer into the same file.
- Interval rows are never deleted automatically. One-shot (`ScheduleAt.time`) rows are deleted after the reducer runs.
- Scheduled reducers are **private by default in 2.x**, so clients cannot call them. (`docs:/functions/reducers/reducer-context`)

**Achievable rates.** There is **no documented minimum interval or maximum rate**. Here is what the sources do show:
- The docs' own example schedules a "Game tick" every **100 ms**. (`docs:/tables/schedule-tables`)
- The official Blackholio demo, including its TS server, runs its movement tick at **50 ms (20 Hz)**, with 500 ms and 5 s ticks for slower systems. (`src:demo/Blackholio/server-ts/src/index.ts#L165-L173`; Unity/Godot/Unreal tutorial part 4)
- Timer resolution: the scheduler is a `tokio_util` `DelayQueue` (`src:crates/core/src/host/scheduler.rs#L31`), and `DelayQueue` "delays are rounded to the closest millisecond" (https://docs.rs/tokio-util/latest/tokio_util/time/delay_queue/struct.DelayQueue.html). So 1 ms is the floor in principle.
- The practical ceiling is set by how long your tick transaction takes, because it competes with every client reducer on the same database. *Unverified. Measure it in a prototype.*

**Timing guarantees (from source, *version-dependent*).**
- **No drift.** The next interval is computed from the previous *intended* time, not the actual one ("Reschedule from the requested time so delays and jitter do not accumulate"). (`src:crates/core/src/host/scheduler.rs#L794-L830`)
- **Missed ticks are skipped, not caught up.** If the database is busy or offline, it schedules the next future tick boundary. (Same source; also `docs:/tables/schedule-tables`, "Interval schedules are anchored…")
- **Lateness is observable.**
  - The host logs a warning when a scheduled function starts more than **30 ms** late and records a Prometheus metric. (`src:crates/core/src/host/scheduler.rs#L191`, L696-L712)
  - The 2.8.0 notes say 50 ms, but the v2.10.1 code has 30 ms. (`rel:v2.8.0`)
- **`ctx.timestamp` is the actual invocation time**, and reducers observe it monotonically. So compute `dt` from `ctx.timestamp` minus the last-tick timestamp you stored, not from the nominal interval. (`docs:/functions/reducers/reducer-context`; `rel:v2.10.1`)
- **Since 2.10.1**, scheduled calls are dispatched concurrently, bounded like normal reducers, so a slow procedure no longer blocks the tick. However, "already-expired scheduled functions are no longer guaranteed to run in strict `scheduled_at` order". (`rel:v2.10.1`, PR #5736)
- In a scheduled reducer, `ctx.sender` is the module's own identity and `ctx.connectionId` is `null`. (`docs:/functions/reducers/lifecycle`)
- The longest possible delay is about 2.18 years. (`src:crates/core/src/host/scheduler.rs#L185`)

---

## 4. Lifecycle hooks

| Hook | TS API | Semantics | Source |
|---|---|---|---|
| init | `spacetimedb.init(ctx => …)` | Runs on first publish and on `publish --delete-data`. If it fails, the publish fails. `ctx.sender` is the **owner**, so store it if you need admin checks later. | `docs:/functions/reducers/lifecycle` |
| client connected | `spacetimedb.clientConnected(ctx => …)` | Runs for every connection (WebSocket or HTTP call). `ctx.connectionId` is typed `ConnectionId \| null`, so guard it. **Throwing rejects the connection**; the TS client then sees a connect error with close code 1006. | `docs:/functions/reducers/lifecycle`; `docs:/how-to/reject-client-connections` |
| client disconnected | `spacetimedb.clientDisconnected(ctx => …)` | Runs on close, timeout, or error. If it fails, the error is logged but the disconnect still happens. | `docs:/functions/reducers/lifecycle` |

When a disconnect is detected (*version-dependent*):
- **Clean close:** immediately.
- **Silent drop** (closed tab without a close frame, network loss): the server pings every **15 s** and closes the connection once it has been idle for **30 s**. Since 2.9.0, any client data counts as activity. (`src:crates/client-api/src/routes/subscribe.rs#L478-L480`; `rel:v2.9.0`)
- **Server crash or restart:** on launch, the host calls `client_disconnected` for every "dangling" client recorded in `st_client` **before** the scheduler starts. Disconnect logic therefore runs even when the process died. (`src:crates/core/src/host/host_controller.rs#L1308-L1326`)

---

## 5. Identity and tokens for anonymous Players

- An `Identity` is a 32-byte ID derived from the JWT's `iss` and `sub` claims (a blake3 hash). It is "long lived, public, globally valid". A `ConnectionId` identifies one connection, so a single Identity can hold several connections at once. (`docs:/intro/key-architecture`)
- **Anonymous flow:** connect without a token, and the server creates a new Identity and returns a **server-issued token**. To keep that Identity, persist the token and pass it back on reconnect. (Authentication overview, `src:docs/docs/00200-core-concepts/00500-authentication.md`; `docs:/clients/typescript` `withToken`)
- **How the server mints the token:**
  - The subject is a random UUIDv4, the issuer is the server's local issuer, and the audience is `"spacetimedb"`.
  - The token is signed with the server's key and has **no expiry** (`exp` is omitted).

  (`src:crates/client-api/src/auth.rs#L183-L199`, `encode_and_sign` passes `expiry: None`)
- Consequences of that design:
  - The token is valid only on the server/cluster whose key signed it, so local and Maincloud Identities differ.
  - On a self-hosted server, "rotating keys invalidates tokens signed by the previous private key" (401). The Identity itself depends only on `iss`/`sub`, so it survives only if you re-mint tokens with the same claims. Anonymous browser Players would therefore lose their Identity on a key rotation unless you build a re-issue path. (`docs:/how-to/self-hosted-key-rotation`)
- **Browser persistence pattern (official):**
  - The `react-ts` template stores the token in `localStorage` under the key `` `${HOST}/${DB_NAME}/auth_token` ``.
  - It passes `.withToken(localStorage.getItem(TOKEN_KEY) || undefined)` to the builder.
  - It writes the token back in `onConnect(conn, identity, token)`.

  (`src:templates/react-ts/src/main.tsx`; `docs:/clients/connection`)
  - Keying by host and database is deliberate. (`rel:v2.0.1`, PR #3252 "Store different auth tokens for different servers/modules")
- In browsers the SDK exchanges the saved long-lived token for a **short-lived WebSocket token** (`POST /v1/identity/websocket-token`), because browsers cannot set WebSocket headers. **Do not overwrite the saved long-lived token with a short-lived one.** (Authentication overview; `docs:/http/identity`)
- **Since 2.9.0**, the TS SDK reuses the first anonymous token during *automatic* reconnects. Before that, a reconnect without a stored token could silently mint a new Identity. (`rel:v2.9.0`, PR #5761)
- Upgrading later to real login through OIDC (SpacetimeAuth, Auth0, Clerk, etc.) is supported. `ctx.senderAuth.jwt` exposes `issuer`, `subject`, `audience`, and `fullPayload`. (Auth usage doc, `src:docs/docs/00200-core-concepts/00500-authentication/00500-usage.md`)

---

## 6. What a reducer knows about its caller

The TS `ReducerCtx` type contains **only** the fields below (`src:crates/bindings-typescript/src/lib/reducers.ts#L110-L124`, `AuthCtx` at L62):

| Field | Meaning |
|---|---|
| `sender: Identity` | The caller's Identity. |
| `connectionId: ConnectionId \| null` | The caller's connection. It is null for `init`, scheduled reducers, and some CLI or internal calls. |
| `senderAuth: { isInternal, hasJWT, jwt: { issuer, subject, audience, identity, fullPayload } \| null }` | Authentication context. |
| `timestamp: Timestamp` | When the reducer was invoked. |
| `databaseIdentity` | The module's own Identity. `identity` is a deprecated alias. |
| `db` | Table access. |
| `random`, `newUuidV4()`, `newUuidV7()` | Deterministic randomness and IDs. |

- **IP address: not available to the module.** The host reads `X-Forwarded-For` only to write a debug log line at WebSocket connect. It is not passed into the reducer context. (`src:crates/client-api/src/routes/subscribe.rs#L248-L256`; `src:crates/client-api/src/util.rs` `XForwardedFor`)
- The same Identity can connect from several tabs, each with a distinct `connectionId`. Game logic has to decide what a second tab means. (`docs:/intro/key-architecture`)

---

## 7. TypeScript and React client SDK, subscriptions, codegen

### Connection
- Build a connection with `DbConnection.builder().withUri(...).withDatabaseName(...).withToken(...).onConnect(...).onConnectError(...).onDisconnect(...).build()`. (`docs:/clients/typescript`)
- Messages are processed on the browser event loop, so no manual `FrameTick` is needed (C# and Unreal do need it). (`docs:/clients/connection`)
- **A raw `DbConnection` never reconnects on its own.**
- The React/Solid/Svelte **providers** do reconnect:
  - They use exponential backoff from 1 s up to a 30 s maximum.
  - They re-check liveness when the page becomes visible, regains focus, comes back online, or is restored from the back-forward cache.
  - `useTable` re-subscribes after a reconnect.

  (`docs:/clients/connection`, `docs:/clients/typescript` "React Integration")
- **Confirmed reads default to ON** for v2/v3 WebSocket clients (`DEFAULT_CONFIRMED_READS = true`). The server holds updates until they are durable, which adds latency. For gameplay traffic, consider `.withConfirmedReads(false)` and measure the difference. (`src:crates/client-api/src/lib.rs#L33`; `src:crates/client-api/src/routes/subscribe.rs#L103-L110`; `rel:v2.1.0`)
- The client uses the v3 WebSocket transport by default (since 2.2.0), which batches messages. Compression defaults to `gzip`, and `brotli` and `none` are also available. (`rel:v2.2.0`; `src:crates/bindings-typescript/src/sdk/db_connection_builder.ts#L27`)

### Subscriptions
- You can subscribe with the typed **query builder**, which is recommended, or with raw SQL. Example: `conn.subscriptionBuilder().onApplied(...).onError(...).subscribe(tables.player.where(r => r.x.gte(a).and(r.x.lt(b))))`.
  - The builder supports `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `and`, `or`, `not`, and left/right **semijoins**.
  - `subscribeToAllTables()` exists but cannot be cancelled.

  (`docs:/clients/typescript` "Query Builder API")
- **Guarantees:**
  - Each transaction produces zero or one atomic update message, delivered in commit order.
  - The initial snapshot is consistent.
  - Callbacks run only after the whole transaction has been applied to the cache.
  - No ordering between individual callbacks is guaranteed.

  (`docs:/clients/subscriptions/semantics`)
- The server shares identical queries across subscriptions ("zero-copy"). When changing an area of interest, **subscribe to the new query before unsubscribing from the old one**. Avoid overlapping, unindexed queries. (`docs:/clients/subscriptions`)
- Table and row callbacks: `onInsert`, `onDelete`, and `onUpdate`. `onUpdate` fires only when the table has a primary key. (`docs:/clients/typescript`)
- **The client cache has no real indexes (*version-dependent*):**
  - The docs say "The SpacetimeDB TypeScript client SDK does not support non-unique BTree indexes". (`docs:/clients/typescript`)
  - In the v2.10.1 source, even unique `find` and index `filter` **linearly scan the whole cached table** ("TODO: this just scans the whole table"). (`src:crates/bindings-typescript/src/sdk/table_cache.ts#L105-L121`, L196-L217)
  - For many entities, keep your own `Map`s or spatial structures, updated from `onInsert`/`onUpdate`/`onDelete`.

### React
- `spacetimedb/react` provides:
  - `SpacetimeDBProvider`, which takes a connection builder you have *not* `.build()`-ed yet.
  - `useSpacetimeDB()`, which returns `isActive`, `identity`, `token`, `connectionId`, `connectionError`, and `getConnection()`.
  - `useTable(query, {onInsert,onDelete,onUpdate})`, which returns `[rows, isReady]`.
  - `useReducer(reducers.x)`, which queues calls until the connection is up.
  - `useProcedure`.
- It is StrictMode-safe, creating only one socket. (`docs:/clients/typescript` "React Integration"; `rel:v2.2.0`)
- `useTable` re-renders React on every row change. That suits UI state. For per-frame entity state in three.js, the natural fit is table callbacks written into a store. This is *inference*, not from the docs.

### Codegen
- Generate bindings with `spacetime generate --lang typescript --out-dir src/module_bindings --module-path <module dir>`. The output includes:
  - `DbConnection`, row types, and `tables.*` query-builder refs
  - `reducers.*`, `procedures.*`, and views
- Private tables are excluded unless you pass `--include-private` (default since 2.0).
- Column names are converted to camelCase on the client.

(`docs:/clients/codegen`; `docs:/cli-reference` `spacetime generate`; `rel:v2.0.1`)

---

## 8. Running locally, publishing, and testing modules

- **Install:** the CLI comes from https://spacetimedb.com/install. It is not installed on this machine yet (per #1).
- **`spacetime start`** starts a local standalone server. It listens on **`0.0.0.0:3000`** by default, which you can override with `listen_addr` in `cli.toml`. The CLI's default `local` server is `127.0.0.1:3000`. (`docs:/cli-reference` `spacetime start`; `src:crates/standalone/src/subcommands/start.rs#L36`; `src:crates/cli/src/config.rs#L162`)
- **`spacetime build`** handles TS modules as follows (`src:crates/cli/src/tasks/javascript.rs#L44-L93`):
  - It runs `node_modules/.bin/tsc --noEmit`, so `typescript` must be a devDependency.
  - It bundles `./src/index.ts` with an **embedded rolldown**, as a single ESM `dist/bundle.js` with platform `browser` (no Node polyfills).
  - Implications: the entry point is fixed at `src/index.ts`, and only pure-JS dependencies work. There is no Node API.
  - A prebuilt bundle can be published with `--js-path`, which is marked UNSTABLE.
- **`spacetime publish [-s server] <db-name>`** builds, creates or updates the database, runs `init` on creation, and hot-swaps the module while keeping clients connected.
  - Schema changes are auto-migrated where possible.
  - `--break-clients` allows breaking changes.
  - `-c/--delete-data always|on-conflict|never` wipes data.

  (`docs:/databases/building-publishing`; `docs:/cli-reference`)
- **`spacetime dev`** creates or detects a project, watches files, and does build, publish, and generate on every save. It can also run the client dev server (`spacetime.json` → `dev.run`). The docs **mark it unstable**. `spacetime dev --template react-ts` scaffolds Vite + React + a TS module. (`docs:/databases/developing`; `docs:/quickstarts/react`)
  - That docs page contradicts itself: it says `spacetime dev` "Starts a local SpacetimeDB server" and also that the database "will be available at maincloud". Pass `-s local` explicitly. (*unclear in docs*)
- Other day-to-day commands: `spacetime call <db> <reducer> args…`, `spacetime sql <db> "…"` (use `--anonymous` to see what an unprivileged client sees), `spacetime logs <db>`, `spacetime subscribe`, and `spacetime describe`. (`docs:/cli-reference`)
- **Testing:**
  - There is **no official unit-test harness for TS modules**, meaning no in-process fake `ReducerCtx`. The docs have no module-testing page.
  - Clockwork's own practice (`TESTING.md`) is to test by **publishing to a real local server**:
    - Publish a fresh short-lived database.
    - Run `spacetime generate`.
    - Drive it from a client subprocess that connects to `localhost:3000`, calls reducers, subscribes, and asserts, reporting the result through its exit code.
    - Add standalone tests that publish and then check logs.

    (`src:TESTING.md`; test modules `src:modules/sdk-test-ts`, `modules/module-test-ts`)
  - For this project, that suggests two layers:
    - Pure game logic in plain TS functions, independent of `ctx`, tested with vitest.
    - Integration tests or headless bot clients that use the TS SDK against `spacetime start`.
  - The split is *inference*.

---

## Implications for this project

1. **Pin versions.** Start on `spacetimedb@2.10.1` with the matching CLI, and pin the npm package exactly. Recent minor releases have changed codegen casing, scheduler ordering, and reconnect/identity behaviour. The 2.9.0 reconnect-identity fix in particular matters for anonymous Players, so don't go below it.
2. **Tick.**
   - A single interval-scheduled `tick` reducer at **50 ms (20 Hz)** is the officially demonstrated pattern.
   - Compute `dt` from `ctx.timestamp` and a stored last-tick time, because ticks are skipped (not replayed) under load.
   - Watch the "delayed by … exceeding 0.030s" log and metric.
   - The upper limit on rate and entity count depends on how long the tick transaction takes, since everything is serialized. This needs a prototype/bench, which feeds the movement-model ticket.
3. **Positions.** Floats can't be indexed. If the server needs spatial queries, or clients subscribe by region through the query builder, store scaled-integer cell or coordinate columns. Put high-frequency position data in its own narrow table, separate from Character stats.
4. **Combat events** (hits, Telegraph resolution, Dodge i-frames feedback) map naturally onto **event tables**. Durable state such as HP and the Character row stays in normal tables.
5. **Logout / Abandoned Characters.**
   - `clientDisconnected` fires on clean close, within about 30 s of a silent drop, and after a server crash (dangling clients are disconnected on restart). That makes it a reliable place to mark a Character logged-out in place.
   - The Blackholio TS server shows the pattern: move rows to `logged_out_*` tables on disconnect and back on connect.
   - Multiple tabs mean several `connectionId`s per Identity. Decide the policy explicitly, for example allowing only one connection to control a Character at a time.
   - Abandoned-Character cleanup can be a slow interval reducer (minutes) that scans a `lastSeen` timestamp.
6. **Player identity = the anonymous token in `localStorage`, keyed by host and database.**
   - It never expires and is bound to the signing server's key.
   - Clearing storage means a new Player, which matches CONTEXT.md.
   - Moving between local and Maincloud, or rotating a self-hosted key, also means new Players, because old tokens stop validating. That is fine for dev. The hosting decision should treat the signing key as part of Player data.
   - IP is not visible to reducers, so any abuse limits must be keyed on Identity or connection.
7. **Client state architecture.**
   - The TS client cache is correct and atomic but **not indexed**: lookups scan linearly.
   - For the three.js scene, mirror subscribed rows into your own keyed and spatial store from row callbacks, and keep React `useTable` for UI.
   - Consider `withConfirmedReads(false)` for gameplay latency.
   - Use the provider's built-in reconnect, or replicate it if you manage `DbConnection` yourself.
8. **Tooling and scaffolding.**
   - TS modules are built by the CLI's embedded tsc check plus rolldown, not by vite-plus. The module must be a package with `src/index.ts` and `typescript` in devDependencies, using only pure-JS dependencies.
   - `spacetime dev` is convenient but unstable. The `vp` tasks can wrap `spacetime start`, `publish -s local`, and `generate`.
   - Module tests: vitest for logic that doesn't depend on `ctx`, plus integration or bot tests against a local server. There is no official in-process harness.
