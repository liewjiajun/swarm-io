// =============================================================================
// CORE ENTITY TYPES
// =============================================================================

export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  x: number;
  y: number;
}

// =============================================================================
// PLAYER
// =============================================================================

export interface PlayerState extends Entity {
  nickname: string; // P3.1: Player display name
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  speed: number;
  facingX: number; // Normalized direction X component
  facingY: number; // Normalized direction Y component
  weapons: WeaponState[];
  kills: number;
  timeAlive: number; // Seconds
  hostility: number; // PvP aggression tracker
  invulnerableTime: number; // Seconds remaining of invulnerability
  dead: boolean; // Whether player is dead
  pendingUpgrade: boolean; // Whether player has pending upgrade choice
  armor: number; // Damage reduction
  magnetRange: number; // XP pickup range
}

export interface PlayerInput {
  dx: number; // -1 to 1
  dy: number; // -1 to 1
  sequence: number; // For client-side prediction reconciliation
}

// =============================================================================
// WEAPONS
// =============================================================================

export type WeaponType =
  | 'knife'      // Directional slash
  | 'wand'       // Directional projectile
  | 'bible'      // Orbital rotation
  | 'garlic'     // AOE around player
  | 'lightning'  // Homing strike
  | 'axe'        // Piercing throw (passes through enemies)
  | 'fireball'   // Exploding projectile
  | 'whip';      // Wide arc attack

export interface WeaponConfig {
  type: WeaponType;
  name: string;
  description: string;
  baseDamage: number;
  baseCooldown: number; // Seconds
  baseRange: number;
  maxLevel: number;
  projectileSpeed?: number;
  projectileCount?: number;
  area?: number; // For AOE weapons
  // Computed properties for backward compatibility
  damage: number;
  cooldown: number;
  range: number;
}

export interface WeaponState {
  type: string; // WeaponType at runtime, but Colyseus sends as string
  level: number;
  cooldownRemaining: number;
  // P9.4: Weapon Evolution System
  evolved: boolean;     // Whether weapon has evolved
  evolvedType: string;  // The evolved weapon type (e.g., 'thousand_cuts')
}

// =============================================================================
// PROJECTILES
// =============================================================================

export type ProjectileType =
  | 'bullet'
  | 'slash'
  | 'orb'
  | 'lightning_bolt'
  | 'axe_spin'
  | 'fireball'
  | 'explosion'
  | 'demon_fireball';

export interface ProjectileState extends Entity {
  type: string; // ProjectileType at runtime, but Colyseus sends as string
  ownerId: string;
  damage: number;
  velocityX: number;
  velocityY: number;
  lifetime: number; // Remaining seconds
  radius: number;
  piercing: number; // How many enemies it can hit (0 = unlimited)
  // Note: hitEnemies is tracked server-side only (not synced to client)
}

// =============================================================================
// ENEMIES
// =============================================================================

export type EnemyType =
  | 'bat'       // Fast, weak, swarm
  | 'skeleton'  // Medium speed/health
  | 'zombie'    // Slow, tanky
  | 'ghost'     // Phases through other enemies
  | 'slime'     // Splits on death into mini_slimes
  | 'mini_slime' // Small slime that doesn't split
  | 'demon'     // Ranged attack
  | 'boss_slime'    // Boss variant
  | 'boss_skeleton' // Boss variant
  | 'boss_demon'    // Boss variant
  | 'secret_boss';  // P5.3: Secret boss - spawns when all players reach level 15+

export interface EnemyConfig {
  type: EnemyType;
  name: string;
  health: number;
  speed: number;
  damage: number;
  xpValue: number;
  size: number; // Collision radius
  isBoss: boolean;
}

export interface EnemyState extends Entity {
  type: string; // EnemyType at runtime, but Colyseus sends as string
  health: number;
  maxHealth: number;
  targetPlayerId: string; // Empty string when no target
  velocityX: number;
  velocityY: number;
}

// =============================================================================
// XP ORBS
// =============================================================================

export type XPOrbSize = 'small' | 'medium' | 'large' | 'jackpot';

export interface XPOrbState extends Entity {
  size: string; // XPOrbSize at runtime ('small' | 'medium' | 'large' | 'jackpot')
  value: number;
  magnetized: boolean; // Being pulled toward a player
  targetPlayerId: string; // Empty string when no target
  isJackpot: boolean; // P5.5: Whether this is a jackpot orb (rare, 500 XP, attracts enemies)
}

// =============================================================================
// WORLD STATE
// =============================================================================

export interface WorldState {
  worldRadius: number;
  playerCount: number;
  gameTime: number; // Seconds since world started
  currentWave: number;
  difficulty: number; // Multiplier for enemy stats
}

// =============================================================================
// GAME STATE (Full synchronized state)
// =============================================================================

export interface GameState {
  world: WorldState;
  players: Map<string, PlayerState>;
  enemies: Map<string, EnemyState>;
  projectiles: Map<string, ProjectileState>;
  xpOrbs: Map<string, XPOrbState>;
  hazards: Map<string, HazardState>; // P5.4: Environmental hazards
}

// =============================================================================
// NETWORK MESSAGES
// =============================================================================

export interface ServerMessage {
  type: 'state_update' | 'player_died' | 'level_up' | 'damage_dealt' | 'enemy_killed';
}

export interface StateUpdateMessage extends ServerMessage {
  type: 'state_update';
  lastProcessedSequence: number; // For client prediction reconciliation
}

export interface PlayerDiedMessage extends ServerMessage {
  type: 'player_died';
  playerId: string;
  killedBy: string; // Enemy ID or player ID
  finalScore: number;
}

export interface LevelUpMessage extends ServerMessage {
  type: 'level_up';
  newLevel: number;
  choices: UpgradeChoice[];
}

export interface UpgradeChoice {
  id: string;
  type: 'new_weapon' | 'upgrade_weapon' | 'stat_boost';
  weaponType?: WeaponType;
  statType?: 'health' | 'speed' | 'magnet' | 'armor';
  description: string;
  currentLevel?: number;
  maxLevel?: number;
}

export interface ClientMessage {
  type: 'input' | 'choose_upgrade' | 'respawn' | 'trade_offer' | 'trade_response' | 'trade_cancel';
}

export interface InputMessage extends ClientMessage {
  type: 'input';
  input: PlayerInput;
}

export interface ChooseUpgradeMessage extends ClientMessage {
  type: 'choose_upgrade';
  choiceId: string;
}

export interface RespawnMessage extends ClientMessage {
  type: 'respawn';
}

export interface UpgradeMessage extends ClientMessage {
  type: 'choose_upgrade';
  choice: {
    id: string;
    type: 'weapon' | 'stat';
    weaponType?: string;
    statType?: string;
    description: string;
    weight: number;
  };
}

// =============================================================================
// P4.6: TRADING/GIFTING UPGRADES
// =============================================================================

export interface TradeOfferMessage extends ClientMessage {
  type: 'trade_offer';
  targetPlayerId: string; // Player to offer trade to
  weaponType: string; // Weapon being offered
}

export interface TradeResponseMessage extends ClientMessage {
  type: 'trade_response';
  offerId: string; // ID of the trade offer
  accepted: boolean; // Whether the trade was accepted
}

export interface TradeCancelMessage extends ClientMessage {
  type: 'trade_cancel';
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  weaponType: string;
  weaponLevel: number;
  createdAt: number; // Timestamp
}

// =============================================================================
// P5.1: WORLD EVENTS
// =============================================================================

export type WorldEventType =
  | 'meteor_shower'      // Meteors fall from sky, dealing damage
  | 'invasion_wave'      // Extra enemy spawn wave
  | 'double_xp_zone';    // Area grants 2x XP for a duration

export interface WorldEvent {
  id: string;
  type: WorldEventType;
  x: number;              // Center position
  y: number;
  radius: number;         // Affected area
  startTime: number;      // Game time when event started
  duration: number;       // How long the event lasts
  active: boolean;        // Whether event is currently active
}

export interface WorldEventState extends WorldEvent {
  // Additional synced state for different event types
  intensity?: number;     // For meteor_shower: damage per meteor
  spawnedCount?: number;  // For invasion_wave: enemies spawned so far
  xpMultiplier?: number;  // For double_xp_zone: XP multiplier
}

// =============================================================================
// P5.2: HIDDEN POWER-UPS
// =============================================================================

export type PowerUpType =
  | 'health_restore'  // Instant health restoration
  | 'damage_boost'    // Temporary damage increase
  | 'speed_boost'     // Temporary movement speed increase
  | 'shield'          // Temporary invulnerability
  | 'magnet_boost';   // Temporary XP magnet range increase

export interface PowerUpState extends Entity {
  type: string;       // PowerUpType at runtime
  spawnTime: number;  // Game time when spawned
  lifetime: number;   // How long before despawning
}

// =============================================================================
// P5.4: ENVIRONMENTAL HAZARDS
// =============================================================================

export type HazardType =
  | 'lava'        // DOT damage, spawns randomly
  | 'ice'         // Slow movement, spawns in groups
  | 'teleporter'; // Paired portals, random placement

export interface HazardState extends Entity {
  type: string;        // HazardType at runtime
  radius: number;      // Collision/effect radius
  active: boolean;     // Whether hazard is currently active
  spawnTime: number;   // Game time when spawned
  duration: number;    // How long before despawning (0 = permanent)
  // Teleporter-specific
  linkedHazardId: string; // ID of paired teleporter (empty for non-teleporters)
  // Visual state
  animationTime: number;  // For client-side animation timing
}

// =============================================================================
// UPGRADE CHOICES
// =============================================================================

export interface UpgradeDefinition {
  id: string;
  type: 'new_weapon' | 'upgrade_weapon' | 'stat_boost';
  weaponType?: WeaponType;
  statType?: 'health' | 'speed' | 'magnet' | 'armor';
  statBoost?: number;
  description: string;
  weight: number; // For weighted random selection
  maxLevel: number;
}