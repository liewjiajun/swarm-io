# 01 - Project Setup

## Overview
Initialize the monorepo structure with TypeScript, Vite for the client, and Node.js for the server. Use npm workspaces to manage the client and server packages.

## Directory Structure

```
swarm-io/
├── package.json              # Root package.json with workspaces
├── tsconfig.base.json        # Shared TypeScript config
├── src/
│   ├── client/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.ts
│   │       ├── game/
│   │       ├── network/
│   │       └── ui/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── rooms/
│   │       ├── systems/
│   │       └── entities/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── constants.ts
│           └── utils.ts
├── specs/
├── AGENTS.md
├── IMPLEMENTATION_PLAN.md
├── PROMPT_plan.md
├── PROMPT_build.md
└── loop.sh
```

## Root package.json

```json
{
  "name": "swarm-io",
  "version": "0.0.1",
  "private": true,
  "workspaces": [
    "src/client",
    "src/server",
    "src/shared"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:client": "npm run dev --workspace=@swarm-io/client",
    "dev:server": "npm run dev --workspace=@swarm-io/server",
    "build": "npm run build --workspaces",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "concurrently": "^8.2.2",
    "eslint": "^8.55.0",
    "typescript": "^5.3.0"
  }
}
```

## Client package.json

```json
{
  "name": "@swarm-io/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@swarm-io/shared": "*",
    "colyseus.js": "^0.15.0",
    "three": "^0.160.0"
  },
  "devDependencies": {
    "@types/three": "^0.160.0",
    "vite": "^5.0.0"
  }
}
```

## Server package.json

```json
{
  "name": "@swarm-io/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@swarm-io/shared": "*",
    "@colyseus/core": "^0.15.0",
    "@colyseus/schema": "^2.0.0",
    "@colyseus/ws-transport": "^0.15.0",
    "@colyseus/monitor": "^0.15.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "tsx": "^4.6.0"
  }
}
```

## Shared package.json

```json
{
  "name": "@swarm-io/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

## TypeScript Configs

### tsconfig.base.json (root)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### Client tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

### Server tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

## Vite Config (Client)

```typescript
// src/client/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/colyseus': {
        target: 'http://localhost:2567',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

## Initial Files

### src/client/index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SWARM.IO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #1a1a2e; }
    #game { width: 100vw; height: 100vh; display: block; }
    #ui { position: absolute; top: 0; left: 0; pointer-events: none; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="ui"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

### src/client/src/main.ts
```typescript
import { Game } from './game/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();
```

### src/server/src/index.ts
```typescript
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom';

const app = express();
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

gameServer.define('game', GameRoom);

app.use('/colyseus', monitor());

const PORT = process.env.PORT || 2567;
httpServer.listen(PORT, () => {
  console.log(`🎮 SWARM.IO server running on http://localhost:${PORT}`);
  console.log(`📊 Monitor: http://localhost:${PORT}/colyseus`);
});
```

### src/shared/src/index.ts
```typescript
export * from './types';
export * from './constants';
export * from './utils';
```

## Acceptance Criteria

1. Running `npm install` at root installs all workspace dependencies
2. Running `npm run dev` starts both client and server
3. Client accessible at http://localhost:5173
4. Server accessible at http://localhost:2567
5. TypeScript compiles without errors: `npm run typecheck`
6. Shared types are importable from both client and server
