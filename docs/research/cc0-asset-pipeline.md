# CC0 low-poly character & asset pipeline

Research for [issue #7](https://github.com/lenhosseini/browser-game/issues/7) (parent map: [#1](https://github.com/lenhosseini/browser-game/issues/1)).
Researched 2026-09-29. Tool versions come from npm or GitHub on that date: `three` 0.186.1 (r186), `@react-three/drei` 10.7.9, `@react-three/fiber` 9.8.1, `gltfjsx` 6.5.3, `@gltf-transform/cli` 4.5.1, `meshoptimizer` 1.3.0.

**Question:** What is the practical pipeline for CC0 stylized low-poly characters and environments in an R3F game? The ticket asks about:

1. KayKit and Quaternius packs: licensing, rig compatibility, included animations.
2. Retargeting Mixamo-style animation onto those rigs.
3. glTF optimisation: gltf-transform, meshopt/Draco, KTX2.
4. Loading in R3F/drei.
5. `gltfjsx`.
6. Animation playback and blending in R3F (`useAnimations`, mixers) with many characters on screen.

The pipeline must accept any rigged glTF so that assets can be swapped later.

**Method.** The claims below come from the vendors' own pages, from source code, and from real files. I downloaded the KayKit `Knight.glb` and `Skeleton_Minion.glb` from KayKit's GitHub repos, inspected them, and ran them through `gltf-transform` 4.5.1. The numbers in section 1 and section 5 are measurements from that run, not vendor claims.

---

## TL;DR

- **KayKit** (Kay Lousberg) is **CC0 1.0** and fits this project best. All KayKit humanoids share one rig, and the free **Character Animations** pack gives 161 CC0 clips that play on every KayKit character. Characters and animations ship as glTF.
- **Quaternius has changed its terms.** The site now carries the **Quaternius Asset License (QAL) v1.0**, dated 2026-08-28. It is *not* CC0: it bans redistributing the assets as assets. Pack pages and the FAQ still say "CC0", so the site contradicts itself. Record the licence that comes inside each zip you download. The QAL says the version in force when you got an asset is the one that governs it.
- **Mixamo is not CC0.** Adobe allows royalty-free use in games. It forbids standalone distribution of the raw files, and needs an Adobe ID. **This repo is public**, so Mixamo FBX/GLB files must never be committed. A web game also ships its GLBs to every client, which is a grey area. **Recommendation:** prefer the CC0 KayKit animation set; if Quaternius is used, take its "Mixamo-compatible" Universal Animation Library; use Mixamo only as a last resort.
- **Optimise with `gltf-transform`, not `gltfjsx --transform`.** Split each character into a mesh-only GLB plus shared per-rig animation GLBs (one per clip category). Use **meshopt** (EXT_meshopt) compression, which covers geometry *and* animation, and serve the files gzip/brotli-compressed.
  - Measured on the KayKit Knight: 3.66 MB became a **138 KB mesh file** plus **1.89 MB of shared animations (319 KB gzipped)**.
  - Use WebP for the tiny gradient atlases. Save KTX2 for large environment textures.
- **Loading and playback.** Load with drei `useGLTF` and self-hosted decoders. Clone each character with `SkeletonUtils.clone`. Share the `AnimationClip`s and give each character its own `AnimationMixer`.
  - drei's `useAnimations` calls `mixer.update` every frame for every instance. For many NPCs, use a central mixer system that throttles or skips distant and off-screen characters.
  - GPU instanced skinning exists only as WebGPU examples in three r186. Treat it as a later optimisation.

---

## 1. KayKit (Kay Lousberg)

### Licence

- The pack pages say: "Free for personal and commercial use, no attribution required. (CC0 Licensed)". They add a *request*: "please don't resell unmodified copies or claim them as your own." Sources: [Adventurers](https://kaylousberg.itch.io/kaykit-adventurers), [Character Animations](https://kaylousberg.itch.io/kaykit-character-animations), [Skeletons](https://kaylousberg.itch.io/kaykit-skeletons).
- The GitHub repo's `LICENSE.txt` reads: "License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ … This content is free to use in personal, educational and commercial projects." Crediting Kay Lousberg is "not mandatory" ([LICENSE.txt](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/main/LICENSE.txt)).
- The CC0 legal code is at [creativecommons.org/publicdomain/zero/1.0](https://creativecommons.org/publicdomain/zero/1.0/). Committing KayKit files to a public repo is fine.

### Tiers

These are the tiers for the character packs:

| Pack | FREE | EXTRA | SOURCE |
| --- | --- | --- | --- |
| Adventurers | 5 characters | $7.95+: 3 more characters and alternative textures | $11.95+: `.blend` files |
| Skeletons | 4 characters | $7.95+: Golem and Necromancer | $11.95+: `.blend` files |

Sources: [Adventurers](https://kaylousberg.itch.io/kaykit-adventurers), [Skeletons](https://kaylousberg.itch.io/kaykit-skeletons).

The Character Animations pack is free. Its `.blend` source costs $14.99+ ([page](https://kaylousberg.itch.io/kaykit-character-animations)).

### Formats and art style

- The files come as ".FBX, .GLTF" ([Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)).
- The characters are "Textured using a single gradient atlas texture (1024x1024) that can be downsampled to 128x128" (same page).

### Rig: measured on the GitHub 1.0 files

**Rig structure.**

- `Knight.glb` ([repo](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)) has **one skin with 41 joints**.
- About 23 of those joints are the deform and socket chain: `root, hips, spine, chest, head`, `upperarm/lowerarm/wrist/hand/handslot .l/.r`, and `upperleg/lowerleg/foot/toes .l/.r`.
- The other 18 are IK and control helpers, such as `kneeIK.l`, `control-heel-roll.l`, `IK-foot.l` and `handIK.r`.
- There is **no neck bone and there are no finger bones**.

**Weapon sockets.** `handslot.l/.r` are weapon sockets. The Knight carries **15 meshes**: six skinned body parts (arms, body, head, legs) and nine rigid accessories (swords, shields, helmet, cape) parented to bones.

**Shared rig.** `Skeleton_Minion.glb` from the [Skeletons repo](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) has **the identical 41-joint list**, so the packs share one rig.

**Embedded animations.**

- Knight embeds **76 clips**, for example `Idle`, `Walking_A`, `Running_A`, `Dodge_Left`, `1H_Melee_Attack_Chop`, `Spellcast_Shoot`, `Block`, `Hit_A`, `Death_A`, `Sit_Chair_Idle` and `T-Pose`.
- Skeleton_Minion embeds **95 clips**.
- All **41 joints are keyed** in every clip, IK helpers included.
- In the 3.66 MB Knight file, about 3.0 MB is animation data: the GLB is 2.0 MB of JSON and 1.7 MB of binary, mostly animation accessors. The atlas PNG is only 14 KB.

**Caveat.** The GitHub repos were last pushed in 2023–2024. The itch pages say the characters "have been updated to be compatible with the KayKit Character Animations" and name the rigs **`Rig_Medium`** and **`Rig_Large`** ([Character Animations](https://kaylousberg.itch.io/kaykit-character-animations)). Check the bone names of the current itch download against the list above before building on it.

### Animations

- **Character Animations** has "161 Humanoid animations … For both Rig_Medium and Rig_Large KayKit characters", "Separated per category":
  - General, Movement (walk/run/jump/crawl/sneak/dodge/crouch)
  - Melee (1H, 2H, unarmed, dual wield, block)
  - Ranged/spellcasting, Simulation (emotes, sit, lie), Special (skeleton variants), Tools
- The page adds: "The amount of Rig_Large animations is currently on the lower side."
- On other characters: "they will work on other humanoid characters too, use your engine's retargeting functions for that".

Source: [kaylousberg.itch.io/kaykit-character-animations](https://kaylousberg.itch.io/kaykit-character-animations).

**Fit for this game.** Dodge (4 directions), block, hit, death, spellcast and 1H/2H/dual-wield attacks line up with tab-target plus Telegraph plus Dodge combat.

## 2. Quaternius

### Licence: the site contradicts itself

- **[quaternius.com/license.html](https://quaternius.com/license.html)** is the "Quaternius Asset License (QAL) v1.0". It was last updated 2026-08-28; the server's `last-modified` header is 28 Aug 2026.
  - **Grant (section 2):** "worldwide, royalty-free, non-exclusive, perpetual license, for personal, educational, or commercial purposes, to: Use, copy, and modify the Assets; Incorporate the Assets … into a Product; Publish, distribute, sell … that Product … No attribution is required."
  - **Restriction 3(a):** "You may not extract, repackage, sublicense, sell, or otherwise redistribute the Assets (in original or modified form) as a standalone asset, asset pack, stock file, template, or similar product, whether for free or for payment … This restriction applies regardless of how much the Assets have been modified. It does not restrict distributing a completed Product that merely incorporates the Assets."
  - **Section 4:** "We retain all intellectual property rights in the Assets."
  - **Section 7:** "Changes will not apply retroactively to Assets you've already obtained under an earlier version; the version in effect at the time you obtained the Assets governs your use of them."
- **The same site's [FAQ](https://quaternius.com/faq.html)** still says "All models are under the CC0 License … These assets are licensed under CC0".
- **Pack pages** still say "(CC0 License)": [Universal Animation Library](https://quaternius.itch.io/universal-animation-library), [Universal Base Characters](https://quaternius.itch.io/universal-base-characters), [Modular Character Outfits – Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy).

**What this means.** The QAL is a copyright licence with a redistribution ban, not a public-domain waiver. For this project the ban matters in two ways:

- **Shipping inside the game is allowed.** 3(a) explicitly allows a completed Product.
- **Committing raw Quaternius files to a public GitHub repo is a grey area.** It could be read as redistributing "the Assets themselves".

Treat Quaternius as "free for games, not CC0". Keep the licence file that comes in each zip, and record the download date (see the provenance manifest in the recommended pipeline).

### Packs relevant to a WoW-like game

- **[Universal Animation Library](https://quaternius.itch.io/universal-animation-library)** has "120+ Animations", including "Locomotion in 8 directions, jog, sprint, push, crawling, swimming, sitting, death animations".
  - Rig: "universal humanoid rig … ready for retargeting" and "Compatible with other common rigs (Mixamo for example)".
  - Changelog v2.0 (2026-01-23): "Updated to new rig naming scheme (Same as modular outfits / base chars)".
  - v3.0 (2026-06-16) added root-motion and in-place variants.
  - Files: `[Standard]` is free, `[Pro]` is $9.99+, `[Source]` (`.blend`) is $14.99+ (same itch page).
- **[Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2)** has "130+ Animations", including "3 and 4 hit combos, split into separate hits with their recoveries", parkour, farming and zombie locomotion. It uses the same rig.
- **[Universal Base Characters](https://quaternius.itch.io/universal-base-characters)** has 6 base bodies and 20 hairstyles, at an "Average 13k tris", and is "Compatible with the Universal Animation Library".
  - 13k triangles is about **2× the KayKit Knight**: 6,952 triangles including all nine accessories (measured). This matters when many characters are on screen.
- **[Modular Character Outfits – Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy)** has "12 Outfits, 62 Parts", is "Compatible with the Universal Animation Library", and ships as glTF.
- **Style.** Quaternius's newer "Universal" line uses more realistic proportions than KayKit's chibi style. Mixing the two families in one World will look inconsistent, and the two rigs differ, so clips do not transfer without retargeting.

## 3. Mixamo (Adobe): not CC0

**Official FAQ.** The [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) was read via the [Wayback snapshot of 2026-09-24](https://web.archive.org/web/20260924203626/https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html), because Adobe's CDN blocks automated fetches. It was last updated Sep 14, 2021. It says:

- "Mixamo is available free for anyone with an Adobe ID and does not require a subscription to Creative Cloud."
- "Mixamo is not available for Enterprise and Federated IDs."
- "You can use both characters and animations royalty free for personal, commercial, and non-profit projects including: … Create video games."
- "the auto-rigger and animation libraries are for bipedal humanoids only."

**Adobe General Terms of Use** ([adobe.com/legal/terms.html](https://www.adobe.com/legal/terms.html), last updated 2025-10-03), section 3.6 "Content Files":

- Content Files are "Adobe assets provided as part of the Services and Software".
- You may embed them in an end product you author, and "may not distribute the Content Files on a stand-alone basis, outside of the End Use".

**The raw-file rule is not written in the FAQ.** The widely quoted rule ("the only thing you can't do is distribute the raw character and animation files") comes from community posts, not from Adobe staff:

- the [community FAQ thread](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400) by a non-staff member, 2022
- the [terms-of-use thread](https://community.adobe.com/t5/mixamo-discussions/can-i-see-mixamo-legal-terms-of-use/td-p/12802766)

It does match section 3.6 of the General Terms.

**What this means here:**

1. **This repo is public** (`gh repo view` reports `PUBLIC`). Committing Mixamo FBX/GLB clips would be standalone distribution. Don't.
2. A browser game sends its `.glb` files to every client, where anyone can download them. They are embedded in the game, but they are still the raw clip data. No Adobe source says whether that counts as "stand-alone". This is an unresolved risk, not a blocker.
3. Mixamo output mixed into the asset tree makes the whole tree "CC0 except these files". A provenance manifest is needed either way.
4. **Recommendation:** use the CC0 KayKit animations first. Use Quaternius UAL, which is Mixamo-compatible and free under the QAL, if more clips are needed. Treat Mixamo as a local-only authoring source, kept out of git, and only if a clip is missing from both.

## 4. Retargeting Mixamo-style animation onto these rigs

**Three routes, best first.**

1. **Don't retarget. Stay on one rig family.** KayKit characters plus KayKit clips share bone names, so no retargeting is needed. Quaternius characters plus UAL are the same by design.
2. **Offline retarget into the target rig, then ship native clips.** three.js has `SkeletonUtils.retargetClip(target, source, clip, options)` ([source @ r186](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/utils/SkeletonUtils.js)).
   - `names`: "A dictionary for mapping target to source bone names". `getBoneName` is the function alternative.
   - `hip`: "The name of the source's hip bone" (default `'hip'`).
   - `scale`, `hipInfluence`, `localOffsets` (per-bone offset matrices), `trim` and `fps`.
   - Run it in a Node or browser build script and write the result out with `GLTFExporter`, so the game only ever loads clips baked for its own rig.
3. **Runtime retargeting.** The same function called on load. This costs CPU at load time, and it spreads source-rig knowledge through the client. Avoid it.

**Worked examples in three r186.**

- [`webgpu_animation_retargeting.html`](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_animation_retargeting.html) retargets between two glTF characters. It uses `hip: 'mixamorigHips'`, `scale: 1 / targetModel.scene.scale.y` and `localOffsets` on the shoulder, arm and hand bones to fix the arm rest pose.
- [`webgpu_animation_retargeting_readyplayer.html`](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_animation_retargeting_readyplayer.html) retargets a Mixamo FBX onto a glTF avatar.
  - Its comment says: "mixamo use centimeters, readyplayer.me use meters (three.js scale is meters)". It passes `scale: .01`.
  - It maps names with `getBoneName: bone => 'mixamorig' + bone.name`.

**Gotchas specific to KayKit.**

- **Bone names get sanitised.** three.js strips `[ ] . : /` from node names: `PropertyBinding.sanitizeNodeName` does `name.replace(/\s/g,'_').replace(/[\[\]\.:\/]/g,'')` ([PropertyBinding.js @ r186](https://github.com/mrdoob/three.js/blob/r186/src/animation/PropertyBinding.js)), and `GLTFLoader` applies it to every node. So KayKit's `upperarm.l` becomes `upperarml` at runtime, and Mixamo's `mixamorig:Hips` becomes `mixamorigHips`. Write retarget name maps against the *sanitised* names.
- **The chains don't match.** KayKit has no neck or fingers, and a two-bone spine (`spine`, `chest`). Mixamo-style rigs have more bones, which the three.js examples reference (`mixamorigLeftShoulder` and others). Spine and neck motion from a Mixamo clip gets collapsed or dropped on KayKit. Expect some manual tuning of `localOffsets` per source rig.
- **Don't use Mixamo's auto-rigger on KayKit characters.** It builds a new Mixamo skeleton, which breaks compatibility with the 161 KayKit clips and loses the `handslot` sockets. The FAQ also lists auto-rigger limits: "large extra appendages or props", "floating heads that are disjoined from the body". KayKit bodies are separate skinned parts.

## 5. glTF optimisation: gltf-transform, meshopt vs Draco, KTX2

### Tools

- **`@gltf-transform/cli` 4.5.1** ([docs](https://gltf-transform.dev/cli), [repo](https://github.com/donmccurdy/glTF-Transform)). It has these commands:
  - `inspect`, `validate`, `optimize`
  - `meshopt`, `draco`, `quantize`
  - `resample`, `prune`, `dedup`, `join`, `instance`, `simplify`, `palette`
  - `webp`, `avif`, `etc1s`, `uastc`, `resize`, `merge`, `partition`
- The CLI states the division of labour: "Draco compresses geometry; Meshopt and quantization compress geometry and animation".
- `meshopt` "decodes very quickly, and is best used in combination with a lossless compression method like brotli or gzip" (`gltf-transform help meshopt`).
- `etc1s` and `uastc` need **KTX-Software** installed (`gltf-transform help etc1s`, [KTX-Software](https://github.com/KhronosGroup/KTX-Software/)).
- **meshoptimizer** ([README](https://github.com/zeux/meshoptimizer)): the decoder runs at "3-6 GB/s on modern desktop CPUs", and encoded data "remains compressible with general purpose compressors". The encoding is available as the glTF extensions `EXT_meshopt_compression` and the newer `KHR_meshopt_compression`.
- **gltfpack** from the same repo ([gltf/README](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)) is an all-in-one alternative. It "merg[es] meshes … quantiz[es] and resampl[es] animations". It has `-cc` (meshopt), `-tc` (KTX2/BasisU) and `-tw` (WebP). It notes that "Draco compression … [is] not supported".
- **Why meshopt over Draco for this project:** animation is the largest part of a character file (section 1), and Draco does not touch animation.

### KTX2 / Basis Universal

- Khronos: KTX 2.0 holds "Basis Universal supercompressed GPU textures" that can be "efficiently transcoded to a variety of GPU compressed texture formats at run-time", with "significantly smaller transmission and GPU memory sizes than JPEG and PNG". **ETC1S** gives the smallest files and **UASTC** the higher quality. glTF uses it via `KHR_texture_basisu` ([khronos.org/ktx](https://www.khronos.org/ktx/)).
- three.js `KTX2Loader` needs the "WASM transcoder and JS wrapper … from the `examples/jsm/libs/basis` directory", plus `setTranscoderPath` and `detectSupport(renderer)` ([KTX2Loader.js @ r186](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/KTX2Loader.js)).
- **Where KTX2 pays off here:** large terrain, tiling and environment textures, where VRAM and upload time matter.
- **Where it doesn't (recommendation, not a sourced fact):** KayKit and Quaternius character atlases are small gradient swatch textures. Downloads are already tiny, VRAM use is trivial at 256–512 px, and block compression plus mipmapping can bleed colour between swatches. Use WebP, or leave them as PNG, for character atlases.

### Measured on the KayKit Knight (gltf-transform 4.5.1)

| File | Size | Notes |
| --- | --- | --- |
| `Knight.glb` (original) | 3.66 MB | 15 meshes, 1 skin, 76 clips, 14 KB PNG |
| `optimize` with all defaults | 2.06 MB | still bundles all 76 clips |
| Mesh-only (animations removed), then `optimize --compress meshopt --texture-compress webp --texture-size 512 --flatten false --join false --simplify false` | **138 KB** (87 KB gzip) | 14 meshes. Validates with no errors |
| Same, but with `join` left on | 134 KB | 10 meshes: the rigid accessories joined, **the 6 skinned parts stayed separate** |
| Animation-only (meshes and skin removed, 76 clips), then `resample` and `meshopt` | **1.89 MB** (**319 KB gzip**) | validates with no errors. One file shared by every character on the rig |

Findings from the measurement:

- **Split the animations out.** In a 76-clip character file, 80%+ of the bytes are animation. With N characters, embedding the clips in each costs N× the download.
- **Drop the IK and control-bone tracks** (recommendation). All 41 joints are keyed in every clip, including 18 IK and control helpers. They should not need runtime tracks, because the baked deform bones already hold the result. Check this visually before relying on it.
- **Merge the body parts in Blender** (recommendation). `join` does not merge the 6 skinned body parts, so a KayKit character costs **6 skinned draw calls plus one per visible accessory**. For crowds, merge the body parts into one skinned mesh before export. They already share one material.
- **Quantisation splits the skin.** With `KHR_mesh_quantization`, optimize wrote **6 skins** (one per skinned mesh) where the source had 1. three.js loads this fine, but tools that assume "one skin per character" will not.

## 6. Loading in R3F/drei

**`useGLTF(path, useDraco = true, useMeshOpt = true, extendLoader?)`** wraps R3F `useLoader` and caches per URL. `useGLTF.preload(url)` preloads. It "defaults to CDN loaded draco binaries (`https://www.gstatic.com/draco/versioned/decoders/1.5.5/`)" unless you pass a path or call `useGLTF.setDecoderPath` ([docs](https://github.com/pmndrs/drei/blob/master/docs/loaders/gltf-use-gltf.mdx), [source](https://github.com/pmndrs/drei/blob/master/src/core/Gltf.tsx)).

- Use `extendLoader` to attach a `KTX2Loader`: `loader.setKTX2Loader(ktx2Loader.detectSupport(gl))`.
- Self-host the decoders from `three/examples/jsm/libs/{draco/gltf,basis}` (listed in the [r186 tree](https://github.com/mrdoob/three.js/tree/r186/examples/jsm/libs)). If the project uses only meshopt, pass `useDraco = false`.

**drei imports `GLTFLoader` from `three-stdlib`, not from `three`** ([Gltf.tsx](https://github.com/pmndrs/drei/blob/master/src/core/Gltf.tsx)).

- three r186's own `GLTFLoader` supports both `EXT_meshopt_compression` and `KHR_meshopt_compression` ([GLTFLoader.js @ r186](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/GLTFLoader.js)).
- `three-stdlib`'s loader only knows `EXT_meshopt_compression` ([three-stdlib GLTFLoader.js](https://github.com/pmndrs/three-stdlib/blob/main/src/loaders/GLTFLoader.js)).
- **Emit `EXT_meshopt_compression`**, the gltf-transform default. Alternatively, load with `useLoader(GLTFLoader from 'three/addons/…')` if KHR is ever needed.

**R3F docs:**

- "Every resource that is loaded with useLoader is cached automatically!" ([scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)).
- Each mesh is a draw call: "no more than 1000 as the very maximum, and optimally a few hundred or less" (same page).
- "think twice before you mount/unmount things! Every material or light … has to compile" ([pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)). For characters, pool them and toggle `visible` rather than mount and unmount them as they stream in and out of range.

**Vite placement.** gltfjsx expects models in `/public` ("The GLTF file has to be present in your projects `/public` folder", [gltfjsx README](https://github.com/pmndrs/gltfjsx)). Vite serves `public/` as-is at the root, without hashing ([Vite static assets](https://vite.dev/guide/assets)). Add a content hash or version to the filename yourself, or cache-busting won't work.

## 7. gltfjsx

**What it is.** [gltfjsx](https://github.com/pmndrs/gltfjsx) 6.5.3 turns a GLB into a typed JSX component.

- `--types` adds TypeScript definitions. `--keepnames`, `--shadows` and `--instance`/`--instanceall` (via drei `Merged`) are also available.
- `--transform` runs gltf-transform with draco, resize and WebP.
- The README says: "GLTF is thrown whole into the scene which prevents re-use, in threejs objects can only be mounted once". gltfjsx creates "a virtual graph of all objects and materials" so a model can be re-used.

**Skinned models.** The generated code does `const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])` and then `useGraph(clone)`. When clips exist, it wires in drei `useAnimations` ([parser.js](https://github.com/pmndrs/gltfjsx/blob/master/src/utils/parser.js)).

**`--transform` defaults** ([transform.js](https://github.com/pmndrs/gltfjsx/blob/master/src/utils/transform.js)):

- It pushes `draco()` for geometry, which means no meshopt animation compression.
- It uses `palette`, `join`, `flatten`, `resample`, `prune`, `sparse`, and WebP textures at 1024 px.

**Recommendation:**

- **Environment props:** use gltfjsx to generate typed components, especially with `--instanceall`. Run compression yourself with gltf-transform and point gltfjsx at the result without `--transform`.
- **Characters:** don't generate one component per model. A single generic `<Character url rig>` component (section 8) is what lets "any rigged glTF" be swapped in. gltfjsx is still useful to read a new asset's node names (`--console`) and to produce `--types` for it.

## 8. Animation playback and blending for many characters

### three.js primitives (r186)

- **Mixers.** `AnimationMixer`: "When multiple objects in the scene are animated independently, one `AnimationMixer` may be used for each object" ([AnimationMixer.js](https://github.com/mrdoob/three.js/blob/r186/src/animation/AnimationMixer.js)).
- **Blending.** `AnimationAction` has `fadeIn`, `fadeOut`, `crossFadeTo(action, duration, warp)`, `crossFadeFrom` and `setEffectiveWeight` ([AnimationAction.js](https://github.com/mrdoob/three.js/blob/r186/src/animation/AnimationAction.js)). The official examples [`webgl_animation_skinning_blending`](https://github.com/mrdoob/three.js/blob/r186/examples/webgl_animation_skinning_blending.html) and [`webgl_animation_skinning_additive_blending`](https://github.com/mrdoob/three.js/blob/r186/examples/webgl_animation_skinning_additive_blending.html) show crossfades and additive layers.
- **Shared state.** `AnimationObjectGroup` is "A group of objects that receives a shared animation state". Its limitation: "The animated properties must be compatible among the all objects in the group" ([AnimationObjectGroup.js](https://github.com/mrdoob/three.js/blob/r186/src/animation/AnimationObjectGroup.js)). It fits crowds that move in lockstep, such as idle townsfolk. It does not fit NPCs that each have their own state.
- **Cloning.** `SkeletonUtils.clone` "ensur[es] that any `SkinnedMesh` instances are correctly associated with their bones … geometries and materials, are reused by reference" ([SkeletonUtils.js](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/utils/SkeletonUtils.js)). drei `<Clone>` calls it automatically for skinned objects ([Clone.tsx](https://github.com/pmndrs/drei/blob/master/src/core/Clone.tsx)).
- **Clip binding.** Clips bind by (sanitised) node name through `PropertyBinding`, so **clips loaded from a separate animations GLB play on any character whose bone names match**. This is what makes the split in section 5 work.

### drei `useAnimations`

Source: [useAnimations.tsx](https://github.com/pmndrs/drei/blob/master/src/core/useAnimations.tsx).

- It creates **one `AnimationMixer` per hook call**, builds actions lazily through `mixer.clipAction(clip, root)`, and registers `useFrame((state, delta) => mixer.update(delta))`.
- So every character using it updates every frame, with no distance or visibility throttling.
- It is fine for the local Player and a handful of nearby characters. The gltfjsx README shows the crossfade pattern: `actions[name].reset().fadeIn(0.5).play(); return () => actions[name].fadeOut(0.5)`.

### Scaling to many on-screen characters (recommendations)

These build on the facts above. They are design proposals, not sourced claims.

1. **Load each asset once, share it across characters.** Share one `AnimationClip[]` per rig from the animations GLB. Give each character a `SkeletonUtils.clone` of its mesh GLB, which re-uses geometry and material. Each character gets its own mixer and actions.
2. **Tick all mixers from one central `useFrame` system**, not from N hooks. Per character:
   - Skip the update when off-screen (frustum test on a bounding sphere) or beyond a cull distance.
   - Update at a reduced rate for mid-distance characters by accumulating `delta` and updating every 2nd–4th frame.
   - This is animation LOD. It fits the pmndrs "mutate, don't setState" guidance ([pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)).
3. **Keep the action set small per character.** Use locomotion (idle/walk/run/strafe/dodge) plus the current ability clip. Drive them from a small animation state machine fed by network state: speed → blend weight, and ability start → one-shot `crossFadeTo`. Ability and Telegraph timing live on the server, and the client only picks clips.
4. **Watch draw calls.** A KayKit character is about 6 skinned body calls plus accessories (measured). Merging the body in Blender brings it to about 1–3 calls. With ~100 visible characters, the result stays under R3F's "few hundred" guideline.
5. **GPU instanced skinning is the escape hatch, not the baseline.** three r186 ships [`webgpu_skinning_instancing`](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_skinning_instancing.html) and [`webgpu_skinning_instancing_individual`](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_skinning_instancing_individual.html).
   - The second uses a TSL compute pass (`Compute Instanced Skinning`) with per-instance time offsets.
   - Both are WebGPU/TSL examples, not a core API. Revisit them once the renderer choice (issue #6) and a measured scale target exist.

### Environments

- For repeated props (trees, rocks, fences), use drei `<Instances>`/`<Merged>`: "Each type will cost you exactly one draw call, no matter how many you use" ([Merged docs](https://github.com/pmndrs/drei/blob/master/docs/performances/merged.mdx)).
- For level of detail, use `<Detailed distances={[…]}>`, a wrapper around `THREE.LOD` ([Detailed docs](https://github.com/pmndrs/drei/blob/master/docs/performances/detailed.mdx)).
- KayKit environment packs such as [Dungeon Remastered](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0) and [Medieval Hexagon](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) are CC0 on GitHub, like the characters.

---

## Open questions and risks

- **Quaternius licence.** The QAL v1.0 page (2026-08-28) contradicts the CC0 wording on pack pages and in the FAQ. Before adopting Quaternius, confirm which licence file ships in the zip on the download date. Also decide whether raw Quaternius files may sit in this public repo. A conservative option is to keep them out of git and fetch them in a build step.
- **Mixamo in a web client.** Whether GLBs served to browsers count as "stand-alone" distribution under Adobe section 3.6 is unresolved. Avoid Mixamo unless a clip is missing.
- **Current KayKit rig names.** Measurements came from the GitHub 1.0 repos. Verify that the current itch `Rig_Medium` bone names match before writing name maps.
- **Removing IK-control tracks** is a proposed saving that has not been verified visually.
- **Mixer cost at scale** has not been benchmarked. The animation-LOD thresholds need a prototype, which depends on the scale target from the netcode tickets.

---

## Recommended pipeline for this project

### 1. Sources (provenance first)

- Primary: **KayKit** character packs (Adventurers, Skeletons, others as needed) and the **KayKit Character Animations** (`Rig_Medium`, `Rig_Large`), all CC0.
- Fill gaps: **KayKit environment packs** (CC0).
- Optional, QAL: **Quaternius** — only as a whole second rig family (UBC, Outfits and UAL together), never mixed per-character with KayKit.
- Last resort: **Mixamo**, local-only, never committed.
- Keep a manifest at `assets/source/<pack>/<version>/` with the original zips' `LICENSE*` files, plus `assets/PROVENANCE.md` (or JSON) recording pack, author, URL, licence, version and download date for every file.

### 2. Layout and conventions

These let any rigged glTF slot in:

```
assets/source/…                 # untouched vendor files (+ licences)
assets/rigs/<rig>/rig.json      # rig id, sanitised bone names, hip bone, socket bones (e.g. handslotl/handslotr)
public/models/chars/<name>.<hash>.glb        # mesh-only, one per character
public/models/anims/<rig>.<set>.<hash>.glb   # clips for that rig by category (movement, melee, …), no meshes
public/models/props/<name>.<hash>.glb
```

A new character asset only needs a `rig` id. If its rig has no clip set, add `public/models/anims/<newrig>.glb`, made natively or by offline `SkeletonUtils.retargetClip` into that rig. The client code does not change.

### 3. Processing commands

Put these in a `scripts/assets` build step with `@gltf-transform/cli` pinned as a devDependency.

```bash
# 0. Inspect anything new
npx gltf-transform inspect in.glb

# 1. Split (script below): animations removed -> char.glb; meshes/skins removed -> anims.glb
node scripts/assets/split.mjs in.glb tmp/char.glb tmp/anims.glb

# 2. Characters: meshopt geometry, WebP atlas, keep skinned hierarchy intact
npx gltf-transform optimize tmp/char.glb public/models/chars/knight.glb \
  --compress meshopt --texture-compress webp --texture-size 512 \
  --flatten false --join false --simplify false

# 3. Per-rig animation sets (one file per category, e.g. KayKit's General/Movement/Melee…):
#    dedupe keyframes, meshopt. Do NOT use `gltf-transform merge` to combine them: it keeps
#    "each in a separate Scene" (help text), i.e. duplicate skeletons. Load several set files
#    and concatenate their clip arrays instead; binding is by bone name.
npx gltf-transform resample tmp/anims.glb tmp/anims.r.glb
npx gltf-transform meshopt  tmp/anims.r.glb public/models/anims/rig_medium.movement.glb

# 4. Environment props: full optimize; KTX2 only for big textures (needs KTX-Software)
npx gltf-transform optimize prop.glb public/models/props/prop.glb --compress meshopt --texture-compress webp
npx gltf-transform etc1s big_terrain.glb out.glb     # or uastc for quality-sensitive maps

# 5. Always
npx gltf-transform validate public/models/**/*.glb
```

The split script used for the measurements in section 5 (gltf-transform SDK 4.5.1). The follow-up `optimize` pass removes the leftover unused accessors.

```js
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [, , input, meshOut, animOut] = process.argv;
let doc = await io.read(input);                                   // mesh-only
doc.getRoot().listAnimations().forEach((a) => a.dispose());
await doc.transform(prune());
await io.write(meshOut, doc);
doc = await io.read(input);                                       // animation-only
for (const n of doc.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
doc.getRoot().listMeshes().forEach((m) => m.dispose());
doc.getRoot().listSkins().forEach((s) => s.dispose());
await doc.transform(prune({ keepLeaves: true }));                 // keep bone nodes
await io.write(animOut, doc);
```

Also:

- Serve `.glb` with gzip or brotli. Meshopt output relies on it: 1.89 MB → 319 KB measured.
- Optional, once verified visually: strip IK/control-bone tracks in the split script.
- Optional, in Blender: merge the skinned body parts into one mesh per character.

### 4. Loading in R3F

- `useGLTF(url, false /* no draco */, true /* meshopt */, extendLoader)`. Self-host decoders with `useGLTF.setDecoderPath(…)`. Attach `KTX2Loader` (transcoder copied from `three/examples/jsm/libs/basis`) only where KTX2 is used.
- `useGLTF.preload` the animation-set GLBs for each rig and the mesh GLBs for the current zone. Keep the files in `public/` with hashed names.
- Write one generic `<Character url rig>` component:
  - `const { scene } = useGLTF(url)`
  - `const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])`
  - Attach weapons by parenting accessory meshes to the socket bones listed in `rig.json`.
  - Pool Character instances and toggle `visible` rather than mounting and unmounting per stream-in.
- Use gltfjsx (`--types --instanceall`, **without** `--transform`) for static environment kits only.

### 5. Animation playback for many characters

- Share one clip array per rig: concatenate `useGLTF(anims/<rig>.<set>.glb).animations` across the loaded sets. Each Character gets its own `AnimationMixer(clone)` and caches only the actions it uses.
- A **central `AnimationSystem`** calls `mixer.update` in one `useFrame`:
  - full rate near the camera or for the local Player
  - every 2nd–4th frame at mid range, with accumulated delta
  - skipped when off-screen or beyond the cull distance
- A small per-character **state machine** (idle ↔ walk ↔ run by speed, strafe, dodge, ability one-shots, hit, death) switches with `crossFadeTo(next, 0.15–0.25)`.
- The local Player may use drei `useAnimations` for convenience. NPCs use the central system.
- Add later, only after profiling: `AnimationObjectGroup` for lockstep ambient crowds, and WebGPU compute instanced skinning (three r186 examples) if the renderer decision and scale target need it.
