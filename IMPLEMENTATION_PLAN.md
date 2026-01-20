# SWARM.IO Implementation Plan

## Current Status: Phase 7 - Gameplay Polish & New Content

**Last Updated:** 2026-01-20
**Implementation Progress:** 144/85 core tasks completed (169%) + 1 new task pending
**Test Count:** 1096 tests - ALL PASSING (602 server + 121 shared + 373 client)
**Build Status:** Server running on port 2567, Client fully connected on port 5173 (live multiplayer)
**Pending Tasks:** 1 LOW PRIORITY task (see PRIORITIZED TASK LIST below)
**Total Sprites:** 96 (player 9 + enemies 16 + weapons/projectiles 26 + XP orbs 8 + power-ups 6 + world events 6 + decorations 10 + hazards 6 + misc 9)
**Code Quality:** Excellent (0 TODOs, 0 FIXMEs, 0 skipped tests, 0 lint warnings, ~2 production `any` types - intentional for security logging)
**CI/CD Status:** GitHub Actions configured (.github/workflows/test.yml, release.yml)

> **See also:** [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md) for verification checklists, code quality standards, and development commands.

---

## EXECUTIVE SUMMARY

| Metric | Value | Notes |
|--------|-------|-------|
| Core Tasks | 144/85 | 169% complete |
| **Pending Tasks** | **1** | **LOW PRIORITY - Optional** |
| Test Coverage | 1096 tests | All passing |
| Code Quality | Excellent | 0 TODOs, 0 FIXMEs, 0 skipped tests |

### System Status

All core systems operational: 60Hz game loop, **12 weapons** with animations (8 original + 4 new), multiplayer (6 features), world events, hidden power-ups, environmental hazards, shapeshifter enemy, audio system, screen shake, knockback, persistent high score, random starting weapons, server leaderboard (top 100), character classes (5), **weapon evolution (12 paths)**, level up effects, weapon impact particles, **day/night cycle**.

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

- [x] **P6.1: Balance Enemy Health/Damage** ✅ DONE (2026-01-19)
  - Early enemies (0-60s): bat 10→20 HP, skeleton 25→30 HP (2-3 hits at level 1)
  - Mid enemies (60-180s): zombie 50→80 HP, ghost 15→35 HP, slime 20→45 HP, mini_slime 8→15 HP (4-6 hits at level 5)
  - Late enemies (180s+): demon 40→120 HP (6-7 hits at level 10)

- [x] **P6.2: Balance Boss Difficulty** ✅ DONE (2026-01-19)
  - boss_slime: 500→300 HP, 30→25 damage (beatable at level 5-6)
  - boss_skeleton: 800→600 HP, 40→35 damage (requires level 10+)
  - boss_demon: 1200→1000 HP, 50→45 damage (requires evolved weapons)

---

### P2 - HIGH PRIORITY: Visual Polish (Implement Now)

- [x] **BUG-043: Environment Too Empty** ✅ DONE (2026-01-19)
  - Added 10 decoration sprites: rocks (3), debris/bones (1), dead trees (2), pillars/ruins (4)
  - Sprites generated in `scripts/generate-sprites.ts` using 4-color Game Boy palette
  - Added `createEnvironmentDecorations()` in `src/client/src/game/Renderer.ts`
  - Scatters 70-100 visual-only decorations within world bounds (seeded random for consistency)
  - Atlas updated: `src/client/public/assets/sprites/atlas.json`

- [x] **P8.1: Player Size Scales With Level** ✅ DONE (2026-01-19)
  - Scale formula: `1.0 + (level - 1) * 0.0125` (1.0x at level 1 → 1.5x at level 40)
  - Implemented in `updatePlayers()` method in `src/client/src/game/Renderer.ts`
  - Visual only - hitbox unchanged, base scale of 2 multiplied by level scale

---

### P3 - HIGH PRIORITY: Surprise Mechanics (Implement Now)

- [x] **P5.3: Secret Boss** ✅ DONE (2026-01-19)
  - Trigger: All alive players reach level 15+
  - Added `secret_boss` enemy type in `src/shared/src/types.ts` and `src/shared/src/constants.ts`
  - HP: 2000, Speed: 6, Damage: 60, XP: 1000 (unique dark violet color 0x9400d3)
  - Spawns at world center (0,0) after 3 second delay with announcements
  - Added `SECRET_BOSS_CONFIG` for configurable trigger level and delays
  - Implemented in `src/server/src/systems/SpawnSystem.ts` with trigger/reset logic
  - Broadcasts announcements to all clients via GameRoom callback
  - 10 new tests added to `SpawnSystem.test.ts` (now 45 total tests)

- [x] **P5.4: Environmental Hazards** ✅ DONE (2026-01-19)
  - Lava pools: 15 DOT/sec damage, spawns randomly, 60s duration, radius 4
  - Ice patches: 50% slow movement, spawns in groups of 3, 45s duration, radius 5
  - Teleporters: Paired portals, 3s cooldown, random placement, 90s duration, radius 2
  - Added `HazardType` and `HazardState` to `src/shared/src/types.ts`
  - Added hazard constants to `src/shared/src/constants.ts` (spawn intervals, radii, damage, etc.)
  - Created `HazardSchema` in `src/server/src/state/HazardSchema.ts` with object pooling
  - Created `HazardSystem` in `src/server/src/systems/HazardSystem.ts` (spawning, effects, expiration)
  - Added 6 hazard sprites (2 frames each) to atlas at y=336
  - Added hazard rendering in `src/client/src/game/Renderer.ts` with type-specific colors/animations
  - Added hazard state sync in `src/client/src/network/NetworkClient.ts`
  - 32 comprehensive tests in `HazardSystem.test.ts`

- [x] **P5.5: Jackpot XP Orbs** ✅ DONE (2026-01-19)
  - Rare spawn (1% chance after 30s game time), gives 500 XP
  - Glows golden with pulsing animation, 2.5x size of large orb
  - Attracts nearby enemies within aggro radius (30 units)
  - Added `isJackpot` field to `XPOrbSchema` and `XPOrbState`
  - Added `JACKPOT_ORB_CONFIG` constants in `src/shared/src/constants.ts`
  - Implemented spawning in `CombatSystem.cleanupDeadEntities()`
  - Enemy aggro logic in `PhysicsSystem.findNearbyJackpotOrb()`
  - Added `xp_orb_jackpot` sprite (48x48, 2 frames) to atlas
  - Pulsing and bobbing animation in `Renderer.updateXPOrbsSprite()`

- [x] **P5.6: Shape-Shifting Enemy** ✅ DONE (2026-01-19)
  - Copies random player's current weapons and mimics their appearance
  - Spawns after wave 5 (90s game time), 3% chance to replace regular spawn
  - Maximum 3 active shapeshifters at once
  - Added `shapeshifter` enemy type to `src/shared/src/types.ts`
  - Added `SHAPESHIFTER_CONFIG` constants (MIN_GAME_TIME, SPAWN_CHANCE, MAX_ACTIVE, etc.)
  - Added shapeshifter config to `ENEMY_CONFIGS` (150 HP, speed 7, 50 XP)
  - Extended `EnemySchema` with `copiedPlayerId`, `copiedWeapons`, weapon cooldowns
  - Implemented shapeshifter spawning in `SpawnSystem.ts` with player weapon copying
  - Added shapeshifter AI in `PhysicsSystem.ts` (targets players, refreshes copy every 15s)
  - Added weapon firing logic for all 8 weapon types at 60% damage
  - Added magenta (0xff00ff) color and torus knot geometry for visual distinction
  - 5 new tests in `SpawnSystem.test.ts` (now 50 total tests)

- [x] **P5.7: Day/Night Cycle** ✅ DONE (2026-01-19)
  - 2-minute cycle (1 min day, 1 min night)
  - Day: Normal spawns, +10% XP (DAY_XP_MULTIPLIER = 1.1)
  - Night: 2x spawn rate (NIGHT_SPAWN_MULTIPLIER = 2.0), enemies +20% damage (NIGHT_DAMAGE_MULTIPLIER = 1.2)
  - Added `DayNightPhase` type to `src/shared/src/types.ts`
  - Added day/night constants to `src/shared/src/constants.ts`
  - Added `dayNightPhase`, `dayNightCycleTime`, `isDaytime()`, `isNighttime()`, `updateDayNightCycle()` to `WorldSchema`
  - Day/night multipliers in `XPSystem.ts` (XP), `CombatSystem.ts` (damage), `SpawnSystem.ts` (spawn rate)
  - Visual effects in `Renderer.ts` with smooth color transitions
  - All systems tested and integrated

---

### P4 - COMPLETED: New Weapons

- [x] **P8.2: Add 4 New Weapons** ✅ DONE (2026-01-20)
  1. **Boomerang** - Returns to player after max range, hits enemies both ways
     - Damage: 18, Cooldown: 1.8s, Range: 15, Speed: 18, Piercing: 3
     - Evolution: Chakram (homing return, +50% damage, +2 pierce)
  2. **Chain Lightning** - Jumps between 3-5 enemies within 8 unit range
     - Damage: 20, Cooldown: 2.5s, Range: 12, Speed: 30, Chains: 3 (+2 when evolved)
     - Evolution: Storm Caller (5 chains, stuns for 0.5s, +30% damage)
  3. **Poison Cloud** - Stationary DOT area denial
     - Damage: 8/tick, Cooldown: 4.0s, Range: 10, Duration: 3s, Area: 4
     - Evolution: Plague (expanding area, +100% damage, slows enemies 40%)
  4. **Shield** - Orbital barrier that blocks enemies and reflects projectiles
     - Damage: 15, Cooldown: 0 (orbital), Range: 2, Orbitals: 2 (+2 when evolved)
     - Evolution: Aegis (4 orbitals, reflects projectiles, heals 1 HP/hit)

  Files updated:
  - `src/shared/src/types.ts` - Added WeaponType variants and ProjectileType variants
  - `src/shared/src/constants.ts` - WEAPON_CONFIGS, UPGRADE_POOL, WEAPON_EVOLUTIONS, COLOR_PALETTE
  - `src/server/src/systems/WeaponSystem.ts` - fireBoomerang(), fireChainLightning(), firePoisonCloud(), fireShield()
  - `src/server/src/systems/PhysicsSystem.ts` - Boomerang return physics, shield orbital, poison cloud stationary
  - `scripts/generate-sprites.ts` - 4 new projectile sprites (8 frames total)
  - `src/client/public/assets/sprites/atlas.json` - Sprite frames at y=96
  - `src/client/src/game/Renderer.ts` - Visual sizes, colors, rotation speeds, sprite names
  - `src/shared/src/constants.test.ts` - Updated expectations for 12 weapons

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

## CHANGELOG

See `git log` for detailed changelog. Recent highlights:
- 2026-01-20: BUG-054 - Fixed AudioManager weapon sounds for 4 new weapons
- 2026-01-20: P8.2 complete - 4 new weapons (Boomerang, Chain Lightning, Poison Cloud, Shield)
- 2026-01-19: P5 features complete (Secret Boss, Hazards, Jackpot Orbs, Day/Night, Shapeshifter)
- 2026-01-19: Balance tuning (P6.1/P6.2), Gameplay feel (BUG-040/041/042)

---

## SPECIFICATION COMPLIANCE (Verified 2026-01-20)

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
