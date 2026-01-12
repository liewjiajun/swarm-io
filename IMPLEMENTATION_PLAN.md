# SWARM.IO Implementation Plan

## Current Status: Project Setup Required

This document tracks implementation progress. Ralph will update this as work proceeds.

---

## Phase 1: Foundation (Priority: CRITICAL)

- [ ] **Project scaffolding** - Create package.json files, tsconfig files, and directory structure per spec 01
- [ ] **Shared types** - Implement all types, constants, and utilities in src/shared per spec 02
- [ ] **Basic server** - Set up Colyseus server with GameRoom per spec 03
- [ ] **State schemas** - Implement all Colyseus Schema classes per spec 04

## Phase 2: Server Systems (Priority: HIGH)

- [ ] **Spatial hash** - Implement spatial partitioning for efficient queries
- [ ] **Input system** - Process player inputs with validation
- [ ] **Physics system** - Enemy AI movement, projectile movement, world bounds
- [ ] **Weapon system** - All 8 weapon types with auto-fire per spec 05
- [ ] **Combat system** - Projectile/enemy collisions, PvP damage per spec 05
- [ ] **XP system** - Orb spawning, magnetization, collection, leveling per spec 05
- [ ] **Spawn system** - Wave-based enemy spawning per spec 06

## Phase 3: Client Core (Priority: HIGH)

- [ ] **Three.js setup** - Scene, camera, renderer, lighting per spec 07
- [ ] **Entity rendering** - InstancedMesh for enemies, projectiles, XP orbs per spec 07
- [ ] **Player rendering** - Sprites for players with invulnerability visual
- [ ] **Input manager** - WASD/Arrow key handling per spec 07
- [ ] **Interpolator** - State snapshot storage and interpolation per spec 07

## Phase 4: Networking (Priority: HIGH)

- [ ] **Network client** - Colyseus client connection per spec 08
- [ ] **State sync** - Convert Colyseus state to renderable format per spec 08
- [ ] **Client prediction** - Local player prediction and reconciliation per spec 07/08
- [ ] **Message handlers** - Death, level up, respawn messages per spec 08

## Phase 5: UI/UX (Priority: MEDIUM)

- [ ] **HUD** - Health, XP, level, weapons display per spec 09
- [ ] **Leaderboard** - Top survivors by time alive per spec 09
- [ ] **Minimap** - World overview with player positions per spec 09
- [ ] **Upgrade UI** - Level up choice modal per spec 09
- [ ] **Death screen** - Stats and respawn button per spec 09

## Phase 6: Polish (Priority: LOW)

- [ ] **Particle effects** - Weapon impacts, XP collection sparkles
- [ ] **Sound effects** - Attacks, pickups, level up, death
- [ ] **Visual feedback** - Damage numbers, screen shake
- [ ] **Performance optimization** - Culling, LOD, network optimization

---

## Known Issues

_None yet - project not started_

---

## Completed Items

_None yet - project not started_

---

## Notes for Ralph

1. Start with Phase 1 - nothing works without the foundation
2. Server and client must use shared types from src/shared
3. Always use InstancedMesh for repeated entities (enemies, orbs, projectiles)
4. Test server independently before client integration
5. The server is authoritative - all game logic happens there
