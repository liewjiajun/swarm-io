import { GameState, PlayerSchema, EnemySchema } from '../state/GameState.js';
import { WEAPON_CONFIGS } from '@swarm-io/shared';
import { SpatialHash } from './SpatialHash.js';

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

  // SpatialHash reference for efficient enemy queries (Lightning, Fireball)
  private spatialHash: SpatialHash | null = null;

  constructor() {
    console.log('[WeaponSystem] Initialized with auto-firing weapon support');
  }

  update(gameState: GameState, spatialHash: SpatialHash, deltaTime: number): void {
    // Store spatial hash reference for weapon methods
    this.spatialHash = spatialHash;

    // Process all living players' weapons
    gameState.players.forEach(player => {
      if (!player.dead && !player.pendingUpgrade) {
        this.updatePlayerWeapons(gameState, player, deltaTime);
      }
    });
  }

  private updatePlayerWeapons(gameState: GameState, player: PlayerSchema, deltaTime: number): void {
    // Guard against undefined weapons (can happen during player initialization)
    if (!player.weapons) return;

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

    gameState.enemies.forEach(enemy => {
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
    const toRemove: string[] = [];
    gameState.projectiles.forEach((proj, id) => {
      if (proj.ownerId === player.id && proj.type === 'orb') {
        toRemove.push(id);
      }
    });
    toRemove.forEach(id => gameState.removeProjectile(id));

    // Create new orbs in circle formation
    // Orbit radius scales with level (base range * (1 + (level-1) * 0.1))
    const orbitRadius = config.range * (1 + (weapon.level - 1) * 0.1);

    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;

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
    gameState.enemies.forEach(enemy => {
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

  // LIGHTNING: Random multi-target strikes to nearby enemies
  private fireLightning(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.lightning;
    if (!this.spatialHash) return;

    // Calculate number of strikes based on level (1-5)
    const strikeCount = Math.min(1 + Math.floor(weapon.level / 2), 5);
    const range = config.range * (1 + (weapon.level - 1) * 0.1);

    // Query nearby enemies using spatial hash for efficiency
    const nearbyEnemies = this.spatialHash.queryRadius(
      player.x, player.y, range, 'enemy'
    );

    if (nearbyEnemies.length === 0) return;

    // Shuffle and take strikeCount random targets
    const shuffled = nearbyEnemies.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, strikeCount);

    for (const entity of targets) {
      // Create lightning bolt projectile - CombatSystem will handle damage validation
      // BUG-006 FIX: Removed direct damage application; projectile goes through CombatSystem
      // like all other weapons for proper validation, metrics tracking, and consistency
      gameState.addProjectile(
        'lightning_bolt',  // type
        player.id,         // ownerId
        entity.x,          // x (at target position)
        entity.y,          // y
        0,                 // velocityX (stationary)
        0,                 // velocityY
        damage,            // damage (will be validated by CombatSystem)
        0.15,              // lifetime (very short for visual)
        0.5,               // radius
        1                  // piercing (single hit)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // AXE: Thrown spinning axes that pierce through enemies
  private fireAxe(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.axe;
    const speed = config.projectileSpeed || 8;

    // Calculate number of axes based on level (1-3)
    const axeCount = Math.min(1 + Math.floor(weapon.level / 3), 3);

    for (let i = 0; i < axeCount; i++) {
      // Calculate spread angle for multiple axes
      const angleOffset = (i - (axeCount - 1) / 2) * 0.5;
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);

      // Rotate facing direction by angle offset
      const dirX = player.facingX * cos - player.facingY * sin;
      const dirY = player.facingX * sin + player.facingY * cos;

      gameState.addProjectile(
        'axe_spin',        // type
        player.id,         // ownerId
        player.x,          // x
        player.y,          // y
        dirX * speed,      // velocityX
        dirY * speed,      // velocityY
        damage,            // damage
        3,                 // lifetime (3 seconds)
        0.6,               // radius
        999                // piercing (unlimited)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // FIREBALL: Targeted explosive projectile toward nearest enemy
  private fireFireball(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.fireball;
    if (!this.spatialHash) return;

    // Find nearest enemy within range using spatial hash
    const nearestEnemy = this.spatialHash.queryNearestOfType(
      player.x, player.y, 'enemy', config.range
    );

    // Default to facing direction if no enemy found
    let dirX = player.facingX;
    let dirY = player.facingY;

    // Aim toward nearest enemy if found
    if (nearestEnemy) {
      const dx = nearestEnemy.x - player.x;
      const dy = nearestEnemy.y - player.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dirX = dx / len;
        dirY = dy / len;
      }
    }

    const speed = config.projectileSpeed || 10;

    gameState.addProjectile(
      'fireball',        // type (CombatSystem handles explosion on hit)
      player.id,         // ownerId
      player.x,          // x
      player.y,          // y
      dirX * speed,      // velocityX
      dirY * speed,      // velocityY
      damage,            // damage
      3,                 // lifetime (3 seconds)
      0.5,               // radius
      1                  // piercing (explodes on first hit)
    );

    this.weaponMetrics.projectilesCreated++;
  }

  // WHIP: Wide horizontal arc attack
  private fireWhip(gameState: GameState, player: PlayerSchema, weapon: any, damage: number): void {
    const config = WEAPON_CONFIGS.whip;

    // Scale range and arc width with level
    const range = config.range * (1 + (weapon.level - 1) * 0.1);
    const arcWidth = (config.area || 4) * (1 + (weapon.level - 1) * 0.1);

    // Create multiple slash projectiles in an arc pattern
    const slashCount = 5;
    for (let i = 0; i < slashCount; i++) {
      // Calculate position along arc (-0.5 to 0.5)
      const t = i / (slashCount - 1) - 0.5;
      const angle = t * arcWidth / range;

      // Rotate facing direction by arc angle
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const dirX = player.facingX * cos - player.facingY * sin;
      const dirY = player.facingX * sin + player.facingY * cos;

      gameState.addProjectile(
        'slash',                        // type
        player.id,                      // ownerId
        player.x + dirX * range * 0.5,  // x (spawned along arc)
        player.y + dirY * range * 0.5,  // y
        0,                              // velocityX (stationary)
        0,                              // velocityY
        damage,                         // damage
        0.15,                           // lifetime (very short)
        0.5,                            // radius
        999                             // piercing (unlimited)
      );

      this.weaponMetrics.projectilesCreated++;
    }
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