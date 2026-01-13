import { GameState, PlayerSchema, EnemySchema } from '../state/GameState.js';
import { WEAPON_CONFIGS } from '@swarm-io/shared';

interface WeaponMetrics {
  totalShots: number;
  projectilesCreated: number;
  weaponCooldowns: { [weaponType: string]: number };
  securityViolations: number;
}

export class WeaponSystem {
  private weaponMetrics: WeaponMetrics = {
    totalShots: 0,
    projectilesCreated: 0,
    weaponCooldowns: {},
    securityViolations: 0
  };

  constructor() {
    console.log('[WeaponSystem] Initialized with auto-firing weapon support');
  }

  update(gameState: GameState, deltaTime: number): void {
    // Process all living players' weapons
    Object.values(gameState.players).forEach(player => {
      if (!player.dead && !player.pendingUpgrade) {
        this.updatePlayerWeapons(gameState, player, deltaTime);
      }
    });
  }

  private updatePlayerWeapons(gameState: GameState, player: PlayerSchema, deltaTime: number): void {
    // Update cooldowns and fire weapons that are ready
    player.weapons.forEach(weapon => {
      // Security validation: Ensure weapon type exists
      if (!WEAPON_CONFIGS[weapon.type]) {
        this.logSecurityViolation('Invalid weapon type', {
          playerId: player.id,
          weaponType: weapon.type
        });
        return;
      }

      // Update cooldown
      if (weapon.cooldownRemaining > 0) {
        weapon.cooldownRemaining = Math.max(0, weapon.cooldownRemaining - deltaTime);
      }

      // Fire weapon if cooldown finished
      if (weapon.cooldownRemaining === 0) {
        this.fireWeapon(gameState, player, weapon);
      }
    });
  }

  private fireWeapon(gameState: GameState, player: PlayerSchema, weapon: any): void {
    const config = WEAPON_CONFIGS[weapon.type];
    if (!config) return;

    // Security validation: Validate weapon level
    if (weapon.level < 1 || weapon.level > 10 || !Number.isFinite(weapon.level)) {
      this.logSecurityViolation('Invalid weapon level', {
        playerId: player.id,
        weaponType: weapon.type,
        level: weapon.level
      });
      return;
    }

    // Calculate scaled stats
    const damage = this.calculateWeaponDamage(config, weapon.level);
    const cooldown = this.calculateWeaponCooldown(config, weapon.level);

    // Fire weapon based on type
    switch (weapon.type) {
      case 'knife':
        this.fireKnife(gameState, player, weapon, damage);
        break;
      case 'wand':
        this.fireWand(gameState, player, weapon, damage);
        break;
      case 'bible':
        this.fireBible(gameState, player, weapon, damage);
        break;
      case 'garlic':
        this.fireGarlic(gameState, player, weapon, damage);
        break;
      case 'lightning':
        this.fireLightning(gameState, player, weapon, damage);
        break;
      case 'axe':
        this.fireAxe(gameState, player, weapon, damage);
        break;
      case 'fireball':
        this.fireFireball(gameState, player, weapon, damage);
        break;
      case 'whip':
        this.fireWhip(gameState, player, weapon, damage);
        break;
      default:
        this.logSecurityViolation('Unknown weapon type', {
          playerId: player.id,
          weaponType: weapon.type
        });
        return;
    }

    // Set cooldown
    weapon.cooldownRemaining = cooldown;
    this.weaponMetrics.totalShots++;

    // Track cooldown in metrics
    this.weaponMetrics.weaponCooldowns[weapon.type] = cooldown;
  }

  // KNIFE: Directional slash projectiles in facing direction
  private fireKnife(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.knife;

    // Calculate number of projectiles (1 + level scaling)
    const projectileCount = Math.min(1 + Math.floor(weapon.level / 2), 5); // Max 5 slashes

    // Create fan pattern spread
    const baseAngle = Math.atan2(player.facingY, player.facingX);
    const spreadAngle = Math.PI / 6; // 30 degree spread total

    for (let i = 0; i < projectileCount; i++) {
      const offset = projectileCount === 1 ? 0 :
        (i / (projectileCount - 1) - 0.5) * spreadAngle;
      const angle = baseAngle + offset;

      // Calculate projectile velocity
      const speed = config.range * 5; // 5 units per second for 0.2s lifetime
      const velocityX = Math.cos(angle) * speed;
      const velocityY = Math.sin(angle) * speed;

      // Create projectile
      gameState.addProjectile(
        'slash',           // type
        player.id,         // ownerId
        player.x,          // x
        player.y,          // y
        velocityX,         // velocityX
        velocityY,         // velocityY
        damage,            // damage
        0.2,              // lifetime (0.2 seconds)
        config.range,      // radius
        999               // piercing (unlimited)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // WAND: Targets nearest enemy or fires in facing direction
  private fireWand(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.wand;

    // Find nearest enemy within range
    let targetAngle = Math.atan2(player.facingY, player.facingX);
    let nearestEnemy: EnemySchema | null = null;
    let nearestDistance = Infinity;

    Object.values(gameState.enemies).forEach(enemy => {
      const distance = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
      if (distance < nearestDistance && distance <= config.range) {
        nearestEnemy = enemy;
        nearestDistance = distance;
      }
    });

    // Target nearest enemy if found
    if (nearestEnemy) {
      const target = nearestEnemy as EnemySchema;
      targetAngle = Math.atan2(target.y - player.y, target.x - player.x);
    }

    // Calculate number of projectiles based on level
    const projectileCount = Math.min(1 + Math.floor((weapon.level - 1) / 2), 4);

    // Create spread pattern
    const spreadAngle = projectileCount > 1 ? Math.PI / 8 : 0; // 22.5 degree spread

    for (let i = 0; i < projectileCount; i++) {
      const offset = projectileCount === 1 ? 0 :
        (i / (projectileCount - 1) - 0.5) * spreadAngle;
      const angle = targetAngle + offset;

      const velocityX = Math.cos(angle) * config.range;
      const velocityY = Math.sin(angle) * config.range;

      gameState.addProjectile(
        'bullet',          // type
        player.id,         // ownerId
        player.x,          // x
        player.y,          // y
        velocityX,         // velocityX
        velocityY,         // velocityY
        damage,            // damage
        2.0,              // lifetime (2 seconds)
        20,               // radius
        weapon.level      // piercing (level-based)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // BIBLE: Creates orbital projectiles that circle the player
  private fireBible(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.bible;

    // Calculate number of orbs (2 + level scaling, max 8)
    const orbCount = Math.min(2 + weapon.level - 1, 8);

    // Remove existing bible projectiles for this player
    Object.keys(gameState.projectiles).forEach(id => {
      const proj = gameState.projectiles.get(id);
      if (proj && proj.ownerId === player.id && proj.type === 'orb') {
        gameState.projectiles.delete(id);
      }
    });

    // Create new orbs in circle formation
    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;
      const orbitRadius = 50; // Fixed orbit radius

      const orbX = player.x + Math.cos(angle) * orbitRadius;
      const orbY = player.y + Math.sin(angle) * orbitRadius;

      gameState.addProjectile(
        'orb',             // type
        player.id,         // ownerId
        orbX,              // x
        orbY,              // y
        0,                 // velocityX (will be updated in physics)
        0,                 // velocityY
        damage,            // damage
        999,              // lifetime (very long)
        config.range,      // radius
        999               // piercing (unlimited)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // GARLIC: Area-of-effect damage around player position
  private fireGarlic(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.garlic;

    // Garlic deals direct damage to all enemies within radius (no projectiles)
    Object.values(gameState.enemies).forEach(enemy => {
      const distance = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);

      if (distance <= config.range) {
        // Apply damage directly (will be handled by CombatSystem later)
        // For now, create a very short-lived explosion effect
        gameState.addProjectile(
          'explosion',       // type
          player.id,         // ownerId
          enemy.x,           // x
          enemy.y,           // y
          0,                 // velocityX
          0,                 // velocityY
          damage,            // damage
          0.1,              // lifetime (visual only)
          30,               // radius
          1                 // piercing
        );

        this.weaponMetrics.projectilesCreated++;
      }
    });
  }

  // TODO: Implement remaining weapons (lightning, axe, fireball, whip)
  // These will be added incrementally as per the implementation plan

  private fireLightning(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    // TODO: Implement lightning strikes to random nearby enemies
    console.log(`[WeaponSystem] Lightning not yet implemented for player ${player.id}`);
  }

  private fireAxe(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    // TODO: Implement thrown spinning axe projectiles
    console.log(`[WeaponSystem] Axe not yet implemented for player ${player.id}`);
  }

  private fireFireball(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    // TODO: Implement exploding fireball projectiles
    console.log(`[WeaponSystem] Fireball not yet implemented for player ${player.id}`);
  }

  private fireWhip(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    // TODO: Implement wide horizontal arc attacks
    console.log(`[WeaponSystem] Whip not yet implemented for player ${player.id}`);
  }

  // Utility methods for weapon calculations
  private calculateWeaponDamage(config: any, level: number): number {
    // Damage scales by +20% per level
    const scaledDamage = config.damage * (1 + (level - 1) * 0.2);

    // Security validation: Ensure damage is reasonable
    const maxDamage = config.damage * 5; // 5x safety margin
    if (scaledDamage > maxDamage) {
      this.logSecurityViolation('Damage exceeds safety bounds', {
        weaponType: config.type,
        level,
        calculatedDamage: scaledDamage,
        maxAllowed: maxDamage
      });
      return Math.min(scaledDamage, maxDamage);
    }

    return scaledDamage;
  }

  private calculateWeaponCooldown(config: any, level: number): number {
    // Cooldown reduces by 5% per level (minimum 40% of base)
    const reduction = (level - 1) * 0.05;
    const minMultiplier = 0.4;
    const multiplier = Math.max(minMultiplier, 1 - reduction);

    return config.cooldown * multiplier;
  }

  private logSecurityViolation(reason: string, data: any): void {
    console.warn(`[WeaponSystem] Security violation: ${reason}`, data);
    this.weaponMetrics.securityViolations++;
  }

  // Public methods for monitoring and debugging
  getWeaponMetrics(): WeaponMetrics {
    return { ...this.weaponMetrics };
  }

  reset(): void {
    this.weaponMetrics = {
      totalShots: 0,
      projectilesCreated: 0,
      weaponCooldowns: {},
      securityViolations: 0
    };
    console.log('[WeaponSystem] Reset for new game');
  }
}