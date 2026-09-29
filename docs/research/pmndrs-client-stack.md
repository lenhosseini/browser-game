# pmndrs + three.js client stack in 2026

Research for [issue #6](https://github.com/lenhosseini/browser-game/issues/6) (parent map: [#1](https://github.com/lenhosseini/browser-game/issues/1)).
Researched 2026-09-29. Versions change fast. Every version number below comes from npm metadata (`npm view <pkg> dist-tags time peerDependencies`) or GitHub releases on that date, unless noted otherwise.

**Question:** What does the pmndrs + three.js client stack look like in 2026 for a third-person, open-world multiplayer game? The ticket asks for six things:

1. The current React Three Fiber (R3F) version and which React versions it works with.
2. WebGPURenderer/TSL support in R3F and drei, and the WebGL fallback.
3. The state/ECS options and how well each handles many networked entities.
4. `@react-three/rapier` for client-side character movement.
5. Postprocessing.
6. How to feed high-frequency network updates into the render loop without React re-renders.

---

## 0. Version snapshot (2026-09-29)

| Package | Latest stable | Pre-release | Key peer ranges (latest stable) | Source |
| --- | --- | --- | --- | --- |
| `three` | **0.186.1** (r186, 2026-09-24) | – | – | [npm](https://www.npmjs.com/package/three), [r186 release](https://github.com/mrdoob/three.js/releases/tag/r186) |
| `react` / `react-dom` | **19.3.0** (2026-09-09) | – | – | [npm](https://www.npmjs.com/package/react) |
| `@react-three/fiber` | **9.8.1** (2026-09-24) | `10.0.0-alpha.5` (2026-09-08) | react `>=19 <19.4`, three `>=0.156` | [npm](https://www.npmjs.com/package/@react-three/fiber), [releases](https://github.com/pmndrs/react-three-fiber/releases) |
| `@react-three/drei` | **10.7.9** (2026-09-25) | `11.0.0-alpha.7` (2026-09-05) | fiber `^9.0.0`, react `^19`, three `>=0.159` | [npm](https://www.npmjs.com/package/@react-three/drei), [releases](https://github.com/pmndrs/drei/releases) |
| `@react-three/rapier` | **2.2.0** (2025-11-03) | – | fiber `^9.0.4`, react `^19`, three `>=0.159.0`; pins `@dimforge/rapier3d-compat` **0.19.2** | [npm](https://www.npmjs.com/package/@react-three/rapier) |
| `@dimforge/rapier3d-compat` | **0.21.0** (2026-09-25) | – | – | [npm](https://www.npmjs.com/package/@dimforge/rapier3d-compat) |
| `@react-three/postprocessing` | **3.1.3** (2026-09-27) | – | fiber `>=9.7.0`, postprocessing `^6.36.0`, three `>=0.156.0` | [npm](https://www.npmjs.com/package/@react-three/postprocessing), [releases](https://github.com/pmndrs/react-postprocessing/releases) |
| `postprocessing` | **6.39.5** (2026-09-09) | `7.0.0-beta.16` (2026-02-19) | three `>=0.168.0 <0.187.0` | [npm](https://www.npmjs.com/package/postprocessing) |
| `koota` | **0.6.6** | – | react `>=18` | [npm](https://www.npmjs.com/package/koota), [releases](https://github.com/pmndrs/koota/releases) |
| `zustand` | **5.0.15** (2026-08-13) | – | react `>=18` | [npm](https://www.npmjs.com/package/zustand) |
| `ecctrl` | **2.0.2** | – | three `>=0.184`, fiber `>=9.4`, rapier `>=2.2.0`, leva `>=0.10.1`, react `>=19.2.7` | [npm](https://www.npmjs.com/package/ecctrl) |
| `spacetimedb` (TS SDK) | **2.10.1** | – | optional react `^18 \|\| ^19` | [npm](https://www.npmjs.com/package/spacetimedb) |

Flag: for `koota@0.6.6`, npm's `time` field says 2026-04-09, but the GitHub release "v0.6.6 – The Lost Release" is dated 2026-08-25. The dates disagree, but it is the same version number.

---

## 1. React Three Fiber version and React compatibility

- **Stable line is v9 (9.8.1).** 9.8.0 (2026-09-22) made R3F compatible with **React 19.3.0**: "We don't fully support all of the new APIs, but it will not longer conflict" ([v9.8.0 release](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.8.0)). The same release changed two other things:
  - Roots are now configured synchronously and "gated on the renderer if it need async, for example with WebGPURenderer".
  - Strict Mode no longer breaks the canvas.
- The peer range is `react >=19 <19.4` ([npm](https://www.npmjs.com/package/@react-three/fiber)). The ceiling states the versions that have been tested. It moves when a new React ships.
- History: 9.5.0 (2025-12-30) added React 19.2 support, including `<Activity>`. To keep one R3F major across 19.0–19.2, R3F now bundles the React reconciler ([v9.5.0 release](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.5.0)). 9.7.0 (2026-07-31) was a reconciler-hardening pass that fixed child reorder, prop reset and event priorities ([v9.7.0 release](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.7.0)).
- **v10 is alpha** (`10.0.0-alpha.5`, 2026-09-08). Its peer ranges are **`react >=19.0 <19.3`** and **`three >=0.185.0`** ([npm](https://www.npmjs.com/package/@react-three/fiber/v/10.0.0-alpha.5), [v10 migration guide](https://github.com/pmndrs/react-three-fiber/blob/v10.0.0-alpha.5/docs/migration/v10.mdx)).
  - **Today, v10 alpha does not accept React 19.3, the current React release.** Adopting v10 means pinning React 19.2.
  - The guide says: "Consider all features experimental and may be changed, removed or expanded at any time" ([v10.0.0-alpha.1 release](https://github.com/pmndrs/react-three-fiber/releases/tag/v10.0.0-alpha.1)).

## 2. WebGPURenderer / TSL in three.js, R3F and drei, and the WebGL fallback

### three.js itself (r186)

From the official manual page, [`manual/pages/webgpurenderer.html` @ r186](https://github.com/mrdoob/three.js/blob/r186/manual/pages/webgpurenderer.html):

- **Automatic fallback:** "If a device/browser doesn't support WebGPU, the renderer can automatically fall back to using a WebGL 2 backend." `forceWebGL: true` forces that backend.
- **Async initialisation:** you call `setAnimationLoop()` or `await renderer.init()` before rendering.
- **Breaking migration:**
  - "Custom materials based on `ShaderMaterial`, `RawShaderMaterial` and modifications of built-in materials via `onBeforeCompile()` are not supported in `WebGPURenderer`." Those must be ported to node materials/TSL.
  - "`EffectComposer` with its effect passes are not supported." The new stack is `RenderPipeline` plus TSL nodes.
- **Maturity:** "The renderer itself is still in an experimental state … depending on your application and scene setup, you will encounter missing features or a better performance with `WebGLRenderer`."
- **WebGLRenderer:** it "is still maintained and the recommended choice for pure WebGL 2 applications", but it gets "no plans to add larger new features".
- **Post-processing on WebGPU** uses `new THREE.RenderPipeline(renderer)`, which replaces `EffectComposer`. Effects are TSL node compositions (`pass()`, `bloom()`, `fxaa()`…) with built-in MRT and automatic pass merging ([`manual/pages/webgpu-postprocessing.html` @ r186](https://github.com/mrdoob/three.js/blob/r186/manual/pages/webgpu-postprocessing.html)). R3F's v10 guide notes that `RenderPipeline` was "renamed from `PostProcessing` in r183".

### Browser support for WebGPU

From MDN browser-compat-data 8.1.3 (2026-09-24), `api.GPU` ([BCD](https://github.com/mdn/browser-compat-data), [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)):

| Browser | Support |
| --- | --- |
| Chrome / Edge desktop | Since 113 on ChromeOS, macOS and Windows. **On Linux only since 144, and only on Intel Gen12+ GPUs.** |
| Chrome Android | Since 121 |
| Firefox | Partial. Windows since 141, macOS Tahoe on Apple silicon since 145, older macOS on Apple silicon since 147. **No Linux, no Intel Macs, no Firefox Android.** |
| Safari macOS / iOS | Since 26 |
| Samsung Internet | Since 25 |

[caniuse](https://caniuse.com/webgpu) puts global usage at about 87%. Flag: this is as summarised on fetch, and caniuse's Firefox marking is coarser than BCD's.

**Implication:** a real share of players will hit the WebGL 2 fallback. That includes most Linux desktops and Intel Macs on Firefox. **Whichever renderer is chosen, the WebGL 2 path must look and run acceptably.**

### R3F

- **v9 (stable):** WebGPU works through an async `gl` factory. The docs say "A factory can return a promise. R3F waits for that promise before rendering the scene" ([Canvas docs](https://r3f.docs.pmnd.rs/api/canvas)):
  ```tsx
  <Canvas gl={async (props) => { const r = new THREE.WebGPURenderer(props as any); await r.init(); return r }}>
  ```
  - There are no TSL-specific hooks in v9. You write TSL against `three/tsl` directly.
  - 9.8.0 fixed async-renderer root ordering (see §1).
- **v10 (alpha):** WebGPU and TSL are first-class ([migration guide](https://github.com/pmndrs/react-three-fiber/blob/v10.0.0-alpha.5/docs/migration/v10.mdx), [alpha.1 notes](https://github.com/pmndrs/react-three-fiber/releases/tag/v10.0.0-alpha.1)):
  - **Entry points:** `@react-three/fiber` is the default and still uses WebGL unless you opt in. `/legacy` is WebGLRenderer only. `/webgpu` is WebGPURenderer plus the TSL hooks.
  - **Canvas and state:** `<Canvas renderer>` handles init. `state.gl` becomes `state.renderer`.
  - **Hooks:** `useUniforms`, `useNodes`, `useLocalNodes`, `useRenderPipeline` (post-processing) and `useGPUStorage`/compute.
  - **Scheduler:** a new one with named phases (for example `physics`, `update`, `render`), plus `before`/`after` constraints. `useFrame` can run outside `<Canvas>`.
  - **Removed:** `state.clock`.

### drei

- **drei 10.7.x (stable, R3F v9):** one entry point. Many components are GLSL `ShaderMaterial`/`onBeforeCompile`-based, so they cannot compile under WebGPURenderer, per the three.js rule quoted above.
  - Renderer-independent components (cameras, controls, loaders, `useGLTF`, `Html`, `Environment`, …) are fine on either renderer.
  - Flag: I did not audit drei 10 per component. The classification in the drei 11 status file below is the best proxy.
- **drei 11 (alpha.7, 2026-09-05)** requires R3F v10, `react <19.3` and `three >=0.185` ([npm](https://www.npmjs.com/package/@react-three/drei/v/11.0.0-alpha.7)). It splits entry points into root (renderer-agnostic), `/legacy` (WebGL), `/webgpu` (TSL ports), `/external` and `/experimental` ([MIGRATION_V10_TO_V11.md](https://github.com/pmndrs/drei/blob/v11.0.0-alpha.7/devDocs/MIGRATION_V10_TO_V11.md)).
  - Its own [`component-status.json`](https://github.com/pmndrs/drei/blob/v11.0.0-alpha.7/component-status.json) counts **144 components**: 106 renderer-agnostic, 31 with a WebGPU implementation, 5 `todo`.
  - The guide warns that "`implemented` … means only that a file exists under `src/webgpu/`. It is not a claim that the component works."
  - The five `todo` components are:
    - **`Text`**: the vendored troika fork could not be published. It "returns via `@pmndrs/glyph`".
    - **`Outlines`**: "broken on WebGPU through both entries".
    - **`PointMaterial`**
    - **`Preload`**: on WebGPU it never actually preloads.
    - **`Splat`**
  - Milestones still ahead: alpha.8 "WebGPU Correctness", then beta.1.
  - **For an MMO, a missing `Text` matters.** Floating nameplates and combat numbers use it.

## 3. State / ECS options for many networked entities

| Option | What it is | Fit for hundreds of networked entities |
| --- | --- | --- |
| **koota 0.6.6** (pmndrs) | ECS-based state library "optimized for real-time apps, games, and XR" ([README](https://github.com/pmndrs/koota)) | **Strong fit.** Details below. |
| **zustand 5.0.15** (pmndrs) | Small store with selector hooks | **Good for app/UI state**, not for per-entity simulation. Details below. |
| **miniplex 2.0.0** | Object-based ECS with React bindings | Last npm publish 2023-07-16 ([npm](https://www.npmjs.com/package/miniplex)). Repo not archived but quiet. **Not recommended for a new project.** |
| **bitECS 0.4.0** | Very fast typed-array ECS, no React layer | Last publish 2025-12 ([npm](https://www.npmjs.com/package/bitecs)). You would build the React integration yourself. koota covers the same ground with pmndrs bindings. |

**koota in detail:**
- **Storage:**
  - Schema traits (`trait({x:0,y:0})`) are stored **SoA**, "always the fastest option for data that has intensive operations".
  - Callback traits (`trait(() => new THREE.Mesh())`) are stored **AoS** and can hold object refs such as meshes or snapshot buffers.
- **Batch loops:** `world.query(A,B).updateEach(...)` / `readEach`.
- **Change tracking:** the `Added`/`Removed`/`Changed` query modifiers and `world.onAdd/onRemove/onChange` events.
- **React bindings:**
  - `useQuery` re-renders only when the entity set changes.
  - `useTrait` re-renders on value change.
  - **`useTraitEffect` "fires as an effect whenever it is added, removed or changes value without rerendering"**, which is the transient-update path.
- **Relations** (`ChildOf`, targets) suit target/aggro links.
- **Cost:** pre-1.0, 746 stars, active (pushed 2026-09-27) ([repo](https://github.com/pmndrs/koota)). Expect API churn.

**zustand in detail:**
- The README documents "Transient updates (for often occurring state-changes)": `store.subscribe(...)` into a ref "without forcing re-render" ([README](https://github.com/pmndrs/zustand)).
- R3F's own pitfalls page recommends `useFrame(() => (ref.current.position.x = api.getState().x))` ([Performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)).
- R3F v10 already depends on `zustand ^5` ([npm](https://www.npmjs.com/package/@react-three/fiber/v/10.0.0-alpha.5)).
- A single store of hundreds of entities gives no archetype queries and no change tracking. Immutable updates per tick would churn memory.

## 4. Physics: `@react-three/rapier` for client-side character movement

- **Version and dependencies:** `@react-three/rapier@2.2.0` (2025-11-03) is the latest. It declares **peer `@react-three/fiber ^9.0.4`**, so it does not support R3F v10 yet. It **pins `@dimforge/rapier3d-compat` 0.19.2**, while Rapier itself is at 0.21.0 ([npm](https://www.npmjs.com/package/@react-three/rapier)).
- **Upstream change:** the `dimforge/rapier.js` repo was **archived on 2026-07-12** and "merged into the main Rapier repository … (into the `typescript` directory)" ([rapier.js README](https://github.com/dimforge/rapier.js)).
- **The wrapper looks slow-moving.** Last push 2025-11-03, per the GitHub API.
- **Relevant features** ([README](https://github.com/pmndrs/react-three-rapier)):
  - A fixed timestep that defaults to 60 Hz. `timeStep` is configurable, including `"vary"`, which "prevents the simulation from being fully deterministic".
  - The `interpolation` prop.
  - Manual stepping via `useRapier().step(dt)`.
  - `updateLoop="independent"`.
  - World snapshots.
  - Direct access to the raw `rapier`/`world` objects.
- **Character controller:** Rapier's built-in `KinematicCharacterController` is available through `world.createCharacterController(offset)` ([Rapier docs](https://rapier.rs/docs/user_guides/javascript/character_controller)).
  - `computeColliderMovement(collider, desiredTranslation)` → `computedMovement()`.
  - Autostep, snap-to-ground, max slope climb and min slope slide angles.
  - Computed collisions, and optional impulses to dynamic bodies.
  - It "only supports translations", so you handle yaw yourself.
- **Ready-made controllers:**
  - **`ecctrl` 2.0.2** ([README](https://github.com/pmndrs/ecctrl)) is a dynamic-rigid-body "floating capsule" controller with ShapeCast ground detection and an animation-state store. It needs `leva` as a peer. "Multiplayer demo examples" are still on its roadmap.
  - **BVHEcctrl 0.0.18** ([repo](https://github.com/pmndrs/BVHEcctrl)) needs "no physics engine" and uses three-mesh-bvh for triangle-accurate collisions. It is early (0.0.x, last publish 2025-08).
- **Fit for a server-authoritative MMO (my reasoning, not from a source):**
  - A kinematic controller is deterministic, translation-only and has no dynamic-body forces. It is much easier to **predict locally and reconcile** against server positions than a force-driven dynamic body (ecctrl).
  - The server (a SpacetimeDB TS module) will not run Rapier WASM in the same way. Movement rules must therefore be simple enough to re-implement or validate on the server. That is a netcode decision for the movement/tick tickets.

## 5. Postprocessing

- **WebGL path (stable):** `postprocessing` 6.39.5 plus `@react-three/postprocessing` 3.1.3.
  - `postprocessing` is built on `WebGLRenderer` (see its [README](https://github.com/pmndrs/postprocessing)).
  - Its peer range caps three at **`<0.187.0`**, so it gates three.js upgrades ([npm](https://www.npmjs.com/package/postprocessing)).
  - `@react-three/postprocessing` 3.1.0 (2026-08-23) rewrote how props apply, so effects update in place instead of being rebuilt. It also added `EffectGroup`, `mergeMode` and `DepthPicking`, and now requires fiber `>=9.7.0` ([v3.1.0 release](https://github.com/pmndrs/react-postprocessing/releases/tag/v3.1.0)).
  - Maintained effects include Bloom, N8AO/SSAO, SMAA/FXAA, Outline, DoF, Vignette and ToneMapping.
- **WebGPU path:** `postprocessing` does **not** support WebGPURenderer. The maintainer says it "will eventually support `WebGPURenderer`, but it's not the focus right now" ([issue #700](https://github.com/pmndrs/postprocessing/issues/700)). v7 is in beta (`7.0.0-beta.16`, 2026-02-19), and nothing I found indicates it targets WebGPU.
  - On WebGPU you use three's own `RenderPipeline` plus TSL nodes (§2).
  - With R3F v10 that is `useRenderPipeline` ([v10 alpha.5 notes](https://github.com/pmndrs/react-three-fiber/releases/tag/v10.0.0-alpha.5)).
- **For stylized low-poly art** a small chain is likely enough: tone mapping, SMAA/FXAA, light bloom, maybe AO and an outline for the selected target. It exists on both paths.

## 6. Feeding high-frequency network updates into the render loop without React re-renders

**What the sources say:**

- **R3F:**
  - "You should never setState in there [useFrame]!" ([hooks docs](https://r3f.docs.pmnd.rs/api/hooks)).
  - "don't, mutate inside `useFrame`!", "use deltas", "fetch state directly" with `getState()`, and "re-pool objects" ([pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)).
  - Use instancing for many similar objects. Each mesh is a draw call, "no more than 1000 as the very maximum" ([scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)).
  - Negative `useFrame` priorities order callbacks without taking over rendering ([hooks docs](https://r3f.docs.pmnd.rs/api/hooks)). v10 replaces this with named phases ([migration guide](https://github.com/pmndrs/react-three-fiber/blob/v10.0.0-alpha.5/docs/migration/v10.mdx)).
- **SpacetimeDB TS SDK:**
  - Table handles expose `onInsert(ctx,row)`, `onDelete(ctx,row)` and, for tables with a primary key, `onUpdate(ctx, old, new)` ([TypeScript reference](https://spacetimedb.com/docs/clients/typescript/)).
  - The React `useTable` hook returns `[rows, isReady]` and **re-renders on row changes**, so it is wrong for position tables.
  - Flag: the docs I fetched do not say whether callbacks from one transaction arrive as a batch, or how their timing relates to the cache update. Verify this in the netcode prototype.
- **koota:** `useTraitEffect` and `onChange` give non-rendering subscriptions. `updateEach` loops mutate SoA stores in place ([README](https://github.com/pmndrs/koota)).

**Recommended pattern** (it follows from the sources above; the specific numbers depend on the tick rate, which is still undecided):

1. **The network layer is outside React.** Register SpacetimeDB row callbacks once at connection time, not inside components.
   - `onInsert` calls `world.spawn(NetId(id), Kind, Transform, Snapshots)`.
   - `onDelete` calls `entity.destroy()`.
   - `onUpdate` **only pushes `{serverTime, pos, yaw, anim}` into that entity's snapshot ring buffer**, stored as an AoS/callback trait. It triggers no React work at all.
2. **React renders entity *membership*, not entity *state*.** One `useQuery(IsCharacter)` component maps entities to `<CharacterView entity>` components (or to instanced slots).
   - It re-renders only when Characters enter or leave interest, which is low frequency.
   - Each view attaches its `Object3D` to the entity through a ref or callback trait.
3. **One interpolation system in `useFrame`.** Run it at a negative priority on v9, or in the `update` phase on v10. It:
   - computes `renderTime = estimatedServerNow − interpDelay` (roughly 2–3 server ticks),
   - samples each entity's buffer with `updateEach`,
   - writes `position`/`quaternion` straight onto the `Object3D`, or into `InstancedMesh.setMatrixAt` for crowds and NPCs,
   - reuses scratch `Vector3`/`Quaternion` objects so it allocates nothing per frame.
4. **The local Character** is client-predicted with Rapier's `KinematicCharacterController`, stepped at a fixed timestep. Input is sent to the server. When the server's authoritative row arrives through `onUpdate`, the client reconciles by replaying unacknowledged inputs or blending corrections.
5. **UI state goes in zustand** (selected target, HUD, menus), read with selectors. Fast-changing HUD values such as the target's HP or cast bars are read transiently with `subscribe` or `getState()`, or through koota `useTraitEffect` into DOM refs.
6. **Keep `useTable` out of any table that updates at tick rate.** Use it only for low-frequency tables such as the character sheet or inventory.

---

## Implications for this project

**Recommended package set** (versions as of 2026-09-29):

- `react@19.3` and `react-dom@19.3`
- `three@~0.186`. Pin it, because `postprocessing` caps three at `<0.187`.
- `@react-three/fiber@^9.8`
- `@react-three/drei@^10.7` for `useGLTF`, `useAnimations`, `Text` nameplates, `Html`, `Detailed` LOD, `PerformanceMonitor` and `Bvh`.
- `@react-three/rapier@^2.2`. It pins Rapier 0.19.2. For heavier use, weigh calling `@dimforge/rapier3d-compat` directly.
- `@react-three/postprocessing@^3.1` with `postprocessing@^6.39`.
- `koota@^0.6` for the World's networked entities. It is pre-1.0, so wrap it behind a thin module.
- `zustand@^5` for UI and app state.
- `spacetimedb@^2.10` as the client SDK.
- `leva` for dev only.
- Not recommended:
  - `ecctrl`, because it drives a dynamic body and is hard to reconcile with an authoritative server. Build a thin controller on Rapier's KCC instead.
  - `miniplex`, because it is dormant.
  - R3F v10 / drei 11 alphas, because they require React `<19.3`, have unfinished WebGPU ports including `Text`, and have no rapier support.

**Renderer choice trade-offs:**

- **WebGLRenderer (R3F v9 default). Recommended now.**
  - Every player's browser supports it.
  - The whole stable pmndrs ecosystem works: drei 10, `postprocessing`, `@react-three/rapier`, troika `Text`.
  - Three.js still recommends it for WebGL 2 apps, and the manual says it may still out-perform WebGPURenderer for some scenes.
  - The cost: it gets no big new features, and any GLSL/`onBeforeCompile` code written now must be rewritten when moving to WebGPU.
- **WebGPURenderer on stable R3F v9 via the async `gl` factory.** It is possible, but you lose drei's GLSL materials and all of `postprocessing`. You would hand-write TSL, including post-processing through `RenderPipeline`, with no R3F helpers. Many players would still land on its WebGL 2 backend anyway: Linux, Intel Macs on Firefox, older devices.
- **WebGPURenderer on R3F v10 / drei 11 alpha.** This is the intended future path, with TSL hooks, `useRenderPipeline` and a phase scheduler. But it is alpha, needs React 19.2 or lower, drei's WebGPU ports are unverified with `Text`/`Outlines` missing, and `@react-three/rapier` does not accept fiber 10.
- **Suggested policy:** ship on WebGL, and keep the migration cheap.
  - Avoid custom `ShaderMaterial`/`onBeforeCompile` where a stock material will do. Low-poly CC0 art mostly needs `MeshStandardMaterial`/`MeshToonMaterial`.
  - Keep post-processing minimal.
  - Isolate renderer-specific code.
  - **Re-check when R3F v10 and drei 11 go stable.**

**Recommended network-state → render-loop pattern:**

- SpacetimeDB row callbacks write into koota. `onInsert`/`onDelete` spawn and destroy entities. `onUpdate` only appends to a per-entity snapshot buffer.
- React subscribes only to entity membership (`useQuery`).
- A single `useFrame` interpolation system renders every remote Character/NPC at `serverNow − interpDelay` by mutating `Object3D`s or instance matrices directly. It triggers no React state.
- The local Character is predicted with Rapier's kinematic controller and reconciled against its authoritative row.
- zustand holds UI state, and transient subscriptions keep hot HUD values off the React render path.
- The `interpDelay`, the snapshot buffer depth and whether to use instancing versus per-entity skinned meshes all depend on the tick rate and animation tickets that are still open. The netcode `prototype` should confirm them.

**Open / unverified:**

- How SpacetimeDB TS SDK row callbacks are batched per transaction.
- Which drei 10 components break under WebGPURenderer, checked component by component.
- Whether `postprocessing` v7 targets WebGPU.
- How to render hundreds of *animated* (skinned) Characters efficiently. This was not researched here and belongs with the asset-pipeline/LOD work.
