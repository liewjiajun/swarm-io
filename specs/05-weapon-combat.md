# 05 - Weapon and Combat Systems

## Overview
Implement the auto-attacking weapon system and combat damage resolution. Weapons fire automatically based on cooldowns, and the combat system handles all collision-based damage.

## File: src/server/src/systems/WeaponSystem.ts

```typescript
import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import type { PlayerSchema } from '../state/PlayerSchema';
import type { WeaponSchema } from '../state/WeaponSchema';
import { WEAPON_CONFIGS, normalize, randomRange } from '@swarm-io/shared';

export class WeaponSystem {
  constructor(
    private state: GameState,
    private spatialHash: SpatialHash
  ) {}

  update(state: GameState, dt: number) {
    state.players.forEach((player) => {
      if (player.dead || player.pendingUpgrade) return;
      
      player.weapons.forEach((weapon) => {
        weapon.cooldownRemaining -= dt;
        
        if (weapon.cooldownRemaining <= 0) {
          this.fireWeapon(player, weapon);
          
          // Reset cooldown (scales with level)
          const config = WEAPON_CONFIGS[weapon.type];
          if (config) {
            // Cooldown reduces by 5% per level
            const cooldownMultiplier = Math.max(0.4, 1 - (weapon.level - 1) * 0.05);
            weapon.cooldownRemaining = config.baseCooldown * cooldownMultiplier;
          }
        }
      });
    });
  }

  private fireWeapon(player: PlayerSchema, weapon: WeaponSchema) {
    const config = WEAPON_CONFIGS[weapon.type];
    if (!config) return;
    
    // Damage scales with level
    const damage = config.baseDamage * (1 + (weapon.level - 1) * 0.2);
    
    switch (weapon.type) {
      case 'knife':
        this.fireKnife(player, weapon, damage, config);
        break;
      case 'wand':
        this.fireWand(player, weapon, damage, config);
        break;
      case 'bible':
        this.fireBible(player, weapon, damage, config);
        break;
      case 'garlic':
        this.fireGarlic(player, weapon, damage, config);
        break;
      case 'lightning':
        this.fireLightning(player, weapon, damage, config);
        break;
      case 'axe':
        this.fireAxe(player, weapon, damage, config);
        break;
      case 'fireball':
        this.fireFireball(player, weapon, damage, config);
        break;
      case 'whip':
        this.fireWhip(player, weapon, damage, config);
        break;
    }
  }

  private fireKnife(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // Directional slash in facing direction
    const range = config.baseRange * (1 + (weapon.level - 1) * 0.1);
    const projectileCount = Math.min(1 + Math.floor(weapon.level / 3), 4);
    
    for (let i = 0; i < projectileCount; i++) {
      // Spread knives in a fan pattern
      const angleOffset = (i - (projectileCount - 1) / 2) * 0.3;
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);
      
      const dirX = player.facingX * cos - player.facingY * sin;
      const dirY = player.facingX * sin + player.facingY * cos;
      
      this.state.addProjectile(
        'slash',
        player.id,
        player.x + dirX * 0.5,
        player.y + dirY * 0.5,
        dirX * 15,
        dirY * 15,
        damage,
        0.2, // Short lifetime
        range,
        0 // Unlimited piercing
      );
    }
  }

  private fireWand(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // Fire projectile toward nearest enemy or facing direction
    const nearestEnemy = this.spatialHash.queryNearestOfType(
      player.x, player.y, 'enemy', config.baseRange
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
    
    const projectileCount = 1 + Math.floor(weapon.level / 4);
    const speed = config.projectileSpeed || 12;
    
    for (let i = 0; i < projectileCount; i++) {
      const angleOffset = (i - (projectileCount - 1) / 2) * 0.2;
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);
      
      const vx = (dirX * cos - dirY * sin) * speed;
      const vy = (dirX * sin + dirY * cos) * speed;
      
      this.state.addProjectile(
        'bullet',
        player.id,
        player.x,
        player.y,
        vx,
        vy,
        damage,
        2, // 2 second lifetime
        0.3,
        1 // Hits 1 enemy
      );
    }
  }

  private fireBible(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // Create/update orbital projectiles
    const orbitCount = Math.min(1 + weapon.level, 8);
    const orbitRadius = config.baseRange * (1 + (weapon.level - 1) * 0.1);
    
    // Find existing bible projectiles for this player
    const existingBibles: string[] = [];
    this.state.projectiles.forEach((proj, id) => {
      if (proj.ownerId === player.id && proj.type === 'orb') {
        existingBibles.push(id);
      }
    });
    
    // Remove excess
    while (existingBibles.length > orbitCount) {
      const id = existingBibles.pop()!;
      this.state.projectiles.delete(id);
    }
    
    // Add missing
    while (existingBibles.length < orbitCount) {
      const angle = (existingBibles.length / orbitCount) * Math.PI * 2;
      this.state.addProjectile(
        'orb',
        player.id,
        player.x + Math.cos(angle) * orbitRadius,
        player.y + Math.sin(angle) * orbitRadius,
        0, 0, // Velocity handled specially
        damage,
        999, // Long lifetime
        0.5,
        0 // Unlimited piercing
      );
      existingBibles.push('new'); // Just to increment count
    }
  }

  private fireGarlic(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // AOE damage around player
    const radius = (config.area || 2.5) * (1 + (weapon.level - 1) * 0.1);
    
    const nearbyEnemies = this.spatialHash.queryRadius(
      player.x, player.y, radius, 'enemy'
    );
    
    for (const entity of nearbyEnemies) {
      const enemy = entity.entity;
      enemy.health -= damage;
    }
  }

  private fireLightning(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // Strike random nearby enemies
    const strikeCount = Math.min(1 + Math.floor(weapon.level / 2), 5);
    const range = config.baseRange * (1 + (weapon.level - 1) * 0.1);
    
    const nearbyEnemies = this.spatialHash.queryRadius(
      player.x, player.y, range, 'enemy'
    );
    
    // Shuffle and take strikeCount
    const shuffled = nearbyEnemies.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, strikeCount);
    
    for (const entity of targets) {
      // Create visual lightning bolt
      this.state.addProjectile(
        'lightning_bolt',
        player.id,
        entity.x,
        entity.y,
        0, 0,
        damage,
        0.1, // Very short for visual
        0.5,
        1
      );
      
      // Direct damage
      entity.entity.health -= damage;
    }
  }

  private fireAxe(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // Thrown axe that passes through enemies
    const speed = config.projectileSpeed || 8;
    const axeCount = Math.min(1 + Math.floor(weapon.level / 3), 3);
    
    for (let i = 0; i < axeCount; i++) {
      const angleOffset = (i - (axeCount - 1) / 2) * 0.5;
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);
      
      const dirX = player.facingX * cos - player.facingY * sin;
      const dirY = player.facingX * sin + player.facingY * cos;
      
      this.state.addProjectile(
        'axe_spin',
        player.id,
        player.x,
        player.y,
        dirX * speed,
        dirY * speed,
        damage,
        3, // 3 second lifetime
        0.6,
        0 // Unlimited piercing
      );
    }
  }

  private fireFireball(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // Exploding projectile toward nearest enemy
    const nearestEnemy = this.spatialHash.queryNearestOfType(
      player.x, player.y, 'enemy', config.baseRange
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
    
    this.state.addProjectile(
      'fireball',
      player.id,
      player.x,
      player.y,
      dirX * speed,
      dirY * speed,
      damage,
      3,
      0.5,
      1 // Explodes on first hit
    );
  }

  private fireWhip(player: PlayerSchema, weapon: WeaponSchema, damage: number, config: any) {
    // Wide horizontal arc
    const range = config.baseRange * (1 + (weapon.level - 1) * 0.1);
    const arcWidth = (config.area || 4) * (1 + (weapon.level - 1) * 0.1);
    
    // Create multiple slash projectiles in an arc
    const slashCount = 5;
    for (let i = 0; i < slashCount; i++) {
      const t = i / (slashCount - 1) - 0.5; // -0.5 to 0.5
      const angle = t * arcWidth / range;
      
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      const dirX = player.facingX * cos - player.facingY * sin;
      const dirY = player.facingX * sin + player.facingY * cos;
      
      this.state.addProjectile(
        'slash',
        player.id,
        player.x + dirX * range * 0.5,
        player.y + dirY * range * 0.5,
        0, 0,
        damage,
        0.15,
        0.5,
        0
      );
    }
  }
}
```

## File: src/server/src/systems/CombatSystem.ts

```typescript
import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS, withinRadius } from '@swarm-io/shared';

export class CombatSystem {
  constructor(private spatialHash: SpatialHash) {}

  update(state: GameState, dt: number) {
    this.handleProjectileCollisions(state);
    this.handleEnemyPlayerCollisions(state, dt);
    this.handlePlayerPlayerCollisions(state);
  }

  private handleProjectileCollisions(state: GameState) {
    state.projectiles.forEach((projectile, projId) => {
      // Skip expired projectiles
      if (projectile.lifetime <= 0) return;
      
      // Query nearby enemies
      const nearbyEnemies = this.spatialHash.queryRadius(
        projectile.x, projectile.y, projectile.radius + 1, 'enemy'
      );
      
      for (const entity of nearbyEnemies) {
        if (!projectile.canHit(entity.id)) continue;
        
        const enemy = entity.entity;
        const enemyRadius = enemy.size || 0.5;
        
        if (withinRadius(
          { x: projectile.x, y: projectile.y },
          { x: enemy.x, y: enemy.y },
          projectile.radius + enemyRadius
        )) {
          // Hit!
          enemy.health -= projectile.damage;
          projectile.recordHit(entity.id);
          
          // Handle fireball explosion
          if (projectile.type === 'fireball') {
            this.handleFireballExplosion(state, projectile);
            projectile.lifetime = 0; // Remove after explosion
            break;
          }
          
          // Check if projectile should be removed
          if (projectile.piercing > 0 && projectile.hitEnemies.size >= projectile.piercing) {
            projectile.lifetime = 0;
            break;
          }
        }
      }
      
      // Check player hits (PvP)
      const nearbyPlayers = this.spatialHash.queryRadius(
        projectile.x, projectile.y, projectile.radius + 1, 'player'
      );
      
      for (const entity of nearbyPlayers) {
        // Don't hit owner
        if (entity.id === projectile.ownerId) continue;
        
        const player = entity.entity;
        if (player.dead || player.isInvulnerable) continue;
        
        if (withinRadius(
          { x: projectile.x, y: projectile.y },
          { x: player.x, y: player.y },
          projectile.radius + GAME_CONSTANTS.PLAYER_HITBOX_RADIUS
        )) {
          // PvP hit
          player.takeDamage(projectile.damage, projectile.ownerId, true);
          
          // Increase attacker hostility
          const attacker = state.players.get(projectile.ownerId);
          if (attacker) {
            attacker.hostility += projectile.damage * 0.1;
          }
          
          projectile.lifetime = 0;
          break;
        }
      }
    });
  }

  private handleFireballExplosion(state: GameState, projectile: any) {
    const explosionRadius = 3;
    const explosionDamage = projectile.damage * 0.5;
    
    // Create explosion visual
    state.addProjectile(
      'explosion',
      projectile.ownerId,
      projectile.x,
      projectile.y,
      0, 0,
      0, // Visual only
      0.3,
      explosionRadius,
      0
    );
    
    // Damage all enemies in radius
    const nearbyEnemies = this.spatialHash.queryRadius(
      projectile.x, projectile.y, explosionRadius, 'enemy'
    );
    
    for (const entity of nearbyEnemies) {
      entity.entity.health -= explosionDamage;
    }
  }

  private handleEnemyPlayerCollisions(state: GameState, dt: number) {
    state.enemies.forEach((enemy) => {
      const nearbyPlayers = this.spatialHash.queryRadius(
        enemy.x, enemy.y, enemy.size + GAME_CONSTANTS.PLAYER_HITBOX_RADIUS, 'player'
      );
      
      for (const entity of nearbyPlayers) {
        const player = entity.entity;
        if (player.dead || player.isInvulnerable) continue;
        
        if (withinRadius(
          { x: enemy.x, y: enemy.y },
          { x: player.x, y: player.y },
          enemy.size + GAME_CONSTANTS.PLAYER_HITBOX_RADIUS
        )) {
          // Enemy touches player - deal damage
          player.takeDamage(enemy.damage * dt, enemy.id);
        }
      }
    });
  }

  private handlePlayerPlayerCollisions(state: GameState) {
    // Optional: Push players apart slightly to prevent stacking
    const players = Array.from(state.players.values()).filter(p => !p.dead);
    
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = GAME_CONSTANTS.PLAYER_HITBOX_RADIUS * 2;
        
        if (dist < minDist && dist > 0) {
          // Push apart
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          
          p1.x -= nx * overlap * 0.5;
          p1.y -= ny * overlap * 0.5;
          p2.x += nx * overlap * 0.5;
          p2.y += ny * overlap * 0.5;
        }
      }
    }
  }
}
```

## File: src/server/src/systems/XPSystem.ts

```typescript
import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import type { PlayerSchema } from '../state/PlayerSchema';
import { GAME_CONSTANTS, XP_ORB_VALUES, UPGRADE_POOL, withinRadius } from '@swarm-io/shared';

export class XPSystem {
  constructor(
    private state: GameState,
    private spatialHash: SpatialHash
  ) {}

  update(state: GameState, dt: number) {
    this.handleMagnetization(state);
    this.handleCollection(state);
  }

  private handleMagnetization(state: GameState) {
    state.xpOrbs.forEach((orb) => {
      if (orb.collected || orb.magnetized) return;
      
      // Find nearest player within magnet range
      let nearestPlayer: PlayerSchema | null = null;
      let nearestDist = Infinity;
      
      state.players.forEach((player) => {
        if (player.dead) return;
        
        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= player.magnetRange && dist < nearestDist) {
          nearestDist = dist;
          nearestPlayer = player;
        }
      });
      
      if (nearestPlayer) {
        orb.magnetized = true;
        orb.targetPlayerId = nearestPlayer.id;
      }
    });
  }

  private handleCollection(state: GameState) {
    state.xpOrbs.forEach((orb) => {
      if (orb.collected) return;
      
      // Check collection by any player
      state.players.forEach((player) => {
        if (player.dead) return;
        
        if (withinRadius(
          { x: orb.x, y: orb.y },
          { x: player.x, y: player.y },
          GAME_CONSTANTS.XP_PICKUP_RADIUS
        )) {
          orb.collected = true;
          player.addXP(orb.value);
        }
      });
    });
  }

  spawnXPOrb(x: number, y: number, value: number) {
    // Split large values into multiple orbs
    while (value > 0) {
      let orbValue: number;
      let size: keyof typeof XP_ORB_VALUES;
      
      if (value >= 25) {
        orbValue = 25;
        size = 'large';
      } else if (value >= 5) {
        orbValue = 5;
        size = 'medium';
      } else {
        orbValue = value;
        size = 'small';
      }
      
      // Slight random offset
      const offsetX = (Math.random() - 0.5) * 2;
      const offsetY = (Math.random() - 0.5) * 2;
      
      this.state.addXPOrb(x + offsetX, y + offsetY, orbValue);
      value -= orbValue;
    }
  }

  applyUpgrade(player: PlayerSchema, choiceId: string) {
    const upgrade = UPGRADE_POOL.find(u => u.id === choiceId);
    if (!upgrade) return;
    
    switch (upgrade.type) {
      case 'new_weapon':
        if (upgrade.weaponType && !player.hasWeapon(upgrade.weaponType)) {
          player.addWeapon(upgrade.weaponType);
        }
        break;
        
      case 'upgrade_weapon':
        if (upgrade.weaponType) {
          player.upgradeWeapon(upgrade.weaponType);
        }
        break;
        
      case 'stat_boost':
        if (upgrade.statType && upgrade.statBoost) {
          switch (upgrade.statType) {
            case 'health':
              player.maxHealth += upgrade.statBoost;
              player.health += upgrade.statBoost;
              break;
            case 'speed':
              player.speed += upgrade.statBoost;
              break;
            case 'magnet':
              player.magnetRange += upgrade.statBoost;
              break;
            case 'armor':
              player.armor += upgrade.statBoost;
              break;
          }
        }
        break;
    }
    
    player.pendingUpgrade = false;
    player.pendingChoices = [];
  }

  generateUpgradeChoices(player: PlayerSchema): any[] {
    const choices: any[] = [];
    const availableUpgrades = UPGRADE_POOL.filter(upgrade => {
      // Filter out weapons player already has at max level
      if (upgrade.type === 'new_weapon' && upgrade.weaponType) {
        if (player.hasWeapon(upgrade.weaponType)) return false;
      }
      
      // Filter out maxed stat boosts
      if (upgrade.type === 'stat_boost') {
        // For now, allow all stat boosts
      }
      
      return true;
    });
    
    // Weighted random selection
    const totalWeight = availableUpgrades.reduce((sum, u) => sum + u.weight, 0);
    
    while (choices.length < 4 && availableUpgrades.length > 0) {
      let random = Math.random() * totalWeight;
      
      for (let i = 0; i < availableUpgrades.length; i++) {
        random -= availableUpgrades[i].weight;
        if (random <= 0) {
          const upgrade = availableUpgrades[i];
          
          // For existing weapons, convert to upgrade
          if (upgrade.type === 'new_weapon' && upgrade.weaponType && player.hasWeapon(upgrade.weaponType)) {
            choices.push({
              id: `upgrade_${upgrade.weaponType}`,
              type: 'upgrade_weapon',
              weaponType: upgrade.weaponType,
              description: `Upgrade ${upgrade.weaponType} to level ${player.getWeaponLevel(upgrade.weaponType) + 1}`,
              currentLevel: player.getWeaponLevel(upgrade.weaponType),
              maxLevel: upgrade.maxLevel,
            });
          } else {
            choices.push({
              id: upgrade.id,
              type: upgrade.type,
              weaponType: upgrade.weaponType,
              statType: upgrade.statType,
              description: upgrade.description,
            });
          }
          
          availableUpgrades.splice(i, 1);
          break;
        }
      }
    }
    
    return choices;
  }
}
```

## Acceptance Criteria

1. All 8 weapon types fire correctly with distinct behaviors
2. Weapon damage and cooldown scale with level
3. Projectiles collide with enemies and deal damage
4. PvP damage is reduced to 15%
5. Hostility increases when attacking other players
6. Fireball creates explosion on impact
7. Bible creates orbital projectiles around player
8. XP orbs are magnetized within player's magnet range
9. XP collection triggers level up when threshold reached
10. Upgrade choices are generated with weighted randomness
