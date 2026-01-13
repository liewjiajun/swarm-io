# SWARM.IO Implementation Plan

## Current Status: Phase 5 Complete - Phase 6 In Progress (Audio & Visual Effects)

**Last Updated:** 2026-01-13
**Implementation Progress:** 87/85 tasks completed (102.4%)
**Build Status:** Server running on port 2567, Client fully connected on port 5173 (live multiplayer)
**Next Priority:** Phase 6 - Polish & Optimization (8/17 complete)

---

## EXECUTIVE SUMMARY

| Metric | Value | Notes |
|--------|-------|-------|
| Total Tasks | 85 | Across 6 phases |
| Completed | 87 | 102.4% (Phase 6 progress) |
| Remaining | 9 | Polish & optimization (9/17 Phase 6 tasks remain) |
| Blocking Issues | 0 | All critical bugs resolved |
| Critical Path | Phase 6 | Polish & Optimization |
| Est. Time to MVP | Complete | MVP is complete |

---

## PHASE 5 - UI/HUD SYSTEM (COMPLETE)

**Status:** 12/12 tasks complete (100%)
**Impact:** Full user experience with game feedback
**Spec Reference:** `specs/09-ui-hud.md` (536 lines, full implementation)

### Completed State

- **HUD.ts FULLY IMPLEMENTED** - Complete UI system at `src/client/src/ui/HUD.ts`
- **Renderer.ts stub methods REMOVED** - UI methods moved to HUD class

### Task List

| ID | Task | File | Status |
|----|------|------|--------|
| P1.1 | Create HUD class with styles | `src/client/src/ui/HUD.ts` | COMPLETE |
| P1.2 | Health/XP bars | HUD.ts | COMPLETE |
| P1.3 | Weapon display icons | HUD.ts | COMPLETE |
| P1.4 | Leaderboard panel | HUD.ts | COMPLETE |
| P1.5 | Minimap canvas | HUD.ts | COMPLETE |
| P1.6 | Game info (time/wave/players) | HUD.ts | COMPLETE |
| P1.7 | Upgrade modal | HUD.ts | COMPLETE |
| P1.8 | Death screen | HUD.ts | COMPLETE |
| P1.9 | Loading screen | HUD.ts | COMPLETE (N/A - loading handled by existing flow) |
| P1.10 | Update UI barrel export | `src/client/src/ui/index.ts` | COMPLETE |
| P1.11 | Implement Renderer.showDeathScreen() | HUD.ts | COMPLETE (Moved to HUD class, removed from Renderer) |
| P1.12 | Implement Renderer.showUpgradeUI() | HUD.ts | COMPLETE (Moved to HUD class, removed from Renderer) |

---

## P2: WEAPONS (8/8 Weapons Complete)

**Status:** All 8 weapons fully implemented - 100% Complete
**Impact:** All weapons fully functional
**Spec Reference:** `specs/05-weapon-combat.md:201-324` (full implementations)

### All Weapons (Full Functionality)

| Weapon | Location | Status |
|--------|----------|--------|
| Knife | `WeaponSystem.ts` | COMPLETE |
| Wand | `WeaponSystem.ts` | COMPLETE |
| Bible | `WeaponSystem.ts` | COMPLETE |
| Garlic | `WeaponSystem.ts` | COMPLETE |
| Lightning | `WeaponSystem.ts` | COMPLETE |
| Axe | `WeaponSystem.ts` | COMPLETE |
| Fireball | `WeaponSystem.ts` | COMPLETE |
| Whip | `WeaponSystem.ts` | COMPLETE |

### Task List

| ID | Task | Spec Lines | Est. LOC | Complexity | Status |
|----|------|------------|----------|------------|--------|
| P2.0 | Add spatialHash access to WeaponSystem | N/A | ~10 | Low | COMPLETE |
| P2.1 | Implement `fireLightning()` | 201-231 | ~30 | Medium | COMPLETE |
| P2.2 | Implement `fireAxe()` | 233-259 | ~30 | Low | COMPLETE |
| P2.3 | Implement `fireFireball()` | 261-292 | ~35 | Medium | COMPLETE |
| P2.4 | Implement `fireWhip()` | 294-324 | ~25 | Low | COMPLETE |

---

## P3: SECURITY HARDENING

**Status:** 4/4 tasks complete (100%)
**Impact:** Full security hardening with kick mechanism, ban persistence, and rate limiting

### Task List

| ID | Task | File | Description | Est. LOC | Status |
|----|------|------|-------------|----------|--------|
| P3.1 | Implement player kick mechanism | `InputSystem.ts:167` | Kick after 5+ violations | ~25 | COMPLETE |
| P3.2 | Add ban persistence | GameRoom.ts | Store banned IPs/sessionIds | ~40 | COMPLETE |
| P3.3 | WebSocket URL validation | NetworkClient.ts | Prevent arbitrary connections | ~15 | COMPLETE |
| P3.4 | Client-side rate limiting | NetworkClient.ts | Max 60 inputs/sec | ~20 | COMPLETE |

---

## P4: PHASE 6 - POLISH & OPTIMIZATION (POST-MVP)

**Status:** 8/17 tasks complete (47.1%)
**Priority:** LOW - After MVP is functional
**Implementation:** Audio system complete, visual effects partially complete

### 6.1 Visual Effects (2/5 COMPLETE)

| Task | Description | Complexity | Est. LOC | Status |
|------|-------------|------------|----------|--------|
| Damage numbers | Floating text popups with fade/scale animation | Medium | ~100 | COMPLETE |
| XP collection sparkle | Particle burst effect on pickup | Low | ~40 | COMPLETE |
| Weapon impact particles | Three.js Points for hit effects | Medium | ~80 | PENDING |
| Death explosion | Enemy death visual | Low | ~50 | PENDING |
| Level up flash | Screen flash on level up | Low | ~20 | PENDING |

**Files Modified:**
- `src/client/src/game/Renderer.ts` - Added damage numbers and particle effects

### 6.2 Audio System (6/6 COMPLETE)

| Task | Description | Complexity | Est. LOC | Status |
|------|-------------|------------|----------|--------|
| Audio system setup | Web Audio API context, volume control, synthesized sounds | Low | ~60 | COMPLETE |
| Weapon sounds | Per-weapon attack sounds (all 8 weapons) | Low | ~40 | COMPLETE |
| Pickup sounds | XP collection sounds | Low | ~20 | COMPLETE |
| Level up jingle | Ascending note celebration jingle | Low | ~10 | COMPLETE |
| Death sound | Descending ominous death audio | Low | ~10 | COMPLETE |
| Player damage sound | Damage feedback sound | Low | ~10 | COMPLETE |

**Files Created:**
- `src/client/src/audio/AudioManager.ts` - Full audio system with Web Audio API
- `src/client/src/audio/index.ts` - Barrel export

**Files Modified:**
- `src/client/src/game/Game.ts` - Added AudioManager integration

### 6.3 Performance Optimizations

| Task | Description | Impact | Est. LOC |
|------|-------------|--------|----------|
| Frustum culling | Don't render off-screen entities | High | ~50 |
| Interest management | Only sync entities within player's view radius | High | ~150 |
| Object pooling | Reuse projectile/enemy objects instead of GC | Medium | ~100 |
| LOD for distant entities | Simpler geometry for far entities | Medium | ~80 |
| State delta compression | Only send changed fields | Medium | ~100 |
| Batch rendering | Reduce draw calls | Medium | ~60 |

### 6.4 Quality of Life

| Task | Description | Complexity | Est. LOC |
|------|-------------|------------|----------|
| Demon ranged attack | Demons fire projectiles at range | Medium | ~60 |
| Boss unique abilities | Special boss mechanics (charge, AOE) | Medium | ~150 |
| Mobile touch controls | Virtual joystick for mobile play | Medium | ~200 |
| Settings menu | Sound, controls, graphics options | Low | ~100 |
| Tutorial overlay | First-time player guidance | Low | ~80 |
| Pause menu | In-game pause with options | Low | ~60 |

---

## COMPLETED PHASES

### Phase 1: Foundation (COMPLETE - 2026-01-12)

**14/14 tasks complete (100%)**

| Component | Files | Status |
|-----------|-------|--------|
| Package structure | 3 package.json files | COMPLETE |
| TypeScript config | 3 tsconfig.json files | COMPLETE |
| Shared types | `src/shared/src/types.ts` (30+ types) | COMPLETE |
| Constants | `src/shared/src/constants.ts` (8 weapons, 9 enemies) | COMPLETE |
| Utilities | `src/shared/src/utils.ts` (vector math, interpolation) | COMPLETE |
| Vite config | `vite.config.ts` | COMPLETE |
| HTML entry | `index.html` | COMPLETE |

### Phase 2: Server Core (COMPLETE - 2026-01-13)

**24/24 tasks complete (100%)** - Note: 4 weapon stubs require implementation, type errors fixed

| Component | Files | Status |
|-----------|-------|--------|
| Colyseus Schemas | 8 schema files (GameState, Player, Enemy, Weapon, Projectile, XPOrb, World) | COMPLETE |
| SpatialHash | `src/server/src/systems/SpatialHash.ts` | COMPLETE |
| InputSystem | `src/server/src/systems/InputSystem.ts` (with rate limiting) | 95% Complete (kick not enforced) |
| PhysicsSystem | `src/server/src/systems/PhysicsSystem.ts` | COMPLETE (constructor fixed) |
| SpawnSystem | `src/server/src/systems/SpawnSystem.ts` | COMPLETE |
| WeaponSystem | `src/server/src/systems/WeaponSystem.ts` | 50% Complete (4/8 weapons work, 4 stubs; type errors fixed) |
| CombatSystem | `src/server/src/systems/CombatSystem.ts` | COMPLETE (type errors fixed) |
| XPSystem | `src/server/src/systems/XPSystem.ts` | COMPLETE (type errors fixed) |
| GameRoom | `src/server/src/rooms/GameRoom.ts` | COMPLETE (type errors fixed) |
| Server Entry | `src/server/src/index.ts` | COMPLETE |

### Phase 3: Client Core (COMPLETE - 2026-01-13)

**12/12 tasks complete (100%)** - Note: Renderer has 2 UI method stubs

| Component | Files | Status |
|-----------|-------|--------|
| Renderer | `src/client/src/game/Renderer.ts` (Three.js, InstancedMesh) | 95% Complete (UI stubs at lines 273-281) |
| InputManager | `src/client/src/game/InputManager.ts` (WASD, prediction) | COMPLETE |
| Interpolator | `src/client/src/game/Interpolator.ts` | COMPLETE |
| Game Loop | `src/client/src/game/Game.ts` | COMPLETE (NetworkClient integrated) |
| UI stub | `src/client/src/ui/index.ts` | Placeholder only - HUD.ts does NOT exist |

### Phase 4: Networking (COMPLETE - 2026-01-13)

**8/8 tasks complete (100%)**

| Component | Files | Status |
|-----------|-------|--------|
| NetworkClient | `src/client/src/network/NetworkClient.ts` | COMPLETE (connection, reconnection, state serialization) |
| Network barrel export | `src/client/src/network/index.ts` | COMPLETE |
| Game integration | `src/client/src/game/Game.ts` | COMPLETE (state handlers, death/levelup events, input sending) |
| vite-env.d.ts | `src/client/vite-env.d.ts` | COMPLETE (import.meta.env types) |

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
│   │   └── XPSystem.ts         # Orb collection, upgrades
│   ├── rooms/
│   │   └── GameRoom.ts         # 60Hz game loop, Colyseus room
│   └── index.ts                # Express + Colyseus server

└── client/src/
    ├── game/
    │   ├── Renderer.ts         # Three.js, InstancedMesh
    │   ├── InputManager.ts     # WASD, client prediction
    │   ├── Interpolator.ts     # Smooth movement
    │   └── Game.ts             # Main game class
    ├── network/
    │   ├── NetworkClient.ts    # DOES NOT EXIST - TO BE IMPLEMENTED (P1)
    │   └── index.ts            # Barrel export (placeholder only)
    └── ui/
        ├── HUD.ts              # DOES NOT EXIST - TO BE IMPLEMENTED (P3)
        └── index.ts            # Barrel export (placeholder only)
```

### Critical Patterns

#### Colyseus Schema Decorators
```typescript
import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

class PlayerSchema extends Schema {
  @type('string') id: string = '';
  @type('number') x: number = 0;
  @type([WeaponSchema]) weapons = new ArraySchema<WeaponSchema>();
}

class GameState extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
```

#### Three.js InstancedMesh (Performance Critical)
```typescript
// CRITICAL: Set count BEFORE setting matrices
mesh.count = entities.length;

entities.forEach((entity, index) => {
  dummy.position.set(entity.x, 0, entity.y);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
});

// REQUIRED: Flag matrix as needing update
mesh.instanceMatrix.needsUpdate = true;
```

#### State Serialization (Client)
```typescript
// Convert Colyseus MapSchema to plain Maps for rendering
const players = new Map();
state.players.forEach((player, id) => {
  players.set(id, {
    id: player.id,
    x: player.x,
    y: player.y,
    // ... destructure all fields
  });
});
```

#### Spatial Hash Queries
```typescript
// Query entities within radius
const nearbyEnemies = spatialHash.queryRadius(x, y, radius, 'enemy');

// Query nearest entity of type
const nearestPlayer = spatialHash.queryNearestOfType(x, y, 'player', maxRange);
```

---

## KNOWN ISSUES

### Blocking Issues

| ID | Issue | Location | Severity | Status |
|----|-------|----------|----------|--------|
| - | - | - | - | All resolved |

### Non-Blocking Issues

| ID | Issue | Location | Severity | Status |
|----|-------|----------|----------|--------|
| TEST-001 | No unit tests exist | N/A | Low | Open |
| DESIGN-001 | Garlic creates unused explosion projectiles | `WeaponSystem.ts:259-274` | Info | Won't Fix |

### Verified Constants

| Item | Location | Value | Notes |
|------|----------|-------|-------|
| SERVER_TICK_RATE | `constants.ts:42` | 16 (ms) | ~62.5Hz - correctly documented in code |
| WAVE_SCHEDULE | `constants.ts:280-291` | Array format | `[{time, enemies, bossType?}]` - matches spec |
| WEAPON_CONFIGS | `constants.ts` | 8 weapons | All defined correctly |
| ENEMY_CONFIGS | `constants.ts` | 9 enemies | All defined correctly |

---

## SPEC FILE REFERENCE

| Spec File | Lines | Purpose | Key Content |
|-----------|-------|---------|-------------|
| `01-project-setup.md` | ~300 | Project structure | package.json files, configs |
| `02-shared-types.md` | ~628 | Type definitions | All types, constants, 8 weapons, 9 enemies |
| `03-server-gameloop.md` | ~456 | Server architecture | GameRoom, 60Hz loop, system orchestration |
| `04-server-state.md` | ~420 | Colyseus state | All 8 schema definitions |
| `05-weapon-combat.md` | ~700 | Weapon/combat | **All 8 weapon implementations**, CombatSystem |
| `06-spawning.md` | ~200 | Enemy spawning | Wave schedule, spawn algorithms |
| `07-client-renderer.md` | ~668 | Client rendering | Three.js setup, InstancedMesh, camera |
| `08-client-networking.md` | ~245 | Client networking | **Complete NetworkClient** |
| `09-ui-hud.md` | ~536 | UI/HUD | **Complete HUD implementation** |

**Total Specification:** ~4,153 lines with ~95% copy-paste-ready code

---

## MVP COMPLETION CRITERIA

### Minimum Viable Product Checklist

- [x] **P0 Bug Fixed** - PhysicsSystem constructor
- [x] **Connection** - Player connects and spawns in world
- [x] **Movement** - WASD movement with visual feedback
- [x] **Combat** - Auto-attacking weapons (knife minimum)
- [x] **Enemies** - Enemies spawn and chase player
- [x] **XP System** - XP collection works, level-up UI
- [x] **Death/Respawn** - Death screen
- [x] **Multiplayer** - See other players moving

### Post-MVP Enhancements

- [x] All 8 weapons functional
- [x] Full HUD implementation
- [x] Audio system (complete)
- [x] Visual effects (partial - 2/5 complete)
- [ ] Mobile support
- [ ] Performance optimizations

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
```

---

## CHANGELOG

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-13 | 2.8 | Phase 6 Progress - Audio System COMPLETE (6/6), Visual Effects partial (2/5) - damage numbers and XP sparkles implemented |
| 2026-01-13 | 2.7 | P3.2-P3.4 Security COMPLETE - Ban persistence with file storage, WebSocket URL validation, client-side rate limiting |
| 2026-01-13 | 2.6 | P3.1 Security - Player kick mechanism implemented in InputSystem with callback to GameRoom |
| 2026-01-13 | 2.5 | P2 Weapons COMPLETE (8/8) - Lightning, Axe, Fireball, Whip fully implemented with spatialHash integration |
| 2026-01-13 | 2.4 | Phase 5 UI/HUD COMPLETE (12/12 tasks) - Full HUD.ts implementation with health bars, XP, weapons, leaderboard, minimap, upgrade modal, death screen |
| 2026-01-13 | 2.3 | Phase 4 Networking COMPLETE (8/8 tasks) - NetworkClient.ts created with full implementation |
| 2026-01-13 | 2.3 | P0 Bug RESOLVED - PhysicsSystem constructor in GameRoom.ts:34 fixed |
| 2026-01-13 | 2.3 | Type errors FIXED - GameRoom onMessage, CombatSystem projectileType, XPSystem upgrades, WeaponSystem nearestEnemy, MapSchema iteration issues |
| 2026-01-13 | 2.3 | Shared package rebuilt with correct types, vite-env.d.ts added for import.meta.env types |
| 2026-01-13 | 2.3 | Progress: 58/85 tasks completed (68.2%), blocking issues: 0 |
| 2026-01-13 | 2.3 | Next priority: Phase 5 UI/HUD System |
| 2026-01-13 | 2.2 | Verified WAVE_SCHEDULE is array format (removed incorrect CONST-002 issue) |
| 2026-01-13 | 2.2 | Confirmed SERVER_TICK_RATE = 16ms with comment (~60Hz) - correct |
| 2026-01-13 | 2.2 | Added "Verified Constants" section to KNOWN ISSUES |
| 2026-01-13 | 2.2 | Documented spatialHash requirement for Lightning/Fireball weapons in P2 |
| 2026-01-13 | 2.2 | Added implementation options for WeaponSystem spatialHash access |
| 2026-01-13 | 2.2 | Split P2 weapon table into "Implemented" and "Stub" sections |
| 2026-01-13 | 2.2 | Removed Constants Mismatch Issues section (issues were incorrect) |
| 2026-01-13 | 2.1 | Comprehensive codebase audit findings integrated |
| 2026-01-13 | 2.1 | Confirmed NetworkClient.ts does NOT exist (only placeholder in network/index.ts) |
| 2026-01-13 | 2.1 | Confirmed HUD.ts does NOT exist (only placeholder in ui/index.ts) |
| 2026-01-13 | 2.1 | Verified InputSystem.ts:167-173 detects but does NOT kick rate limit violators |
| 2026-01-13 | 2.0 | Complete rewrite with accurate priority analysis |
| 2026-01-13 | 2.0 | Identified P0 bug (PhysicsSystem constructor) |
| 2026-01-13 | 2.0 | Verified 4 weapon stubs with spec references |
| 2026-01-13 | 2.0 | Confirmed Phase 4 (Networking) 0% complete |
| 2026-01-13 | 2.0 | Confirmed Phase 5 (UI/HUD) 0% complete |
| 2026-01-13 | 2.0 | Added detailed implementation code snippets |
| 2026-01-13 | 2.0 | Added verification checklists for each phase |
| 2026-01-13 | 1.0 | Phase 3 (Client Core) COMPLETE - 12/12 tasks |
| 2026-01-13 | 1.0 | Phase 2 (Server Core) COMPLETE - 24/24 tasks |
| 2026-01-12 | 1.0 | Phase 1 (Foundation) COMPLETE - 14/14 tasks |
| 2026-01-12 | 0.1 | Initial project setup |
