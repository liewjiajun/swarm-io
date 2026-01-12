# SWARM.IO

A massive multiplayer survivor.io-style game built with Three.js and Colyseus.

## 🎮 Game Features

- **Drop-in/Drop-out gameplay** - Join anytime, no waiting for matches
- **Auto-attacking weapons** - 8 weapon types that fire automatically
- **XP & Leveling** - Collect orbs, level up, choose upgrades
- **2.5D Graphics** - Top-down view with 3D depth using Three.js
- **Massive multiplayer** - 100+ players per world instance
- **Hybrid PvE/PvP** - Fight mobs primarily, but players can damage each other
- **Dynamic world** - World expands as more players join

## 🚀 Building with Ralph Wiggum Technique

This project is designed to be built using the [Ralph Wiggum Technique](https://ghuntley.com/ralph/) - an AI-assisted development methodology using Claude Code.

### Prerequisites

1. **Claude Code CLI** installed and authenticated
   ```bash
   # Install Claude Code (if not already installed)
   npm install -g @anthropic-ai/claude-code
   
   # Authenticate
   claude auth login
   ```

2. **Node.js 20+** installed

3. **Git** installed

### Quick Start with Ralph

```bash
# 1. Navigate to project directory
cd swarm-io

# 2. Make loop script executable
chmod +x loop.sh

# 3. Initialize git (required for Ralph)
git init
git add -A
git commit -m "Initial commit"

# 4. Run Ralph in PLAN mode first (analyzes specs, creates plan)
./loop.sh plan 3

# 5. Run Ralph in BUILD mode (implements the plan)
./loop.sh 50
```

### Ralph Commands

```bash
# Plan mode - analyzes specs and updates IMPLEMENTATION_PLAN.md
./loop.sh plan           # Unlimited iterations
./loop.sh plan 5         # Max 5 iterations

# Build mode - implements features from the plan
./loop.sh                # Unlimited iterations
./loop.sh 20             # Max 20 iterations
```

### How It Works

1. **loop.sh** runs Claude Code in a continuous loop
2. Each iteration, Claude reads:
   - `specs/*` - Detailed specifications for each system
   - `IMPLEMENTATION_PLAN.md` - What's done and what's next
   - `AGENTS.md` - Build/run commands
3. Claude implements one task per iteration
4. Progress is committed to git automatically
5. Loop continues until complete or max iterations reached

### Important Notes

⚠️ **Run in a sandbox/VM** - Ralph uses `--dangerously-skip-permissions` which auto-approves all actions

⚠️ **Monitor the output** - Watch for errors or unexpected behavior

⚠️ **Review commits** - Each iteration creates a git commit you can review/revert

## 📁 Project Structure

```
swarm-io/
├── loop.sh                 # Ralph orchestration script
├── PROMPT_plan.md          # Planning mode prompt
├── PROMPT_build.md         # Building mode prompt
├── AGENTS.md               # Build/run commands reference
├── IMPLEMENTATION_PLAN.md  # Progress tracking
├── specs/                  # Detailed specifications
│   ├── 01-project-setup.md
│   ├── 02-shared-types.md
│   ├── 03-server-gameloop.md
│   ├── 04-server-state.md
│   ├── 05-weapon-combat.md
│   ├── 06-spawning.md
│   ├── 07-client-renderer.md
│   ├── 08-client-networking.md
│   └── 09-ui-hud.md
└── src/
    ├── client/             # Three.js game client
    ├── server/             # Colyseus game server
    └── shared/             # Shared types and constants
```

## 🎯 Manual Development

If you prefer to build manually without Ralph:

```bash
# Install dependencies
npm install

# Run development servers (client + server)
npm run dev

# Client only: http://localhost:5173
npm run dev:client

# Server only: http://localhost:2567
npm run dev:server

# Type checking
npm run typecheck

# Build for production
npm run build
```

## 🎮 Game Controls

- **WASD / Arrow Keys** - Move
- Weapons fire automatically toward nearest enemies
- Level up choices appear when you gain enough XP

## 📊 Tech Stack

- **Client**: Three.js, TypeScript, Vite
- **Server**: Node.js, Colyseus, TypeScript
- **Shared**: Common types and constants
- **Networking**: WebSocket via Colyseus

## 📝 License

MIT
