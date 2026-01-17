import { GameState, PlayerSchema, EnemySchema, ProjectileSchema } from '../state/GameState.js';
import { SpatialHash } from './SpatialHash.js';
import { GAME_CONSTANTS, WEAPON_CONFIGS, ENEMY_CONFIGS, BOSS_ABILITY_CONFIGS } from '@swarm-io/shared';
import { combatSystemLogger } from '../utils/logger.js';

interface CombatMetrics {
  totalDamageDealt: number;
  enemiesKilled: number;
  playersKilled: number;
  projectileHits: number;
  contactDamageEvents: number;
  securityViolations: number;
  damageValidationErrors: number;
  comboDamageDealt: number; // P4.4: Track combo bonus damage
  maxComboReached: number; // P4.4: Track highest combo
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
    damageValidationErrors: 0,
    comboDamageDealt: 0,
    maxComboReached: 0
  };

  private recentDamageEvents: DamageEvent[] = [];

  constructor() {
    combatSystemLogger.info('Initialized with damage validation and collision detection');
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
    gameState.projectiles.forEach(projectile => {
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
    let validatedDamage = this.validateDamage(
      projectile.damage,
      'projectile',
      projectile.type,
      1 // Default level for validation
    );

    // P4.3: Apply team zone damage bonus
    const teamZoneBonus = this.calculateTeamZoneDamageBonus(gameState, projectile.ownerId);
    if (teamZoneBonus > 0) {
      validatedDamage = Math.floor(validatedDamage * (1 + teamZoneBonus));
    }

    // P5.2: Apply damage boost from power-up
    const ownerPlayer = gameState.players.get(projectile.ownerId);
    if (ownerPlayer?.hasDamageBoost) {
      validatedDamage = Math.floor(validatedDamage * GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_MULTIPLIER);
    }

    // P4.4: Apply combo damage multiplier
    const comboMultiplier = this.updateComboAndGetMultiplier(enemy, projectile.ownerId);
    const comboBonusDamage = validatedDamage * (comboMultiplier - 1);
    validatedDamage = Math.floor(validatedDamage * comboMultiplier);

    // Track combo damage
    if (comboBonusDamage > 0) {
      this.combatMetrics.comboDamageDealt += comboBonusDamage;
    }

    // Apply damage to enemy
    enemy.health -= validatedDamage;
    this.combatMetrics.totalDamageDealt += validatedDamage;
    this.combatMetrics.projectileHits++;

    // BUG-018 FIX: Track who damaged this enemy for kill credit
    enemy.lastDamagedBy = projectile.ownerId;

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

    // P9.8: Apply knockback to enemy (if still alive)
    if (enemy.health > 0) {
      this.applyKnockback(enemy, projectile.x, projectile.y, projectile.velocityX, projectile.velocityY, validatedDamage);
    }

    // Check if projectile should be destroyed (piercing limit reached)
    // BUG-004 fix: Only check piercing limit if piercing > 0 (0 means unlimited)
    if (projectile.piercing > 0 && projectile.hitEnemies.size >= projectile.piercing) {
      projectile.lifetime = 0; // Mark for cleanup
    }
  }

  /**
   * P4.3: Calculate team zone damage bonus based on nearby allies
   * Players near each other deal bonus damage
   */
  private calculateTeamZoneDamageBonus(gameState: GameState, playerId: string): number {
    const player = gameState.players.get(playerId);
    if (!player || player.dead) return 0;

    let nearbyAllies = 0;
    const zoneRadius = GAME_CONSTANTS.TEAM_ZONE_RADIUS;

    gameState.players.forEach(other => {
      if (other.id === playerId || other.dead) return;

      const distance = Math.sqrt(
        (other.x - player.x) ** 2 + (other.y - player.y) ** 2
      );

      if (distance <= zoneRadius) {
        nearbyAllies++;
      }
    });

    // Calculate bonus (capped at max)
    const bonus = Math.min(
      nearbyAllies * GAME_CONSTANTS.TEAM_ZONE_DAMAGE_BONUS,
      GAME_CONSTANTS.TEAM_ZONE_MAX_BONUS
    );

    if (bonus > 0) {
      combatSystemLogger.debug({
        playerId,
        nearbyAllies,
        damageBonus: `${(bonus * 100).toFixed(0)}%`
      }, 'Team zone damage bonus applied');
    }

    return bonus;
  }

  /**
   * P4.3: Calculate team zone defense bonus based on nearby allies
   * Players near each other take reduced damage
   */
  private calculateTeamZoneDefenseBonus(gameState: GameState, playerId: string): number {
    const player = gameState.players.get(playerId);
    if (!player || player.dead) return 0;

    let nearbyAllies = 0;
    const zoneRadius = GAME_CONSTANTS.TEAM_ZONE_RADIUS;

    gameState.players.forEach(other => {
      if (other.id === playerId || other.dead) return;

      const distance = Math.sqrt(
        (other.x - player.x) ** 2 + (other.y - player.y) ** 2
      );

      if (distance <= zoneRadius) {
        nearbyAllies++;
      }
    });

    // Calculate bonus (capped at max)
    const bonus = Math.min(
      nearbyAllies * GAME_CONSTANTS.TEAM_ZONE_DEFENSE_BONUS,
      GAME_CONSTANTS.TEAM_ZONE_MAX_BONUS
    );

    return bonus;
  }

  /**
   * P4.4: Update combo system for an enemy and return the damage multiplier
   * Combos increase when different players hit the same enemy in sequence
   */
  private updateComboAndGetMultiplier(enemy: EnemySchema, attackerId: string): number {
    const now = Date.now();
    const comboWindow = GAME_CONSTANTS.COMBO_WINDOW * 1000; // Convert to ms

    // Check if combo has expired
    if (now - enemy.comboLastHitTime > comboWindow) {
      // Combo expired, reset
      enemy.comboCount = 0;
      enemy.comboLastPlayerId = '';
    }

    // Check if this is a different player than the last hit
    if (attackerId !== enemy.comboLastPlayerId && enemy.comboLastPlayerId !== '') {
      // Different player, increase combo!
      enemy.comboCount++;
      this.combatMetrics.maxComboReached = Math.max(
        this.combatMetrics.maxComboReached,
        enemy.comboCount
      );

      combatSystemLogger.debug({
        enemyId: enemy.id,
        attackerId,
        previousAttacker: enemy.comboLastPlayerId,
        comboCount: enemy.comboCount
      }, 'Combo increased');
    }

    // Update tracking
    enemy.comboLastHitTime = now;
    enemy.comboLastPlayerId = attackerId;

    // Calculate multiplier (1.0 base + increment per combo, capped at max)
    const multiplier = Math.min(
      1 + enemy.comboCount * GAME_CONSTANTS.COMBO_INCREMENT,
      GAME_CONSTANTS.COMBO_MAX_MULTIPLIER
    );

    return multiplier;
  }

  /**
   * P9.8: Apply knockback to an enemy when hit by a projectile
   * Knockback direction is based on projectile velocity or direction from source
   * Bosses receive reduced knockback
   */
  private applyKnockback(
    enemy: EnemySchema,
    sourceX: number,
    sourceY: number,
    velocityX: number,
    velocityY: number,
    damage: number
  ): void {
    // Calculate knockback direction from projectile velocity
    // If velocity is near zero (e.g., garlic aura), use direction from source to enemy
    let dirX = velocityX;
    let dirY = velocityY;
    const velMagnitude = Math.sqrt(dirX * dirX + dirY * dirY);

    if (velMagnitude < 0.1) {
      // Use direction from source to enemy for stationary/aura effects
      dirX = enemy.x - sourceX;
      dirY = enemy.y - sourceY;
    }

    // Normalize direction
    const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
    if (magnitude < 0.01) {
      // If no direction available, push in random direction
      const angle = Math.random() * Math.PI * 2;
      dirX = Math.cos(angle);
      dirY = Math.sin(angle);
    } else {
      dirX /= magnitude;
      dirY /= magnitude;
    }

    // Calculate knockback force based on damage
    let force = GAME_CONSTANTS.KNOCKBACK_BASE_FORCE + damage * GAME_CONSTANTS.KNOCKBACK_DAMAGE_SCALE;

    // Reduce knockback for bosses
    if (enemy.type.startsWith('boss_')) {
      force *= GAME_CONSTANTS.KNOCKBACK_BOSS_REDUCTION;
    }

    // Apply knockback
    enemy.knockbackVX = dirX * force;
    enemy.knockbackVY = dirY * force;
    enemy.knockbackEndTime = Date.now() / 1000 + GAME_CONSTANTS.KNOCKBACK_DURATION;
    enemy.isKnockedBack = true;
  }

  private processProjectilePlayerHit(gameState: GameState, projectile: ProjectileSchema, player: PlayerSchema): void {
    // Get source player for hostility tracking
    const sourcePlayer = gameState.players.get(projectile.ownerId);
    if (!sourcePlayer) return;

    // BUG-005 fix: Don't apply PvP damage reduction here - PlayerSchema.takeDamage() handles it
    // Previously this was applying 0.15 multiplier, then takeDamage() applied it again (0.15 * 0.15 = 0.0225)
    const validatedDamage = this.validateDamage(projectile.damage, 'projectile', projectile.type, 1);

    // Apply damage with PvP flag (takeDamage will apply PVP_DAMAGE_MULTIPLIER)
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

    // BUG-010 FIX: Hostility increase now scales with damage dealt instead of fixed +10
    // This makes high-damage attacks more punishing for PvP than weak attacks
    sourcePlayer.hostility = Math.min(sourcePlayer.hostility + validatedDamage * 0.1, 100);

    // Check if projectile piercing exceeded (BUG-004 fix: 0 means unlimited)
    if (projectile.piercing > 0 && projectile.hitEnemies.size >= projectile.piercing) {
      projectile.lifetime = 0;
    }
  }

  private processEnemyProjectilePlayerHit(gameState: GameState, projectile: ProjectileSchema, player: PlayerSchema): void {
    // Validate damage - enemy projectiles deal full damage
    let validatedDamage = this.validateDamage(projectile.damage, 'projectile', projectile.type, 1);

    // P4.3: Apply team zone defense bonus (damage reduction)
    const defenseBonus = this.calculateTeamZoneDefenseBonus(gameState, player.id);
    if (defenseBonus > 0) {
      validatedDamage = Math.floor(validatedDamage * (1 - defenseBonus));
    }

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
    gameState.players.forEach(player => {
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

          let validatedDamage = this.validateDamage(damage, 'contact', enemy.type, 1);

          // P4.3: Apply team zone defense bonus (damage reduction)
          const defenseBonus = this.calculateTeamZoneDefenseBonus(gameState, player.id);
          if (defenseBonus > 0) {
            validatedDamage = Math.floor(validatedDamage * (1 - defenseBonus));
          }

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
    // BUG-009 FIX: Use configured explosion radius from WEAPON_CONFIGS instead of hardcoded 100
    // Fireball area config is 3, so explosions are now properly sized instead of 33x too large
    const explosionRadius = WEAPON_CONFIGS.fireball.area || 3;

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
      explosionRadius,  // radius (BUG-009 FIX)
      999               // piercing (hits all in radius)
    );

    // Apply damage to all enemies in explosion radius
    gameState.enemies.forEach(enemy => {
      if (enemy.health <= 0) return;

      const distance = Math.sqrt((x - enemy.x) ** 2 + (y - enemy.y) ** 2);
      if (distance <= explosionRadius) {  // BUG-009 FIX: use config value
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
    // Collect IDs first to avoid modifying collection during iteration
    const deadEnemyIds: string[] = [];
    gameState.enemies.forEach((enemy, enemyId) => {
      if (enemy.health <= 0) {
        deadEnemyIds.push(enemyId);
      }
    });

    // Now process dead enemies
    deadEnemyIds.forEach(enemyId => {
      const enemy = gameState.enemies.get(enemyId);
      if (enemy) {
        // BUG-018 FIX: Credit the player who killed this enemy
        if (enemy.lastDamagedBy) {
          const killer = gameState.players.get(enemy.lastDamagedBy);
          if (killer && !killer.dead) {
            killer.kills++;
          }
        }

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
    gameState.players.forEach(player => {
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

      combatSystemLogger.debug({ bossType: enemy.type, splitCount: abilityConfig.splitCount, splitType: abilityConfig.splitType }, 'Boss split');
    }
  }

  private recordDamageEvent(event: DamageEvent): void {
    this.recentDamageEvents.push(event);
  }

  private logSecurityViolation(reason: string, data: any): void {
    combatSystemLogger.warn({ reason, ...data }, 'Security violation');
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
      damageValidationErrors: 0,
      comboDamageDealt: 0,
      maxComboReached: 0
    };
    this.recentDamageEvents = [];
    combatSystemLogger.info('Reset for new game');
  }
}