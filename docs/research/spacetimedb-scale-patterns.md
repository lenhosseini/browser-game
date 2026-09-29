# SpacetimeDB scale limits & real-time game patterns

Research for [issue #3](https://github.com/lenhosseini/browser-game/issues/3), part of the [Wayfinder map (#1)](https://github.com/lenhosseini/browser-game/issues/1). It feeds two decisions: the **scale target & interest management** decision, and the **movement authority & sync model** decision.

Researched 2026-09-29. Sources are primary: the SpacetimeDB docs and source (`clockworklabs/SpacetimeDB` @ [`978e861`](https://github.com/clockworklabs/SpacetimeDB/tree/978e86168dd897816355a9c297fc2baca45981d8)), the Blackholio demo in that repo, the BitCraft server source (`clockworklabs/BitCraftPublic` @ [`9983494`](https://github.com/clockworklabs/BitCraftPublic/tree/998349436a903512410842ad6a588215b93ad040)), and blog posts by Clockwork Labs. The docs website renders from `docs/docs/` in the SpacetimeDB repo. Doc links below use the site URLs and the source links are pinned to those commits.

**Evidence labels used below:**

- **[Measured]**: a number from a published benchmark with a stated method.
- **[Code]**: read directly from source.
- **[Docs]**: a statement in the official documentation.
- **[Claim]**: a vendor statement with no published measurement behind it.
- **[Unverified]**: a secondary source, or my own inference or arithmetic.

---

## TL;DR

1. **One database is one thread.** Each SpacetimeDB database runs reducers serially on a single thread. Subscription delta evaluation also runs on that thread while it holds the lock. In a TypeScript module, all reducers, subscriptions and queries go through one V8 isolate on one OS thread. Our one World would be one database, so everything shares one core.
2. **The only published throughput numbers use a trivial reducer.** They are about 304k TPS for a TypeScript module and 266k for Rust, on a 24-core i9-14900K, with **no subscribers**. Nobody has published a subscription fan-out or "N concurrent game clients" benchmark. "Hundreds of players" for Blackholio is a claim, not a measurement.
3. **BitCraft does not run its world in one database.** It shards the world into ~25 region databases plus a global database, and each region has a sign-in cap and a login queue. That is the shipped reference for "big open world on SpacetimeDB".
4. **Interest management comes from subscription queries and views.** The engine indexes subscriptions that use an *equality* filter (e.g. `WHERE chunk = 42`), so it only re-evaluates the queries that match a changed row. Identical queries are shared across clients. The docs explicitly recommend chunk/region keys and shared (anonymous) views over per-player "near me" views.
5. **Movement patterns found:**
   - **Blackholio** is server-authoritative: the client sends input at 20 Hz, a scheduled 50 ms (20 Hz) tick reducer moves everything, and the client lerps toward server positions over 100 ms.
   - **BitCraft** is client-authoritative with server validation: the client sends origin, destination, timestamp and duration per move segment, and the server checks speed, timestamp window, distance and terrain, then resets the player on failure. Other clients extrapolate from origin, destination and timestamp. BitCraft uses no server tick for movement.
6. **Implication:** a realistic first target for our World is about **100–200 concurrent Characters**. Use chunk-keyed subscriptions, BitCraft-style validated client movement segments (not per-frame position spam), and a low-rate server tick (about 10 Hz) only for NPCs, Telegraph resolution and combat. Plan to measure with headless bots before committing to more. Details are in [Implications](#implications-for-this-project).

---

## 1. Throughput: reducer calls/s and row updates/s

### Execution model

- **[Docs + Claim] Transactions run serially.** "SpacetimeDB currently executes transactions serially, but reserves the right to execute them concurrently in future versions." ([docs: auto-increment](https://spacetimedb.com/docs/tables/auto-increment)). The cofounder describes the execution model as "single-threaded by design". In their words: "we found that single-threaded execution flat out outperformed parallel execution… Today in Spacetime, each database is a single-threaded actor." ([Tyler Cloutier, "Ok, but does it scale?", 2026-09-03](https://spacetimedb.com/blog/how-does-spacetime-scale))
- **[Code] TypeScript/V8 topology.** Non-procedure work (reducers, subscriptions, one-off queries) "is serialized through a single queue" feeding "a single worker thread" with "one V8 isolate". Procedures use a separate bounded pool. Client responses leave through a separate `SendWorker`. ([`crates/core/src/host/v8/mod.rs` L1–58](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/crates/core/src/host/v8/mod.rs#L1-L58))
- **[Docs] All state lives in memory.** It is persisted to a commitlog. As of the Sept 2026 post, "Spacetime stores all table data in memory on the leader node". Disk and object-storage tiers are announced for 2026-10-31. ([blog](https://spacetimedb.com/blog/how-does-spacetime-scale))

### Published numbers

- **[Measured] The keynote-2 "transfer" benchmark.** Each transaction reads two account rows, checks the balance, and updates both rows. The benchmark ran 64 clients, pipelined to 40 in-flight each, with confirmed reads ON, over 300 s runs on a single-node SpacetimeDB Standalone. The hardware was a PhoenixNAP i9-14900K (24 cores) with 128 GB RAM, with client and server on the same host.
  - **279,024 TPS** (p50 8 ms, p99 12 ms) at no contention.
  - **303,919 TPS** at ~80% contention.
  - Source: [`templates/keynote-2/README.md`](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/templates/keynote-2/README.md).
- **[Measured] TypeScript vs Rust modules.** The benchmark blog says the 303,920 ± 4,712 TPS figure is "our TypeScript benchmark". It adds: "TypeScript is now actually faster than Rust, which measures only 265,541 ± 940" ([blog: "Let's talk benchmarks", 2026-05-14](https://spacetimedb.com/blog/benchmarking)). The module in the template is TypeScript ([`templates/keynote-2/spacetimedb/src`](https://github.com/clockworklabs/SpacetimeDB/tree/978e86168dd897816355a9c297fc2baca45981d8/templates/keynote-2/spacetimedb/src)). The same post admits the original 2.0 keynote numbers (~100k–150k TPS) had problems that were later fixed, and that the first run used a Rust client for SpacetimeDB only.
- **[Code] Caveat: the benchmark measures no subscriptions.** Its client subscribes to `accounts` only when `VERIFY=1` ([`src/connectors/spacetimedb.ts` L44–48](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/templates/keynote-2/src/connectors/spacetimedb.ts#L44-L48)). The numbers therefore say nothing about fan-out cost. Each transaction touches 2 rows, which is much smaller than a game tick.
- **[Claim] Replication.** Replicated SpacetimeDB Cloud databases reportedly reach "the same throughput as unreplicated databases (roughly 300k TPS for the benchmark transactions)" ([blog](https://spacetimedb.com/blog/how-does-spacetime-scale)). No methodology is published.

**Reading for us [Unverified inference]:** the raw reducer rate is not the bottleneck at our scale. 300 Characters sending 10 movement calls/s each is 3,000 reducer calls/s, about 1% of the benchmark rate. But our reducers will do more work than a 2-row transfer, and the fan-out cost (section 2) runs on the same thread. The real ceiling is unknown until we measure it with our own module.

### Row-update cost levers (official guidance)

- **[Docs] Split hot and cold data.** Put frequently changing columns (position) in their own narrow table. The docs' example is "1000 concurrent players updating positions at 60Hz": splitting settings out of the position table means position subscribers don't receive settings changes ([docs: tables](https://spacetimedb.com/docs/tables); [docs: performance](https://spacetimedb.com/docs/tables/performance)).
- **[Docs] Keep rows small and batch writes.** Use the smallest integer types, keep internal state in private tables, and batch many writes into one reducer call rather than many calls ([docs: performance](https://spacetimedb.com/docs/tables/performance)).
- **[Code] BitCraft's hot table layout.** `MobileEntityState` is a fixed 48-byte, padding-free `#[repr(C)]` row, laid out "to take advantage of a serialization fast-path in SpacetimeDB" ([`messages/components.rs` L254–281](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/messages/components.rs#L254-L281)). This is Rust-specific, but the principle (narrow, fixed-size hot rows) carries over.

## 2. Subscription fan-out as client count grows

### How it works

- **[Docs] Incremental delta evaluation.** When a transaction commits, its result is a delta (inserted and deleted rows). The host "evaluates the QUERIES against the state delta" and sends each client **at most one `TransactionUpdate` per transaction**. If a client has several subscription sets, their updates are bundled into that one message ([docs: subscription semantics](https://spacetimedb.com/docs/clients/subscriptions/semantics)).
- **[Code] Pruning uses equality filters only.** `SubscriptionManager` keeps an index of subscriptions keyed by *equality* filter values (`search_args`, e.g. `WHERE id = 3`). A changed row only triggers the queries whose parameter matches that row. Queries **without** a simple equality filter go into a per-table list and are evaluated for **every** change to that table ([`module_subscription_manager.rs` L257–300, L503–540, L1301–1319](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/crates/core/src/subscription/module_subscription_manager.rs#L1301-L1319)).
  - **[Unverified inference]** A range query such as `x > a AND x < b` is therefore not pruned by value. Chunk-id equality subscriptions scale better than bounding-box range subscriptions.
- **[Docs] Identical queries are shared.** "SpacetimeDB subscriptions are zero-copy. Subscribing to the same query more than once doesn't incur additional processing or serialization overhead." ([docs: subscriptions](https://spacetimedb.com/docs/clients/subscriptions))
- **[Code] Evaluation runs on the main thread; sending does not.** Delta evaluation is sequential and runs while holding the datastore lock. The code comments say rayon parallelism was *removed* "to optimize for the common case of small updates". Aggregation per client and handing off to websockets happen in a separate `SendWorker` "so that transaction processing can proceed on the main thread" ([`module_subscription_manager.rs` L1338–1384, L528–539](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/crates/core/src/subscription/module_subscription_manager.rs#L1338-L1384)).
  - **Consequence:** evaluation cost adds directly to per-transaction latency on the single thread, and serialization and sending are off-thread.
- **[Docs] Confirmed reads delay updates until they are durable.** With confirmed reads on, the server sends updates only once the transaction is persisted. With them off, it sends "as soon as transactions are committed in memory". The TypeScript SDK exposes `withConfirmedReads(bool)`, and if it is not set, "the server chooses the default" ([docs: TS client](https://spacetimedb.com/docs/clients/typescript)). The blog says `confirmedReads(true)` is "the default setting" ([blog](https://spacetimedb.com/blog/how-does-spacetime-scale)). For movement updates we probably want it **off**, which trades durability-on-read for lower latency.
- **[Claim] Read replicas are planned, not shipped.** Moving subscription evaluation onto "consistent read replicas" to fan out horizontally is listed as **Planned**, with no date ([blog](https://spacetimedb.com/blog/how-does-spacetime-scale)). Today, fan-out for one database is bounded by one leader.

### Published fan-out measurements

**None found.** No official benchmark reports subscription cost versus number of connected clients or subscribers per row. This includes the keynote-2 benchmark (no subscribers), the benchmarks blog, and the docs. **[Unverified]**

### Back-of-envelope sizing [Unverified, my arithmetic]

The dominant cost is `changed rows/s × interested clients per row`. Each client receives at most one message per transaction.

| Setup | Row deliveries/s | Messages per client/s |
| --- | --- | --- |
| 300 Characters, 10 Hz position updates, everyone sees everyone | 300 × 10 × 300 = **900k** | up to 3,000 if every move is its own transaction |
| Same, but each client sees ~30 neighbours (chunked interest) | 300 × 10 × 30 = **90k** | about 300 |
| Server tick batching all movement into one transaction at 10 Hz | unchanged | **10** |

Two levers therefore matter:

- **Interest management** cuts rows × receivers.
- **Batching into fewer transactions** cuts per-client message count. A server tick does this, and so does sending movement *segments* rather than per-frame positions.

## 3. Spatial interest management patterns

- **[Docs] Chunk/region keys over "near me".** The views doc says: "instead of a view that returns 'entities near me'… consider views that return 'entities in region X'. Multiple players in the same region share a single materialized view." It gives a chunk example where entities are indexed by `chunkX` and `chunkY`. It warns that per-user `ViewContext` views are computed and tracked per subscriber: "With 1,000 connected users, that's 1,000 separate view computations" ([docs: views](https://spacetimedb.com/docs/functions/views)).
- **[Docs] View restrictions.** Procedural views may only read through indexes (`.find()`, `.filter()`), never `.iter()`, so that invalidation stays targeted. Views built with the module-side query builder are evaluated incrementally by the query engine and are preferred for filter and join logic ([docs: views](https://spacetimedb.com/docs/functions/views)).
- **[Docs] Client-side chunk subscriptions.** Clients can subscribe with typed query builders or SQL, for example `tables.entity.where(r => r.chunk.eq(42))`, with a separate subscription handle per chunk set.
  - Subscribe to new chunks **before** unsubscribing from old ones, because overlapping queries are free and this avoids a flicker ([docs: subscriptions](https://spacetimedb.com/docs/clients/subscriptions)).
  - Avoid overlapping *non-indexed* queries, because the server processes and serializes those rows twice.
  - Subscription SQL allows at most 2-table joins, requires indexes on both join columns, and has no arithmetic in `WHERE` ([docs: SQL reference](https://spacetimedb.com/docs/reference/sql)). A distance query like `(x-px)^2+(z-pz)^2 < r^2` is therefore impossible, and chunk ids are the intended mechanism.
- **[Code] BitCraft indexes mobile entities by chunk.** `mobile_entity_state` has a btree index on `chunk_index`, and the server recomputes `chunk_index` when an entity moves ([`components.rs` L254–259](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/messages/components.rs#L254-L259); [`game/entities/location.rs`](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/game/entities/location.rs)). **[Unverified]** The BitCraft *client* and its actual subscription queries are not open source, so chunk-keyed client subscriptions are an inference from this schema.
- **[Docs] Transient data goes in event tables.** Rows are broadcast to subscribers on commit and never stored in state or the client cache. The documented uses include "Combat and damage events", effects and notifications. There are caveats:
  - event rows are still written to the commitlog;
  - event tables can't be used in views or as the lookup side of subscription joins.
  - Source: [docs: event tables](https://spacetimedb.com/docs/tables/event-tables).

  BitCraft publishes `player_move_event` and `enemy_move_event` as public event tables ([`messages/events.rs`](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/messages/events.rs)).
- **[Docs] Interest management is not access control.** Tables are private by default, but any client can subscribe to *all* rows of a **public** table. Row-Level Security is marked "experimental, unstable — use Views instead" ([docs: RLS](https://spacetimedb.com/docs/how-to/rls); [docs: access permissions](https://spacetimedb.com/docs/tables/access-permissions)). If hidden information matters (e.g. stealth Characters), expose it only through views.
- **[Claim] Sharding across databases is the scale-out path.** "Several of our customers operate hundreds or thousands of databases in this way and BitCraft also scales this way. A single root database maintains global data, while region databases handle different parts of the world." First-class async inter-database calls ship on 2026-10-31. Synchronous cross-database transactions and intra-database partitions are "Planned" ([blog](https://spacetimedb.com/blog/how-does-spacetime-scale)). Multiple Worlds and sharding are out of scope for us, but this is the escape hatch.

## 4. How the reference games sync movement

### Blackholio (official tutorial demo; TypeScript server + TypeScript client exist)

- **[Code] Authority: server-authoritative input.** The client calls `update_player_input({direction})`, throttled to 20 Hz (`SEND_UPDATES_FREQUENCY_MS = 1000 / 20`). The reducer only stores direction and speed ([`server-ts/src/index.ts` L256](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/demo/Blackholio/server-ts/src/index.ts#L256); [`client-ts/src/game/PlayerController.ts` L8](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/demo/Blackholio/client-ts/src/game/PlayerController.ts#L8)).
- **[Code + Docs] Tick: 20 Hz.** A schedule table runs `move_all_players` every 50 ms (`ScheduleAt.interval(50_000n)`). It integrates all positions and does collision in one transaction. The tutorial calls it "very similar to a standard game 'tick'" ([`index.ts` L173, L274](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/demo/Blackholio/server-ts/src/index.ts#L274); [docs: Unity tutorial part 4](https://spacetimedb.com/docs/tutorials/unity/part-4)).
- **[Code + Docs] Client: interpolation only.** The client has no prediction. Each entity lerps toward the latest server position over `LERP_DURATION_MS = 100`. The tutorial points readers to Gabriel Gambetta for client-side prediction but does not implement it ([`EntityController.ts` L5](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/demo/Blackholio/client-ts/src/game/EntityController.ts#L5); [docs: Unity tutorial part 3](https://spacetimedb.com/docs/tutorials/unity/part-3)).
- **[Code] No interest management.** The client calls `subscribeToAllTables()` ([`GameManager.ts` L57](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/demo/Blackholio/client-ts/src/game/GameManager.ts#L57)). Collision is a brute-force nested loop over every circle × every entity inside the tick ([`index.ts` L341](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/demo/Blackholio/server-ts/src/index.ts#L341)).
- **[Claim] Scale: "hundreds of players".** The README says "Supports hundreds of players seamlessly", and the tutorial says "You can connect hundreds of players to this arena" ([docs: Unity tutorial](https://spacetimedb.com/docs/tutorials/unity)). **No measurement is published.** Given the O(n²) collision and subscribe-to-everything design, treat this as marketing.

### BitCraft (shipped MMO; server source is open, client is not)

- **[Code] Authority: client-authoritative movement with server validation.** The `player_move` reducer receives `PlayerMoveRequest { timestamp, origin, destination, duration, move_type }`, which is a movement *segment*, not an input ([`player_move.rs`](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/game/handlers/player/player_move.rs); [`action_request.rs` L14–21](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/messages/action_request.rs#L14-L21)). The server checks:
  - **Timestamp window:** it accepts requests up to 8 s in the past and 1 s in the future, and timestamps must be monotonic. The code notes "clients don't currently have accurate ServerTime".
  - **Blatant-cheat bounds:** maximum segment distance, maximum speed and maximum duration.
  - **Origin vs previous position:** checked against speed × elapsed time, with about 10% leniency.
  - **Cliff and elevation phasing** across terrain cells, and building hitboxes.
  - Sources: [`move_validation_helpers.rs` L199–320](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/game/reducer_helpers/move_validation_helpers.rs#L199-L320).
  - Several stricter checks (full terrain raycast, duration versus estimated travel time) are **commented out** because they misfired. One comment reads: "Terrain validation currently gets triggered by HTM + glancing, so it's disabled".
- **[Code] Failure handling: strikes, then a reset.** A failed speed check records a strike. Past a threshold, a scheduled `reset_mobile_entity` snaps the player back to the last valid position ([`move_validation_helpers.rs` L434–480](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/game/reducer_helpers/move_validation_helpers.rs#L434-L480)).
- **[Code, partly inferred] Replication: origin + destination + timestamp.** `MobileEntityState` stores `location`, `destination` and `timestamp`, so other clients can extrapolate along the segment. The server also inserts a `player_move_event` event row per move. **[Unverified]** How the client interpolates is not visible, because the client is closed source.
- **[Code] Tick: none for players.** Periodic "agents" are scheduled reducers for regen, decay, NPC AI and so on, running on seconds-scale intervals. For example, `npc_ai_agent_loop` is scheduled at 300 s ([`agents/npc_ai_agent.rs`](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/agents/npc_ai_agent.rs)).
- **[Code] Enemy movement is computed outside the database.** `enemy_move` and `enemy_move_batch` are admin-only reducers that write `MobileEntityState` rows and `enemy_move_event`s ([`handlers/server/enemy_move.rs`](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/game/handlers/server/enemy_move.rs)). **[Unverified inference]** An external privileged process (not in the repo) runs mob pathing and AI and submits batched results. This keeps expensive AI off the single database thread.
- **[Code + Docs] Scale: sharded regions with caps and queues.**
  - The deploy scripts publish `bitcraft-live-1` through `bitcraft-live-25` ([`publish-region2-25.sh`](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/publish-region2-25.sh)).
  - Each region has an admin-set `max_signed_in_players` and a login queue ([`generic.rs` L115–125](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/messages/generic.rs#L115-L125); [`handlers/queue/player_queue.rs` L52, L108](https://github.com/clockworklabs/BitCraftPublic/blob/998349436a903512410842ad6a588215b93ad040/BitCraftServer/packages/game/src/game/handlers/queue/player_queue.rs#L108)).
  - Official news: "Each region operates on its own 'server' (SpacetimeDB Module)… potentially a login queue if the region is full". Before this, BitCraft had "a hard cap on world size and active players" ([BitCraft news, 2025-05-16](https://bitcraftonline.com/news/early-access-key-new-features-pt-1)).
  - The 2023 post already stated the world "must be implemented as a set of many SpacetimeDB databases which handle a spatial partition" ([BitCraft news, 2023-08-28](https://bitcraftonline.com/news/spacetimedb-and-bitcraft)).
  - **[Unverified]** The per-region cap is not in the repo (it is runtime data). The community wiki says a region is "supposed to contain up to several hundreds concurrent players" ([bitcraft.wiki.gg](https://bitcraft.wiki.gg/wiki/Region)). That is secondary and unconfirmed.

## 5. Known pitfalls at scale

1. **One thread per database.** A slow reducer stalls everything, including subscription evaluation for every client ([blog](https://spacetimedb.com/blog/how-does-spacetime-scale); [code](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/crates/core/src/host/v8/mod.rs#L1-L58)). Avoid O(n²) work in ticks (Blackholio's collision loop) and avoid `.iter()` scans in hot reducers ([docs: performance](https://spacetimedb.com/docs/tables/performance)).
2. **TypeScript reducers currently have no execution timeout.** [Code] The V8 budget and timeout logic is stubbed out (`// TODO(v8): This currently leads to UB…`, `fake logic that allows a maximum timeout`) ([`host/v8/budget.rs` L23–40, L110–121](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/crates/core/src/host/v8/budget.rs#L23-L40)). A runaway loop in a TypeScript reducer would therefore block the World indefinitely. [Unverified] This may change in later versions.
3. **One transaction produces one message per interested client.** Many small per-client reducer calls multiply outbound messages. Batching into fewer transactions (a tick, or movement segments) reduces them ([docs: semantics](https://spacetimedb.com/docs/clients/subscriptions/semantics)).
4. **Non-equality subscription filters are evaluated against every change to their table** ([code](https://github.com/clockworklabs/SpacetimeDB/blob/978e86168dd897816355a9c297fc2baca45981d8/crates/core/src/subscription/module_subscription_manager.rs#L503-L540)). Per-user views are computed per subscriber ([docs: views](https://spacetimedb.com/docs/functions/views)). Prefer chunk-id equality filters and anonymous (shared) views.
5. **Large public tables are fully visible.** Clients can subscribe to everything in a public table, e.g. `subscribeToAllTables`. Interest management is voluntary on the client side. Use private tables plus views for anything secret ([docs: RLS](https://spacetimedb.com/docs/how-to/rls)).
6. **Everything is persisted, including event rows.** The docs estimate 1M players × 10 Hz transforms at about 10 PB/year uncompressed ([docs: zen](https://spacetimedb.com/docs/intro/zen)).
   - **[Unverified arithmetic]** 300 Characters × 10 Hz × about 50 bytes is roughly 13 GB/day of commitlog before compression. That matters for self-host disk and Maincloud cost, and argues for low update rates and segment-based movement.
7. **All data must fit in RAM** on the leader until tiered storage ships ([blog](https://spacetimedb.com/blog/how-does-spacetime-scale)). This is not an issue for one small World.
8. **Confirmed reads add durability latency** to every update the client sees. Consider `withConfirmedReads(false)` for the game connection ([docs: TS client](https://spacetimedb.com/docs/clients/typescript)).
9. **Scheduled ticks skip missed runs under load.** "If the database is busy… SpacetimeDB schedules the next future tick rather than running missed ticks back-to-back." Tick logic must use `ctx.timestamp` deltas, not assume a fixed dt ([docs: schedule tables](https://spacetimedb.com/docs/tables/schedule-tables)).
10. **Module-level globals are undefined behaviour.** The runtime may use fresh instances or re-execute reducers, so no in-memory caches of World state between calls. Everything goes in tables ([docs: reducers](https://spacetimedb.com/docs/functions/reducers)).

---

## Implications for this project

### Scale target

- **Recommend: design for about 100–200 concurrent Characters in the one World, and validate with headless bots before promising more.**
  - Reducer throughput is not the limit: 3k–5k calls/s against a measured ~300k TPS for trivial TypeScript reducers.
  - The unmeasured risk is fan-out plus per-tick work on a single thread, and no one has published numbers for that.
  - The only shipped large-world reference (BitCraft) caps population *per database* and shards regions, and it is written in Rust.
- **"Hundreds" (300+) is plausible but unproven.** It requires tight interest management (below), movement batching, and cheap ticks. The official "hundreds of players" claims for Blackholio have no published data behind them.
- **Escape hatch if the target outgrows one database.** BitCraft-style region databases plus a global database, using async inter-database calls from 2026-10-31. That is the "multiple Worlds / geo sharding" work that is currently out of scope, so the data model should keep a `region`/`chunk` key on every spatial row from day one.

### Interest management

- Give every spatial entity (Characters, NPCs, Telegraphs) a **`chunk` column with a btree index**, maintained by the server on movement. Use a fixed grid and size chunks so the view radius covers about 3×3 chunks.
- Clients subscribe with **equality queries per chunk** (e.g. one subscription set for the 3×3 neighbourhood). They add new chunks before dropping old ones. The engine prunes these by value, and players in the same chunk share query evaluation.
- Split hot tables: a narrow `character_motion` table (position segment, chunk, timestamp) separate from `character`, stats and inventory.
- Use **event tables** for transient combat output: damage numbers, Telegraph spawn and resolve, Dodge triggers, ability casts.
- Keep hidden or secret state in **private tables and expose it via views**. Don't rely on RLS.

### Movement authority & sync

- **Recommend a BitCraft-style model:** client-authoritative movement *segments* with server validation, not server-authoritative per-input simulation. This fits tab-target, Telegraph and Dodge combat with no aimed skillshots or lag compensation.
  - The client sends `move(origin, destination/velocity, clientTimestamp)` only when its heading or speed changes, plus a slow heartbeat (for example ≤5 Hz). It does not send every frame.
  - The server validates speed × elapsed time, the timestamp window, world bounds and walkable terrain. On failure it resets the Character to the last valid position (strikes, then a snap-back).
  - Other clients **extrapolate along the segment and blend** (interpolate toward the extrapolated position). The local player has no rollback, because the local client is authoritative for its own motion.
  - Dodge is a special movement segment with a server-checked cooldown and i-frame window.
- **Use a server tick only where the server must simulate.** Run a scheduled reducer at about **10 Hz** (Blackholio uses 20 Hz) for NPC movement and AI, Telegraph resolution (who is inside when it lands, using the server's segment positions at `ctx.timestamp`), DoTs and regen. Keep each tick O(entities in active chunks), not O(n²). Consider BitCraft's pattern of batching mob movement results into one reducer call.
- **Client connection:** use `withConfirmedReads(false)` for the World connection.

### Open questions for follow-up tickets

- **Measure it.** Run a headless bot harness against a local SpacetimeDB Standalone with the TypeScript module. Ramp 50 → 100 → 200 → 400 bots, each sending segment moves, subscribed to a 3×3 chunk neighbourhood. Record server CPU, tick overrun, p99 update latency and egress per client. This is the only way to set the final number, and it belongs to the "Testing strategy" item in #1.
- **Check Maincloud hosting limits and energy pricing** for this load before choosing self-host vs Maincloud. This belongs to the "Hosting & deploy" item in #1.
- **Re-check the TypeScript reducer timeout status** (pitfall 2) against the SpacetimeDB version we pin.
