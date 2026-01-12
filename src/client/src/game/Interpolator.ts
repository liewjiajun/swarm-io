import { lerp } from '@swarm-io/shared';

interface StateSnapshot {
  timestamp: number;
  state: any;
}

export class Interpolator {
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots = 10;

  pushState(state: any, timestamp: number) {
    this.snapshots.push({ timestamp, state: this.cloneState(state) });

    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getInterpolatedState(renderTime: number): any {
    // Find the two snapshots to interpolate between
    let before: StateSnapshot | null = null;
    let after: StateSnapshot | null = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i].timestamp <= renderTime &&
          this.snapshots[i + 1].timestamp >= renderTime) {
        before = this.snapshots[i];
        after = this.snapshots[i + 1];
        break;
      }
    }

    // If no valid range, return latest state
    if (!before || !after) {
      return this.snapshots[this.snapshots.length - 1]?.state || this.emptyState();
    }

    // Calculate interpolation factor
    const range = after.timestamp - before.timestamp;
    const t = range > 0 ? (renderTime - before.timestamp) / range : 0;

    return this.interpolateStates(before.state, after.state, t);
  }

  getLocalPlayer(playerId: string): any | null {
    const latest = this.snapshots[this.snapshots.length - 1];
    return latest?.state.players.get(playerId) || null;
  }

  private interpolateStates(from: any, to: any, t: number): any {
    const result = {
      players: new Map(),
      enemies: new Map(),
      projectiles: new Map(),
      xpOrbs: new Map(),
      world: to.world,
    };

    // Interpolate players
    to.players.forEach((toPlayer: any, id: string) => {
      const fromPlayer = from.players.get(id);
      if (fromPlayer) {
        result.players.set(id, {
          ...toPlayer,
          x: lerp(fromPlayer.x, toPlayer.x, t),
          y: lerp(fromPlayer.y, toPlayer.y, t),
        });
      } else {
        result.players.set(id, toPlayer);
      }
    });

    // Interpolate enemies
    to.enemies.forEach((toEnemy: any, id: string) => {
      const fromEnemy = from.enemies.get(id);
      if (fromEnemy) {
        result.enemies.set(id, {
          ...toEnemy,
          x: lerp(fromEnemy.x, toEnemy.x, t),
          y: lerp(fromEnemy.y, toEnemy.y, t),
        });
      } else {
        result.enemies.set(id, toEnemy);
      }
    });

    // Interpolate projectiles
    to.projectiles.forEach((toProj: any, id: string) => {
      const fromProj = from.projectiles.get(id);
      if (fromProj) {
        result.projectiles.set(id, {
          ...toProj,
          x: lerp(fromProj.x, toProj.x, t),
          y: lerp(fromProj.y, toProj.y, t),
        });
      } else {
        result.projectiles.set(id, toProj);
      }
    });

    // Interpolate XP orbs
    to.xpOrbs.forEach((toOrb: any, id: string) => {
      const fromOrb = from.xpOrbs.get(id);
      if (fromOrb) {
        result.xpOrbs.set(id, {
          ...toOrb,
          x: lerp(fromOrb.x, toOrb.x, t),
          y: lerp(fromOrb.y, toOrb.y, t),
        });
      } else {
        result.xpOrbs.set(id, toOrb);
      }
    });

    return result;
  }

  private cloneState(state: any): any {
    // Deep clone state for snapshot storage
    const cloneMap = (map: Map<string, any>) => {
      const result = new Map();
      map.forEach((value, key) => {
        result.set(key, { ...value });
      });
      return result;
    };

    return {
      players: cloneMap(state.players),
      enemies: cloneMap(state.enemies),
      projectiles: cloneMap(state.projectiles),
      xpOrbs: cloneMap(state.xpOrbs),
      world: { ...state.world },
    };
  }

  private emptyState(): any {
    return {
      players: new Map(),
      enemies: new Map(),
      projectiles: new Map(),
      xpOrbs: new Map(),
      world: { worldRadius: 500, playerCount: 0, gameTime: 0 },
    };
  }
}