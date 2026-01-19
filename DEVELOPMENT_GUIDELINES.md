# SWARM.IO Development Guidelines

> **Read this file when implementing features to ensure compliance with project standards.**

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

## VERIFICATION CHECKLIST

Post-implementation testing criteria.

### Track 1 Verification (Foundation Fixes)
- [ ] Run game, confirm Garlic aura is VISIBLE around player
- [ ] Run game, confirm Wand projectiles are VISIBLE
- [ ] Walk in any direction, stop - character should maintain facing direction
- [x] Walk left, fire knife - knife should spawn from LEFT side of character - FIXED BUG-051 2026-01-19
- [ ] View weapon sprites - should match Game Boy Pokemon aesthetic
- [x] Hit enemy - screen should shake (subtle but noticeable) - IMPLEMENTED P9.7
- [x] Hit enemy - enemy should be pushed back slightly - IMPLEMENTED P9.8
- [x] Level up while moving, select upgrade - player should NOT teleport back to level-up position - FIXED BUG-050 2026-01-19
- [x] Confirm Bible orbs orbit smoothly in a circle around player - FIXED BUG-053 2026-01-19

### Track 2 Verification (Core Redesign)
- [ ] Die - death screen shows personal best score
- [ ] Beat personal best - "NEW RECORD" animation appears
- [ ] Reload browser - personal best persists (localStorage)
- [x] Play 5-minute session - verify power spike at minute 2-3 (level 6-8) - IMPLEMENTED P9.5
- [x] Spawn - verify 2-3 random starting weapons assigned - IMPLEMENTED P9.6
- [x] Check leaderboard - shows all-time top 100 (server-side) - IMPLEMENTED P9.2
- [x] Death screen displays all-time top 10 - IMPLEMENTED P9.2
- [x] Player's all-time rank shown on leaderboard - IMPLEMENTED P9.2
- [x] Max out a weapon - verify evolution triggers - IMPLEMENTED P9.4

---

## SESSION TIMING TARGETS

| Minute | Expected Level | Weapons |
|--------|---------------|---------|
| 1 | 3-4 | 3-4 (started with 2-3) |
| 2 | 5-6 | 4-5 |
| 3 | 7-8 | 5-6 (first evolution possible) |
| 4 | 9-10 | 6-7 |
| 5 | 10-12 | 7-8 (multiple evolutions) |

---

## CODE QUALITY STANDARDS

| Metric | Value | Notes |
|--------|-------|-------|
| TODO Comments | 0 | Clean codebase |
| FIXME Comments | 0 | No known issues ignored |
| HACK Comments | 0 | No workarounds |
| Skipped Tests | 0 | All tests running (.skip/.only not found) |
| Empty Functions | 1 | Intentional: settings callback in Game.ts (handled by HUD) |
| Passing Tests | 1049 | 100% pass rate (555 server + 121 shared + 373 client) |
| Non-null Assertions | 0 | Uses optional chaining instead |
| Production console.log | 0 | All logging via structured logger |
| Console.warn Usage | 4 instances | Should use structured logger (see below) |

---

## MINOR SPEC VARIANCES (Intentional)

- PlayerState uses `facingX/facingY` numbers instead of `facing: Vector2` object (Colyseus compatibility)
- Some types use `string` instead of strict unions (Colyseus serialization)
- Knife projectile max: 5 (spec: 4) - Better early-game feel
- Wand projectile scaling: `1 + floor((level-1)/2)` (spec: `1 + floor(level/4)`) - Faster progression
- Wand piercing: scales with level (spec: fixed at 1) - More satisfying progression
- WAVE_SCHEDULE format: Object notation instead of array (simpler, functionally equivalent)
- SERVER_TICK_RATE: 16ms instead of 60Hz (same value, more precise)
- ProjectileState: hitEnemies tracked server-side only (bandwidth optimization)
- Leaderboard: Shows top 10 by score (spec: top 5 by survival time) - Enhancement

---

## CONSOLE.WARN MIGRATION

The following 4 locations use `console.warn` instead of the structured logger:

| File | Line | Context | Message |
|------|------|---------|---------|
| InputSystem.ts | 186 | Kicking player | `[SECURITY] Kicking player ${playerId}: ${reason}` |
| InputSystem.ts | 341-344 | Security violation | `[SECURITY] ${timestamp} Player ${playerId}: ${reason}` |
| AnimationController.ts | 257 | Missing entity type | `[AnimationController] No animations for entity type "${entityType}"` |
| AnimationController.ts | 262 | Missing animation | `[AnimationController] Animation "${animationName}" not found for "${entityType}"` |

**Available Loggers:**
- Server: `securityLogger`, `inputSystemLogger` (from `src/server/src/utils/logger.ts`)
- Client: `animationLogger` already imported in AnimationController.ts line 3

---

## ASSET SOURCING POLICY

> **THE USER WILL NOT SOURCE OR CREATE ANY ASSETS.** All visual sprites, audio files, and other assets must be sourced or created by Claude during implementation. Claude will:
> - Search OpenGameArt.org, Itch.io, Kenney.nl for free/CC0 assets
> - Use WebFetch to download suitable assets
> - Generate pixel art programmatically if needed
> - Create placeholder assets that can be improved later
>
> **Do not ask the user to find or create assets. This is Claude's responsibility.**

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

# Run tests with coverage
npm run test:coverage

# Generate sprites
npm run generate:sprites

# Load testing (150 players)
npm run test:load --players=150 --duration=120

# Memory leak testing
npm run test:memory --players=20 --duration=30
```

---

## ARCHITECTURE REFERENCE

```
src/
├── shared/src/
│   ├── types.ts         # 30+ TypeScript types/interfaces
│   ├── constants.ts     # WEAPON_CONFIGS, ENEMY_CONFIGS, GAME_CONSTANTS
│   └── utils.ts         # Vector math, distance, interpolation

├── server/src/
│   ├── state/           # Colyseus schemas (GameState, Player, Enemy, etc.)
│   ├── systems/         # SpatialHash, Input, Physics, Spawn, Weapon, Combat, XP, ObjectPool, WorldEvent, PowerUp
│   ├── services/        # TelemetryService, LeaderboardService
│   ├── rooms/           # GameRoom (60Hz game loop)
│   └── index.ts         # Express + Colyseus server

└── client/src/
    ├── game/            # Renderer, InputManager, Interpolator, TouchControls, Game, SpriteLoader, AnimationController
    ├── network/         # NetworkClient (Colyseus client, state sync)
    ├── audio/           # AudioManager (Web Audio API procedural synthesis)
    └── ui/              # HUD (health, XP, weapons, minimap, modals)
```

---

## TEST COVERAGE BY CATEGORY

| Category | Files | Tests | Status |
|----------|-------|------:|--------|
| HUD | 1 | 108 | Excellent |
| Renderer | 1 | 94 | Excellent |
| PhysicsSystem | 1 | 67 | Excellent |
| GameRoom | 1 | 70 | Excellent |
| NetworkClient | 1 | 67 | Excellent |
| WeaponSystem | 1 | 51 | Excellent |
| Integration Tests | 1 | 46 | Excellent |
| InputManager | 1 | 42 | Excellent |
| InputSystem | 1 | 41 | Excellent |
| XPSystem | 1 | 41 | Excellent |
| CombatSystem | 1 | 40 | Excellent |
| SpawnSystem | 1 | 35 | Good |
| PowerUpSystem | 1 | 34 | Good |
| Shared Utils | 1 | 33 | Good |
| LeaderboardService | 1 | 30 | Good |
| TelemetryService | 1 | 29 | Good |
| GameState | 1 | 27 | Good |
| SpatialHash | 1 | 18 | Good |
| ObjectPool | 1 | 17 | Good |
| WorldEventSystem | 1 | 14 | Good |
| Shared Constants | 1 | 88 | Excellent |

**Total: 1049 tests passing**
