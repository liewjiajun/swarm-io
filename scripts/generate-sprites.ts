/**
 * Sprite Atlas Generator
 *
 * Generates a 512x512 pixel art sprite atlas for SWARM.IO
 * Creates retro Game Boy-inspired sprites with the game's color palette
 *
 * Run with: npx tsx scripts/generate-sprites.ts
 */

import sharp from 'sharp';
import path from 'path';

// Atlas dimensions
const ATLAS_WIDTH = 512;
const ATLAS_HEIGHT = 512;

// Color palette (from constants.ts, converted to RGBA)
const COLORS = {
  // Player colors
  PLAYER_LOCAL: { r: 0, g: 255, b: 0, a: 255 },
  PLAYER_DARK: { r: 0, g: 180, b: 0, a: 255 },
  PLAYER_LIGHT: { r: 100, g: 255, b: 100, a: 255 },
  PLAYER_OUTLINE: { r: 0, g: 100, b: 0, a: 255 },

  // Enemy colors
  ENEMY_BAT: { r: 139, g: 69, b: 19, a: 255 },
  ENEMY_BAT_DARK: { r: 100, g: 50, b: 10, a: 255 },
  ENEMY_BAT_LIGHT: { r: 180, g: 100, b: 50, a: 255 },

  ENEMY_SKELETON: { r: 255, g: 255, b: 255, a: 255 },
  ENEMY_SKELETON_DARK: { r: 180, g: 180, b: 180, a: 255 },
  ENEMY_SKELETON_BONE: { r: 230, g: 230, b: 210, a: 255 },

  ENEMY_ZOMBIE: { r: 34, g: 139, b: 34, a: 255 },
  ENEMY_ZOMBIE_DARK: { r: 20, g: 100, b: 20, a: 255 },
  ENEMY_ZOMBIE_LIGHT: { r: 60, g: 180, b: 60, a: 255 },

  ENEMY_GHOST: { r: 135, g: 206, b: 235, a: 200 },
  ENEMY_GHOST_LIGHT: { r: 200, g: 230, b: 255, a: 180 },
  ENEMY_GHOST_DARK: { r: 100, g: 150, b: 200, a: 220 },

  ENEMY_SLIME: { r: 50, g: 205, b: 50, a: 255 },
  ENEMY_SLIME_DARK: { r: 30, g: 150, b: 30, a: 255 },
  ENEMY_SLIME_LIGHT: { r: 100, g: 255, b: 100, a: 255 },

  ENEMY_DEMON: { r: 255, g: 69, b: 0, a: 255 },
  ENEMY_DEMON_DARK: { r: 180, g: 40, b: 0, a: 255 },
  ENEMY_DEMON_LIGHT: { r: 255, g: 120, b: 60, a: 255 },

  // XP orbs
  XP_SMALL: { r: 0, g: 255, b: 136, a: 255 },
  XP_MEDIUM: { r: 0, g: 255, b: 255, a: 255 },
  XP_LARGE: { r: 255, g: 255, b: 0, a: 255 },
  XP_GLOW: { r: 255, g: 255, b: 255, a: 100 },

  // Projectiles
  PROJ_KNIFE: { r: 192, g: 192, b: 192, a: 255 },
  PROJ_WAND: { r: 155, g: 89, b: 182, a: 255 },
  PROJ_BIBLE: { r: 255, g: 215, b: 0, a: 255 },
  PROJ_LIGHTNING: { r: 0, g: 255, b: 255, a: 255 },
  PROJ_AXE: { r: 139, g: 69, b: 19, a: 255 },
  PROJ_FIREBALL: { r: 255, g: 69, b: 0, a: 255 },
  PROJ_WHIP: { r: 165, g: 42, b: 42, a: 255 },
  PROJ_GARLIC: { r: 144, g: 238, b: 144, a: 255 },

  // Common
  BLACK: { r: 0, g: 0, b: 0, a: 255 },
  WHITE: { r: 255, g: 255, b: 255, a: 255 },
  TRANSPARENT: { r: 0, g: 0, b: 0, a: 0 },
};

type RGBA = { r: number; g: number; b: number; a: number };

// Canvas class for drawing pixels
class PixelCanvas {
  private data: Uint8ClampedArray;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    // Initialize with transparent pixels
    this.clear();
  }

  clear(): void {
    this.data.fill(0);
  }

  setPixel(x: number, y: number, color: RGBA): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = color.r;
    this.data[i + 1] = color.g;
    this.data[i + 2] = color.b;
    this.data[i + 3] = color.a;
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGBA): void {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.setPixel(px, py, color);
      }
    }
  }

  // Draw a circle (filled)
  fillCircle(cx: number, cy: number, radius: number, color: RGBA): void {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          this.setPixel(cx + x, cy + y, color);
        }
      }
    }
  }

  // Draw ellipse
  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: RGBA): void {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
          this.setPixel(cx + x, cy + y, color);
        }
      }
    }
  }

  // Draw line
  drawLine(x1: number, y1: number, x2: number, y2: number, color: RGBA): void {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.setPixel(x1, y1, color);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x1 += sx; }
      if (e2 < dx) { err += dx; y1 += sy; }
    }
  }

  getBuffer(): Buffer {
    return Buffer.from(this.data);
  }
}

// Sprite drawing functions

function drawPlayerIdle(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // 32x32 player sprite - humanoid character
  const baseX = x;
  const baseY = y;

  // Idle animation - slight bob
  const bob = frame % 2 === 0 ? 0 : 1;

  // Body (centered in 32x32, character is roughly 20x24)
  const cx = baseX + 16; // center x
  const cy = baseY + 16 + bob; // center y with bob

  // Head (8x8)
  canvas.fillRect(cx - 4, cy - 12, 8, 8, COLORS.PLAYER_LOCAL);
  canvas.fillRect(cx - 3, cy - 11, 6, 6, COLORS.PLAYER_LIGHT);
  // Eyes
  canvas.setPixel(cx - 2, cy - 9, COLORS.BLACK);
  canvas.setPixel(cx + 1, cy - 9, COLORS.BLACK);

  // Body (8x10)
  canvas.fillRect(cx - 4, cy - 4, 8, 10, COLORS.PLAYER_LOCAL);
  canvas.fillRect(cx - 3, cy - 3, 6, 8, COLORS.PLAYER_DARK);

  // Arms (different positions per frame for idle animation)
  const armOffset = frame === 1 || frame === 3 ? 1 : 0;
  canvas.fillRect(cx - 7, cy - 3 + armOffset, 3, 6, COLORS.PLAYER_LOCAL);
  canvas.fillRect(cx + 4, cy - 3 - armOffset, 3, 6, COLORS.PLAYER_LOCAL);

  // Legs
  canvas.fillRect(cx - 3, cy + 6, 3, 5, COLORS.PLAYER_DARK);
  canvas.fillRect(cx, cy + 6, 3, 5, COLORS.PLAYER_DARK);

  // Outline effect
  canvas.setPixel(cx - 5, cy - 13, COLORS.PLAYER_OUTLINE);
  canvas.setPixel(cx + 4, cy - 13, COLORS.PLAYER_OUTLINE);
}

function drawPlayerWalk(canvas: PixelCanvas, x: number, y: number, frame: number, direction: 'down' | 'up' | 'left' | 'right'): void {
  const baseX = x;
  const baseY = y;
  const cx = baseX + 16;
  const cy = baseY + 16;

  // Walking animation - leg movement
  const legPhase = frame % 4;
  const leftLegY = legPhase === 0 || legPhase === 2 ? 0 : (legPhase === 1 ? -2 : 2);
  const rightLegY = legPhase === 0 || legPhase === 2 ? 0 : (legPhase === 1 ? 2 : -2);
  const bodyBob = legPhase === 1 || legPhase === 3 ? 1 : 0;

  // Arm swing
  const armPhase = frame % 4;
  const leftArmY = armPhase === 0 || armPhase === 2 ? 0 : (armPhase === 1 ? 2 : -2);
  const rightArmY = armPhase === 0 || armPhase === 2 ? 0 : (armPhase === 1 ? -2 : 2);

  if (direction === 'down') {
    // Facing camera
    // Head
    canvas.fillRect(cx - 4, cy - 12 + bodyBob, 8, 8, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 3, cy - 11 + bodyBob, 6, 6, COLORS.PLAYER_LIGHT);
    canvas.setPixel(cx - 2, cy - 9 + bodyBob, COLORS.BLACK);
    canvas.setPixel(cx + 1, cy - 9 + bodyBob, COLORS.BLACK);
    // Body
    canvas.fillRect(cx - 4, cy - 4 + bodyBob, 8, 10, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 3, cy - 3 + bodyBob, 6, 8, COLORS.PLAYER_DARK);
    // Arms
    canvas.fillRect(cx - 7, cy - 3 + leftArmY + bodyBob, 3, 6, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx + 4, cy - 3 + rightArmY + bodyBob, 3, 6, COLORS.PLAYER_LOCAL);
    // Legs
    canvas.fillRect(cx - 3, cy + 6 + leftLegY + bodyBob, 3, 5, COLORS.PLAYER_DARK);
    canvas.fillRect(cx, cy + 6 + rightLegY + bodyBob, 3, 5, COLORS.PLAYER_DARK);
  } else if (direction === 'up') {
    // Facing away
    canvas.fillRect(cx - 4, cy - 12 + bodyBob, 8, 8, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 3, cy - 11 + bodyBob, 6, 6, COLORS.PLAYER_DARK);
    canvas.fillRect(cx - 4, cy - 4 + bodyBob, 8, 10, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 3, cy - 3 + bodyBob, 6, 8, COLORS.PLAYER_DARK);
    canvas.fillRect(cx - 7, cy - 3 - leftArmY + bodyBob, 3, 6, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx + 4, cy - 3 - rightArmY + bodyBob, 3, 6, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 3, cy + 6 - leftLegY + bodyBob, 3, 5, COLORS.PLAYER_DARK);
    canvas.fillRect(cx, cy + 6 - rightLegY + bodyBob, 3, 5, COLORS.PLAYER_DARK);
  } else if (direction === 'left') {
    // Side view facing left
    canvas.fillRect(cx - 2, cy - 12 + bodyBob, 6, 8, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 1, cy - 11 + bodyBob, 4, 6, COLORS.PLAYER_LIGHT);
    canvas.setPixel(cx - 1, cy - 9 + bodyBob, COLORS.BLACK);
    canvas.fillRect(cx - 2, cy - 4 + bodyBob, 5, 10, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 1, cy - 3 + bodyBob, 3, 8, COLORS.PLAYER_DARK);
    // Single arm visible
    canvas.fillRect(cx - 4, cy - 3 + leftArmY + bodyBob, 3, 6, COLORS.PLAYER_LOCAL);
    // Legs (staggered)
    canvas.fillRect(cx - 1 - (legPhase === 1 || legPhase === 3 ? 1 : 0), cy + 6 + bodyBob, 3, 5, COLORS.PLAYER_DARK);
  } else { // right
    // Side view facing right
    canvas.fillRect(cx - 4, cy - 12 + bodyBob, 6, 8, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 3, cy - 11 + bodyBob, 4, 6, COLORS.PLAYER_LIGHT);
    canvas.setPixel(cx, cy - 9 + bodyBob, COLORS.BLACK);
    canvas.fillRect(cx - 3, cy - 4 + bodyBob, 5, 10, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 2, cy - 3 + bodyBob, 3, 8, COLORS.PLAYER_DARK);
    canvas.fillRect(cx + 1, cy - 3 + rightArmY + bodyBob, 3, 6, COLORS.PLAYER_LOCAL);
    canvas.fillRect(cx - 2 + (legPhase === 1 || legPhase === 3 ? 1 : 0), cy + 6 + bodyBob, 3, 5, COLORS.PLAYER_DARK);
  }
}

function drawBat(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 16;
  const cy = y + 16;

  // Wing animation
  const wingUp = frame === 0;

  // Body (small oval)
  canvas.fillEllipse(cx, cy, 4, 5, COLORS.ENEMY_BAT);
  canvas.fillEllipse(cx, cy, 3, 4, COLORS.ENEMY_BAT_LIGHT);

  // Wings
  if (wingUp) {
    // Wings up
    canvas.fillRect(cx - 10, cy - 6, 6, 4, COLORS.ENEMY_BAT);
    canvas.fillRect(cx + 4, cy - 6, 6, 4, COLORS.ENEMY_BAT);
    canvas.fillRect(cx - 8, cy - 4, 4, 3, COLORS.ENEMY_BAT_DARK);
    canvas.fillRect(cx + 4, cy - 4, 4, 3, COLORS.ENEMY_BAT_DARK);
  } else {
    // Wings down
    canvas.fillRect(cx - 10, cy - 2, 6, 4, COLORS.ENEMY_BAT);
    canvas.fillRect(cx + 4, cy - 2, 6, 4, COLORS.ENEMY_BAT);
    canvas.fillRect(cx - 8, cy, 4, 3, COLORS.ENEMY_BAT_DARK);
    canvas.fillRect(cx + 4, cy, 4, 3, COLORS.ENEMY_BAT_DARK);
  }

  // Eyes (red glowing)
  canvas.setPixel(cx - 2, cy - 2, { r: 255, g: 0, b: 0, a: 255 });
  canvas.setPixel(cx + 1, cy - 2, { r: 255, g: 0, b: 0, a: 255 });

  // Ears
  canvas.setPixel(cx - 3, cy - 5, COLORS.ENEMY_BAT);
  canvas.setPixel(cx + 2, cy - 5, COLORS.ENEMY_BAT);
}

function drawSkeleton(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 16;
  const cy = y + 16;
  const bob = frame === 0 ? 0 : 1;

  // Skull
  canvas.fillRect(cx - 5, cy - 12 + bob, 10, 9, COLORS.ENEMY_SKELETON);
  canvas.fillRect(cx - 4, cy - 11 + bob, 8, 7, COLORS.ENEMY_SKELETON_BONE);
  // Eye sockets
  canvas.fillRect(cx - 3, cy - 10 + bob, 2, 3, COLORS.BLACK);
  canvas.fillRect(cx + 1, cy - 10 + bob, 2, 3, COLORS.BLACK);
  // Jaw
  canvas.fillRect(cx - 3, cy - 5 + bob, 6, 2, COLORS.ENEMY_SKELETON_DARK);

  // Ribcage
  canvas.fillRect(cx - 4, cy - 2 + bob, 8, 6, COLORS.ENEMY_SKELETON);
  for (let i = 0; i < 3; i++) {
    canvas.fillRect(cx - 3, cy - 1 + i * 2 + bob, 6, 1, COLORS.ENEMY_SKELETON_DARK);
  }

  // Spine
  canvas.fillRect(cx - 1, cy + 4 + bob, 2, 4, COLORS.ENEMY_SKELETON_BONE);

  // Arms (bones)
  const armSwing = frame === 0 ? 0 : 2;
  canvas.fillRect(cx - 8, cy - 2 + armSwing + bob, 4, 2, COLORS.ENEMY_SKELETON_BONE);
  canvas.fillRect(cx + 4, cy - 2 - armSwing + bob, 4, 2, COLORS.ENEMY_SKELETON_BONE);

  // Legs
  canvas.fillRect(cx - 3, cy + 8 + bob, 2, 5, COLORS.ENEMY_SKELETON_BONE);
  canvas.fillRect(cx + 1, cy + 8 + bob, 2, 5, COLORS.ENEMY_SKELETON_BONE);
}

function drawZombie(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 16;
  const cy = y + 16;
  const bob = frame === 0 ? 0 : 1;

  // Head (larger, deformed)
  canvas.fillRect(cx - 5, cy - 12 + bob, 10, 9, COLORS.ENEMY_ZOMBIE);
  canvas.fillRect(cx - 4, cy - 11 + bob, 8, 7, COLORS.ENEMY_ZOMBIE_LIGHT);
  // Dead eyes
  canvas.setPixel(cx - 2, cy - 9 + bob, { r: 255, g: 255, b: 0, a: 255 });
  canvas.setPixel(cx + 2, cy - 9 + bob, { r: 255, g: 255, b: 0, a: 255 });
  // Mouth
  canvas.fillRect(cx - 2, cy - 6 + bob, 4, 2, COLORS.ENEMY_ZOMBIE_DARK);

  // Body (hunched)
  canvas.fillRect(cx - 5, cy - 3 + bob, 10, 10, COLORS.ENEMY_ZOMBIE);
  canvas.fillRect(cx - 4, cy - 2 + bob, 8, 8, COLORS.ENEMY_ZOMBIE_DARK);

  // Arms (outstretched, zombie pose)
  canvas.fillRect(cx - 10, cy - 4, 5, 3, COLORS.ENEMY_ZOMBIE);
  canvas.fillRect(cx + 5, cy - 4, 5, 3, COLORS.ENEMY_ZOMBIE);

  // Legs
  canvas.fillRect(cx - 4, cy + 7 + bob, 3, 5, COLORS.ENEMY_ZOMBIE_DARK);
  canvas.fillRect(cx + 1, cy + 7 + bob, 3, 5, COLORS.ENEMY_ZOMBIE_DARK);
}

function drawGhost(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 16;
  const cy = y + 16;
  const float = frame === 0 ? -2 : 0;

  // Main body (translucent)
  canvas.fillEllipse(cx, cy - 4 + float, 8, 10, COLORS.ENEMY_GHOST);
  canvas.fillEllipse(cx, cy - 6 + float, 6, 6, COLORS.ENEMY_GHOST_LIGHT);

  // Wavy bottom
  for (let i = -6; i <= 6; i += 3) {
    const waveOffset = (frame === 0 ? (i + 6) % 2 : (i + 7) % 2) * 2;
    canvas.fillRect(cx + i - 1, cy + 5 + float + waveOffset, 3, 4, COLORS.ENEMY_GHOST);
  }

  // Eyes (hollow)
  canvas.fillRect(cx - 4, cy - 7 + float, 3, 4, COLORS.ENEMY_GHOST_DARK);
  canvas.fillRect(cx + 1, cy - 7 + float, 3, 4, COLORS.ENEMY_GHOST_DARK);
  // Pupils
  canvas.setPixel(cx - 3, cy - 5 + float, COLORS.BLACK);
  canvas.setPixel(cx + 2, cy - 5 + float, COLORS.BLACK);

  // Mouth (O shape)
  canvas.fillEllipse(cx, cy - 1 + float, 2, 2, COLORS.ENEMY_GHOST_DARK);
}

function drawSlime(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 16;
  const cy = y + 16;

  // Bounce animation
  const squash = frame === 0;
  const rx = squash ? 10 : 8;
  const ry = squash ? 6 : 9;
  const yOffset = squash ? 2 : 0;

  // Body (blob shape)
  canvas.fillEllipse(cx, cy + yOffset, rx, ry, COLORS.ENEMY_SLIME);
  canvas.fillEllipse(cx, cy - 2 + yOffset, rx - 2, ry - 2, COLORS.ENEMY_SLIME_LIGHT);

  // Shine highlight
  canvas.fillRect(cx - 4, cy - 4 + yOffset, 3, 2, COLORS.WHITE);

  // Eyes (cute)
  canvas.fillRect(cx - 4, cy - 1 + yOffset, 3, 3, COLORS.BLACK);
  canvas.fillRect(cx + 1, cy - 1 + yOffset, 3, 3, COLORS.BLACK);
  // Eye shine
  canvas.setPixel(cx - 3, cy - 1 + yOffset, COLORS.WHITE);
  canvas.setPixel(cx + 2, cy - 1 + yOffset, COLORS.WHITE);

  // Mouth (happy curve)
  canvas.setPixel(cx - 2, cy + 3 + yOffset, COLORS.ENEMY_SLIME_DARK);
  canvas.setPixel(cx - 1, cy + 4 + yOffset, COLORS.ENEMY_SLIME_DARK);
  canvas.setPixel(cx, cy + 4 + yOffset, COLORS.ENEMY_SLIME_DARK);
  canvas.setPixel(cx + 1, cy + 3 + yOffset, COLORS.ENEMY_SLIME_DARK);
}

function drawDemon(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 16;
  const cy = y + 16;
  const bob = frame === 0 ? 0 : 1;

  // Horns
  canvas.fillRect(cx - 7, cy - 14 + bob, 3, 5, COLORS.ENEMY_DEMON_DARK);
  canvas.fillRect(cx + 4, cy - 14 + bob, 3, 5, COLORS.ENEMY_DEMON_DARK);

  // Head
  canvas.fillRect(cx - 5, cy - 10 + bob, 10, 8, COLORS.ENEMY_DEMON);
  canvas.fillRect(cx - 4, cy - 9 + bob, 8, 6, COLORS.ENEMY_DEMON_LIGHT);

  // Eyes (glowing)
  canvas.fillRect(cx - 3, cy - 8 + bob, 2, 2, { r: 255, g: 255, b: 0, a: 255 });
  canvas.fillRect(cx + 1, cy - 8 + bob, 2, 2, { r: 255, g: 255, b: 0, a: 255 });

  // Fanged mouth
  canvas.fillRect(cx - 3, cy - 4 + bob, 6, 2, COLORS.BLACK);
  canvas.setPixel(cx - 2, cy - 3 + bob, COLORS.WHITE);
  canvas.setPixel(cx + 1, cy - 3 + bob, COLORS.WHITE);

  // Body (muscular)
  canvas.fillRect(cx - 6, cy - 2 + bob, 12, 10, COLORS.ENEMY_DEMON);
  canvas.fillRect(cx - 5, cy - 1 + bob, 10, 8, COLORS.ENEMY_DEMON_DARK);

  // Arms
  canvas.fillRect(cx - 10, cy - 2 + bob, 4, 6, COLORS.ENEMY_DEMON);
  canvas.fillRect(cx + 6, cy - 2 + bob, 4, 6, COLORS.ENEMY_DEMON);

  // Legs
  canvas.fillRect(cx - 4, cy + 8 + bob, 3, 5, COLORS.ENEMY_DEMON_DARK);
  canvas.fillRect(cx + 1, cy + 8 + bob, 3, 5, COLORS.ENEMY_DEMON_DARK);

  // Tail
  canvas.fillRect(cx + 4, cy + 5 + bob, 5, 2, COLORS.ENEMY_DEMON);
  canvas.setPixel(cx + 8, cy + 4 + bob, COLORS.ENEMY_DEMON);
}

function drawXPOrb(canvas: PixelCanvas, x: number, y: number, size: 'small' | 'medium' | 'large'): void {
  const colors = {
    small: COLORS.XP_SMALL,
    medium: COLORS.XP_MEDIUM,
    large: COLORS.XP_LARGE,
  };
  const radii = { small: 5, medium: 8, large: 12 };

  const color = colors[size];
  const radius = radii[size];
  const dims = { small: 16, medium: 24, large: 32 };
  const cx = x + dims[size] / 2;
  const cy = y + dims[size] / 2;

  // Outer glow
  canvas.fillCircle(cx, cy, radius, { ...color, a: 100 });

  // Main orb
  canvas.fillCircle(cx, cy, radius - 2, color);

  // Inner shine
  canvas.fillCircle(cx - 1, cy - 1, radius - 4, { ...color, a: 200 });

  // Highlight
  canvas.setPixel(cx - radius + 4, cy - radius + 4, COLORS.WHITE);
  if (size !== 'small') {
    canvas.setPixel(cx - radius + 5, cy - radius + 4, COLORS.WHITE);
    canvas.setPixel(cx - radius + 4, cy - radius + 5, COLORS.WHITE);
  }
}

function drawProjectileSlash(canvas: PixelCanvas, x: number, y: number): void {
  const cx = x + 12;
  const cy = y + 12;

  // Arc slash effect
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI / 16);
    const r1 = 4;
    const r2 = 10;
    const x1 = cx + Math.cos(angle) * r1;
    const y1 = cy + Math.sin(angle) * r1;
    const x2 = cx + Math.cos(angle) * r2;
    const y2 = cy + Math.sin(angle) * r2;
    canvas.drawLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), COLORS.PROJ_KNIFE);
  }
  // Center glow
  canvas.fillCircle(cx, cy, 3, { ...COLORS.WHITE, a: 150 });
}

function drawProjectileBullet(canvas: PixelCanvas, x: number, y: number): void {
  const cx = x + 8;
  const cy = y + 8;

  // Magic bullet
  canvas.fillCircle(cx, cy, 5, COLORS.PROJ_WAND);
  canvas.fillCircle(cx, cy, 3, { r: 200, g: 150, b: 255, a: 255 });
  canvas.setPixel(cx - 1, cy - 1, COLORS.WHITE);
}

function drawProjectileOrb(canvas: PixelCanvas, x: number, y: number): void {
  const cx = x + 12;
  const cy = y + 12;

  // Bible orb (holy golden)
  canvas.fillCircle(cx, cy, 8, COLORS.PROJ_BIBLE);
  canvas.fillCircle(cx, cy, 6, { r: 255, g: 230, b: 100, a: 255 });
  // Cross pattern
  canvas.fillRect(cx - 1, cy - 4, 2, 8, { r: 255, g: 255, b: 200, a: 255 });
  canvas.fillRect(cx - 3, cy - 1, 6, 2, { r: 255, g: 255, b: 200, a: 255 });
}

function drawProjectileLightning(canvas: PixelCanvas, x: number, y: number): void {
  // Lightning bolt (16x32)
  const bx = x + 8;
  const by = y + 16;

  // Zig-zag pattern
  canvas.fillRect(bx - 2, by - 14, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx - 4, by - 10, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx - 2, by - 6, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx, by - 2, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx + 2, by + 2, 4, 6, COLORS.PROJ_LIGHTNING);

  // White core
  canvas.fillRect(bx, by - 12, 2, 20, COLORS.WHITE);
}

function drawProjectileAxe(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 12;
  const cy = y + 12;
  const angle = frame === 0 ? 0 : Math.PI / 4;

  // Axe head
  canvas.fillRect(cx - 2, cy - 8, 4, 16, { r: 100, g: 60, b: 20, a: 255 }); // Handle

  if (frame === 0) {
    // Blade pointing right
    canvas.fillRect(cx + 2, cy - 6, 6, 6, { r: 180, g: 180, b: 180, a: 255 });
    canvas.fillRect(cx + 4, cy - 4, 4, 4, COLORS.PROJ_KNIFE);
  } else {
    // Blade at 45 degrees (simplified)
    canvas.fillRect(cx - 6, cy - 6, 6, 6, { r: 180, g: 180, b: 180, a: 255 });
    canvas.fillRect(cx - 4, cy - 4, 4, 4, COLORS.PROJ_KNIFE);
  }
}

function drawProjectileFireball(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  const cx = x + 12;
  const cy = y + 12;

  // Flame animation
  const flicker = frame === 0 ? 0 : 2;

  // Outer flames
  canvas.fillCircle(cx, cy + flicker, 8, { r: 255, g: 100, b: 0, a: 200 });
  // Inner fire
  canvas.fillCircle(cx, cy + flicker, 6, COLORS.PROJ_FIREBALL);
  // Core
  canvas.fillCircle(cx, cy + flicker, 4, { r: 255, g: 200, b: 100, a: 255 });
  // Hot center
  canvas.fillCircle(cx, cy + flicker, 2, { r: 255, g: 255, b: 200, a: 255 });

  // Flame wisps
  if (frame === 0) {
    canvas.setPixel(cx - 3, cy - 5, { r: 255, g: 150, b: 50, a: 255 });
    canvas.setPixel(cx + 2, cy - 6, { r: 255, g: 150, b: 50, a: 255 });
  } else {
    canvas.setPixel(cx - 4, cy - 4, { r: 255, g: 150, b: 50, a: 255 });
    canvas.setPixel(cx + 3, cy - 5, { r: 255, g: 150, b: 50, a: 255 });
  }
}

function drawProjectileWhip(canvas: PixelCanvas, x: number, y: number): void {
  // Whip (48x24)
  const by = y + 12;

  // Whip curve
  canvas.fillRect(x + 2, by - 2, 4, 4, { r: 100, g: 60, b: 30, a: 255 }); // Handle
  canvas.fillRect(x + 6, by - 1, 8, 2, COLORS.PROJ_WHIP);
  canvas.fillRect(x + 14, by - 3, 8, 2, COLORS.PROJ_WHIP);
  canvas.fillRect(x + 22, by - 1, 10, 2, COLORS.PROJ_WHIP);
  canvas.fillRect(x + 32, by + 1, 10, 2, COLORS.PROJ_WHIP);
  canvas.fillRect(x + 42, by + 3, 4, 2, COLORS.PROJ_WHIP);

  // Tip
  canvas.setPixel(x + 45, by + 4, { r: 200, g: 80, b: 80, a: 255 });
}

function drawProjectileGarlic(canvas: PixelCanvas, x: number, y: number): void {
  const cx = x + 16;
  const cy = y + 16;

  // Garlic aura (circular wave effect)
  // Outer ring
  for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
    const px = cx + Math.cos(angle) * 12;
    const py = cy + Math.sin(angle) * 12;
    canvas.fillCircle(Math.round(px), Math.round(py), 2, { ...COLORS.PROJ_GARLIC, a: 100 });
  }

  // Middle ring
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    const px = cx + Math.cos(angle) * 8;
    const py = cy + Math.sin(angle) * 8;
    canvas.fillCircle(Math.round(px), Math.round(py), 2, { ...COLORS.PROJ_GARLIC, a: 150 });
  }

  // Center garlic
  canvas.fillCircle(cx, cy, 5, COLORS.PROJ_GARLIC);
  canvas.fillCircle(cx, cy, 3, COLORS.WHITE);
}

async function generateAtlas(): Promise<void> {
  console.log('Generating sprite atlas...');

  const canvas = new PixelCanvas(ATLAS_WIDTH, ATLAS_HEIGHT);

  // Draw all sprites according to atlas.json positions

  // Player idle (row 0)
  for (let i = 0; i < 4; i++) {
    drawPlayerIdle(canvas, i * 32, 0, i);
  }

  // Player walk down (row 1)
  for (let i = 0; i < 4; i++) {
    drawPlayerWalk(canvas, i * 32, 32, i, 'down');
  }

  // Player walk up (row 2)
  for (let i = 0; i < 4; i++) {
    drawPlayerWalk(canvas, i * 32, 64, i, 'up');
  }

  // Player walk left (row 3)
  for (let i = 0; i < 4; i++) {
    drawPlayerWalk(canvas, i * 32, 96, i, 'left');
  }

  // Player walk right (row 4)
  for (let i = 0; i < 4; i++) {
    drawPlayerWalk(canvas, i * 32, 128, i, 'right');
  }

  // Enemies (row 0, starting at x=128)
  drawBat(canvas, 128, 0, 0);
  drawBat(canvas, 160, 0, 1);
  drawSkeleton(canvas, 192, 0, 0);
  drawSkeleton(canvas, 224, 0, 1);
  drawZombie(canvas, 256, 0, 0);
  drawZombie(canvas, 288, 0, 1);
  drawGhost(canvas, 320, 0, 0);
  drawGhost(canvas, 352, 0, 1);
  drawSlime(canvas, 384, 0, 0);
  drawSlime(canvas, 416, 0, 1);
  drawDemon(canvas, 448, 0, 0);
  drawDemon(canvas, 480, 0, 1);

  // XP orbs (row 1, starting at x=128)
  drawXPOrb(canvas, 128, 32, 'small');  // 16x16
  drawXPOrb(canvas, 144, 32, 'medium'); // 24x24
  drawXPOrb(canvas, 168, 32, 'large');  // 32x32

  // Projectiles (row 1, starting at x=200)
  drawProjectileSlash(canvas, 200, 32);   // 24x24
  drawProjectileBullet(canvas, 224, 32);  // 16x16
  drawProjectileOrb(canvas, 240, 32);     // 24x24
  drawProjectileLightning(canvas, 264, 32); // 16x32
  drawProjectileAxe(canvas, 280, 32, 0);  // 24x24
  drawProjectileAxe(canvas, 304, 32, 1);  // 24x24
  drawProjectileFireball(canvas, 328, 32, 0); // 24x24
  drawProjectileFireball(canvas, 352, 32, 1); // 24x24
  drawProjectileWhip(canvas, 376, 32);    // 48x24
  drawProjectileGarlic(canvas, 424, 32);  // 32x32

  // Save the atlas
  const outputPath = path.join(__dirname, '../src/client/public/assets/sprites/atlas.png');

  await sharp(canvas.getBuffer(), {
    raw: {
      width: ATLAS_WIDTH,
      height: ATLAS_HEIGHT,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  console.log(`Sprite atlas saved to: ${outputPath}`);
  console.log('Atlas contents:');
  console.log('  - Player sprites: 20 (idle + 4-direction walk)');
  console.log('  - Enemy sprites: 12 (6 types x 2 frames)');
  console.log('  - XP orb sprites: 3 (small, medium, large)');
  console.log('  - Projectile sprites: 11');
  console.log('  Total: 46 sprites');
}

generateAtlas().catch(console.error);
