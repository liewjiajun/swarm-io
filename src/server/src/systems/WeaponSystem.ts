import { GameState, PlayerSchema, EnemySchema } from '../state/GameState.js';
import { WEAPON_CONFIGS, getCharacterClass, getWeaponEvolution, WeaponEvolutionConfig } from '@swarm-io/shared';
import { SpatialHash } from './SpatialHash.js';
import { weaponSystemLogger } from '../utils/logger.js';

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
    weaponSystemLogger.info('Initialized with auto-firing weapon support');
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

    // P9.4: Get evolution config if weapon is evolved
    const evolution = weapon.evolved ? getWeaponEvolution(weapon.type) : null;

    // Calculate scaled stats with class damage multiplier and evolution bonuses
    let damage = this.calculateWeaponDamage(config, weapon.level, player);
    let cooldown = this.calculateWeaponCooldown(config, weapon.level);

    // Apply evolution multipliers
    if (evolution) {
      damage *= evolution.damageMultiplier;
      cooldown *= evolution.cooldownMultiplier;
    }

    // Fire weapon based on type
    switch (weapon.type) {
      case 'knife':
        this.fireKnife(gameState, player, weapon, damage, evolution);
        break;
      case 'wand':
        this.fireWand(gameState, player, weapon, damage, evolution);
        break;
      case 'bible':
        this.fireBible(gameState, player, weapon, damage, evolution);
        break;
      case 'garlic':
        this.fireGarlic(gameState, player, weapon, damage, evolution);
        break;
      case 'lightning':
        this.fireLightning(gameState, player, weapon, damage, evolution);
        break;
      case 'axe':
        this.fireAxe(gameState, player, weapon, damage, evolution);
        break;
      case 'fireball':
        this.fireFireball(gameState, player, weapon, damage, evolution);
        break;
      case 'whip':
        this.fireWhip(gameState, player, weapon, damage, evolution);
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
  // P9.4 Evolution (Thousand Cuts): 3x projectiles, faster attack
  private fireKnife(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.knife;

    // Calculate number of projectiles (1 + level scaling)
    let projectileCount = Math.min(1 + Math.floor(weapon.level / 2), 5); // Max 5 slashes

    // P9.4: Apply evolution projectile multiplier (Thousand Cuts: 3x)
    if (evolution) {
      projectileCount = Math.floor(projectileCount * evolution.projectileMultiplier);
    }

    // Calculate scaled range (per spec 05-weapon-combat.md line 80: +10% per level)
    let scaledRange = this.calculateWeaponRange(config, weapon.level);
    if (evolution) {
      scaledRange *= evolution.rangeMultiplier;
    }

    // Create fan pattern spread
    const baseAngle = Math.atan2(player.facingY, player.facingX);
    const spreadAngle = Math.PI / 6; // 30 degree spread total

    for (let i = 0; i < projectileCount; i++) {
      const offset = projectileCount === 1 ? 0 :
        (i / (projectileCount - 1) - 0.5) * spreadAngle;
      const angle = baseAngle + offset;

      // Calculate projectile velocity (range determines travel distance in 0.2s)
      const speed = scaledRange * 5; // 5 units per second for 0.2s lifetime
      const velocityX = Math.cos(angle) * speed;
      const velocityY = Math.sin(angle) * speed;

      // Create projectile
      gameState.addProjectile(
        evolution ? 'evolved_slash' : 'slash', // Use evolved type for visual distinction
        player.id,         // ownerId
        player.x,          // x
        player.y,          // y
        velocityX,         // velocityX
        velocityY,         // velocityY
        damage,            // damage
        0.2,              // lifetime (0.2 seconds)
        scaledRange,       // radius (scaled with level)
        999               // piercing (unlimited)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // WAND: Targets nearest enemy or fires in facing direction
  // P9.4 Evolution (Arcane Barrage): Homing projectiles that pierce all
  private fireWand(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.wand;

    // Find nearest enemy within range
    let effectiveRange = config.range;
    if (evolution) {
      effectiveRange *= evolution.rangeMultiplier;
    }

    let targetAngle = Math.atan2(player.facingY, player.facingX);
    let nearestEnemy: EnemySchema | null = null;
    let nearestDistance = Infinity;

    gameState.enemies.forEach(enemy => {
      const distance = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
      if (distance < nearestDistance && distance <= effectiveRange) {
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
    let projectileCount = Math.min(1 + Math.floor((weapon.level - 1) / 2), 4);

    // P9.4: Apply evolution projectile multiplier (Arcane Barrage: 2x)
    if (evolution) {
      projectileCount = Math.floor(projectileCount * evolution.projectileMultiplier);
    }

    // Create spread pattern
    const spreadAngle = projectileCount > 1 ? Math.PI / 8 : 0; // 22.5 degree spread

    // Use projectileSpeed from config (default 12 per spec)
    const speed = config.projectileSpeed || 12;

    // P9.4: Determine piercing - evolved pierces all
    const piercing = (evolution && evolution.pierceAll) ? 999 : weapon.level;

    for (let i = 0; i < projectileCount; i++) {
      const offset = projectileCount === 1 ? 0 :
        (i / (projectileCount - 1) - 0.5) * spreadAngle;
      const angle = targetAngle + offset;

      const velocityX = Math.cos(angle) * speed;
      const velocityY = Math.sin(angle) * speed;

      // P9.4: Use evolved type for homing behavior (handled in PhysicsSystem)
      const projectileType = (evolution && evolution.homing) ? 'homing_bullet' : 'bullet';

      gameState.addProjectile(
        projectileType,    // type
        player.id,         // ownerId
        player.x,          // x
        player.y,          // y
        velocityX,         // velocityX
        velocityY,         // velocityY
        damage,            // damage
        2.0,              // lifetime (2 seconds)
        20,               // radius
        piercing          // piercing (level-based or unlimited if evolved)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // BIBLE: Creates orbital projectiles that circle the player
  // P9.4 Evolution (Crusade): Orbitals expand outward over time, more orbs
  private fireBible(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.bible;

    // Calculate number of orbs (2 + level scaling, max 8)
    let orbCount = Math.min(2 + weapon.level - 1, 8);

    // P9.4: Apply evolution projectile multiplier (Crusade: 1.5x)
    if (evolution) {
      orbCount = Math.floor(orbCount * evolution.projectileMultiplier);
    }

    // P9.4: Determine projectile type for orbs (evolved orbs expand)
    const orbType = (evolution && evolution.expandsOutward) ? 'expanding_orb' : 'orb';

    // Find existing bible projectiles for this player
    const existingOrbs: string[] = [];
    gameState.projectiles.forEach((proj, id) => {
      if (proj.ownerId === player.id && (proj.type === 'orb' || proj.type === 'expanding_orb')) {
        existingOrbs.push(id);
        // Update damage on existing orbs (in case weapon was upgraded)
        proj.damage = damage;
      }
    });

    // Only remove excess orbs if we have too many
    while (existingOrbs.length > orbCount) {
      const id = existingOrbs.pop()!;
      gameState.removeProjectile(id);
    }

    // Only create new orbs if we need more
    // Orbit radius scales with level (base range * (1 + (level-1) * 0.1))
    let orbitRadius = config.range * (1 + (weapon.level - 1) * 0.1);
    if (evolution) {
      orbitRadius *= evolution.rangeMultiplier;
    }

    while (existingOrbs.length < orbCount) {
      // Space new orbs evenly in the circle based on current count
      const angle = (existingOrbs.length / orbCount) * Math.PI * 2;

      const orbX = player.x + Math.cos(angle) * orbitRadius;
      const orbY = player.y + Math.sin(angle) * orbitRadius;

      gameState.addProjectile(
        orbType,           // type (regular or expanding)
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

      existingOrbs.push('new'); // Just to increment count
      this.weaponMetrics.projectilesCreated++;
    }
  }

  // GARLIC: Area-of-effect damage around player position
  // P9.4 Evolution (Holy Aura): 2x radius, heals player on damage
  private fireGarlic(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.garlic;

    // Scale range with level (same formula as other weapons: +10% per level)
    let range = config.range * (1 + (weapon.level - 1) * 0.1);

    // P9.4: Apply evolution range multiplier (Holy Aura: 2x range)
    if (evolution) {
      range *= evolution.rangeMultiplier;
    }

    // P9.4: Determine projectile type (evolved heals)
    const auraType = (evolution && evolution.heals) ? 'holy_aura' : 'garlic_aura';

    // Track total damage dealt for healing calculation
    let totalDamageDealt = 0;

    // Garlic deals direct damage to all enemies within radius (no projectiles)
    gameState.enemies.forEach(enemy => {
      const distance = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);

      if (distance <= range) {
        // Apply damage directly (will be handled by CombatSystem later)
        // Create garlic aura visual effect
        gameState.addProjectile(
          auraType,          // type
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

        totalDamageDealt += damage;
        this.weaponMetrics.projectilesCreated++;
      }
    });

    // P9.4: Holy Aura heals player for 10% of damage dealt
    if (evolution && evolution.heals && totalDamageDealt > 0) {
      const healAmount = Math.floor(totalDamageDealt * 0.1);
      player.health = Math.min(player.health + healAmount, player.maxHealth);
    }
  }

  // LIGHTNING: Random multi-target strikes to nearby enemies
  // P9.4 Evolution (Divine Storm): Double strikes, chains to nearby enemies
  private fireLightning(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.lightning;
    if (!this.spatialHash) return;

    // Calculate number of strikes based on level (1-5)
    let strikeCount = Math.min(1 + Math.floor(weapon.level / 2), 5);

    // P9.4: Apply evolution projectile multiplier (Divine Storm: 2x strikes)
    if (evolution) {
      strikeCount = Math.floor(strikeCount * evolution.projectileMultiplier);
    }

    let range = config.range * (1 + (weapon.level - 1) * 0.1);
    if (evolution) {
      range *= evolution.rangeMultiplier;
    }

    // Query nearby enemies using spatial hash for efficiency
    const nearbyEnemies = this.spatialHash.queryRadius(
      player.x, player.y, range, 'enemy'
    );

    if (nearbyEnemies.length === 0) return;

    // Shuffle and take strikeCount random targets
    const shuffled = nearbyEnemies.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, strikeCount);

    // P9.4: Determine projectile type (evolved chains to nearby enemies)
    const boltType = (evolution && evolution.bounces) ? 'chain_lightning' : 'lightning_bolt';

    for (const entity of targets) {
      // Create lightning bolt projectile - CombatSystem will handle damage validation
      // BUG-006 FIX: Removed direct damage application; projectile goes through CombatSystem
      // like all other weapons for proper validation, metrics tracking, and consistency
      gameState.addProjectile(
        boltType,          // type (regular or chain lightning)
        player.id,         // ownerId
        entity.x,          // x (at target position)
        entity.y,          // y
        0,                 // velocityX (stationary)
        0,                 // velocityY
        damage,            // damage (will be validated by CombatSystem)
        0.15,              // lifetime (very short for visual)
        0.5,               // radius
        (evolution && evolution.bounces) ? 3 : 1  // piercing (chains hit up to 3 enemies)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // AXE: Thrown spinning axes that pierce through enemies
  // P9.4 Evolution (Executioner): Instant kill enemies below 20% HP, more axes
  private fireAxe(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.axe;
    const speed = config.projectileSpeed || 8;

    // Calculate number of axes based on level (1-3)
    let axeCount = Math.min(1 + Math.floor(weapon.level / 3), 3);

    // P9.4: Apply evolution projectile multiplier (Executioner: 1.5x axes)
    if (evolution) {
      axeCount = Math.floor(axeCount * evolution.projectileMultiplier);
    }

    // P9.4: Determine projectile type (executioner has special execute threshold)
    const axeType = (evolution && evolution.executeDamage > 0) ? 'executioner_axe' : 'axe_spin';

    for (let i = 0; i < axeCount; i++) {
      // Calculate spread angle for multiple axes
      const angleOffset = (i - (axeCount - 1) / 2) * 0.5;
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);

      // Rotate facing direction by angle offset
      const dirX = player.facingX * cos - player.facingY * sin;
      const dirY = player.facingX * sin + player.facingY * cos;

      gameState.addProjectile(
        axeType,           // type (regular or executioner)
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
  // P9.4 Evolution (Inferno): Leaves damaging fire trail
  private fireFireball(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.fireball;
    if (!this.spatialHash) return;

    // Apply evolution range multiplier
    let effectiveRange = config.range;
    if (evolution) {
      effectiveRange *= evolution.rangeMultiplier;
    }

    // Find nearest enemy within range using spatial hash
    const nearestEnemy = this.spatialHash.queryNearestOfType(
      player.x, player.y, 'enemy', effectiveRange
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

    // P9.4: Determine projectile type (inferno leaves fire trail)
    const fireballType = (evolution && evolution.leaveTrail) ? 'inferno' : 'fireball';

    gameState.addProjectile(
      fireballType,      // type (regular fireball or inferno with trail)
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
  // P9.4 Evolution (Chain Whip): Bounces to nearby enemies
  private fireWhip(gameState: GameState, player: PlayerSchema, weapon: any, damage: number, evolution: WeaponEvolutionConfig | null): void {
    const config = WEAPON_CONFIGS.whip;

    // Scale range and arc width with level
    let range = config.range * (1 + (weapon.level - 1) * 0.1);
    let arcWidth = (config.area || 4) * (1 + (weapon.level - 1) * 0.1);

    // P9.4: Apply evolution range multiplier (Chain Whip: 1.5x range)
    if (evolution) {
      range *= evolution.rangeMultiplier;
      arcWidth *= evolution.rangeMultiplier;
    }

    // P9.4: Determine projectile type (chain whip bounces)
    const slashType = (evolution && evolution.bounces) ? 'chain_slash' : 'slash';

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
        slashType,                      // type (regular or chain slash)
        player.id,                      // ownerId
        player.x + dirX * range * 0.5,  // x (spawned along arc)
        player.y + dirY * range * 0.5,  // y
        0,                              // velocityX (stationary)
        0,                              // velocityY
        damage,                         // damage
        (evolution && evolution.bounces) ? 0.5 : 0.15, // longer lifetime if bounces
        0.5,                            // radius
        999                             // piercing (unlimited)
      );

      this.weaponMetrics.projectilesCreated++;
    }
  }

  // Utility methods for weapon calculations
  private calculateWeaponDamage(config: any, level: number, player: PlayerSchema): number {
    // Damage scales by +20% per level
    let scaledDamage = config.damage * (1 + (level - 1) * 0.2);

    // P9.3: Apply class-specific damage multiplier (e.g., Warrior gets +25% damage)
    const classConfig = getCharacterClass(player.playerClass);
    if (classConfig.damageMultiplier !== 1.0) {
      scaledDamage *= classConfig.damageMultiplier;
    }

    // P5.2: Apply damage boost power-up multiplier
    if (player.hasDamageBoost) {
      scaledDamage *= 1.5; // GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_MULTIPLIER
    }

    // Security validation: Ensure damage is reasonable
    const maxDamage = config.damage * 5 * 1.5 * 1.25; // 5x safety margin * power-up * warrior class
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

  /**
   * Calculates scaled weapon range based on level.
   * Range increases by +10% per level per spec (05-weapon-combat.md line 80).
   */
  private calculateWeaponRange(config: any, level: number): number {
    // Range scales by +10% per level
    const baseRange = config.baseRange || config.range;
    return baseRange * (1 + (level - 1) * 0.1);
  }

  private logSecurityViolation(reason: string, data: any): void {
    weaponSystemLogger.warn({ reason, ...data }, 'Security violation');
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
    weaponSystemLogger.info('Reset for new game');
  }
}