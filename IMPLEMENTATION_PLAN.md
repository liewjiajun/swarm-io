# SWARM.IO Implementation Plan

## Current Status: Phase 6 Complete - Critical Bugs Resolved

**Last Updated:** 2026-01-13
**Implementation Progress:** 101/85 tasks completed (118.8%)
**Test Count:** 209 tests (136 server + 73 shared)
**Build Status:** Server running on port 2567, Client fully connected on port 5173 (live multiplayer)
**Next Priority:** Medium bug fixes (BUG-006, BUG-007, BUG-009, BUG-010, BUG-011) and test coverage

---

## EXECUTIVE SUMMARY

| Metric | Value | Notes |
|--------|-------|-------|
| Total Tasks | 85 | Across 6 phases |
| Completed | 101 | 118.8% (all phases complete) |
| Critical Bugs | 0 | All critical bugs resolved |
| Medium Bugs | 5 | Balance/behavior issues |
| Test Gaps | 6 systems | Core gameplay systems need tests |
| Code Quality | 4 issues | Type safety and constant cleanup |

---

## PRIORITY 1: MEDIUM BUGS (Balance/Behavior)

### BUG-006: Lightning Bypasses CombatSystem Validation

**Location:** `src/server/src/systems/WeaponSystem.ts:327`
**Severity:** MEDIUM - Bypasses armor, damage caps
**Impact:** Lightning damage is unvalidated, potential exploits

**Problem:**
```typescript
// Direct damage bypass all validation
entity.entity.health -= damage;
```

**Fix:**
```typescript
// Use CombatSystem for proper damage application
// Option 1: Pass combatSystem reference to WeaponSystem
this.combatSystem.applyDamageToEnemy(entity.entity, damage, player.id);

// Option 2: Create enemy damage event for CombatSystem to process
```

---

### BUG-007: ObjectPool State Leak

**Location:** `src/server/src/systems/ObjectPool.ts:133-153`
**Severity:** MEDIUM - Reused enemies may have stale state
**Impact:** Boss mechanics may persist on regular enemies

**Problem:**
```typescript
// resetEnemy() missing fields
private resetEnemy(e: EnemySchema): void {
  // Missing:
  // e.attackCooldown = 0;
  // e.abilityCooldown = 0;
  // e.isCharging = false;
  // e.chargeTargetX = 0;
  // e.chargeTargetY = 0;
}
```

**Fix:**
```typescript
private resetEnemy(e: EnemySchema): void {
  e.id = '';
  e.type = '';
  e.x = 0;
  e.y = 0;
  e.health = 0;
  e.maxHealth = 0;
  e.velocityX = 0;
  e.velocityY = 0;
  e.targetPlayerId = '';
  // Add missing fields:
  e.attackCooldown = 0;
  e.abilityCooldown = 0;
  e.isCharging = false;
  e.chargeTargetX = 0;
  e.chargeTargetY = 0;
}
```

---

### BUG-009: Explosion Radius 33x Too Large

**Location:** `src/server/src/systems/CombatSystem.ts:283,292`
**Severity:** MEDIUM - Fireball explosions are massive
**Impact:** Fireball AOE damage covers huge area

**Problem:**
```typescript
// Lines 283 and 292 - Hardcoded 100 instead of config value
radius: 100,  // Should be ~3 per fireball config.area
if (distance <= 100) {  // Should match radius
```

**Fix:**
```typescript
const explosionRadius = WEAPON_CONFIGS.fireball.area || 3;
// Line 283
radius: explosionRadius,
// Line 292
if (distance <= explosionRadius) {
```

---

### BUG-010: Fixed Hostility Increase (Not Damage-Based)

**Location:** `src/server/src/systems/CombatSystem.ts:192`
**Severity:** LOW - Minor balance issue
**Impact:** All PvP attacks increase hostility equally

**Problem:**
```typescript
// Fixed +10 regardless of damage
sourcePlayer.hostility = Math.min(sourcePlayer.hostility + 10, 100);
```

**Fix:**
```typescript
// Proportional to damage dealt
sourcePlayer.hostility = Math.min(sourcePlayer.hostility + validatedDamage * 0.1, 100);
```

---

### BUG-011: Client Input Rate Inefficiency

**Location:** `src/client/src/game/Game.ts:358`
**Severity:** LOW - Performance waste
**Impact:** 50% of created inputs are dropped by rate limiter

**Problem:**
- Game loop runs at 60 FPS
- Sends input every frame with movement (60Hz)
- NetworkClient rate limits to 30Hz
- Half the inputs are created then immediately dropped

**Fix:**
```typescript
// Add input send throttle
private lastInputSendTime = 0;
private readonly INPUT_SEND_INTERVAL = 1000 / 30; // 30Hz

// In update loop
if (performance.now() - this.lastInputSendTime >= this.INPUT_SEND_INTERVAL) {
  this.network.sendInput(input);
  this.lastInputSendTime = performance.now();
}
```

---

## PRIORITY 2: TEST GAPS

| System | File | Current Tests | Priority | Description |
|--------|------|---------------|----------|-------------|
| CombatSystem | `CombatSystem.test.ts` | 0 | HIGH | Projectile collisions, damage validation, death handling |
| WeaponSystem | `WeaponSystem.test.ts` | 0 | HIGH | All 8 weapon firing, cooldowns, targeting |
| SpawnSystem | `SpawnSystem.test.ts` | 0 | HIGH | Wave progression, boss spawning, difficulty scaling |
| XPSystem | `XPSystem.test.ts` | 0 | HIGH | Orb collection, level-up, upgrade generation |
| PhysicsSystem | `PhysicsSystem.test.ts` | 0 | MEDIUM | Enemy AI, projectile movement, boundaries |
| NetworkClient | `NetworkClient.test.ts` | 0 | MEDIUM | Client-server sync, reconnection |

**Existing Tests (209 total):**
- `src/shared/src/utils.test.ts` - Vector math, distance, interpolation
- `src/shared/src/constants.test.ts` - Config validation
- `src/server/src/systems/SpatialHash.test.ts` - Spatial queries
- `src/server/src/systems/ObjectPool.test.ts` - Pool acquire/release
- `src/server/src/systems/InputSystem.test.ts` - Input validation, rate limiting
- `src/server/src/state/PlayerSchema.test.ts` - Player state management
- `src/server/src/state/GameState.test.ts` - Entity CRUD operations

---

## PRIORITY 3: CODE QUALITY

### QUALITY-001: Duplicate Constants Pattern

**Location:** `src/shared/src/constants.ts:7-51`
**Issue:** Both nested (`GAME_CONSTANTS.PLAYER.START_HEALTH`) and flat (`GAME_CONSTANTS.PLAYER_START_HEALTH`) patterns exist
**Recommendation:** Deprecate flat pattern, use only nested access

### QUALITY-002: Missing ProjectileType

**Location:** `src/shared/src/types.ts`
**Issue:** `demon_fireball` not in ProjectileType union
**Fix:**
```typescript
export type ProjectileType =
  | 'bullet'
  | 'slash'
  | 'orb'
  | 'lightning_bolt'
  | 'axe_spin'
  | 'fireball'
  | 'explosion'
  | 'demon_fireball';  // ADD THIS
```

### QUALITY-003: UpgradeChoice Type Mismatch

**Location:** `src/server/src/systems/XPSystem.ts:14-21` vs `src/shared/src/types.ts:206-213`
**Issue:** Implementation uses `'weapon' | 'stat'` instead of spec's `'new_weapon' | 'upgrade_weapon' | 'stat_boost'`
**Impact:** Loss of semantic information

### QUALITY-004: Magic Numbers in PhysicsSystem

**Location:** `src/server/src/systems/PhysicsSystem.ts`
**Issue:** Hardcoded values should be constants
- Line 29: `Math.PI` orbital speed → `BIBLE_ORBIT_SPEED`
- Line 33: Orbit radius `3` → `WEAPON_CONFIGS.bible.range`
- Line 98: Query radius `100` → `ENEMY_DETECTION_RANGE`

---

## COMPLETED PHASES (Reference)

### Phase 1: Foundation - COMPLETE (14/14 tasks)
### Phase 2: Server Core - COMPLETE (24/24 tasks)
### Phase 3: Client Core - COMPLETE (12/12 tasks)
### Phase 4: Networking - COMPLETE (8/8 tasks)
### Phase 5: UI/HUD - COMPLETE (12/12 tasks)
### Phase 6: Polish & Optimization - COMPLETE (17/17 tasks)

All 8 weapons, audio system, visual effects, mobile controls, settings/tutorial/pause menus, object pooling, interest management, LOD, and frustum culling are fully implemented.

---

## ARCHITECTURE REFERENCE

### File Structure

```
src/
├── shared/src/
│   ├── types.ts         # 30+ TypeScript types/interfaces
│   ├── constants.ts     # WEAPON_CONFIGS, ENEMY_CONFIGS, GAME_CONSTANTS
│   └── utils.ts         # Vector math, distance, interpolation, random

├── server/src/
│   ├── state/           # Colyseus @type decorated schemas
│   │   ├── GameState.ts
│   │   ├── PlayerSchema.ts
│   │   ├── EnemySchema.ts
│   │   ├── WeaponSchema.ts
│   │   ├── ProjectileSchema.ts
│   │   ├── XPOrbSchema.ts
│   │   └── WorldSchema.ts
│   ├── systems/
│   │   ├── SpatialHash.ts      # O(1) spatial queries
│   │   ├── InputSystem.ts      # Rate limiting, validation
│   │   ├── PhysicsSystem.ts    # Enemy AI, movement, boundaries
│   │   ├── SpawnSystem.ts      # Wave-based enemy spawning
│   │   ├── WeaponSystem.ts     # Auto-fire, 8 weapon types
│   │   ├── CombatSystem.ts     # Collision detection, damage
│   │   ├── XPSystem.ts         # Orb collection, upgrades
│   │   └── ObjectPool.ts       # Entity pooling
│   ├── rooms/
│   │   └── GameRoom.ts         # 60Hz game loop, Colyseus room
│   └── index.ts                # Express + Colyseus server

└── client/src/
    ├── game/
    │   ├── Renderer.ts         # Three.js, InstancedMesh, visual effects
    │   ├── InputManager.ts     # WASD, touch controls, client prediction
    │   ├── Interpolator.ts     # Smooth movement
    │   ├── TouchControls.ts    # Mobile virtual joystick
    │   └── Game.ts             # Main game class, AudioManager integration
    ├── network/
    │   ├── NetworkClient.ts    # Colyseus client, state sync, reconnection
    │   └── index.ts            # Barrel export
    ├── audio/
    │   ├── AudioManager.ts     # Web Audio API, synthesized sounds
    │   └── index.ts            # Barrel export
    └── ui/
        ├── HUD.ts              # Full HUD: health, XP, weapons, minimap, modals
        └── index.ts            # Barrel export
```

---

## DEVELOPMENT COMMANDS

```bash
# Start development (server + client)
npm run dev

# Start server only
npm run dev:server

# Start client only
npm run dev:client

# Build for production
npm run build

# Type checking
npm run typecheck

# Lint
npm run lint

# Run tests
npm run test
```

---

## CHANGELOG

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-13 | 2.26 | CRITICAL BUG FIXES - Fixed 6 bugs: BUG-001 (enemy initialization missing), BUG-002 (upgrade choices never sent to client), BUG-003 (server never sends player_died message), BUG-004 (unlimited piercing projectiles destroyed on first hit), BUG-005 (double PvP damage reduction), BUG-008 (hostility decay rate 20x too fast). All critical game-breaking bugs are now resolved. |
| 2026-01-13 | 2.25 | COMPREHENSIVE CODEBASE AUDIT - Identified 11 bugs (5 critical, 6 medium), 6 test gaps, 4 code quality issues. Critical bugs: BUG-001 (enemy initialization missing), BUG-002 (upgrade choices lost), BUG-003 (server never sends level_up/player_died), BUG-004 (piercing=0 projectiles destroyed), BUG-005 (double PvP damage reduction). Updated IMPLEMENTATION_PLAN.md with detailed fixes for all issues. |
| 2026-01-13 | 2.24 | Fixed magnet range boost bug in XPSystem - was incorrectly adding +20 per upgrade instead of +1 as specified in UPGRADE_POOL. Added comprehensive schema unit tests (33 PlayerSchema + 27 GameState tests). Total test count now 209. |
| 2026-01-13 | 2.23 | Bible Weapon Orbital Mechanics FIX - Fixed bug where Bible orb projectiles were static instead of orbiting the player. Added special handling in PhysicsSystem for 'orb' type projectiles. |
| 2026-01-13 | 2.22 | InputSystem Tests COMPLETE - Added comprehensive InputSystem test suite (41 tests). Fixed bug where first input was always detected as spam. |
| 2026-01-13 | 2.21 | ESLint Configuration ADDED - Created .eslintrc.json with TypeScript support. Fixed 18 lint warnings. |
| 2026-01-13 | 2.20 | Unit Testing Infrastructure COMPLETE - Set up Vitest testing framework. Created 108 unit tests total (73 shared + 35 server). |
| 2026-01-13 | 2.19 | Mobile Touch Controls COMPLETE - Added virtual joystick for mobile play. |
| 2026-01-13 | 2.18 | Pause Menu COMPLETE - Added pause overlay with P key toggle. |
| 2026-01-13 | 2.17 | Tutorial Overlay COMPLETE - Added tutorial overlay for first-time players. |
| 2026-01-13 | 2.16 | Settings Menu COMPLETE - Added settings with volume sliders. |
| 2026-01-13 | 2.15 | Boss Unique Abilities COMPLETE - Split, summon, and charge abilities. |
| 2026-01-13 | 2.14 | Demon Ranged Attack COMPLETE - Demons fire projectiles at range. |
| 2026-01-13 | 2.13 | LOD COMPLETE - Distance-based Level of Detail for performance. |
| 2026-01-13 | 2.12 | Object Pooling COMPLETE - Server-side entity reuse. |
| 2026-01-13 | 2.11 | Interest Management COMPLETE - @filterChildren decorators. |
| 2026-01-13 | 2.10 | Frustum Culling COMPLETE - Distance-based culling. |
| 2026-01-13 | 2.9 | Visual Effects COMPLETE (5/5) - All particle systems. |
| 2026-01-13 | 2.8 | Audio System COMPLETE (6/6) - Web Audio API sounds. |
| 2026-01-13 | 2.7 | Security COMPLETE - Ban persistence, URL validation, rate limiting. |
| 2026-01-13 | 2.6 | Player kick mechanism implemented. |
| 2026-01-13 | 2.5 | All 8 Weapons COMPLETE - Lightning, Axe, Fireball, Whip. |
| 2026-01-13 | 2.4 | Phase 5 UI/HUD COMPLETE (12/12 tasks). |
| 2026-01-13 | 2.3 | Phase 4 Networking COMPLETE (8/8 tasks). |
