# SWARM.IO Implementation Plan

## Current Status: Phase 7 - Gameplay Polish & New Content

**Last Updated:** 2026-01-19
**Implementation Progress:** 134/85 core tasks completed (158%) + 11 new tasks pending
**Test Count:** 1049 tests - ALL PASSING (555 server + 121 shared + 373 client)
**Build Status:** Server running on port 2567, Client fully connected on port 5173 (live multiplayer)
**Pending Tasks:** 11 HIGH PRIORITY tasks (see PRIORITIZED TASK LIST below)
**Total Sprites:** 70 (player 9 + enemies 16 + weapons/projectiles 18 + XP orbs 6 + power-ups 6 + world events 6 + misc 3)
**Code Quality:** Excellent (0 TODOs, 0 FIXMEs, 0 skipped tests, 0 lint warnings, ~2 production `any` types - intentional for security logging)
**CI/CD Status:** GitHub Actions configured (.github/workflows/test.yml, release.yml)

> **See also:** [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md) for verification checklists, code quality standards, and development commands.

---

## EXECUTIVE SUMMARY

| Metric | Value | Notes |
|--------|-------|-------|
| Core Tasks | 134/85 | 158% complete |
| **Pending Tasks** | **11** | **HIGH PRIORITY - Implement now** |
| Test Coverage | 1049 tests | All passing |
| Code Quality | Excellent | 0 TODOs, 0 FIXMEs, 0 skipped tests |

### System Status

All core systems operational: 60Hz game loop, 8 weapons with animations, multiplayer (6 features), world events, hidden power-ups, audio system, screen shake, knockback, persistent high score, random starting weapons, server leaderboard (top 100), character classes (5), weapon evolution (8 paths), level up effects, weapon impact particles.

---

## PRIORITIZED TASK LIST

> **IMPORTANT: All tasks below are HIGH PRIORITY and should be implemented immediately.**

---

### P1 - HIGH PRIORITY: Gameplay Feel (Implement Now)

These tasks improve core gameplay feel. Use suggested values.

- [x] **BUG-040: Movement Speed Too Slow** ✅ DONE (2026-01-19)
  - Changed `PLAYER_BASE_SPEED` from 8 → 12 in `src/shared/src/constants.ts`
  - Scaled all enemy speeds 1.5x: bat 6→9, skeleton 3.75→5.6, zombie 2.25→3.4, ghost 4.5→6.75, slime 3→4.5, etc.

- [x] **BUG-041: Enemy Spawn Rate Too Low** ✅ DONE (2026-01-19)
  - Added batch spawning (2-3 enemies per cycle) in `src/server/src/systems/SpawnSystem.ts`
  - Now spawns 2-3 enemies per 0.5s cycle instead of 1

- [x] **BUG-042: Projectile Speed Issues** ✅ DONE (2026-01-19)
  - Axe: 8 → 14 in `src/shared/src/constants.ts`
  - Fireball: 10 → 20
  - XP Orbs: 8 → 12

- [ ] **P6.1: Balance Enemy Health/Damage**
  - Early waves (0-60s): Enemies die in 2-3 hits
  - Mid waves (60-180s): Enemies die in 4-6 hits
  - Late waves (180s+): Enemies die in 6-10 hits

- [ ] **P6.2: Balance Boss Difficulty**
  - First boss (60s): Beatable at level 5-6
  - Second boss (150s): Requires level 10+ or evolved weapon
  - Third boss (240s): Requires multiple evolutions

---

### P2 - HIGH PRIORITY: Visual Polish (Implement Now)

- [ ] **BUG-043: Environment Too Empty**
  - Add decorative objects: rocks (3 variants), dead trees (2), debris/bones, pillars/ruins (4)
  - Generate sprites in `scripts/generate-sprites.ts` using Game Boy palette
  - Add `createEnvironmentDecorations()` in `src/client/src/game/Renderer.ts`
  - Scatter 50-100 visual-only objects within world bounds

- [ ] **P8.1: Player Size Scales With Level**
  - Scale formula: `1.0 + (level - 1) * 0.0125` (1.0x at level 1 → 1.5x at level 40)
  - Modify player sprite rendering in `src/client/src/game/Renderer.ts`
  - Visual only - hitbox unchanged

---

### P3 - HIGH PRIORITY: Surprise Mechanics (Implement Now)

- [ ] **P5.3: Secret Boss**
  - Trigger: All alive players reach level 15+
  - Add `secret_boss` enemy type, spawn at world center with announcement

- [ ] **P5.4: Environmental Hazards**
  - Lava pools: DOT damage, spawns randomly
  - Ice patches: Slow movement, spawns in groups
  - Teleporters: Paired portals, random placement

- [ ] **P5.5: Jackpot XP Orbs**
  - Rare spawn (1% chance), gives 500 XP
  - Glows golden, larger size
  - Attracts nearby enemies (aggro radius 30)

- [ ] **P5.6: Shape-Shifting Enemy**
  - Copies random player's current weapons
  - Changes appearance to match copied player
  - Spawns after wave 5 (rare)

- [ ] **P5.7: Day/Night Cycle**
  - 2-minute cycle (1 min day, 1 min night)
  - Day: Normal spawns, +10% XP
  - Night: 2x spawn rate, enemies +20% damage, -20% visibility

---

### P4 - HIGH PRIORITY: New Weapons (Implement Now)

- [ ] **P8.2: Add 4 New Weapons**
  1. **Boomerang** - Returns to player, hits enemies both ways
  2. **Chain Lightning** - Jumps between 3-5 enemies
  3. **Poison Cloud** - DOT area denial (3s duration)
  4. **Shield** - Blocks damage, reflects projectiles

  For each weapon, update:
  - `src/shared/src/constants.ts` - WEAPON_CONFIGS
  - `src/shared/src/types.ts` - WeaponType union
  - `src/server/src/systems/WeaponSystem.ts` - Fire logic
  - `scripts/generate-sprites.ts` - Weapon sprites
  - `src/client/src/game/Renderer.ts` - Rendering

---

### LOW PRIORITY (Skip for now)

- [ ] **BUG-044: Remove CRT Option** - Keep as optional feature

---

## GAME DESIGN PRINCIPLES

> **CRITICAL: Read this section before implementing any feature or fix.**

### Core Game Type
- **SOLO endless survivor** with PvP enabled
- Players spawn individually, survive endless enemy waves
- Can fight other players (no teams/alliances)
- Victory measured by survival time, kills, and score

### The Game NEVER Pauses
- **No pausing for any reason** - this is a live multiplayer game
- Enemies keep spawning and attacking at all times
- Other players keep moving and can attack you
- The only "pause" is death

### During Upgrade Modal (Level Up)
- **FULL movement control** - player can dodge while choosing upgrade
- **FULLY VULNERABLE** - player takes damage during selection
- **Normal sync continues** - server/client position updates work normally
- **NO teleportation** - player continues from current real-time position
- The modal is just UI overlay, game state continues normally underneath

### During Any Modal/UI
- Same rules apply - game continues, player is vulnerable
- Never block input processing on server during UI states
- Never freeze position or buffer inputs

### Multiplayer Authority
- Server is authoritative for game state
- Client predicts for responsiveness
- Reconciliation should never cause teleportation during normal gameplay

---

## IMPLEMENTATION DETAILS (Reference for tasks above)

### BUG-040-042: Speed Constants Location
All speed values are in `src/shared/src/constants.ts`:
- `PLAYER_BASE_SPEED` (line ~84)
- `ENEMY_CONFIGS` speeds (lines ~471-571)
- `WEAPON_CONFIGS` projectile speeds (lines ~274-378)
- `XP_ORB_SPEED` (line ~92)

### BUG-041: Spawn System Location
Batch spawning goes in `src/server/src/systems/SpawnSystem.ts`:
- `handleEnemySpawning()` method (lines ~114-178)
- Add loop to spawn multiple enemies per tick

### BUG-043: Environment Decoration Locations
- Sprites: `scripts/generate-sprites.ts`
- Rendering: `src/client/src/game/Renderer.ts` - add `createEnvironmentDecorations()` near `createGround()`

---

## CHANGELOG

See git history for detailed changelog. Recent highlights:
- 2026-01-19: BUG-040/041/042 - Gameplay feel improvements (movement speed 8→12, batch spawning 2-3, projectile speeds)
- 2026-01-19: BUG-050, BUG-053 fixed; TypeScript cleanup (95%); XP orb animations; All weapon sprites complete
- 2026-01-19: Integration tests (46), HUD tests (108), NetworkClient tests (67), GameRoom tests (70)
- 2026-01-19: Weapon evolution, character classes, server leaderboard, accelerated XP
- 2026-01-17: Snake.io redesign, screen shake, knockback, random starting weapons, persistent high score

---

## COMPLETED TASKS

**All planned tasks complete:** 131/85 tasks (154%)

**Phase 1-6 Summary:**
- P1: Sprite/animation system, CRT shader, 32-color palette (11 tasks)
- P2: Audio system with procedural chiptune synthesis (8 tasks)
- P3: Player identity, leaderboard, minimap, rate limiting, logging (6 tasks)
- P4: Multiplayer mechanics - co-op XP, revival, team zones, combos, boss aggro, trading (6 tasks)
- P5: World events, hidden power-ups (47 tests) (2 tasks)
- P7: Testing infrastructure complete (1049 tests)
- P9: Retention systems - high scores, leaderboard, classes, evolution, accelerated XP (8 tasks)

**Recent Bug Fixes:**
- BUG-040: Movement speed 8→12, enemy speeds scaled 1.5x
- BUG-041: Batch spawning (2-3 enemies per cycle)
- BUG-042: Projectile speeds (Axe 8→14, Fireball 10→20, XP orbs 8→12)
- BUG-053: Bible weapon orbiting fixed (expanding_orb type handling)
- BUG-051: Projectile spawn position correction
- BUG-050: Player position during level up fixed
- BUG-049: Garlic/Wand visibility fixed (instanceColor buffer)
- BUG-048: World events rendering pipeline
- BUG-047: Nickname input blocking WASD
- BUG-046: Upgrade modal repositioned
- BUG-045: Level up visual effects
- BUG-039: Enemy spawn reset (combo fields)
- BUG-038: Weapon visual fallback system
- BUG-052: All weapon sprite animations (8/8 complete)
- BUG-035: XP orb sprite polish (Game Boy palette)

---

## TESTING INFRASTRUCTURE STATUS

All testing infrastructure complete (1049 tests).

---

## SPECIFICATION COMPLIANCE (Verified 2026-01-19)

All 9 specification documents verified complete and implemented:

| Spec | File | Status | Verification Notes |
|------|------|--------|-------------------|
| 01 | 01-project-setup.md | Complete | Monorepo structure, package.json configs |
| 02 | 02-shared-types.md | Complete | All types defined with enhancements (P3.1, P4.6, P5.1, P5.2, P9.3, P9.4) |
| 03 | 03-server-gameloop.md | Complete | 60Hz tick, all 6 systems, proper execution order |
| 04 | 04-server-state.md | Complete | Uses defineTypes() instead of @type() decorators (esbuild compatible) |
| 05 | 05-weapon-combat.md | Complete | Minor formula variances: knife 1+floor(level/2) vs spec 1+floor(level/3), wand piercing scales vs spec fixed at 1 |
| 06 | 06-spawning.md | Complete | Wave-based spawning, bosses, P9.5 wave compression |
| 07 | 07-client-renderer.md | Complete | Three.js with LOD, frustum culling, CRT shader |
| 08 | 08-client-networking.md | Complete | Colyseus client, reconnection, rate limiting, security |
| 09 | 09-ui-hud.md | Complete | Full HUD system with all enhancements |

---

## GAME DESIGN DIRECTION (Snake.io Style Redesign)

> **Core Philosophy:** Fast sessions, instant replayability, persistent progression hooks

### Session Model

| Aspect | Current | Target | Rationale |
|--------|---------|--------|-----------|
| Session Length | 20-30 min | **~5 minutes** | Snake.io pacing, quick iteration |
| Respawn | Slow restart | **Fast respawn** | Minimal friction |
| Competition | End-of-game score | **Live leaderboard** | Real-time competition |

### Retention Hooks (All Implemented)

| Hook | Description | Status |
|------|-------------|--------|
| **Persistent High Score** | Store personal best in localStorage | DONE (P9.1) |
| **All-Time Leaderboard** | Server-side top 100 with anti-cheat | DONE (P9.2) |
| **Character Classes** | 5 classes with preset weapons + stat multipliers | DONE (P9.3) |
| **Weapon Evolution** | 8 evolution paths with visual feedback | DONE (P9.4) |
| **Accelerated XP** | ~6x progression boost | DONE (P9.5) |
| **Random Start Weapons** | 2-3 weapons per run | DONE (P9.6) |

---
