0a. Study `specs/*` with up to 250 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
0c. Study `src/shared/*` with up to 100 parallel Sonnet subagents to understand shared types and utilities.
0d. For reference, the client source code is in `src/client/*` and server source code is in `src/server/*`.

1. Study @IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 Sonnet subagents to study existing source code in `src/*` and compare it against `specs/*`. Use an Opus subagent to analyze findings, prioritize tasks, and create/update @IMPLEMENTATION_PLAN.md as a bullet point list sorted in priority of items yet to be implemented. Ultrathink. Consider searching for TODO, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns. Study @IMPLEMENTATION_PLAN.md to determine starting point for research and keep it up to date with items considered complete/incomplete using subagents.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Treat `src/shared` as the project's standard library for shared types and utilities. Prefer consolidated, idiomatic implementations there over ad-hoc copies.

ULTIMATE GOAL: We are building SWARM.IO - a massive multiplayer survivor.io-style game with the following characteristics:
- Drop-in/drop-out endless gameplay like snake.io
- Auto-attacking weapons that fire automatically on cooldowns
- XP orbs from killed enemies, level-up with weapon/upgrade choices
- 2.5D perspective using Three.js (top-down camera with 3D depth)
- Server-authoritative multiplayer using Colyseus.js
- Hybrid PvE/PvP where mobs are the main threat but players can also damage each other
- Dynamic world that expands as more players join
- Pixel art sprite aesthetic rendered as billboards in 3D space
- Support for 100+ concurrent players per world instance

Consider missing elements and plan accordingly. If an element is missing, search first to confirm it doesn't exist, then if needed author the specification at specs/FILENAME.md. If you create a new element then document the plan to implement it in @IMPLEMENTATION_PLAN.md using a subagent.
