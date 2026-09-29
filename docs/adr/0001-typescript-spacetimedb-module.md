# TypeScript for the SpacetimeDB server module

The server module is written in TypeScript rather than Rust (or C#). One language across client, server and shared types keeps the repo in a single toolchain (vp, pnpm, oxlint, oxfmt) and lets one agent work across the whole stack. We accept that Rust is the more proven and faster path for SpacetimeDB games (BitCraft runs on it) and has server-side physics crates; if the tick budget ever outgrows TypeScript, this is the decision to revisit.
