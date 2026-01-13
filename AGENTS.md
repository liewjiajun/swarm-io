## Build & Run

```bash
# Install dependencies
npm install

# Run both client and server
npm run dev

# Client only
npm run dev:client

# Server only  
npm run dev:server
```

## Validation

Run these after implementing to get immediate feedback:

```bash
# TypeScript check
npm run typecheck

# Tests
npm run test

# Lint
npm run lint

# Build
npm run build
```

## Ports

- Client: http://localhost:5173
- Server: http://localhost:2567
- Monitor: http://localhost:2567/colyseus

## Codebase Patterns

- Shared types in `src/shared/` - used by both client and server
- Use InstancedMesh for repeated entities (enemies, XP orbs, projectiles)
- Server is authoritative - all game logic happens there
- Client sends only inputs, receives state updates
