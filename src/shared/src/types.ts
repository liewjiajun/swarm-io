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
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  speed: number;
  facing: Vector2; // Normalized direction vector
  weapons: WeaponState[];
  kills: number;
  timeAlive: number; // Seconds
  hostility: number; // PvP aggression tracker
  invulnerable: boolean; // Brief invulnerability after respawn
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
  | 'axe'        // Boomerang projectile
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
  type: WeaponType;
  level: number;
  cooldownRemaining: number;
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
  | 'explosion';

export interface ProjectileState extends Entity {
  type: ProjectileType;
  ownerId: string;
  damage: number;
  velocityX: number;
  velocityY: number;
  lifetime: number; // Remaining seconds
  radius: number;
  piercing: number; // How many enemies it can hit (0 = unlimited)
  hitEnemies: string[]; // IDs of enemies already hit
}

// =============================================================================
// ENEMIES
// =============================================================================

export type EnemyType =
  | 'bat'       // Fast, weak, swarm
  | 'skeleton'  // Medium speed/health
  | 'zombie'    // Slow, tanky
  | 'ghost'     // Phases through other enemies
  | 'slime'     // Splits on death
  | 'demon'     // Ranged attack
  | 'boss_slime'    // Boss variant
  | 'boss_skeleton' // Boss variant
  | 'boss_demon';   // Boss variant

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
  type: EnemyType;
  health: number;
  maxHealth: number;
  targetPlayerId: string | null;
  velocityX: number;
  velocityY: number;
}

// =============================================================================
// XP ORBS
// =============================================================================

export type XPOrbSize = 'small' | 'medium' | 'large';

export interface XPOrbState extends Entity {
  size: XPOrbSize;
  value: number;
  magnetized: boolean; // Being pulled toward a player
  targetPlayerId: string | null;
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
  type: 'input' | 'choose_upgrade' | 'respawn';
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