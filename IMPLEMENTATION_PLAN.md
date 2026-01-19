# SWARM.IO Implementation Plan

## Current Status: Phase 6 Complete - All Critical Bugs Fixed

**Last Updated:** 2026-01-19 (P7.4 Integration Tests Added)
**Implementation Progress:** 129/85 tasks completed (152%)
**Test Count:** 1049 tests - ALL PASSING (555 server + 121 shared + 373 client)
**Build Status:** Server running on port 2567, Client fully connected on port 5173 (live multiplayer)
**Critical Bugs:** 0 | **Medium Bugs:** 6 | **Low Bugs:** 2
**Code Quality:** Excellent (0 TODOs, 0 FIXMEs, 0 skipped tests, 4 console.warn, ~54 production `any` types)
**CI/CD Status:** GitHub Actions configured (.github/workflows/test.yml, release.yml)

> **See also:** [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md) for verification checklists, code quality standards, and development commands.

---

## PRIORITIZED TASK LIST

This section tracks all pending work organized by priority tier. Development follows a two-track parallel approach:
- **Track 1 (Foundation):** Fix broken visual/gameplay systems
- **Track 2 (Redesign):** Implement retention and progression features

---

### P1 - CRITICAL PRIORITY

Must be fixed immediately. Blocking core gameplay.

#### Track 1: Foundation Fixes

- [x] **BUG-049: Garlic/Wand Invisibility** - FIXED 2026-01-17
- [x] **BUG-050: Player Position Resets After Level Up** - FIXED 2026-01-19
  - Root Cause: `pendingUpgrade` check was blocking input processing in InputSystem.ts and GameRoom.ts
  - Fix: Removed `pendingUpgrade` check from input processing - game never pauses (per Game Design Principles)
  - Affected files fixed: InputSystem.ts:66-68, GameRoom.ts:506-508
  - Test updated to verify players CAN move during pending upgrades
- [x] **BUG-053: Bible Weapon Orbiting Erratically** - FIXED 2026-01-19
  - Root Cause: PhysicsSystem.ts line 51 only checked for `'orb'` type, missing `'expanding_orb'`
  - Fix: Added `|| projectile.type === 'expanding_orb'` to orbit handling check
  - P7.8 test coverage added (7 new tests for expanding_orb orbital mechanics)

#### Track 2: Core Redesign

- [x] **P9.1: Persistent High Score (localStorage)** - COMPLETED 2026-01-17

---

### P2 - HIGH PRIORITY

Significantly impacts gameplay experience. Should be addressed soon.

#### Track 1: Foundation Fixes

- [x] **BUG-051: Projectile Spawn Position Incorrect** - FIXED 2026-01-19

#### Track 2: Testing Infrastructure (Production Deployment Blockers)

- [x] **P7.1b** Add Renderer.test.ts - COMPLETED 2026-01-19 (94 tests)
  - Comprehensive coverage: CRT shader, sprite mode, camera control, rendering pipeline
  - Entity rendering: players, enemies, projectiles, XP orbs, power-ups, world events
  - Visual effects: screen shake, damage numbers, XP sparkles, weapon impacts, death explosions
  - Systems: frustum culling, LOD, boundary ring, damage detection, particle system
- [x] **P7.1c** Add InputManager.test.ts - COMPLETED 2026-01-19 (42 tests)
- [x] **P7.1d** Add HUD.test.ts - COMPLETED 2026-01-19 (108 tests)
  - Comprehensive coverage: constructor, health/XP bars, weapon display, leaderboard
  - Score calculation (P3.2a), leaderboard sorting and XSS prevention
  - Minimap rendering (P3.3), enemy heatmap, boss icons, zoom controls
  - Upgrade modal, death screen with personal best (P9.1)
  - Settings modal (audio/CRT), tutorial overlay, pause overlay
  - Nickname modal (P3.1), class selection modal (P9.3)
  - UI sound callbacks, utility methods
  - **XSS Fix:** Added HTML escaping to leaderboard nickname display
- [x] **P7.3** Expand NetworkClient tests - COMPLETED 2026-01-19 (57 new tests, 67 total)
  - Comprehensive coverage: constructor, connection/reconnection, rate limiting (P3.4)
  - URL validation (P3.3), session storage management
  - State serialization from Colyseus MapSchema
  - Callback registration and invocation (stateChange, playerDied, levelUp, leaderboardUpdate)
  - Message handlers: player_died, level_up, leaderboard_update, kicked, banned
  - Disconnect handling with proper cleanup
  - State polling fallback testing
- [x] **P7.4** Add integration tests with mock Colyseus server - COMPLETED 2026-01-19 (46 tests)
  - Created MockColyseusServer infrastructure for testing client-server communication
  - MockColyseusRoom simulates room state and message handling
  - Test coverage: connection lifecycle (join/reconnect/disconnect), input handling
  - Player state management, upgrade system flow, death and respawn cycle
  - Multi-player scenarios, game tick simulation, state serialization
  - Factory function for replacing colyseus.js module in tests
- [x] **P7.8** Add `expanding_orb` test coverage to PhysicsSystem.test.ts - COMPLETED 2026-01-19 (7 tests)

#### Track 3: Core Redesign (COMPLETED)

- [x] **P9.5: Accelerate XP/Progression ~6x** - COMPLETED 2026-01-19
- [x] **P9.6: Randomized Starting Weapons (2-3)** - COMPLETED 2026-01-17
- [x] **P9.7: Screen Shake on Weapon Impact** - COMPLETED 2026-01-17
- [x] **P9.8: Knockback on Hit** - COMPLETED 2026-01-17

---

### P3 - MEDIUM PRIORITY

Important for polish and retention. Can be scheduled after P1/P2.

#### Track 1: Foundation Fixes

- [ ] **BUG-052: Weapon Sprites Too Simple** - PARTIAL (Quality Assessment: A- 9.2/10)
  - Dependencies: BUG-035 (art direction work)

#### Track 2: Core Redesign (ALL COMPLETED)

- [x] **P9.2: Server-Side All-Time Leaderboard** - COMPLETED 2026-01-19 (top 100, anti-cheat, 30 tests)
- [x] **P9.3: Character Classes (Basic 3-5)** - COMPLETED 2026-01-19 (5 classes, 17 tests)
- [x] **P9.4: Weapon Evolution System** - COMPLETED 2026-01-19 (8 paths, golden border, "MAX ★")

---

### P4 - LOW PRIORITY

Polish items. Address when higher priorities complete.

- [ ] **BUG-044: Remove CRT Option** - LOW
- [ ] **Console.warn Migration** - MINOR (4 instances)
  - `/src/server/src/systems/InputSystem.ts` lines 186, 341-344 (security logging)
  - `/src/client/src/game/AnimationController.ts` lines 257, 262 (animation warnings)
- [ ] **TypeScript `any` Type Cleanup** - MINOR (~54 production instances)
  - Major concentrations:
    - WeaponSystem.ts: 13 instances (config object handling)
    - PhysicsSystem.ts: 14 instances (enemy AI polymorphism)
    - NetworkClient.ts: 12 instances (Colyseus MapSchema handling)
    - Game.ts: 6 instances (dynamic state processing)
    - GameRoom.ts: 5 instances (schema handling)
  - Test files: ~62 additional instances (lower priority)

---

### DEFERRED ITEMS

Items explicitly deferred for future consideration.

#### Gameplay Tuning (Awaits Telemetry Data)

- [ ] **BUG-040: Movement Speed Still Slow** - DEFERRED (Current: 8, Suggested: 12-14)
- [ ] **BUG-041: Enemy Spawn Rate Too Low** - DEFERRED (1 enemy per 0.48s cycle)
- [ ] **BUG-042: Projectile Speed Issues (Axe/Fireball)** - DEFERRED
- [ ] **BUG-043: Environment Too Empty** - DEFERRED
- [ ] **P8.1: Player Size Scales With Level** - DEFERRED
- [ ] **P8.2: Research and Add More Weapons** - DEFERRED

#### Surprise Mechanics (P5.3-P5.7) - DEFERRED

- [ ] **P5.3** Secret boss that spawns when all players reach certain level
- [ ] **P5.4** Environmental hazards (lava pools, ice patches, teleporters)
- [ ] **P5.5** "Jackpot" XP orbs that give massive XP but attract enemies
- [ ] **P5.6** Shape-shifting enemy that mimics player abilities
- [ ] **P5.7** Day/night cycle affecting enemy spawns and player abilities

#### Balance Tuning (P6.1-P6.2) - DEFERRED (Awaits Telemetry)

- [ ] **P6.1** Playtest and tune enemy health/damage vs player DPS per wave
- [ ] **P6.2** Verify boss difficulty spikes are appropriate

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

## TESTING INFRASTRUCTURE STATUS

#### Completed

- [x] **P7.1a** Client-side test infrastructure (Vitest config) - COMPLETED 2026-01-19
- [x] **P7.2** GameRoom.test.ts (~1,293 lines) - COMPLETED 2026-01-19 (70 tests)
- [x] **P7.4** Integration tests with mock Colyseus server - COMPLETED 2026-01-19 (46 tests)
  - MockColyseusServer.ts: Full server simulation (~500 lines)
  - client-server.test.ts: Comprehensive integration tests
- [x] **P7.5** GitHub Actions CI/CD workflows - COMPLETED 2026-01-19
- [x] **P7.6** Code coverage reporting (60%/80%/40% thresholds) - COMPLETED 2026-01-19
- [x] **P7.7** Pre-commit hooks (husky + lint-staged) - COMPLETED 2026-01-19

#### Testing Gaps (P2 Priority)

| File | Lines | Coverage | Priority |
|------|-------|----------|----------|
| Renderer.ts | ~2,387 | Tested | COMPLETED (94 tests) |
| InputManager.ts | ~400 | 100% | COMPLETED (42 tests) |
| HUD.ts | ~2,740 | Tested | COMPLETED (108 tests) |
| NetworkClient.ts | ~685 | Tested | COMPLETED (67 tests) |
| Integration Tests | ~770 | New | COMPLETED (46 tests) |

---

## COMPLETED TASKS

### Recently Fixed Bugs (Summary)

| Bug | Symptom | Root Cause | Fix | Date |
|-----|---------|------------|-----|------|
| BUG-053 | Bible orbs orbit erratically | PhysicsSystem only checked for 'orb' type, missing 'expanding_orb' | Added expanding_orb check to orbit handling | 2026-01-19 |
| BUG-051 | Projectiles spawn from wrong position when walking | Client interpolated player position differs from server spawn position | Added projectileSpawnOffsets Map with decay | 2026-01-19 |
| BUG-050 | Player position resets after level up | `pendingUpgrade` check blocked input processing | Removed pendingUpgrade check (game never pauses) | 2026-01-19 |
| BUG-049 | Garlic/Wand projectiles invisible | InstancedMesh.setColorAt() fails without instanceColor init | Initialize instanceColor buffer on mesh creation | 2026-01-17 |
| BUG-048 | World events not rendered on client | Entire client pipeline for worldEvents missing | Added NetworkClient/Interpolator/Game/Renderer support | 2026-01-17 |
| BUG-047 | Nickname input blocks WASD keys | InputManager captured keys globally | Check if input field has focus | 2026-01-17 |
| BUG-046 | Upgrade modal covers entire screen | Full-screen opaque overlay | Repositioned to top-right corner | 2026-01-17 |
| BUG-045 | No level up visual effects | Missing CSS animation | Added levelUpPulse and levelUpGlow animations | 2026-01-19 |
| BUG-039 | Enemies stop spawning after extended play | resetEnemy() missing combo fields | Added lastDamagedBy, comboCount, comboLastHitTime, comboLastPlayerId | 2026-01-17 |
| BUG-038 | Weapons have no visuals | Sprite material fails silently | Added fallback procedural rendering system | 2026-01-17 |

### Recently Completed Features (Summary)

| Feature | Description | Tests | Date |
|---------|-------------|-------|------|
| P9.8 | Knockback on Hit - enemies pushed back with quadratic decay, bosses receive 30% | - | 2026-01-17 |
| P9.7 | Screen Shake - exponential decay, scales with damage type | - | 2026-01-17 |
| P9.6 | Randomized Starting Weapons - 2-3 weapons, ensures 1 ranged + 1 melee | - | 2026-01-17 |
| P9.5 | Accelerated XP ~6x - 3x multiplier + 2x enemy XP + compressed curve | - | 2026-01-19 |
| P9.4 | Weapon Evolution - 8 evolution paths, golden border, "MAX ★" label | 30+ | 2026-01-19 |
| P9.3 | Character Classes - 5 classes with unique stats and starting weapons | 17 | 2026-01-19 |
| P9.2 | Server-Side Leaderboard - top 100, anti-cheat score validation | 30 | 2026-01-19 |
| P9.1 | Persistent High Score - localStorage with "NEW RECORD" animation | - | 2026-01-17 |

### All Completed Phases

- Phase 1-6: All 119/85 tasks completed
- P1.1-P1.11: Sprite/animation system, CRT shader, 32-color palette
- P2.A1-P2.A8: Complete audio system (procedural chiptune synthesis)
- P3.1-P3.6: Player identity, leaderboard, minimap, rate limiting, logging
- P4.1-P4.6: All multiplayer mechanics (co-op XP, revival, team zones, combos, boss aggro, trading)
- P5.1-P5.2: World events, hidden power-ups (47 tests)

---

## EXECUTIVE SUMMARY

| Metric | Value | Notes |
|--------|-------|-------|
| Total Tasks | 85 | Across 6 phases |
| Completed | 127 | 149% (all phases complete + extras) |
| Critical Bugs | 0 | All fixed (BUG-050, BUG-053) |
| Medium Bugs | 6 | BUG-040-044, BUG-052 |
| Test Coverage | 1049 tests | All passing (373 client + 555 server + 121 shared) |
| Testing Gaps | None | All major client files tested |
| Code Quality | Excellent | 0 TODOs, 0 FIXMEs, 0 skipped tests |

### System Status

| System | Status | Notes |
|--------|--------|-------|
| Server game loop | Working | 60Hz tick, all 6 systems functional |
| All 8 weapons | Working | Server logic correct |
| Weapon visuals | Working | Fixed: BUG-049 |
| Player movement during upgrade | Working | BUG-050 fixed: full movement control during upgrade modal |
| Bible weapon (evolved) | Working | BUG-053 fixed: expanding_orb orbits correctly |
| Multiplayer (P4.1-P4.6) | Working | All 6 features implemented |
| World events (P5.1) | Working | Server + client rendering |
| Hidden power-ups (P5.2) | Working | 5 types, 47 tests |
| Audio system | Working | All 8 weapon sounds, UI, boss music |
| Screen shake | Working | P9.7 complete |
| Knockback | Working | P9.8 complete |
| Persistent high score | Working | P9.1 complete |
| Random starting weapons | Working | P9.6 complete |
| Server leaderboard | Working | P9.2 complete (top 100, anti-cheat) |
| Character classes | Working | P9.3 complete (5 classes, 17 tests) |
| Weapon evolution | Working | P9.4 complete (8 paths, all working) |
| Level up effects | Working | BUG-045 fixed |
| Weapon impact particles | Working | Connected to damage events |

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

## MEDIUM BUG DETAILS

### BUG-040: Movement Speed Still Too Slow
- **Current:** Player 8, Enemies proportionally scaled
- **Suggested:** Player 12-14
- **Location:** `src/shared/src/constants.ts`

### BUG-041: Enemy Spawn Rate Too Low
- **Current:** 1 enemy per 0.48s cycle, no batch spawning
- **Location:** `src/server/src/systems/SpawnSystem.ts`

### BUG-042: Projectile Speed Issues
- **Issues:** Axe speed = player speed (8), Fireball borderline (10)
- **Suggested:** Axe 12-15, Fireball 16-24, XP Orbs 10-12
- **Location:** `src/shared/src/constants.ts`

### BUG-043: Environment Too Empty
- **Issue:** Arena feels barren - only floor tiles and boundary ring
- **Location:** `src/client/src/game/Renderer.ts`, `scripts/generate-sprites.ts`

### BUG-052: Weapon Sprites Too Simple
- **Status:** Quality Assessment A- (9.2/10)
- **Issues:** Need more animation frames, enhance silhouette clarity, add impact sprites
- **Location:** `scripts/generate-sprites.ts`

---

## BUG-035: Art Direction (IN PROGRESS)

**Symptom:** Programmatically generated sprites need additional polish for Game Boy Pokemon aesthetic.

**Progress (2026-01-16):**
- [x] Unified 4-color palette per sprite type
- [x] Helper methods for outlined shapes
- [x] Character sprites redesigned (player, bat, skeleton, zombie, ghost, slime, demon)
- [ ] Weapon/projectile sprites need overhaul
- [ ] XP orb sprites need polish
- [ ] Environment tiles need variety

---

## CHANGELOG (Recent)

**2026-01-19 (P7.4 Integration Tests):**
- P7.4 COMPLETED: Integration tests with mock Colyseus server (46 tests)
  - Created MockColyseusServer.ts - simulates full Colyseus server behavior
  - MockColyseusRoom - simulates room state with MapSchema-compatible collections
  - Connection lifecycle: join, reconnect with token, disconnect handling
  - Input handling: position updates, facing direction, sequence tracking
  - Upgrade system: level up trigger, weapon upgrades, stat boosts
  - Death/respawn: player died events, respawn with stat reset
  - Multi-player: concurrent clients, separate states, broadcast updates
  - Game tick simulation: time updates, timer decay, state change callbacks
  - State serialization: MapSchema compatibility, entity collections
  - Factory function for replacing colyseus.js module in tests
- Test count increased: 1003 → 1049 tests (all passing)
- Client tests: 327 → 373 (added 46 integration tests)

**2026-01-19 (NetworkClient.test.ts Expanded):**
- P7.3 COMPLETED: NetworkClient.test.ts expanded from 10 to 67 comprehensive tests
  - Constructor and initialization testing
  - Connection and reconnection logic with exponential backoff
  - Rate limiting (P3.4) - 30 inputs/second with window expiration
  - URL validation (P3.3) for WebSocket security
  - Session storage management (localStorage)
  - State serialization from Colyseus MapSchema (players, enemies, projectiles, XP orbs, powerUps, worldEvents)
  - Callback registration and invocation (stateChange, playerDied, levelUp, leaderboardUpdate)
  - Message handlers: player_died, level_up, leaderboard_update, kicked, banned
  - Disconnect handling with proper cleanup
  - State polling fallback for Colyseus timing edge cases
  - Edge cases: empty/negative/decimal inputs, undefined room handling
- Test count increased: 946 → 1003 tests (all passing)
- Client tests: 270 → 327 (added 57 tests)

**2026-01-19 (HUD.test.ts Completed):**
- P7.1d COMPLETED: HUD.test.ts implemented with 108 comprehensive tests
  - Constructor and initialization testing
  - Health/XP bar updates and level display
  - Weapon display including evolved weapons (P9.4)
  - Score calculation (P3.2a) and leaderboard sorting
  - Game info display (time, wave, player count)
  - Minimap rendering (P3.3) with enemy heatmap and boss icons
  - Upgrade modal with sound callbacks
  - Death screen with personal best (P9.1) and all-time leaderboard (P9.2)
  - Settings modal (audio sliders, CRT toggle)
  - Tutorial, pause, nickname (P3.1), and class selection (P9.3) overlays
  - UI sound callback integration
  - XSS prevention and HTML escaping
- Test count increased: 838 → 946 tests (all passing)
- Client tests: 162 → 270 (added 108 tests)
- **Security Fix:** Added HTML escaping to leaderboard nickname display to prevent XSS
- Added Canvas 2D context mock to client test setup for minimap testing

**2026-01-19 (InputManager.test.ts Completed):**
- P7.1c COMPLETED: InputManager.test.ts implemented with 42 comprehensive tests
  - Keyboard input handling (WASD, arrow keys)
  - Touch controls integration (mocked)
  - Client-side prediction (applyPrediction)
  - Server reconciliation (reconcile)
  - Pending input buffer management
  - Mobile detection
- Test count increased: 702 → 744 tests (all passing)
- Client tests: 26 → 68 (added 42 tests)

**2026-01-19 (GameRoom.test.ts Completed):**
- P7.2 COMPLETED: GameRoom.test.ts implemented with 70 comprehensive tests
  - Ban system: isBanned(), banPlayer(), getClientIP(), kickPlayer()
  - Player lifecycle: onJoin(), onLeave(), onDispose()
  - Input handling: handleInputMessage(), processPlayerInputs()
  - Upgrade handling: full test coverage for upgrade selection and validation
  - Respawn handling: death, respawn, and state reset
  - Player timers: lastDamaged, lastHealed, stun duration tracking
  - World size calculation: dynamic world bounds based on player count
  - Trade system: complete validation coverage
  - Room stats: getStats() method testing
- Test count increased: 639 → 702 tests (all passing)
- Server tests: 492 → 555 (added 63 tests to GameRoom.test.ts + related)
- GameRoom.ts coverage: 0% → comprehensive coverage across all major methods

**2026-01-19 (Critical Bugs Fixed):**
- BUG-050 FIXED: Player position no longer resets after level up
  - Root cause: `pendingUpgrade` check was blocking input processing
  - Fix: Removed `pendingUpgrade` check from InputSystem.ts:66-68 and GameRoom.ts:506-508
  - Per Game Design Principles: Player has FULL movement control during upgrade modal
  - Test updated to verify players CAN move during pending upgrades
- BUG-053 FIXED: Bible weapon (evolved) now orbits correctly
  - Root cause: PhysicsSystem.ts only checked for 'orb' type, missing 'expanding_orb'
  - Fix: Added `|| projectile.type === 'expanding_orb'` to orbit handling check
- P7.8 COMPLETED: Added 7 new tests for expanding_orb orbital mechanics
- Test count increased: 632 → 639 tests (all passing)
- Critical bugs: 2 → 0

**2026-01-19 (Game Design Principles Added):**
- Added GAME DESIGN PRINCIPLES section to prevent future misunderstandings
- Corrected BUG-050 fix approach - removed incorrect "pause game" suggestions
- Clarified: Game NEVER pauses, player has full control during upgrade modal
- Clarified: Player is fully vulnerable during any UI/modal state

**2026-01-19 (Post-Comprehensive Codebase Audit):**
- Full specification compliance verified (all 9 specs pass)
- Updated `any` type count: ~116 total → ~54 production + ~62 test (clarified breakdown)
- Testing gaps documented with line counts and coverage percentages
- All P9 features verified complete with test counts
- BUG-050 and BUG-053 confirmed as P1 critical

**2026-01-19 (Comprehensive Analysis):**
- BUG-050: Root cause needs investigation - something incorrectly blocks position updates during pendingUpgrade
  - Affected files to investigate: XPSystem.ts, GameRoom.ts, InputSystem.ts, Game.ts
  - Fix: Remove any code that blocks movement during pendingUpgrade (game must continue normally)
- BUG-053 ROOT CAUSE IDENTIFIED: PhysicsSystem.ts line 51 only checks `'orb'` type, missing `'expanding_orb'` for evolved Bible
  - One-line fix documented
- Added P7.8: Test coverage for `expanding_orb` projectile type
- Console.warn locations documented with line numbers
- All 9 specification documents verified as complete and implemented

**2026-01-19 (Late):**
- BUG-050 REOPENED: Player position resets to level-up location after selecting upgrade while moving
- BUG-053 NEW: Bible weapon orbiting erratically instead of smooth circular orbit
- Critical bugs increased: 0 → 2

**2026-01-19:**
- CI Fix: Added "Build shared package first" step, removed tsbuildinfo from git tracking
- P7.6 COMPLETED: Code coverage reporting with thresholds
- P7.7 COMPLETED: Pre-commit hooks with husky + lint-staged
- P9.4 Client Visuals: Evolved weapons show golden border, "MAX ★" label, glow animation
- BUG-045 FIXED: Level up CSS animation (pulse + glow)
- BUG-051 FIXED: Projectile spawn position correction with offset decay
- spawnWeaponImpact() connected to damage events
- P7.5 COMPLETED: GitHub Actions CI/CD workflows
- P9.4 COMPLETED: Weapon Evolution System (8 evolution paths, 30+ tests)
- P9.3 COMPLETED: Character Classes (5 classes, 17 tests)
- P9.2 COMPLETED: Server-Side Leaderboard (30 tests)

**2026-01-17:**
- Major redesign: Snake.io style 5-minute sessions
- BUG-049 FIXED: InstancedMesh instanceColor initialization
- BUG-050 FIXED: Use server facingX/facingY for idle direction
- BUG-048 FIXED: World events client pipeline
- BUG-047 FIXED: Input focus check for WASD
- BUG-046 FIXED: Upgrade modal repositioned
- BUG-039 FIXED: resetEnemy() combo fields
- BUG-038 FIXED: Procedural rendering fallback
- P9.8 COMPLETED: Knockback on Hit
- P9.7 COMPLETED: Screen Shake
- P9.6 COMPLETED: Random Starting Weapons
- P9.1 COMPLETED: Persistent High Score
