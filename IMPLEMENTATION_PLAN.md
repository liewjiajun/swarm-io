# SWARM.IO Implementation Plan

## Current Status: 0% Complete - Production-Ready Roadmap

**Last Updated:** 2026-01-12
**Implementation Progress:** 0/85 tasks completed
**Verified State:** All source directories empty, no configuration files exist
**Specification Quality:** EXCELLENT - 4,151 lines of detailed specs with ~95% copy-paste-ready code
**Target:** Secure, Playable MVP

---

## EXECUTIVE SUMMARY

### What We're Building
A multiplayer browser-based survivor game (Vampire Survivors-style) with:
- Real-time multiplayer via WebSocket (Colyseus)
- Server-authoritative game logic
- Three.js 2.5D rendering with InstancedMesh for performance
- Progressive difficulty with wave-based enemy spawning
- 8 weapon types, 9 enemy types including bosses
- XP/leveling system with upgrade choices

### Critical Path to MVP
```
Foundation (2-3h) --> Server Core (4-5h) --> Client Core (3-4h) --> Integration (2-3h) --> MVP (12-15h total)
                          |                      |
                          v                      v
                    Can run parallel after Foundation complete
```

### Success Criteria for MVP
1. Player connects and spawns in world
2. WASD movement with visual feedback
3. Auto-attacking weapons (knife minimum)
4. Enemies spawn and chase player
5. XP collection and level-up UI
6. Death and respawn cycle
7. Multiplayer: see other players

---

## CRITICAL SECURITY & ARCHITECTURE ANALYSIS

> **⚠️ SECURITY WARNING**: Multiple critical vulnerabilities identified that MUST be addressed before MVP

### Security Assessment: **D (Poor - Critical Issues)**

#### **Critical Vulnerabilities Requiring Immediate Fix**

| Vulnerability | Risk Level | Impact | Required Fix |
|---------------|------------|--------|--------------|
| **Client Input Manipulation** | **CRITICAL** | Players can teleport/speed hack | Server-side input validation (dx/dy ∈ [-1,1]) |
| **State Injection** | **CRITICAL** | Clients can inject invalid damage values | Damage bounds checking on server |
| **DoS via Message Spam** | **CRITICAL** | Server crash from message flood | Rate limiting (max 30 inputs/sec) |
| **Session Hijacking** | **HIGH** | Account takeover possible | Secure session tokens + validation |
| **No Authentication** | **HIGH** | Anyone can join/spam | Basic player validation |

#### **Security Implementation Requirements**
```typescript
// REQUIRED: Input validation pattern
if (Math.abs(input.dx) > 1 || Math.abs(input.dy) > 1) {
  console.warn(`Invalid input from ${playerId}`);
  return; // Reject malicious input
}

// REQUIRED: Rate limiting pattern
if (this.inputCounts.get(playerId) > 30) {
  this.kickPlayer(playerId, 'Rate limit exceeded');
}
```

### Architecture Quality: **B+ (Good with concerns)**

#### **Performance Bottlenecks Identified**
- **Spatial Hash Rebuilding**: O(n) operation every frame (60Hz) - use dirty flagging
- **InstancedMesh Updates**: All matrices updated regardless of movement - use frustum culling
- **Full State Serialization**: Deep copying every network update - implement object pooling

#### **Scaling Limits**
| Component | Current Limit | Bottleneck | Solution |
|-----------|---------------|------------|----------|
| Players per room | ~50 | Network bandwidth | Interest management |
| Total enemies | ~2,500 | Spatial hash performance | Hierarchical culling |
| Active projectiles | ~1,000 | GPU matrix uploads | Frustum culling |

#### **Missing Production Features**
- ❌ No persistence layer (all progress lost on server restart)
- ❌ No error boundaries (single points of failure)
- ❌ No graceful degradation on network issues
- ❌ No monitoring/logging for production debugging
- ❌ No load balancing strategy for scaling

### Implementation Priority Changes

Due to security concerns, the implementation order is adjusted:

1. **Phase 1**: Foundation + **Input Validation** (add security from start)
2. **Phase 2**: Server Core + **Rate Limiting** (prevent DoS)
3. **Phase 3**: Client Core + **Error Boundaries** (handle failures gracefully)
4. **Phase 4**: Networking + **Session Security** (secure connections)
5. **Phase 5**: UI/UX + **Error Display** (user-friendly error handling)
6. **Phase 6**: Polish + **Production Hardening** (monitoring, persistence)

---

## PHASE 0: QUICK START (First 30 Minutes)

> **CRITICAL**: Execute these steps to unblock all other work.

### Immediate Actions

**Step 1: Create Root Configuration (10 min)**
```bash
# Create package.json from specs/01-project-setup.md lines 49-75
# Create tsconfig.base.json from specs/01-project-setup.md lines 154-169
```

**Step 2: Create Package Structures (15 min)**
```bash
mkdir -p src/shared/src src/server/src/rooms src/server/src/state src/server/src/systems src/client/src/game src/client/src/network src/client/src/ui
# Copy package.json files from specs/01-project-setup.md
```

**Step 3: Install and Verify (5 min)**
```bash
npm install
npm run typecheck
```

---

## PHASE 1: FOUNDATION [BLOCKING]

**Status:** 0/14 tasks complete
**Priority:** CRITICAL - All other phases blocked until complete
**Estimated Time:** 2-3 hours
**Risk Level:** LOW (all configuration, copy-paste from specs)

### 1.1 Root Project Configuration

| ID | Task | File | Spec Reference | Acceptance Criteria | Est. |
|----|------|------|----------------|---------------------|------|
| 1.1.1 | Create root package.json with workspaces | `/package.json` | 01-project-setup.md:49-75 | `npm install` runs | 5m |
| 1.1.2 | Create shared TypeScript config | `/tsconfig.base.json` | 01-project-setup.md:154-169 | Referenced by children | 5m |

### 1.2 Shared Package

| ID | Task | File | Spec Reference | Acceptance Criteria | Est. |
|----|------|------|----------------|---------------------|------|
| 1.2.1 | Create shared package.json | `/src/shared/package.json` | 01-project-setup.md:134-148 | Named `@swarm-io/shared` | 3m |
| 1.2.2 | Create shared tsconfig.json | `/src/shared/tsconfig.json` | Derive from base | Extends base config | 3m |
| 1.2.3 | Create types.ts | `/src/shared/src/types.ts` | 02-shared-types.md:8-246 | All interfaces compile | 10m |
| 1.2.4 | Create constants.ts | `/src/shared/src/constants.ts` | 02-shared-types.md:251-539 | All constants exported | 10m |
| 1.2.5 | Create utils.ts | `/src/shared/src/utils.ts` | 02-shared-types.md:544-618 | Vector math works | 5m |
| 1.2.6 | Create index.ts barrel | `/src/shared/src/index.ts` | 02-shared-types.md:287-291 | Re-exports all | 2m |

### 1.3 Server Package Structure

| ID | Task | File | Spec Reference | Acceptance Criteria | Est. |
|----|------|------|----------------|---------------------|------|
| 1.3.1 | Create server package.json | `/src/server/package.json` | 01-project-setup.md:105-129 | Has Colyseus deps | 3m |
| 1.3.2 | Create server tsconfig.json | `/src/server/tsconfig.json` | 01-project-setup.md:186-197 | References shared | 3m |

### 1.4 Client Package Structure

| ID | Task | File | Spec Reference | Acceptance Criteria | Est. |
|----|------|------|----------------|---------------------|------|
| 1.4.1 | Create client package.json | `/src/client/package.json` | 01-project-setup.md:78-100 | Has three.js, colyseus.js | 3m |
| 1.4.2 | Create client tsconfig.json | `/src/client/tsconfig.json` | 01-project-setup.md:172-183 | Has DOM lib | 3m |
| 1.4.3 | Create vite.config.ts | `/src/client/vite.config.ts` | 01-project-setup.md:202-220 | Proxy to :2567 | 5m |
| 1.4.4 | Create index.html | `/src/client/index.html` | 01-project-setup.md:225-245 | Canvas + UI div | 5m |

### Phase 1 Validation Checkpoint

```bash
# All these must pass before proceeding to Phase 2/3
npm install           # No errors, node_modules created
npm run typecheck     # 0 TypeScript errors
```

### Phase 1 Security Considerations

- [ ] Verify no secrets in package.json
- [ ] Ensure .gitignore covers node_modules, .env, dist
- [ ] Validate all dependencies have no known vulnerabilities: `npm audit`

---

## PHASE 2: SERVER CORE [HIGH PRIORITY]

**Status:** 0/24 tasks complete
**Priority:** HIGH
**Dependencies:** Phase 1 complete
**Estimated Time:** 4-5 hours
**Risk Level:** MEDIUM (Colyseus schema patterns critical)
**Can Run Parallel With:** Phase 3 (Client Core)

### 2.1 State Schemas (Colyseus) - DEPENDENCY ORDER CRITICAL

> **WARNING**: Create schemas in this exact order due to type references.

| ID | Task | File | Spec Reference | LOC | Risk | Acceptance Criteria |
|----|------|------|----------------|-----|------|---------------------|
| 2.1.1 | WorldSchema | `/src/server/src/state/WorldSchema.ts` | 04-server-state.md:384-407 | ~25 | Low | recalculateSize works |
| 2.1.2 | WeaponSchema | `/src/server/src/state/WeaponSchema.ts` | 04-server-state.md:250-259 | ~15 | Low | @type decorators correct |
| 2.1.3 | XPOrbSchema | `/src/server/src/state/XPOrbSchema.ts` | 04-server-state.md:365-381 | ~20 | Low | collected flag (not synced) |
| 2.1.4 | ProjectileSchema | `/src/server/src/state/ProjectileSchema.ts` | 04-server-state.md:332-362 | ~35 | Med | hitEnemies Set works |
| 2.1.5 | EnemySchema | `/src/server/src/state/EnemySchema.ts` | 04-server-state.md:264-329 | ~70 | Med | initialize() sets stats |
| 2.1.6 | PlayerSchema | `/src/server/src/state/PlayerSchema.ts` | 04-server-state.md:120-247 | ~130 | High | All methods work |
| 2.1.7 | GameState | `/src/server/src/state/GameState.ts` | 04-server-state.md:6-117 | ~120 | High | Factory methods work |
| 2.1.8 | State index.ts | `/src/server/src/state/index.ts` | Barrel export | ~10 | Low | Clean re-exports |

**Schema Validation Pattern:**
```typescript
// After each schema, verify sync works:
console.log(JSON.stringify(schema.toJSON())); // Should show all @type properties
```

### 2.2 Core Systems

| ID | Task | File | Spec Reference | LOC | Risk | Acceptance Criteria |
|----|------|------|----------------|-----|------|---------------------|
| 2.2.1 | SpatialHash | `/src/server/src/systems/SpatialHash.ts` | 03-server-gameloop.md:238-322 | ~85 | Low | queryRadius returns entities |
| 2.2.2 | InputSystem + Security | `/src/server/src/systems/InputSystem.ts` | 03-server-gameloop.md:325-352 | ~30 | **HIGH** | ⚠️ **INCLUDES INPUT VALIDATION** |
| 2.2.3 | PhysicsSystem | `/src/server/src/systems/PhysicsSystem.ts` | 03-server-gameloop.md:355-442 | ~90 | Med | Enemy AI, projectile movement |
| 2.2.4 | Systems index.ts | `/src/server/src/systems/index.ts` | Barrel export | ~15 | Low | Clean re-exports |

### 2.2.5 Critical Security Implementation (InputSystem)

**MANDATORY**: Add this validation to InputSystem.processInput():

```typescript
// Input validation - CRITICAL for security
if (!input || typeof input.dx !== 'number' || typeof input.dy !== 'number') {
  console.warn(`Invalid input type from ${playerId}`);
  return false;
}

if (Math.abs(input.dx) > 1 || Math.abs(input.dy) > 1) {
  console.warn(`Input out of bounds from ${playerId}:`, input);
  return false;
}

if (!Number.isFinite(input.dx) || !Number.isFinite(input.dy)) {
  console.warn(`Non-finite input from ${playerId}:`, input);
  return false;
}

// Rate limiting - CRITICAL for DoS prevention
const now = Date.now();
const playerInputs = this.inputCounts.get(playerId) || { count: 0, resetTime: now };

if (now > playerInputs.resetTime) {
  playerInputs.count = 0;
  playerInputs.resetTime = now + 1000; // Reset every second
}

playerInputs.count++;
if (playerInputs.count > 30) { // Max 30 inputs per second
  console.warn(`Rate limit exceeded for ${playerId}`);
  // TODO: Implement player kick/ban mechanism
  return false;
}

this.inputCounts.set(playerId, playerInputs);
```

### 2.3 Game Systems - IMPLEMENT INCREMENTALLY

> **RISK MITIGATION**: WeaponSystem is highest complexity. Implement one weapon at a time.

| ID | Task | File | Spec Reference | LOC | Risk | Acceptance Criteria |
|----|------|------|----------------|-----|------|---------------------|
| 2.3.1 | SpawnSystem | `/src/server/src/systems/SpawnSystem.ts` | 06-spawning.md:8-144 | ~145 | Med | Enemies spawn at edge |
| 2.3.2 | WeaponSystem (knife only) | `/src/server/src/systems/WeaponSystem.ts` | 05-weapon-combat.md:8-105 | ~100 | Med | Knife fires correctly |
| 2.3.3 | WeaponSystem (wand) | Update WeaponSystem.ts | 05-weapon-combat.md:107-148 | +50 | Med | Wand targets enemies |
| 2.3.4 | WeaponSystem (garlic) | Update WeaponSystem.ts | 05-weapon-combat.md:187-199 | +20 | Low | AOE damage works |
| 2.3.5 | WeaponSystem (bible) | Update WeaponSystem.ts | 05-weapon-combat.md:150-185 | +40 | High | Orbit mechanic works |
| 2.3.6 | WeaponSystem (remaining 4) | Update WeaponSystem.ts | 05-weapon-combat.md:201-323 | +100 | Med | All 8 weapons fire |
| 2.3.7 | CombatSystem + Security | `/src/server/src/systems/CombatSystem.ts` | 05-weapon-combat.md:327-493 | ~170 | **HIGH** | ⚠️ **INCLUDES DAMAGE VALIDATION** |
| 2.3.8 | XPSystem | `/src/server/src/systems/XPSystem.ts` | 05-weapon-combat.md:496-686 | ~190 | Med | XP collection, leveling |

### 2.3.9 Critical Security Implementation (CombatSystem)

**MANDATORY**: Add this validation to CombatSystem damage calculations:

```typescript
// Damage validation - CRITICAL for security
private validateDamage(damage: number, weaponType: string, weaponLevel: number): number {
  if (!Number.isFinite(damage) || damage < 0) {
    console.warn(`Invalid damage value: ${damage}`);
    return 0;
  }

  // Max damage bounds by weapon type and level
  const maxDamage = WEAPON_CONFIGS[weaponType].damage * (1 + (weaponLevel - 1) * 0.1) * 5; // 5x safety margin
  if (damage > maxDamage) {
    console.warn(`Damage exceeds bounds for ${weaponType} level ${weaponLevel}: ${damage} > ${maxDamage}`);
    return Math.min(damage, maxDamage);
  }

  return damage;
}

// Apply in collision handling:
const validatedDamage = this.validateDamage(projectile.damage, projectile.weaponType, projectile.weaponLevel);
enemy.health -= validatedDamage;
```

### 2.4 Specification Gap Fixes

| ID | Task | File | Gap Description | Acceptance Criteria |
|----|------|------|-----------------|---------------------|
| 2.4.1 | Bible orbit physics | Update PhysicsSystem.ts | Bible projectiles need position update to orbit at 2 rad/s | Bibles rotate around player |
| 2.4.2 | Slime split mechanic | Update GameRoom cleanup | Slimes spawn 2 mini-slimes on death | Mini-slimes appear |
| 2.4.3 | Ghost phasing | Update PhysicsSystem.ts | Ghosts skip enemy-enemy collision | Ghosts pass through |
| 2.4.4 | Add mini_slime config | Update constants.ts | mini_slime enemy type needed | Type compiles |

### 2.5 Server Entry Point

| ID | Task | File | Spec Reference | LOC | Acceptance Criteria |
|----|------|------|----------------|-----|---------------------|
| 2.5.1 | GameRoom | `/src/server/src/rooms/GameRoom.ts` | 03-server-gameloop.md:32-235 | ~235 | Room handles lifecycle |
| 2.5.2 | Server index.ts | `/src/server/src/index.ts` | 01-project-setup.md:257-284 | ~30 | Server starts |

### Phase 2 Validation Checkpoint

```bash
npm run dev:server
# Server should start on :2567
# Visit http://localhost:2567/colyseus - should show monitor
# GameRoom should appear in room list
```

### Phase 2 Security Considerations

- [ ] Input validation: sanitize dx/dy to [-1, 1] range
- [ ] Rate limiting: max 10 inputs buffered per player
- [ ] Session validation: verify client.sessionId matches player
- [ ] No eval() or dynamic code execution
- [ ] World boundary enforcement prevents out-of-bounds exploits

### Phase 2 Risk Mitigation

**WeaponSystem Complexity (320 LOC, 8 weapons)**
```
IMPLEMENTATION ORDER:
1. Knife only (simplest) -> Test damage works
2. Wand (adds targeting) -> Test projectiles travel
3. Garlic (adds AOE) -> Test area damage
4. Bible (orbit mechanic) -> Test rotation works
5. Remaining weapons one at a time
```

**Colyseus Schema Checklist (run before each schema):**
- [ ] All synced properties have @type decorator
- [ ] Nested schemas have correct type reference
- [ ] Arrays use `@type([SchemaClass])`
- [ ] Maps use `@type({ map: SchemaClass })`
- [ ] Non-synced properties have NO decorator

---

## PHASE 3: CLIENT CORE [HIGH PRIORITY]

**Status:** 0/12 tasks complete
**Priority:** HIGH
**Dependencies:** Phase 1 complete
**Estimated Time:** 3-4 hours
**Risk Level:** MEDIUM (InstancedMesh patterns critical)
**Can Run Parallel With:** Phase 2 (Server Core)

### 3.1 Three.js Rendering

| ID | Task | File | Spec Reference | LOC | Risk | Acceptance Criteria |
|----|------|------|----------------|-----|------|---------------------|
| 3.1.1 | Renderer base + scene setup | `/src/client/src/game/Renderer.ts` | 07-client-renderer.md:136-254 | ~120 | Med | Scene renders |
| 3.1.2 | Entity pools (InstancedMesh) | Update Renderer.ts | 07-client-renderer.md:213-244 | +50 | High | Pools created correctly |
| 3.1.3 | Player rendering | Update Renderer.ts | 07-client-renderer.md:287-332 | +50 | Med | Players visible |
| 3.1.4 | Enemy rendering | Update Renderer.ts | 07-client-renderer.md:334-367 | +40 | Med | Enemies visible |
| 3.1.5 | Projectile + XP rendering | Update Renderer.ts | 07-client-renderer.md:369-402 | +40 | Low | Both render |

### 3.2 Input & Interpolation

| ID | Task | File | Spec Reference | LOC | Risk | Acceptance Criteria |
|----|------|------|----------------|-----|------|---------------------|
| 3.2.1 | InputManager | `/src/client/src/game/InputManager.ts` | 07-client-renderer.md:426-508 | ~85 | Low | WASD captured |
| 3.2.2 | Interpolator base | `/src/client/src/game/Interpolator.ts` | 07-client-renderer.md:511-653 | ~145 | Med | State snapshots stored |
| 3.2.3 | Entity interpolation | Update Interpolator.ts | 07-client-renderer.md:565-631 | Included | Med | Smooth positions |

### 3.3 Game Orchestration

| ID | Task | File | Spec Reference | LOC | Acceptance Criteria |
|----|------|------|----------------|-----|---------------------|
| 3.3.1 | Game class | `/src/client/src/game/Game.ts` | 07-client-renderer.md:31-133 | ~105 | Game loop runs |
| 3.3.2 | Client main.ts | `/src/client/src/main.ts` | 01-project-setup.md:248-254 | ~6 | Entry point works |
| 3.3.3 | Game index.ts | `/src/client/src/game/index.ts` | Barrel export | ~10 | Clean exports |

### Phase 3 Validation Checkpoint

```bash
npm run dev:client
# Visit http://localhost:5173
# Should see Three.js scene with ground plane and grid
# No console errors
```

### Phase 3 Risk Mitigation

**InstancedMesh Critical Pattern:**
```typescript
// CORRECT ORDER - prevents flicker
mesh.count = entities.length;  // SET COUNT FIRST
entities.forEach((entity, index) => {
  dummy.position.set(entity.x, 0, entity.y);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
});
mesh.instanceMatrix.needsUpdate = true;  // REQUIRED
```

**Client-Side Prediction Strategy:**
```
1. Start WITHOUT prediction (server-only positions)
2. Confirm smooth interpolation works
3. Add simple prediction (apply input locally)
4. Add reconciliation (re-apply pending inputs)
5. Tune interpolation delay (start at 100ms)

FALLBACK: If too complex, ship with interpolation only (playable, slightly laggy)
```

---

## PHASE 4: NETWORKING INTEGRATION [CRITICAL]

**Status:** 0/8 tasks complete
**Priority:** CRITICAL
**Dependencies:** Phase 2 AND Phase 3 complete
**Estimated Time:** 2-3 hours
**Risk Level:** HIGH (client-server sync critical)

### 4.1 Network Client

| ID | Task | File | Spec Reference | LOC | Risk | Acceptance Criteria |
|----|------|------|----------------|-----|------|---------------------|
| 4.1.1 | NetworkClient base | `/src/client/src/network/NetworkClient.ts` | 08-client-networking.md:8-145 | ~140 | Med | Connects to server |
| 4.1.2 | State serialization | Update NetworkClient.ts | 08-client-networking.md:64-144 | +80 | Med | State converted correctly |
| 4.1.3 | Message handlers | Update NetworkClient.ts | 08-client-networking.md:52-62 | +15 | Low | Messages received |
| 4.1.4 | Network index.ts | `/src/client/src/network/index.ts` | Barrel export | ~5 | Low | Clean exports |

### 4.2 Specification Gap Fixes (Networking)

| ID | Task | File | Gap Description | Acceptance Criteria |
|----|------|------|-----------------|---------------------|
| 4.2.1 | Reconnection logic | Update NetworkClient.ts | Add exponential backoff (1s, 2s, 4s, 8s, max 30s) | Auto-reconnects on disconnect |
| 4.2.2 | Session persistence | Update NetworkClient.ts | Store sessionId in localStorage for rejoin | Reconnection preserves progress |
| 4.2.3 | Connection error handling | Update NetworkClient.ts | Try/catch, error modal, retry button | User sees connection status |

### 4.3 Integration

| ID | Task | File | Description | Acceptance Criteria |
|----|------|------|-------------|---------------------|
| 4.3.1 | Integrate NetworkClient with Game | Update Game.ts | Wire up state/message handlers | State flows to renderer |

### Phase 4 Validation Checkpoint

```bash
# Start both server and client
npm run dev

# Test 1: Single player
# - Open http://localhost:5173
# - Player should appear and move with WASD
# - Enemies should spawn and chase

# Test 2: Multiplayer
# - Open second browser tab
# - Both players should be visible in each tab
# - Movement syncs between tabs
```

### Phase 4 Security Considerations

- [ ] WebSocket URL validation (no arbitrary URLs)
- [ ] Message type validation before processing
- [ ] Input sequence validation (prevent replay attacks)
- [ ] Rate limit outgoing messages (max 60/sec)
- [ ] Sanitize all received data before use

### Reconnection Logic Implementation

```typescript
private reconnectAttempts = 0;
private maxReconnectAttempts = 5;
private reconnectDelays = [1000, 2000, 4000, 8000, 30000];

async connect(): Promise<void> {
  try {
    const storedSession = localStorage.getItem('swarm_session');
    if (storedSession) {
      try {
        this.room = await this.client.reconnect(storedSession);
      } catch {
        this.room = await this.client.joinOrCreate('game');
      }
    } else {
      this.room = await this.client.joinOrCreate('game');
    }
    localStorage.setItem('swarm_session', this.room.reconnectionToken);
    this.reconnectAttempts = 0;
  } catch (error) {
    await this.handleReconnect();
  }
}

private async handleReconnect() {
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    // Show error UI
    return;
  }
  const delay = this.reconnectDelays[
    Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1)
  ];
  this.reconnectAttempts++;
  await new Promise(resolve => setTimeout(resolve, delay));
  await this.connect();
}
```

---

## PHASE 5: UI/UX [MEDIUM PRIORITY]

**Status:** 0/10 tasks complete
**Priority:** MEDIUM
**Dependencies:** Phase 4 complete
**Estimated Time:** 2-3 hours
**Risk Level:** LOW

### 5.1 HUD Components

| ID | Task | File | Spec Reference | Component | Acceptance Criteria |
|----|------|------|----------------|-----------|---------------------|
| 5.1.1 | HUD base + styles | `/src/client/src/ui/HUD.ts` | 09-ui-hud.md:28-340 | Core structure | HUD renders |
| 5.1.2 | Health/XP bars | Update HUD.ts | 09-ui-hud.md:355-367 | Status bars | Bars update correctly |
| 5.1.3 | Weapon display | Update HUD.ts | 09-ui-hud.md:381-399 | Weapon icons | Shows equipped weapons |
| 5.1.4 | Leaderboard | Update HUD.ts | 09-ui-hud.md:401-416 | Top 5 players | Sorts by survival time |
| 5.1.5 | Minimap | Update HUD.ts | 09-ui-hud.md:427-461 | Position canvas | Shows player positions |
| 5.1.6 | Game info | Update HUD.ts | 09-ui-hud.md:419-424 | Time/Wave/Players | Updates in real-time |

### 5.2 Modal UI

| ID | Task | File | Spec Reference | Acceptance Criteria |
|----|------|------|----------------|---------------------|
| 5.2.1 | Upgrade selection UI | Update HUD.ts | 09-ui-hud.md:469-490 | Choices clickable, sends to server |
| 5.2.2 | Death screen | Update HUD.ts | 09-ui-hud.md:497-519 | Shows stats, respawn works |
| 5.2.3 | UI index.ts | `/src/client/src/ui/index.ts` | Barrel export | Clean exports |

### 5.3 Specification Gap Fixes (UI)

| ID | Task | File | Gap Description | Acceptance Criteria |
|----|------|------|-----------------|---------------------|
| 5.3.1 | Loading screen | Update HUD.ts | CSS overlay during connection | Shows "Connecting..." initially |

### Loading Screen Implementation

```html
<div class="loading-screen">
  <div class="loading-title">SWARM.IO</div>
  <div class="loading-spinner"></div>
  <div class="loading-text">Connecting...</div>
</div>
```

```css
.loading-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.loading-screen.hidden { display: none; }
.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255,255,255,0.3);
  border-top-color: #4ecdc4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

### Phase 5 Validation Checkpoint

```bash
# Full game loop test:
1. Connect - Loading screen shows, then hides
2. Play - HUD shows health, XP, weapons
3. Kill enemies - XP bar fills
4. Level up - Upgrade modal appears
5. Select upgrade - Modal closes, weapon added
6. Die - Death screen shows stats
7. Respawn - Game resets, playing again
```

---

## PHASE 6: POLISH & OPTIMIZATION [LOW PRIORITY]

**Status:** 0/17 tasks complete
**Priority:** LOW
**Dependencies:** Phase 5 complete
**Estimated Time:** 4-6 hours
**Risk Level:** LOW-MEDIUM

### 6.1 Visual Effects

| ID | Task | Description | Complexity |
|----|------|-------------|------------|
| 6.1.1 | Weapon impact particles | Three.js Points for hit effects | Medium |
| 6.1.2 | XP collection sparkle | Brief particle burst | Low |
| 6.1.3 | Damage numbers | Floating text popups | Medium |
| 6.1.4 | Death explosion | Enemy death visual | Low |

### 6.2 Audio

| ID | Task | Description | Complexity |
|----|------|-------------|------------|
| 6.2.1 | Audio system setup | Web Audio API context | Low |
| 6.2.2 | Weapon sounds | Per-weapon attack sounds | Low |
| 6.2.3 | Pickup sounds | XP/item collection | Low |
| 6.2.4 | Level up jingle | Victory sound | Low |
| 6.2.5 | Background music | Looping ambient track | Low |

### 6.3 Performance Optimizations

| ID | Task | Description | Complexity | Impact |
|----|------|-------------|------------|--------|
| 6.3.1 | Frustum culling | Don't render off-screen entities | Medium | High |
| 6.3.2 | Interest management | Only sync entities within radius | High | High |
| 6.3.3 | Object pooling | Reuse objects instead of GC | Medium | Medium |
| 6.3.4 | LOD for distant entities | Simpler geometry far away | Medium | Medium |

### 6.4 Quality of Life

| ID | Task | Description | Complexity |
|----|------|-------------|------------|
| 6.4.1 | Demon ranged attack | Demons fire projectiles | Medium |
| 6.4.2 | Boss unique abilities | Special boss mechanics | Medium |
| 6.4.3 | Mobile touch controls | Virtual joystick | Medium |
| 6.4.4 | Settings menu | Sound, controls options | Low |

---

## RISK ASSESSMENT & MITIGATION

### High Risk Items

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| WeaponSystem complexity | Combat broken | High | Implement one weapon at a time, test each |
| Client-side prediction jitter | Poor UX | Medium | Start simple, add reconciliation incrementally |
| Colyseus schema sync failures | Silent data loss | Medium | Follow spec patterns exactly, log toJSON() |
| InstancedMesh performance | Visual glitches | Medium | Set count before matrices, always needsUpdate |

### Medium Risk Items

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| npm workspace resolution | Build failures | Low | Match package names to import names exactly |
| Vite proxy WebSocket | Connection fails | Low | Use spec config, verify /colyseus proxy |
| Browser compatibility | Broken on Safari | Low | Test Three.js on multiple browsers |

### Security Risk Items

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Input injection | Server exploit | Low | Validate all input ranges, sanitize |
| State manipulation | Cheating | Medium | Server is authoritative, validate everything |
| DoS via message flood | Server crash | Low | Rate limit per-client messages |
| XSS via player names | Client exploit | Low | Sanitize all displayed strings |

---

## MILESTONES & VALIDATION

### Milestone 1: "It Compiles" (Hour 2)
- [ ] `npm install` succeeds
- [ ] `npm run typecheck` shows 0 errors
- **Deliverable:** Build system working

### Milestone 2: "Server Runs" (Hour 5)
- [ ] `npm run dev:server` starts without error
- [ ] http://localhost:2567/colyseus shows monitor
- [ ] GameRoom appears in room list
- **Deliverable:** Server accepting connections

### Milestone 3: "Client Renders" (Hour 6)
- [ ] `npm run dev:client` starts without error
- [ ] http://localhost:5173 shows Three.js scene
- [ ] Ground plane and grid visible
- **Deliverable:** Visual foundation working

### Milestone 4: "Connected" (Hour 8)
- [ ] Client connects to server
- [ ] Player appears in world
- [ ] Console shows "Connected to room: xxx"
- **Deliverable:** Network layer working

### Milestone 5: "Moving" (Hour 9)
- [ ] WASD moves player
- [ ] Other browser tabs show same player
- [ ] Camera follows player
- **Deliverable:** Basic multiplayer working

### Milestone 6: "Fighting" (Hour 11)
- [ ] Enemies spawn and chase player
- [ ] Knife auto-attacks enemies
- [ ] Enemies die and drop XP
- [ ] XP is collected
- **Deliverable:** Core gameplay loop

### Milestone 7: "MVP Complete" (Hour 14)
- [ ] Level up shows upgrade choices
- [ ] Death shows respawn screen
- [ ] Full game loop playable
- **Deliverable:** Minimum Viable Game

---

## RALPH LOOP TASK SIZING

Each Ralph Loop iteration has a 50-task limit. Tasks are sized accordingly:

### Loop 1: Foundation (Tasks 1.1.1 - 1.4.4)
14 tasks, all configuration and setup
**Goal:** `npm install && npm run typecheck` succeeds

### Loop 2: Server Schemas (Tasks 2.1.1 - 2.1.8)
8 tasks, Colyseus state schemas
**Goal:** All schemas compile, factory methods work

### Loop 3: Server Systems (Tasks 2.2.1 - 2.3.4)
8 tasks, core game systems
**Goal:** `npm run dev:server` starts, basic systems work

### Loop 4: Server Complete (Tasks 2.3.5 - 2.5.2)
10 tasks, remaining weapons and entry point
**Goal:** Full server running, all weapons fire

### Loop 5: Client Rendering (Tasks 3.1.1 - 3.3.3)
12 tasks, Three.js setup and game loop
**Goal:** `npm run dev:client` shows scene

### Loop 6: Networking (Tasks 4.1.1 - 4.3.1)
8 tasks, client-server integration
**Goal:** Multiplayer working in two tabs

### Loop 7: UI/UX (Tasks 5.1.1 - 5.3.1)
10 tasks, HUD and modals
**Goal:** Full game loop playable

### Loop 8-10: Polish (Phase 6 tasks)
17 tasks split across loops
**Goal:** Production-ready polish

---

## FILE CHECKLIST

### Configuration Files (10)
```
[ ] /package.json
[ ] /tsconfig.base.json
[ ] /src/shared/package.json
[ ] /src/shared/tsconfig.json
[ ] /src/server/package.json
[ ] /src/server/tsconfig.json
[ ] /src/client/package.json
[ ] /src/client/tsconfig.json
[ ] /src/client/vite.config.ts
[ ] /src/client/index.html
```

### Shared Package (4)
```
[ ] /src/shared/src/index.ts
[ ] /src/shared/src/types.ts
[ ] /src/shared/src/constants.ts
[ ] /src/shared/src/utils.ts
```

### Server Package (18)
```
[ ] /src/server/src/index.ts
[ ] /src/server/src/rooms/GameRoom.ts
[ ] /src/server/src/state/GameState.ts
[ ] /src/server/src/state/WorldSchema.ts
[ ] /src/server/src/state/PlayerSchema.ts
[ ] /src/server/src/state/WeaponSchema.ts
[ ] /src/server/src/state/EnemySchema.ts
[ ] /src/server/src/state/ProjectileSchema.ts
[ ] /src/server/src/state/XPOrbSchema.ts
[ ] /src/server/src/state/index.ts
[ ] /src/server/src/systems/SpatialHash.ts
[ ] /src/server/src/systems/InputSystem.ts
[ ] /src/server/src/systems/PhysicsSystem.ts
[ ] /src/server/src/systems/SpawnSystem.ts
[ ] /src/server/src/systems/WeaponSystem.ts
[ ] /src/server/src/systems/CombatSystem.ts
[ ] /src/server/src/systems/XPSystem.ts
[ ] /src/server/src/systems/index.ts
```

### Client Package (8)
```
[ ] /src/client/src/main.ts
[ ] /src/client/src/game/Game.ts
[ ] /src/client/src/game/Renderer.ts
[ ] /src/client/src/game/InputManager.ts
[ ] /src/client/src/game/Interpolator.ts
[ ] /src/client/src/game/index.ts
[ ] /src/client/src/network/NetworkClient.ts
[ ] /src/client/src/network/index.ts
[ ] /src/client/src/ui/HUD.ts
[ ] /src/client/src/ui/index.ts
```

**Total: 40 files to create**

---

## CRITICAL CODE PATTERNS

### Colyseus Schema Decorators
```typescript
import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export class ExampleSchema extends Schema {
  @type('string') id: string = '';
  @type('number') x: number = 0;
  @type([WeaponSchema]) weapons = new ArraySchema<WeaponSchema>();
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();

  // NOT synced - server only
  privateData: string = '';
}
```

### Three.js InstancedMesh
```typescript
// CRITICAL: Set count BEFORE updating matrices
mesh.count = entities.length;
entities.forEach((entity, index) => {
  dummy.position.set(entity.x, 0, entity.y);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
});
mesh.instanceMatrix.needsUpdate = true;
```

### ES Module Imports
```typescript
// CORRECT - use package name
import { GAME_CONSTANTS } from '@swarm-io/shared';

// WRONG - don't use relative paths across packages
import { GAME_CONSTANTS } from '../../shared/src/constants';
```

### Input Validation
```typescript
// Always validate client input
const dx = Math.max(-1, Math.min(1, input.dx));
const dy = Math.max(-1, Math.min(1, input.dy));
```

---

## COMMIT MESSAGE FORMAT

```
[Phase X.Y] Brief description

- What was implemented
- Any deviations from spec
- Tests/validation performed

Co-Authored-By: Claude Sonnet 4 <noreply@anthropic.com>
```

---

## CHANGELOG

| Date | Change |
|------|--------|
| 2026-01-12 | Complete rewrite with production-ready structure |
| 2026-01-12 | Added Ralph Loop task sizing (50-iteration limits) |
| 2026-01-12 | Added comprehensive security considerations |
| 2026-01-12 | Added specification gap fixes with code snippets |
| 2026-01-12 | Added risk mitigation strategies |
| 2026-01-12 | Added validation checkpoints per phase |
| 2026-01-12 | Restructured for parallel development (Phase 2/3) |
| 2026-01-12 | Total 85 tasks across 6 phases |

---

## COMPLETED ITEMS

_None - implementation not started_

---

## KNOWN ISSUES

_None - implementation not started_

---

## DEFERRED ITEMS (Post-MVP)

1. **Interest Management** - Only sync entities within radius (performance)
2. **Mobile Controls** - Virtual joystick for touch devices
3. **Audio System** - Sound effects and music
4. **Boss Unique Abilities** - Special boss mechanics
5. **Player Names** - Custom names with profanity filter
6. **Persistent Stats** - Save high scores
7. **Multiple Rooms** - Room browser for different games
