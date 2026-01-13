# SWARM.IO Implementation Plan

## Current Status: Phase 4 Complete - All Core Systems Operational

**Last Updated:** 2026-01-13
**Implementation Progress:** 58/85 tasks completed (68.2%)
**Build Status:** Server running on port 2567, Client fully connected on port 5173 (live multiplayer)
**Next Priority:** Phase 5 UI/HUD, then remaining weapons

---

## EXECUTIVE SUMMARY

| Metric | Value | Notes |
|--------|-------|-------|
| Total Tasks | 85 | Across 6 phases |
| Completed | 58 | 68.2% |
| Remaining | 27 | P2-P5 priority |
| Blocking Issues | 0 | All critical bugs resolved |
| Critical Path | Phase 5 | UI/HUD for user experience |
| Est. Time to MVP | 4-6 hours | Phase 5 complete |

---

## P1: PHASE 5 - UI/HUD SYSTEM (CRITICAL PATH)

**Status:** 0/12 tasks complete (0%)
**Impact:** Poor user experience, no game feedback
**Spec Reference:** `specs/09-ui-hud.md` (536 lines, full implementation)

### Current State

- **HUD.ts DOES NOT EXIST** - only empty placeholder at `src/client/src/ui/index.ts`
- **Renderer.ts has 2 stub methods:**
  - `showDeathScreen(finalScore)` at lines 273-276 - console.log only
  - `showUpgradeUI(choices, onSelect)` at lines 278-281 - console.log only

### Task List

| ID | Task | File | Spec Lines | Est. LOC |
|----|------|------|------------|----------|
| P1.1 | Create HUD class with styles | `src/client/src/ui/HUD.ts` | 30-340 | ~340 |
| P1.2 | Health/XP bars | HUD.ts | 51-62, 355-366 | (incl.) |
| P1.3 | Weapon display icons | HUD.ts | 73-76, 381-398 | (incl.) |
| P1.4 | Leaderboard panel | HUD.ts | 66-71, 401-416 | (incl.) |
| P1.5 | Minimap canvas | HUD.ts | 87-90, 427-461 | (incl.) |
| P1.6 | Game info (time/wave/players) | HUD.ts | 79-85, 419-425 | (incl.) |
| P1.7 | Upgrade modal | HUD.ts | 93-97, 469-495 | (incl.) |
| P1.8 | Death screen | HUD.ts | 99-105, 497-519 | (incl.) |
| P1.9 | Loading screen | HUD.ts | CSS overlay | ~30 |
| P1.10 | Update UI barrel export | `src/client/src/ui/index.ts` | N/A | ~5 |
| P1.11 | Implement Renderer.showDeathScreen() | `src/client/src/game/Renderer.ts:273-276` | N/A | ~20 |
| P1.12 | Implement Renderer.showUpgradeUI() | `src/client/src/game/Renderer.ts:278-281` | N/A | ~20 |

### Current Renderer Stubs

```typescript
// Renderer.ts:273-276 (CURRENT - STUB)
showDeathScreen(finalScore: number) {
  // Implementation: Show overlay with score and respawn button
  console.log('Death screen:', finalScore);
}

// Renderer.ts:278-281 (CURRENT - STUB)
showUpgradeUI(choices: any[], onSelect: (id: string) => void) {
  // Implementation: Show upgrade selection UI
  console.log('Upgrade choices:', choices);
}
```

### HUD Implementation (from spec)

The complete HUD implementation is at `specs/09-ui-hud.md:30-521`. Key components:

**HTML Structure (lines 51-106):**
```html
<div class="hud">
  <div class="hud-topleft"><!-- Health, XP, Level --></div>
  <div class="hud-topright"><!-- Leaderboard --></div>
  <div class="hud-bottomleft"><!-- Weapons --></div>
  <div class="hud-bottomright"><!-- Game Info --></div>
  <div class="hud-minimap"><!-- Canvas --></div>
</div>
<div class="upgrade-modal hidden"><!-- Level up choices --></div>
<div class="death-screen hidden"><!-- Death stats --></div>
```

**CSS Styling (lines 112-338):**
- Pixel-art font (Press Start 2P)
- Semi-transparent backgrounds (rgba)
- Health bar gradient (red)
- XP bar gradient (teal)
- Pointer-events: none for non-interactive areas

**Update Method (lines 355-378):**
```typescript
update(player: any, world: any, allPlayers: Map<string, any>, localPlayerId: string) {
  // Health
  const healthPercent = (player.health / player.maxHealth) * 100;
  this.elements.healthBar.style.width = `${healthPercent}%`;
  this.elements.healthText.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;

  // XP, Level, Weapons, Leaderboard, Game Info, Minimap...
}
```

---

## P2: MISSING WEAPONS (4/8 Weapons Are Stubs)

**Status:** 4 weapons functional, 4 are stubs (console.log only) - 50% Complete
**Impact:** Players can select these weapons but they don't function
**Spec Reference:** `specs/05-weapon-combat.md:201-324` (full implementations)

### Implemented Weapons (Full Functionality)

| Weapon | Location | Status |
|--------|----------|--------|
| Knife | `WeaponSystem.ts:117-153` | COMPLETE |
| Wand | `WeaponSystem.ts:156-206` | COMPLETE |
| Bible | `WeaponSystem.ts:209-246` | COMPLETE |
| Garlic | `WeaponSystem.ts:249-275` | COMPLETE |

### Stub Weapons (console.log only)

| Weapon | Location | Current Code |
|--------|----------|--------------|
| Lightning | `WeaponSystem.ts:280-283` | `console.log('[WeaponSystem] Lightning not yet implemented...')` |
| Axe | `WeaponSystem.ts:285-288` | `console.log('[WeaponSystem] Axe not yet implemented...')` |
| Fireball | `WeaponSystem.ts:290-293` | `console.log('[WeaponSystem] Fireball not yet implemented...')` |
| Whip | `WeaponSystem.ts:295-298` | `console.log('[WeaponSystem] Whip not yet implemented...')` |

### Pre-requisite: WeaponSystem SpatialHash Access

**IMPORTANT:** The spec implementations for Lightning and Fireball use `this.spatialHash.queryRadius()` and `this.spatialHash.queryNearestOfType()`, but the current WeaponSystem does not have access to spatialHash.

**Current Code (WeaponSystem.ts):**
- Constructor takes no parameters
- `update()` method receives `gameState` but NOT `spatialHash`

**Required Fix Options:**

**Option 1: Pass spatialHash to update() method:**
```typescript
// In GameRoom.ts game loop, change:
this.weaponSystem.update(this.state, dt);
// To:
this.weaponSystem.update(this.state, dt, this.spatialHash);

// And update WeaponSystem.update() signature
update(gameState: GameState, dt: number, spatialHash: SpatialHash): void
```

**Option 2: Pass spatialHash to constructor:**
```typescript
constructor(private spatialHash: SpatialHash) {
  console.log('[WeaponSystem] Initialized with auto-firing weapon support');
}

// GameRoom.ts change:
private weaponSystem = new WeaponSystem(this.spatialHash);
```

### Task List

| ID | Task | Spec Lines | Est. LOC | Complexity | Notes |
|----|------|------------|----------|------------|-------|
| P2.0 | Add spatialHash access to WeaponSystem | N/A | ~10 | Low | Required for Lightning/Fireball |
| P2.1 | Implement `fireLightning()` | 201-231 | ~30 | Medium | Needs spatialHash.queryRadius |
| P2.2 | Implement `fireAxe()` | 233-259 | ~30 | Low | No spatialHash needed |
| P2.3 | Implement `fireFireball()` | 261-292 | ~35 | Medium | Needs spatialHash.queryNearestOfType |
| P2.4 | Implement `fireWhip()` | 294-324 | ~25 | Low | No spatialHash needed |

### Weapon Implementations from Spec

#### Lightning (Random Multi-Target Strikes) - NEEDS spatialHash
```typescript
private fireLightning(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
  const config = WEAPON_CONFIGS.lightning;
  const strikeCount = Math.min(1 + Math.floor(weapon.level / 2), 5);
  const range = config.range * (1 + (weapon.level - 1) * 0.1);

  const nearbyEnemies = this.spatialHash.queryRadius(
    player.x, player.y, range, 'enemy'
  );

  // Shuffle and take strikeCount random targets
  const shuffled = nearbyEnemies.sort(() => Math.random() - 0.5);
  const targets = shuffled.slice(0, strikeCount);

  for (const entity of targets) {
    // Create visual lightning bolt
    gameState.addProjectile(
      'lightning_bolt', player.id,
      entity.x, entity.y,
      0, 0, damage,
      0.1, 0.5, 1
    );
    // Direct damage
    entity.entity.health -= damage;
  }
}
```

#### Axe (Piercing Boomerang Pattern)
```typescript
private fireAxe(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
  const config = WEAPON_CONFIGS.axe;
  const speed = config.projectileSpeed || 8;
  const axeCount = Math.min(1 + Math.floor(weapon.level / 3), 3);

  for (let i = 0; i < axeCount; i++) {
    const angleOffset = (i - (axeCount - 1) / 2) * 0.5;
    const cos = Math.cos(angleOffset);
    const sin = Math.sin(angleOffset);

    const dirX = player.facingX * cos - player.facingY * sin;
    const dirY = player.facingX * sin + player.facingY * cos;

    gameState.addProjectile(
      'axe_spin', player.id,
      player.x, player.y,
      dirX * speed, dirY * speed,
      damage, 3, 0.6, 999 // 3s lifetime, unlimited piercing
    );
  }
}
```

#### Fireball (Targeted Explosive) - NEEDS spatialHash
```typescript
private fireFireball(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
  const config = WEAPON_CONFIGS.fireball;

  // Find nearest enemy
  const nearestEnemy = this.spatialHash.queryNearestOfType(
    player.x, player.y, 'enemy', config.range
  );

  let dirX = player.facingX;
  let dirY = player.facingY;

  if (nearestEnemy) {
    const dx = nearestEnemy.x - player.x;
    const dy = nearestEnemy.y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    dirX = dx / len;
    dirY = dy / len;
  }

  const speed = config.projectileSpeed || 10;

  gameState.addProjectile(
    'fireball', player.id,
    player.x, player.y,
    dirX * speed, dirY * speed,
    damage, 3, 0.5, 1 // Explodes on first hit
  );
  // Note: CombatSystem.handleFireballExplosion() handles the AOE
}
```

#### Whip (Wide Horizontal Arc)
```typescript
private fireWhip(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
  const config = WEAPON_CONFIGS.whip;
  const range = config.range * (1 + (weapon.level - 1) * 0.1);
  const arcWidth = (config.area || 4) * (1 + (weapon.level - 1) * 0.1);

  const slashCount = 5;
  for (let i = 0; i < slashCount; i++) {
    const t = i / (slashCount - 1) - 0.5; // -0.5 to 0.5
    const angle = t * arcWidth / range;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const dirX = player.facingX * cos - player.facingY * sin;
    const dirY = player.facingX * sin + player.facingY * cos;

    gameState.addProjectile(
      'slash', player.id,
      player.x + dirX * range * 0.5,
      player.y + dirY * range * 0.5,
      0, 0, damage,
      0.15, 0.5, 999 // Short lifetime, unlimited piercing
    );
  }
}
```

---

## P3: SECURITY HARDENING

**Status:** Input validation implemented, enforcement incomplete
**Impact:** Cheaters can flood server without consequences

### Current Security Gap

```typescript
// InputSystem.ts:167-173 (CURRENT)
// TODO: Implement player kick/ban mechanism when violations exceed threshold
if (playerRate.violations >= this.MAX_VIOLATIONS_BEFORE_KICK) {
  console.warn(
    `Player ${playerId} exceeded violation threshold (${playerRate.violations}). ` +
    'Consider implementing kick/ban mechanism.'
  );
}
// BUT NO ACTUAL KICK IS PERFORMED
```

### Task List

| ID | Task | File | Description | Est. LOC |
|----|------|------|-------------|----------|
| P3.1 | Implement player kick mechanism | `InputSystem.ts:167` | Kick after 5+ violations | ~25 |
| P3.2 | Add ban persistence | GameRoom.ts | Store banned IPs/sessionIds | ~40 |
| P3.3 | WebSocket URL validation | NetworkClient.ts | Prevent arbitrary connections | ~15 |
| P3.4 | Client-side rate limiting | NetworkClient.ts | Max 60 inputs/sec | ~20 |

### Required Implementation

```typescript
// InputSystem.ts - Add kick callback
constructor(private onKickPlayer?: (playerId: string, reason: string) => void) {}

// In rate limit check:
if (playerRate.violations >= this.MAX_VIOLATIONS_BEFORE_KICK) {
  if (this.onKickPlayer) {
    this.onKickPlayer(playerId, 'rate_limit_exceeded');
  }
}

// GameRoom.ts - Wire up kick
this.inputSystem = new InputSystem((playerId, reason) => {
  const client = this.clients.find(c => c.sessionId === playerId);
  if (client) {
    client.leave(4000); // Custom close code
    console.log(`[Security] Kicked player ${playerId}: ${reason}`);
  }
});
```

---

## P4: PHASE 6 - POLISH & OPTIMIZATION (POST-MVP)

**Status:** 0/17 tasks complete
**Priority:** LOW - After MVP is functional

### 6.1 Visual Effects

| Task | Description | Complexity | Est. LOC |
|------|-------------|------------|----------|
| Weapon impact particles | Three.js Points for hit effects | Medium | ~80 |
| XP collection sparkle | Brief particle burst on pickup | Low | ~40 |
| Damage numbers | Floating text popups | Medium | ~100 |
| Death explosion | Enemy death visual | Low | ~50 |
| Level up flash | Screen flash on level up | Low | ~20 |

### 6.2 Audio System

| Task | Description | Complexity | Est. LOC |
|------|-------------|------------|----------|
| Audio system setup | Web Audio API context, volume control | Low | ~60 |
| Weapon sounds | Per-weapon attack sounds (8 weapons) | Low | ~40 |
| Pickup sounds | XP/item collection sounds | Low | ~20 |
| Level up jingle | Victory/celebration sound | Low | ~10 |
| Background music | Looping ambient track | Low | ~30 |
| Death sound | Player death audio feedback | Low | ~10 |

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
| STUB-001 | Lightning weapon stub | `WeaponSystem.ts:280-283` | Medium | Open |
| STUB-002 | Axe weapon stub | `WeaponSystem.ts:285-288` | Medium | Open |
| STUB-003 | Fireball weapon stub | `WeaponSystem.ts:290-293` | Medium | Open |
| STUB-004 | Whip weapon stub | `WeaponSystem.ts:295-298` | Medium | Open |
| SEC-001 | Player kick not enforced | `InputSystem.ts:167-173` | Low | Open |
| UI-001 | showDeathScreen is stub | `Renderer.ts:273-276` | Medium | Open |
| UI-002 | showUpgradeUI is stub | `Renderer.ts:278-281` | Medium | Open |
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
- [ ] **XP System** - XP collection works, level-up UI needs HUD implementation
- [ ] **Death/Respawn** - Death screen needs HUD implementation
- [x] **Multiplayer** - See other players moving

### Post-MVP Enhancements

- [ ] All 8 weapons functional
- [ ] Full HUD implementation
- [ ] Audio system
- [ ] Visual effects
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
