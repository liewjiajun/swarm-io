import { GameState, PlayerSchema, EnemySchema, ProjectileSchema } from '../state/GameState.js';
import { SpatialHash } from './SpatialHash.js';
import { GAME_CONSTANTS, WEAPON_CONFIGS, ENEMY_CONFIGS, BOSS_ABILITY_CONFIGS } from '@swarm-io/shared';

interface CombatMetrics {
  totalDamageDealt: number;
  enemiesKilled: number;
  playersKilled: number;
  projectileHits: number;
  contactDamageEvents: number;
  securityViolations: number;
  damageValidationErrors: number;
}

interface DamageEvent {
  targetId: string;
  damage: number;
  sourceId: string;
  damageType: 'projectile' | 'contact' | 'explosion' | 'world_edge';
  timestamp: number;
}

export class CombatSystem {
  private combatMetrics: CombatMetrics = {
    totalDamageDealt: 0,
    enemiesKilled: 0,
    playersKilled: 0,
    projectileHits: 0,
    contactDamageEvents: 0,
    securityViolations: 0,
    damageValidationErrors: 0
  };

  private recentDamageEvents: DamageEvent[] = [];

  constructor() {
    console.log('[CombatSystem] Initialized with damage validation and collision detection');
  }

  update(gameState: GameState, spatialHash: SpatialHash, deltaTime: number): void {
    // Process projectile collisions with enemies and players
    this.processProjectileCollisions(gameState, spatialHash);

    // Process enemy-player contact damage
    this.processContactDamage(gameState, spatialHash, deltaTime);

    // Clean up dead enemies and players
    this.cleanupDeadEntities(gameState);

    // Clean up old damage events (keep last 100)
    this.cleanupDamageEvents();
  }

  private processProjectileCollisions(gameState: GameState, spatialHash: SpatialHash): void {
    Object.values(gameState.projectiles).forEach(projectile => {
      // Skip projectiles with no remaining lifetime
      if (projectile.lifetime <= 0) return;

      // Get nearby entities using spatial hash
      const nearbyEntities = spatialHash.queryRadius(
        projectile.x,
        projectile.y,
        projectile.radius,
        'enemy'
      );

      // Check collisions with enemies
      nearbyEntities.forEach(spatialEntity => {
        const enemy = spatialEntity.entity as EnemySchema;

        // Skip if enemy already dead
        if (enemy.health <= 0) return;

        // Skip if projectile already hit this enemy
        if (projectile.hitEnemies.has(enemy.id)) return;

        // Check collision using radius
        const distance = Math.sqrt((projectile.x - enemy.x) ** 2 + (projectile.y - enemy.y) ** 2);
        if (distance <= projectile.radius + enemy.size) {
          this.processProjectileHit(gameState, projectile, enemy);
        }
      });

      // Check collisions with players (for PvP and enemy projectiles)
      if (projectile.ownerId) {
        const nearbyPlayers = spatialHash.queryRadius(
          projectile.x,
          projectile.y,
          projectile.radius,
          'player'
        );

        nearbyPlayers.forEach(spatialEntity => {
          const player = spatialEntity.entity as PlayerSchema;

          // Skip self-damage (for player-owned projectiles)
          if (player.id === projectile.ownerId) return;

          // Skip if player is dead or invulnerable
          if (player.dead || player.isInvulnerable) return;

          // Check collision
          const distance = Math.sqrt((projectile.x - player.x) ** 2 + (projectile.y - player.y) ** 2);
          if (distance <= projectile.radius + GAME_CONSTANTS.PLAYER_HITBOX_RADIUS) {
            // Check if this is a player-owned projectile (PvP) or enemy-owned projectile
            const sourcePlayer = gameState.players.get(projectile.ownerId);
            if (sourcePlayer) {
              // PvP projectile
              this.processProjectilePlayerHit(gameState, projectile, player);
            } else {
              // Enemy projectile - full damage to player
              this.processEnemyProjectilePlayerHit(gameState, projectile, player);
            }
          }
        });
      }
    });
  }

  private processProjectileHit(gameState: GameState, projectile: ProjectileSchema, enemy: EnemySchema): void {
    // Validate damage before applying
    const validatedDamage = this.validateDamage(
      projectile.damage,
      'projectile',
      projectile.type,
      1 // Default level for validation
    );

    // Apply damage to enemy
    enemy.health -= validatedDamage;
    this.combatMetrics.totalDamageDealt += validatedDamage;
    this.combatMetrics.projectileHits++;

    // Record hit for piercing limit
    if (!projectile.canHit(enemy.id)) {
      this.logSecurityViolation('Projectile piercing limit exceeded', {
        projectileId: projectile.id,
        enemyId: enemy.id,
        piercing: projectile.piercing
      });
      return;
    }

    projectile.recordHit(enemy.id);

    // Handle special projectile types
    if (projectile.type === 'fireball') {
      this.processExplosion(gameState, projectile.x, projectile.y, validatedDamage * 0.5, projectile.ownerId);
    }

    // Log damage event
    this.recordDamageEvent({
      targetId: enemy.id,
      damage: validatedDamage,
      sourceId: projectile.ownerId,
      damageType: 'projectile',
      timestamp: Date.now()
    });

    // Check if projectile should be destroyed (piercing limit reached)
    if (projectile.hitEnemies.size >= projectile.piercing) {
      projectile.lifetime = 0; // Mark for cleanup
    }
  }

  private processProjectilePlayerHit(gameState: GameState, projectile: ProjectileSchema, player: PlayerSchema): void {
    // Get source player for hostility tracking
    const sourcePlayer = gameState.players.get(projectile.ownerId);
    if (!sourcePlayer) return;

    // Calculate PvP damage (reduced to 15%)
    const pvpDamage = projectile.damage * 0.15;
    const validatedDamage = this.validateDamage(pvpDamage, 'projectile', projectile.type, 1);

    // Apply damage with PvP flag
    player.takeDamage(validatedDamage, sourcePlayer.id, true);
    this.combatMetrics.totalDamageDealt += validatedDamage;

    // Record hit
    projectile.recordHit(player.id);

    // Log damage event
    this.recordDamageEvent({
      targetId: player.id,
      damage: validatedDamage,
      sourceId: sourcePlayer.id,
      damageType: 'projectile',
      timestamp: Date.now()
    });

    // Increase source player hostility
    sourcePlayer.hostility = Math.min(sourcePlayer.hostility + 10, 100);

    // Check if projectile piercing exceeded
    if (projectile.hitEnemies.size >= projectile.piercing) {
      projectile.lifetime = 0;
    }
  }

  private processEnemyProjectilePlayerHit(gameState: GameState, projectile: ProjectileSchema, player: PlayerSchema): void {
    // Validate damage - enemy projectiles deal full damage
    const validatedDamage = this.validateDamage(projectile.damage, 'projectile', projectile.type, 1);

    // Apply damage to player (not PvP, so no hostility tracking)
    player.takeDamage(validatedDamage, projectile.ownerId, false);
    this.combatMetrics.totalDamageDealt += validatedDamage;
    this.combatMetrics.projectileHits++;

    // Record hit
    projectile.recordHit(player.id);

    // Log damage event
    this.recordDamageEvent({
      targetId: player.id,
      damage: validatedDamage,
      sourceId: projectile.ownerId,
      damageType: 'projectile',
      timestamp: Date.now()
    });

    // Destroy projectile on hit (single hit for enemy projectiles)
    projectile.lifetime = 0;
  }

  private processContactDamage(gameState: GameState, spatialHash: SpatialHash, deltaTime: number): void {
    Object.values(gameState.players).forEach(player => {
      // Skip dead or invulnerable players
      if (player.dead || player.isInvulnerable) return;

      // Get nearby enemies
      const nearbyEnemies = spatialHash.queryRadius(
        player.x,
        player.y,
        GAME_CONSTANTS.PLAYER_HITBOX_RADIUS + 30, // Extra radius for enemy detection
        'enemy'
      );

      nearbyEnemies.forEach(spatialEntity => {
        const enemy = spatialEntity.entity as EnemySchema;

        // Skip dead enemies
        if (enemy.health <= 0) return;

        // Check collision
        const distance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
        if (distance <= GAME_CONSTANTS.PLAYER_HITBOX_RADIUS + enemy.size) {

          // Calculate contact damage per second
          const damagePerSecond = enemy.damage;
          const damage = damagePerSecond * deltaTime;

          const validatedDamage = this.validateDamage(damage, 'contact', enemy.type, 1);

          // Apply damage to player
          player.takeDamage(validatedDamage, enemy.id, false);
          this.combatMetrics.totalDamageDealt += validatedDamage;
          this.combatMetrics.contactDamageEvents++;

          // Log damage event
          this.recordDamageEvent({
            targetId: player.id,
            damage: validatedDamage,
            sourceId: enemy.id,
            damageType: 'contact',
            timestamp: Date.now()
          });
        }
      });
    });
  }

  private processExplosion(gameState: GameState, x: number, y: number, damage: number, ownerId: string): void {
    // Create explosion effect projectile
    gameState.addProjectile(
      'explosion',       // type
      ownerId,           // ownerId
      x,                 // x
      y,                 // y
      0,                 // velocityX
      0,                 // velocityY
      damage,            // damage
      0.2,              // lifetime (visual effect)
      100,              // radius
      999               // piercing (hits all in radius)
    );

    // Apply damage to all enemies in explosion radius
    Object.values(gameState.enemies).forEach(enemy => {
      if (enemy.health <= 0) return;

      const distance = Math.sqrt((x - enemy.x) ** 2 + (y - enemy.y) ** 2);
      if (distance <= 100) {
        const validatedDamage = this.validateDamage(damage, 'explosion', 'fireball', 1);
        enemy.health -= validatedDamage;
        this.combatMetrics.totalDamageDealt += validatedDamage;

        this.recordDamageEvent({
          targetId: enemy.id,
          damage: validatedDamage,
          sourceId: ownerId,
          damageType: 'explosion',
          timestamp: Date.now()
        });
      }
    });
  }

  private validateDamage(
    damage: number,
    damageType: 'projectile' | 'contact' | 'explosion' | 'world_edge',
    sourceType: string,
    level: number
  ): number {
    // Basic validation: ensure damage is a finite positive number
    if (!Number.isFinite(damage) || damage < 0) {
      this.logSecurityViolation('Invalid damage value', {
        damage,
        damageType,
        sourceType
      });
      this.combatMetrics.damageValidationErrors++;
      return 0;
    }

    // Calculate reasonable damage bounds based on source type
    let maxDamage = 1000; // Default maximum

    if (damageType === 'projectile') {
      // For projectiles, use a reasonable cap based on highest weapon damage
      // sourceType is the projectile type like 'slash', 'bullet', etc.
      const highestWeaponDamage = Math.max(...Object.values(WEAPON_CONFIGS).map(w => w.baseDamage));
      maxDamage = highestWeaponDamage * (1 + (level - 1) * 0.2) * 5; // 5x safety margin
    } else if (damageType === 'contact') {
      // For contact damage, base on enemy config
      const enemyConfig = ENEMY_CONFIGS[sourceType];
      if (enemyConfig) {
        maxDamage = enemyConfig.damage * 2; // 2x safety margin for contact damage
      }
    } else if (damageType === 'explosion') {
      maxDamage = 200; // Reasonable explosion damage cap
    }

    // Apply damage cap if exceeded
    if (damage > maxDamage) {
      this.logSecurityViolation('Damage exceeds safety bounds', {
        damage,
        maxDamage,
        damageType,
        sourceType,
        level
      });
      this.combatMetrics.damageValidationErrors++;
      return Math.min(damage, maxDamage);
    }

    return damage;
  }

  private cleanupDeadEntities(gameState: GameState): void {
    // Remove dead enemies and spawn XP orbs
    Object.keys(gameState.enemies).forEach(enemyId => {
      const enemy = gameState.enemies.get(enemyId);
      if (enemy && enemy.health <= 0) {
        // Check for boss ability on death (e.g., slime split)
        this.handleBossDeathAbility(gameState, enemy);

        // Spawn XP orb at enemy position
        gameState.addXPOrb(enemy.x, enemy.y, enemy.xpValue);

        // Remove from state and return to pool
        gameState.removeEnemy(enemyId);
        this.combatMetrics.enemiesKilled++;
      }
    });

    // Handle dead players
    Object.values(gameState.players).forEach(player => {
      if (player.health <= 0 && !player.dead) {
        player.die('combat');
        this.combatMetrics.playersKilled++;
      }
    });
  }

  private cleanupDamageEvents(): void {
    // Keep only last 100 damage events for monitoring
    if (this.recentDamageEvents.length > 100) {
      this.recentDamageEvents = this.recentDamageEvents.slice(-100);
    }
  }

  /**
   * Handle boss-specific abilities on death (e.g., slime splitting into smaller slimes)
   */
  private handleBossDeathAbility(gameState: GameState, enemy: EnemySchema): void {
    const abilityConfig = BOSS_ABILITY_CONFIGS[enemy.type];
    if (!abilityConfig) return;

    // Handle split ability (boss_slime)
    if (abilityConfig.type === 'split' && abilityConfig.splitCount && abilityConfig.splitType) {
      const angleStep = (Math.PI * 2) / abilityConfig.splitCount;
      const spawnRadius = enemy.size * 0.5;

      for (let i = 0; i < abilityConfig.splitCount; i++) {
        const angle = angleStep * i;
        const spawnX = enemy.x + Math.cos(angle) * spawnRadius;
        const spawnY = enemy.y + Math.sin(angle) * spawnRadius;

        // Spawn split enemy with difficulty 1 (no scaling for splits)
        const splitEnemy = gameState.addEnemy(abilityConfig.splitType, spawnX, spawnY);
        splitEnemy.initialize(abilityConfig.splitType, 1);
      }

      console.log(`[CombatSystem] Boss ${enemy.type} split into ${abilityConfig.splitCount} ${abilityConfig.splitType}s`);
    }
  }

  private recordDamageEvent(event: DamageEvent): void {
    this.recentDamageEvents.push(event);
  }

  private logSecurityViolation(reason: string, data: any): void {
    console.warn(`[CombatSystem] Security violation: ${reason}`, data);
    this.combatMetrics.securityViolations++;
  }

  // Public methods for monitoring and debugging
  getCombatMetrics(): CombatMetrics {
    return { ...this.combatMetrics };
  }

  getRecentDamageEvents(count: number = 10): DamageEvent[] {
    return this.recentDamageEvents.slice(-count);
  }

  reset(): void {
    this.combatMetrics = {
      totalDamageDealt: 0,
      enemiesKilled: 0,
      playersKilled: 0,
      projectileHits: 0,
      contactDamageEvents: 0,
      securityViolations: 0,
      damageValidationErrors: 0
    };
    this.recentDamageEvents = [];
    console.log('[CombatSystem] Reset for new game');
  }
}