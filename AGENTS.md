# SWARM.IO - Operational Guide

## Project Structure

```
swarm-io/
├── src/
│   ├── client/          # Three.js game client
│   ├── server/          # Colyseus game server
│   └── shared/          # Shared types and constants
├── specs/               # Requirement specifications
├── package.json         # Root package.json (workspaces)
└── IMPLEMENTATION_PLAN.md
```

## Build & Run

### Install dependencies
```bash
npm install
```

### Development (runs both client and server)
```bash
npm run dev
```

### Client only
```bash
npm run dev:client
```

### Server only
```bash
npm run dev:server
```

### Production build
```bash
npm run build
```

## Validation

Run these after implementing to get immediate feedback:

```bash
# TypeScript check (both client and server)
npm run typecheck

# Run tests
npm run test

# Lint
npm run lint

# Build check
npm run build
```

## Ports

- Client dev server: http://localhost:5173
- Game server: http://localhost:2567
- Colyseus monitor: http://localhost:2567/colyseus

## Codebase Patterns

### Shared Types
All game entity types (Player, Enemy, Projectile, etc.) are defined in `src/shared/types.ts` and used by both client and server.

### State Synchronization
- Server uses Colyseus Schema for state
- Client receives state updates via `room.state.onChange`
- Local player uses client-side prediction

### Rendering
- Use InstancedMesh for all repeated entities (enemies, XP orbs, projectiles)
- Sprites are PlaneGeometry with sprite textures, billboarded to face camera
- Particle effects use three.quarks or similar

### Networking
- Client sends only input commands: `{ dx: number, dy: number, sequence: number }`
- Server processes inputs and broadcasts authoritative state
- Interest management: only entities within player's AOI are synced
