/**
 * Sprite Atlas Generator - Pokemon Game Boy Style
 *
 * Generates a 512x512 pixel art sprite atlas for SWARM.IO
 * Art Direction: Game Boy Pokemon aesthetic with modern vibrant colors
 *
 * Style Guidelines (BUG-035 fix):
 * - 4 colors max per sprite: outline (black), dark, mid, light/highlight
 * - Consistent 1px black outline on all character sprites
 * - Large heads (~40% of body height) for "cute" Pokemon aesthetic
 * - Rounded shapes instead of hard rectangles
 * - Clear silhouettes with exaggerated features
 *
 * Run with: npx tsx scripts/generate-sprites.ts
 */

import sharp from 'sharp';
import path from 'path';

// Atlas dimensions
const ATLAS_WIDTH = 512;
const ATLAS_HEIGHT = 512;

// =============================================================================
// UNIFIED COLOR PALETTE - 4 colors per sprite type (BUG-035 fix)
// Each sprite uses: OUTLINE (black), DARK, MID, LIGHT
// =============================================================================
const COLORS = {
  // Player: Green theme (4 colors)
  PLAYER_OUTLINE: { r: 0, g: 40, b: 0, a: 255 },      // Very dark green/black outline
  PLAYER_DARK: { r: 0, g: 120, b: 0, a: 255 },        // Dark green shadow
  PLAYER_MID: { r: 0, g: 200, b: 0, a: 255 },         // Main green
  PLAYER_LIGHT: { r: 100, g: 255, b: 100, a: 255 },   // Highlight green

  // Bat: Brown theme (4 colors)
  ENEMY_BAT_OUTLINE: { r: 40, g: 20, b: 0, a: 255 },
  ENEMY_BAT_DARK: { r: 80, g: 40, b: 10, a: 255 },
  ENEMY_BAT_MID: { r: 139, g: 69, b: 19, a: 255 },
  ENEMY_BAT_LIGHT: { r: 180, g: 110, b: 60, a: 255 },

  // Skeleton: Gray/white theme (4 colors)
  ENEMY_SKELETON_OUTLINE: { r: 60, g: 60, b: 60, a: 255 },
  ENEMY_SKELETON_DARK: { r: 160, g: 160, b: 160, a: 255 },
  ENEMY_SKELETON_MID: { r: 220, g: 220, b: 210, a: 255 },
  ENEMY_SKELETON_LIGHT: { r: 255, g: 255, b: 255, a: 255 },

  // Zombie: Green theme (4 colors)
  ENEMY_ZOMBIE_OUTLINE: { r: 10, g: 50, b: 10, a: 255 },
  ENEMY_ZOMBIE_DARK: { r: 20, g: 90, b: 20, a: 255 },
  ENEMY_ZOMBIE_MID: { r: 34, g: 139, b: 34, a: 255 },
  ENEMY_ZOMBIE_LIGHT: { r: 80, g: 180, b: 80, a: 255 },

  // Ghost: Blue theme with transparency (4 colors)
  ENEMY_GHOST_OUTLINE: { r: 50, g: 80, b: 120, a: 200 },
  ENEMY_GHOST_DARK: { r: 100, g: 140, b: 180, a: 180 },
  ENEMY_GHOST_MID: { r: 150, g: 200, b: 230, a: 160 },
  ENEMY_GHOST_LIGHT: { r: 220, g: 240, b: 255, a: 140 },

  // Slime: Bright green theme (4 colors)
  ENEMY_SLIME_OUTLINE: { r: 15, g: 80, b: 15, a: 255 },
  ENEMY_SLIME_DARK: { r: 30, g: 140, b: 30, a: 255 },
  ENEMY_SLIME_MID: { r: 50, g: 205, b: 50, a: 255 },
  ENEMY_SLIME_LIGHT: { r: 140, g: 255, b: 140, a: 255 },

  // Demon: Red/orange theme (4 colors)
  ENEMY_DEMON_OUTLINE: { r: 80, g: 20, b: 0, a: 255 },
  ENEMY_DEMON_DARK: { r: 160, g: 40, b: 0, a: 255 },
  ENEMY_DEMON_MID: { r: 230, g: 80, b: 20, a: 255 },
  ENEMY_DEMON_LIGHT: { r: 255, g: 150, b: 80, a: 255 },

  // XP orbs - distinct colors per size
  XP_SMALL: { r: 0, g: 255, b: 136, a: 255 },
  XP_MEDIUM: { r: 0, g: 255, b: 255, a: 255 },
  XP_LARGE: { r: 255, g: 255, b: 0, a: 255 },
  XP_GLOW: { r: 255, g: 255, b: 255, a: 100 },

  // Projectiles - simplified palettes
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

  // Eyes - universal
  EYE_WHITE: { r: 255, g: 255, b: 255, a: 255 },
  EYE_PUPIL: { r: 0, g: 0, b: 0, a: 255 },
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

  // Draw ellipse with 1px outline (Pokemon style)
  fillEllipseOutlined(cx: number, cy: number, rx: number, ry: number, fill: RGBA, outline: RGBA): void {
    // First draw outline (1px larger)
    for (let y = -(ry + 1); y <= ry + 1; y++) {
      for (let x = -(rx + 1); x <= rx + 1; x++) {
        if ((x * x) / ((rx + 1) * (rx + 1)) + (y * y) / ((ry + 1) * (ry + 1)) <= 1) {
          this.setPixel(cx + x, cy + y, outline);
        }
      }
    }
    // Then draw fill
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
          this.setPixel(cx + x, cy + y, fill);
        }
      }
    }
  }

  // Draw circle with 1px outline (Pokemon style)
  fillCircleOutlined(cx: number, cy: number, radius: number, fill: RGBA, outline: RGBA): void {
    // First draw outline (1px larger)
    for (let y = -(radius + 1); y <= radius + 1; y++) {
      for (let x = -(radius + 1); x <= radius + 1; x++) {
        if (x * x + y * y <= (radius + 1) * (radius + 1)) {
          this.setPixel(cx + x, cy + y, outline);
        }
      }
    }
    // Then draw fill
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          this.setPixel(cx + x, cy + y, fill);
        }
      }
    }
  }

  // Draw rounded rectangle with outline (Pokemon style)
  fillRoundedRectOutlined(x: number, y: number, w: number, h: number, fill: RGBA, outline: RGBA): void {
    // Draw outline first
    this.fillRect(x - 1, y, w + 2, h, outline);     // Left-right outline
    this.fillRect(x, y - 1, w, h + 2, outline);     // Top-bottom outline
    // Then fill
    this.fillRect(x, y, w, h, fill);
    // Round corners by removing outline pixels at corners
    this.setPixel(x - 1, y - 1, COLORS.TRANSPARENT);
    this.setPixel(x + w, y - 1, COLORS.TRANSPARENT);
    this.setPixel(x - 1, y + h, COLORS.TRANSPARENT);
    this.setPixel(x + w, y + h, COLORS.TRANSPARENT);
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
  // 32x32 player sprite - Pokemon-style humanoid with large head
  // Style: 4 colors (outline, dark, mid, light), rounded shapes, head ~40% of height
  const cx = x + 16; // center x
  const cy = y + 16; // center y

  // Idle animation - breathing bob
  const bob = frame % 2 === 0 ? 0 : 1;
  const armBob = frame === 1 || frame === 3 ? 1 : 0;

  // === BODY (draw first, behind head) ===
  // Body is an ellipse (rounded, not rectangle)
  canvas.fillEllipseOutlined(cx, cy + 2 + bob, 5, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
  // Body shading (dark on bottom half)
  canvas.fillEllipse(cx, cy + 4 + bob, 4, 3, COLORS.PLAYER_DARK);

  // === ARMS ===
  // Left arm (small ellipse)
  canvas.fillEllipseOutlined(cx - 7, cy + 1 + bob + armBob, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
  // Right arm
  canvas.fillEllipseOutlined(cx + 7, cy + 1 + bob - armBob, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);

  // === LEGS ===
  // Short stubby legs (Pokemon style)
  canvas.fillEllipseOutlined(cx - 3, cy + 9 + bob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
  canvas.fillEllipseOutlined(cx + 3, cy + 9 + bob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);

  // === HEAD (draw last, on top) ===
  // Large round head (~40% of sprite height = ~12px diameter)
  canvas.fillCircleOutlined(cx, cy - 6 + bob, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
  // Head highlight (light on top)
  canvas.fillCircle(cx - 1, cy - 8 + bob, 3, COLORS.PLAYER_LIGHT);

  // === EYES ===
  // Large cute eyes (2px white with 1px pupil)
  canvas.fillRect(cx - 4, cy - 7 + bob, 3, 3, COLORS.EYE_WHITE);
  canvas.fillRect(cx + 1, cy - 7 + bob, 3, 3, COLORS.EYE_WHITE);
  // Pupils (slightly to center for cute look)
  canvas.setPixel(cx - 2, cy - 6 + bob, COLORS.EYE_PUPIL);
  canvas.setPixel(cx + 2, cy - 6 + bob, COLORS.EYE_PUPIL);
  // Eye shine
  canvas.setPixel(cx - 3, cy - 7 + bob, COLORS.WHITE);
  canvas.setPixel(cx + 1, cy - 7 + bob, COLORS.WHITE);
}

function drawPlayerWalk(canvas: PixelCanvas, x: number, y: number, frame: number, direction: 'down' | 'up' | 'left' | 'right'): void {
  // Pokemon-style walking animation with consistent proportions
  const cx = x + 16;
  const cy = y + 16;

  // Walking animation phases
  const legPhase = frame % 4;
  const bodyBob = legPhase === 1 || legPhase === 3 ? 1 : 0;
  const leftLegOffset = legPhase === 1 ? -1 : (legPhase === 3 ? 1 : 0);
  const rightLegOffset = legPhase === 1 ? 1 : (legPhase === 3 ? -1 : 0);
  const armSwing = legPhase === 1 ? 1 : (legPhase === 3 ? -1 : 0);

  if (direction === 'down') {
    // Facing camera (same as idle but with walking animation)
    // Body
    canvas.fillEllipseOutlined(cx, cy + 2 + bodyBob, 5, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipse(cx, cy + 4 + bodyBob, 4, 3, COLORS.PLAYER_DARK);
    // Arms (swinging)
    canvas.fillEllipseOutlined(cx - 7, cy + 1 + bodyBob + armSwing, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipseOutlined(cx + 7, cy + 1 + bodyBob - armSwing, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    // Legs (walking)
    canvas.fillEllipseOutlined(cx - 3 + leftLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipseOutlined(cx + 3 + rightLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    // Head
    canvas.fillCircleOutlined(cx, cy - 6 + bodyBob, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillCircle(cx - 1, cy - 8 + bodyBob, 3, COLORS.PLAYER_LIGHT);
    // Eyes (forward facing)
    canvas.fillRect(cx - 4, cy - 7 + bodyBob, 3, 3, COLORS.EYE_WHITE);
    canvas.fillRect(cx + 1, cy - 7 + bodyBob, 3, 3, COLORS.EYE_WHITE);
    canvas.setPixel(cx - 2, cy - 6 + bodyBob, COLORS.EYE_PUPIL);
    canvas.setPixel(cx + 2, cy - 6 + bodyBob, COLORS.EYE_PUPIL);
    canvas.setPixel(cx - 3, cy - 7 + bodyBob, COLORS.WHITE);
    canvas.setPixel(cx + 1, cy - 7 + bodyBob, COLORS.WHITE);

  } else if (direction === 'up') {
    // Facing away - no eyes visible
    // Body
    canvas.fillEllipseOutlined(cx, cy + 2 + bodyBob, 5, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipse(cx, cy + 4 + bodyBob, 4, 3, COLORS.PLAYER_DARK);
    // Arms (swinging opposite)
    canvas.fillEllipseOutlined(cx - 7, cy + 1 + bodyBob - armSwing, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipseOutlined(cx + 7, cy + 1 + bodyBob + armSwing, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    // Legs
    canvas.fillEllipseOutlined(cx - 3 - leftLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipseOutlined(cx + 3 - rightLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    // Head (back of head - darker, no eyes)
    canvas.fillCircleOutlined(cx, cy - 6 + bodyBob, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillCircle(cx, cy - 6 + bodyBob, 4, COLORS.PLAYER_DARK);

  } else if (direction === 'left') {
    // Side view facing left
    // Body (slightly narrower from side)
    canvas.fillEllipseOutlined(cx, cy + 2 + bodyBob, 4, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipse(cx + 1, cy + 4 + bodyBob, 3, 3, COLORS.PLAYER_DARK);
    // One arm visible (in front)
    canvas.fillEllipseOutlined(cx - 3, cy + 1 + bodyBob + armSwing, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    // Legs (staggered for walking)
    canvas.fillEllipseOutlined(cx - 1 + leftLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipseOutlined(cx + 1 - leftLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    // Head
    canvas.fillCircleOutlined(cx, cy - 6 + bodyBob, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillCircle(cx + 1, cy - 8 + bodyBob, 3, COLORS.PLAYER_LIGHT);
    // One eye visible (looking left)
    canvas.fillRect(cx - 4, cy - 7 + bodyBob, 3, 3, COLORS.EYE_WHITE);
    canvas.setPixel(cx - 4, cy - 6 + bodyBob, COLORS.EYE_PUPIL);
    canvas.setPixel(cx - 3, cy - 7 + bodyBob, COLORS.WHITE);

  } else { // right
    // Side view facing right
    // Body
    canvas.fillEllipseOutlined(cx, cy + 2 + bodyBob, 4, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipse(cx - 1, cy + 4 + bodyBob, 3, 3, COLORS.PLAYER_DARK);
    // One arm visible
    canvas.fillEllipseOutlined(cx + 3, cy + 1 + bodyBob - armSwing, 2, 3, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    // Legs
    canvas.fillEllipseOutlined(cx - 1 - rightLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    canvas.fillEllipseOutlined(cx + 1 + rightLegOffset, cy + 9 + bodyBob, 2, 3, COLORS.PLAYER_DARK, COLORS.PLAYER_OUTLINE);
    // Head
    canvas.fillCircleOutlined(cx, cy - 6 + bodyBob, 6, COLORS.PLAYER_MID, COLORS.PLAYER_OUTLINE);
    canvas.fillCircle(cx - 1, cy - 8 + bodyBob, 3, COLORS.PLAYER_LIGHT);
    // One eye visible (looking right)
    canvas.fillRect(cx + 1, cy - 7 + bodyBob, 3, 3, COLORS.EYE_WHITE);
    canvas.setPixel(cx + 3, cy - 6 + bodyBob, COLORS.EYE_PUPIL);
    canvas.setPixel(cx + 1, cy - 7 + bodyBob, COLORS.WHITE);
  }
}

function drawBat(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // Pokemon-style bat - round body, cute big eyes, wing animation
  const cx = x + 16;
  const cy = y + 16;
  const wingUp = frame === 0;
  const wingY = wingUp ? -4 : 0;

  // Body (round with outline)
  canvas.fillCircleOutlined(cx, cy, 5, COLORS.ENEMY_BAT_MID, COLORS.ENEMY_BAT_OUTLINE);
  // Body shading
  canvas.fillCircle(cx + 1, cy + 2, 3, COLORS.ENEMY_BAT_DARK);

  // Ears (triangular, on top of head)
  canvas.fillEllipseOutlined(cx - 4, cy - 6, 2, 3, COLORS.ENEMY_BAT_MID, COLORS.ENEMY_BAT_OUTLINE);
  canvas.fillEllipseOutlined(cx + 4, cy - 6, 2, 3, COLORS.ENEMY_BAT_MID, COLORS.ENEMY_BAT_OUTLINE);

  // Wings (animated)
  canvas.fillEllipseOutlined(cx - 9, cy + wingY, 4, 3, COLORS.ENEMY_BAT_MID, COLORS.ENEMY_BAT_OUTLINE);
  canvas.fillEllipseOutlined(cx + 9, cy + wingY, 4, 3, COLORS.ENEMY_BAT_MID, COLORS.ENEMY_BAT_OUTLINE);
  // Wing membrane (darker)
  canvas.fillEllipse(cx - 9, cy + wingY + 1, 3, 2, COLORS.ENEMY_BAT_DARK);
  canvas.fillEllipse(cx + 9, cy + wingY + 1, 3, 2, COLORS.ENEMY_BAT_DARK);

  // Eyes (big cute eyes with red pupils - bat characteristic)
  canvas.fillRect(cx - 4, cy - 2, 3, 3, COLORS.EYE_WHITE);
  canvas.fillRect(cx + 1, cy - 2, 3, 3, COLORS.EYE_WHITE);
  // Red pupils (glowing effect)
  canvas.setPixel(cx - 2, cy - 1, { r: 255, g: 50, b: 50, a: 255 });
  canvas.setPixel(cx + 2, cy - 1, { r: 255, g: 50, b: 50, a: 255 });
  // Eye shine
  canvas.setPixel(cx - 3, cy - 2, COLORS.WHITE);
  canvas.setPixel(cx + 1, cy - 2, COLORS.WHITE);

  // Small fangs
  canvas.setPixel(cx - 1, cy + 3, COLORS.ENEMY_BAT_LIGHT);
  canvas.setPixel(cx + 1, cy + 3, COLORS.ENEMY_BAT_LIGHT);
}

function drawSkeleton(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // Pokemon-style skeleton - cute skull with big eye sockets, rounded bones
  const cx = x + 16;
  const cy = y + 16;
  const bob = frame === 0 ? 0 : 1;
  const armSwing = frame === 0 ? 0 : 1;

  // Ribcage/body (behind skull)
  canvas.fillEllipseOutlined(cx, cy + 3 + bob, 5, 5, COLORS.ENEMY_SKELETON_MID, COLORS.ENEMY_SKELETON_OUTLINE);
  // Rib lines
  canvas.fillRect(cx - 3, cy + 1 + bob, 6, 1, COLORS.ENEMY_SKELETON_DARK);
  canvas.fillRect(cx - 3, cy + 3 + bob, 6, 1, COLORS.ENEMY_SKELETON_DARK);
  canvas.fillRect(cx - 3, cy + 5 + bob, 6, 1, COLORS.ENEMY_SKELETON_DARK);

  // Arms (bone shapes)
  canvas.fillEllipseOutlined(cx - 8, cy + 1 + bob + armSwing, 3, 2, COLORS.ENEMY_SKELETON_MID, COLORS.ENEMY_SKELETON_OUTLINE);
  canvas.fillEllipseOutlined(cx + 8, cy + 1 + bob - armSwing, 3, 2, COLORS.ENEMY_SKELETON_MID, COLORS.ENEMY_SKELETON_OUTLINE);

  // Legs (bone shapes)
  canvas.fillEllipseOutlined(cx - 3, cy + 10 + bob, 2, 4, COLORS.ENEMY_SKELETON_MID, COLORS.ENEMY_SKELETON_OUTLINE);
  canvas.fillEllipseOutlined(cx + 3, cy + 10 + bob, 2, 4, COLORS.ENEMY_SKELETON_MID, COLORS.ENEMY_SKELETON_OUTLINE);

  // Skull (large, ~40% of body, drawn last to be on top)
  canvas.fillCircleOutlined(cx, cy - 5 + bob, 7, COLORS.ENEMY_SKELETON_MID, COLORS.ENEMY_SKELETON_OUTLINE);
  // Skull highlight
  canvas.fillCircle(cx - 2, cy - 7 + bob, 3, COLORS.ENEMY_SKELETON_LIGHT);

  // Big empty eye sockets (dark holes)
  canvas.fillCircle(cx - 3, cy - 5 + bob, 2, COLORS.ENEMY_SKELETON_OUTLINE);
  canvas.fillCircle(cx + 3, cy - 5 + bob, 2, COLORS.ENEMY_SKELETON_OUTLINE);
  // Tiny red dots for spooky eyes
  canvas.setPixel(cx - 3, cy - 5 + bob, { r: 255, g: 100, b: 100, a: 255 });
  canvas.setPixel(cx + 3, cy - 5 + bob, { r: 255, g: 100, b: 100, a: 255 });

  // Nose hole
  canvas.setPixel(cx, cy - 2 + bob, COLORS.ENEMY_SKELETON_OUTLINE);

  // Jaw/teeth
  canvas.fillRect(cx - 3, cy + bob, 6, 2, COLORS.ENEMY_SKELETON_MID);
  canvas.fillRect(cx - 3, cy + bob, 6, 1, COLORS.ENEMY_SKELETON_OUTLINE);
  // Individual teeth
  canvas.setPixel(cx - 2, cy + 1 + bob, COLORS.ENEMY_SKELETON_LIGHT);
  canvas.setPixel(cx, cy + 1 + bob, COLORS.ENEMY_SKELETON_LIGHT);
  canvas.setPixel(cx + 2, cy + 1 + bob, COLORS.ENEMY_SKELETON_LIGHT);
}

function drawZombie(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // Pokemon-style zombie - cute but creepy, arms outstretched, shambling
  const cx = x + 16;
  const cy = y + 16;
  const bob = frame === 0 ? 0 : 1;
  const tilt = frame === 0 ? 0 : 1; // Shambling animation

  // Body (hunched oval)
  canvas.fillEllipseOutlined(cx + tilt, cy + 3 + bob, 6, 6, COLORS.ENEMY_ZOMBIE_MID, COLORS.ENEMY_ZOMBIE_OUTLINE);
  canvas.fillEllipse(cx + tilt + 1, cy + 5 + bob, 4, 3, COLORS.ENEMY_ZOMBIE_DARK);

  // Outstretched arms (zombie pose)
  canvas.fillEllipseOutlined(cx - 9, cy + 1 + bob, 4, 2, COLORS.ENEMY_ZOMBIE_MID, COLORS.ENEMY_ZOMBIE_OUTLINE);
  canvas.fillEllipseOutlined(cx + 9, cy + 1 + bob, 4, 2, COLORS.ENEMY_ZOMBIE_MID, COLORS.ENEMY_ZOMBIE_OUTLINE);

  // Shambling legs
  canvas.fillEllipseOutlined(cx - 3 - tilt, cy + 10 + bob, 2, 4, COLORS.ENEMY_ZOMBIE_DARK, COLORS.ENEMY_ZOMBIE_OUTLINE);
  canvas.fillEllipseOutlined(cx + 3 + tilt, cy + 10 + bob, 2, 4, COLORS.ENEMY_ZOMBIE_DARK, COLORS.ENEMY_ZOMBIE_OUTLINE);

  // Large head (zombies have big heads in cute style)
  canvas.fillCircleOutlined(cx, cy - 5 + bob, 7, COLORS.ENEMY_ZOMBIE_MID, COLORS.ENEMY_ZOMBIE_OUTLINE);
  // Messy hair/highlight
  canvas.fillCircle(cx - 2, cy - 8 + bob, 3, COLORS.ENEMY_ZOMBIE_LIGHT);
  canvas.fillCircle(cx + 3, cy - 9 + bob, 2, COLORS.ENEMY_ZOMBIE_LIGHT);

  // Dead/glowing eyes (yellow)
  canvas.fillRect(cx - 4, cy - 6 + bob, 3, 3, { r: 255, g: 255, b: 100, a: 255 });
  canvas.fillRect(cx + 1, cy - 6 + bob, 3, 3, { r: 255, g: 255, b: 100, a: 255 });
  // Dark pupils (small)
  canvas.setPixel(cx - 2, cy - 5 + bob, COLORS.ENEMY_ZOMBIE_OUTLINE);
  canvas.setPixel(cx + 2, cy - 5 + bob, COLORS.ENEMY_ZOMBIE_OUTLINE);

  // Open mouth (groaning)
  canvas.fillEllipse(cx, cy - 1 + bob, 2, 2, COLORS.ENEMY_ZOMBIE_OUTLINE);
}

function drawGhost(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // Pokemon-style ghost - cute floating blob with big eyes, wavy tail
  const cx = x + 16;
  const cy = y + 16;
  const float = frame === 0 ? -2 : 0;
  const wavePhase = frame === 0 ? 0 : 1;

  // Wispy tail (wavy bottom) - drawn first, behind body
  for (let i = -2; i <= 2; i++) {
    const waveOffset = ((i + wavePhase) % 2) * 3;
    canvas.fillEllipse(cx + i * 3, cy + 8 + float + waveOffset, 2, 3, COLORS.ENEMY_GHOST_MID);
  }

  // Main body (round blob)
  canvas.fillEllipseOutlined(cx, cy - 2 + float, 8, 9, COLORS.ENEMY_GHOST_MID, COLORS.ENEMY_GHOST_OUTLINE);
  // Body highlight (light on top)
  canvas.fillCircle(cx - 2, cy - 6 + float, 4, COLORS.ENEMY_GHOST_LIGHT);

  // Large cute eyes (slightly hollow/dark)
  canvas.fillCircle(cx - 4, cy - 3 + float, 3, COLORS.ENEMY_GHOST_DARK);
  canvas.fillCircle(cx + 4, cy - 3 + float, 3, COLORS.ENEMY_GHOST_DARK);
  // Eye whites/pupils
  canvas.setPixel(cx - 5, cy - 4 + float, COLORS.EYE_WHITE);
  canvas.setPixel(cx + 3, cy - 4 + float, COLORS.EYE_WHITE);
  canvas.setPixel(cx - 3, cy - 2 + float, COLORS.BLACK);
  canvas.setPixel(cx + 5, cy - 2 + float, COLORS.BLACK);

  // Small "O" mouth (surprised/spooky)
  canvas.fillCircle(cx, cy + 2 + float, 2, COLORS.ENEMY_GHOST_DARK);
}

function drawSlime(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // Pokemon-style slime - classic cute blob, big eyes, happy face, squash/stretch
  const cx = x + 16;
  const cy = y + 16;

  // Bounce animation (squash and stretch)
  const squash = frame === 0;
  const rx = squash ? 9 : 7;
  const ry = squash ? 6 : 9;
  const yOffset = squash ? 3 : 0;

  // Body (blob shape with outline)
  canvas.fillEllipseOutlined(cx, cy + yOffset, rx, ry, COLORS.ENEMY_SLIME_MID, COLORS.ENEMY_SLIME_OUTLINE);
  // Body highlight (light on top)
  canvas.fillEllipse(cx - 2, cy - 3 + yOffset, rx - 3, ry - 4, COLORS.ENEMY_SLIME_LIGHT);

  // Big shine highlight (Pokemon style)
  canvas.fillCircle(cx - 4, cy - 3 + yOffset, 2, COLORS.WHITE);

  // Large cute eyes (black with white shine)
  canvas.fillCircle(cx - 3, cy - 1 + yOffset, 2, COLORS.EYE_PUPIL);
  canvas.fillCircle(cx + 3, cy - 1 + yOffset, 2, COLORS.EYE_PUPIL);
  // Eye shine
  canvas.setPixel(cx - 4, cy - 2 + yOffset, COLORS.EYE_WHITE);
  canvas.setPixel(cx + 2, cy - 2 + yOffset, COLORS.EYE_WHITE);

  // Happy smile (curved mouth)
  canvas.setPixel(cx - 2, cy + 3 + yOffset, COLORS.ENEMY_SLIME_OUTLINE);
  canvas.setPixel(cx - 1, cy + 4 + yOffset, COLORS.ENEMY_SLIME_OUTLINE);
  canvas.setPixel(cx, cy + 4 + yOffset, COLORS.ENEMY_SLIME_OUTLINE);
  canvas.setPixel(cx + 1, cy + 4 + yOffset, COLORS.ENEMY_SLIME_OUTLINE);
  canvas.setPixel(cx + 2, cy + 3 + yOffset, COLORS.ENEMY_SLIME_OUTLINE);
}

function drawDemon(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // Pokemon-style demon - cute but menacing, big head with horns, glowing eyes
  const cx = x + 16;
  const cy = y + 16;
  const bob = frame === 0 ? 0 : 1;
  const armSwing = frame === 0 ? 0 : 1;

  // Body (round with outline)
  canvas.fillEllipseOutlined(cx, cy + 3 + bob, 6, 6, COLORS.ENEMY_DEMON_MID, COLORS.ENEMY_DEMON_OUTLINE);
  canvas.fillEllipse(cx + 1, cy + 5 + bob, 4, 3, COLORS.ENEMY_DEMON_DARK);

  // Arms (short and stubby)
  canvas.fillEllipseOutlined(cx - 8, cy + 2 + bob + armSwing, 3, 3, COLORS.ENEMY_DEMON_MID, COLORS.ENEMY_DEMON_OUTLINE);
  canvas.fillEllipseOutlined(cx + 8, cy + 2 + bob - armSwing, 3, 3, COLORS.ENEMY_DEMON_MID, COLORS.ENEMY_DEMON_OUTLINE);

  // Legs
  canvas.fillEllipseOutlined(cx - 3, cy + 10 + bob, 2, 3, COLORS.ENEMY_DEMON_DARK, COLORS.ENEMY_DEMON_OUTLINE);
  canvas.fillEllipseOutlined(cx + 3, cy + 10 + bob, 2, 3, COLORS.ENEMY_DEMON_DARK, COLORS.ENEMY_DEMON_OUTLINE);

  // Tail (curving to side)
  canvas.fillEllipse(cx + 7, cy + 6 + bob, 4, 2, COLORS.ENEMY_DEMON_MID);
  canvas.setPixel(cx + 11, cy + 5 + bob, COLORS.ENEMY_DEMON_OUTLINE);
  canvas.setPixel(cx + 10, cy + 4 + bob, COLORS.ENEMY_DEMON_OUTLINE);

  // Large head (demon proportions)
  canvas.fillCircleOutlined(cx, cy - 5 + bob, 7, COLORS.ENEMY_DEMON_MID, COLORS.ENEMY_DEMON_OUTLINE);
  // Head highlight
  canvas.fillCircle(cx - 2, cy - 7 + bob, 3, COLORS.ENEMY_DEMON_LIGHT);

  // Horns (on top of head)
  canvas.fillEllipseOutlined(cx - 6, cy - 10 + bob, 2, 4, COLORS.ENEMY_DEMON_DARK, COLORS.ENEMY_DEMON_OUTLINE);
  canvas.fillEllipseOutlined(cx + 6, cy - 10 + bob, 2, 4, COLORS.ENEMY_DEMON_DARK, COLORS.ENEMY_DEMON_OUTLINE);

  // Glowing yellow eyes
  canvas.fillRect(cx - 4, cy - 6 + bob, 3, 3, { r: 255, g: 255, b: 0, a: 255 });
  canvas.fillRect(cx + 1, cy - 6 + bob, 3, 3, { r: 255, g: 255, b: 0, a: 255 });
  // Dark slit pupils (menacing)
  canvas.fillRect(cx - 2, cy - 6 + bob, 1, 3, COLORS.ENEMY_DEMON_OUTLINE);
  canvas.fillRect(cx + 2, cy - 6 + bob, 1, 3, COLORS.ENEMY_DEMON_OUTLINE);

  // Fanged mouth
  canvas.fillRect(cx - 3, cy - 1 + bob, 6, 2, COLORS.ENEMY_DEMON_OUTLINE);
  // White fangs
  canvas.setPixel(cx - 2, cy + bob, COLORS.WHITE);
  canvas.setPixel(cx + 2, cy + bob, COLORS.WHITE);
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

function drawProjectileSlash(canvas: PixelCanvas, x: number, y: number, frame: number = 0): void {
  const cx = x + 12;
  const cy = y + 12;

  // Animation: Frame 0 = start arc, Frame 1 = full arc with motion blur
  const arcStart = frame === 0 ? Math.PI / 6 : Math.PI / 8;
  const arcLines = frame === 0 ? 6 : 10;
  const arcSpread = frame === 0 ? Math.PI / 20 : Math.PI / 16;

  // Arc slash effect with animation
  for (let i = 0; i < arcLines; i++) {
    const angle = arcStart + (i * arcSpread);
    const r1 = frame === 0 ? 3 : 4;
    const r2 = frame === 0 ? 8 : 10;
    const x1 = cx + Math.cos(angle) * r1;
    const y1 = cy + Math.sin(angle) * r1;
    const x2 = cx + Math.cos(angle) * r2;
    const y2 = cy + Math.sin(angle) * r2;
    canvas.drawLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), COLORS.PROJ_KNIFE);
  }

  // Motion blur trail on frame 1
  if (frame === 1) {
    for (let i = 0; i < 4; i++) {
      const angle = arcStart - (i * Math.PI / 24);
      const r2 = 8;
      const x2 = cx + Math.cos(angle) * r2;
      const y2 = cy + Math.sin(angle) * r2;
      canvas.setPixel(Math.round(x2), Math.round(y2), { ...COLORS.PROJ_KNIFE, a: 100 });
    }
  }

  // Center glow (brighter on frame 1)
  const glowAlpha = frame === 0 ? 120 : 180;
  canvas.fillCircle(cx, cy, 3, { ...COLORS.WHITE, a: glowAlpha });
}

function drawProjectileBullet(canvas: PixelCanvas, x: number, y: number): void {
  const cx = x + 8;
  const cy = y + 8;

  // Magic bullet
  canvas.fillCircle(cx, cy, 5, COLORS.PROJ_WAND);
  canvas.fillCircle(cx, cy, 3, { r: 200, g: 150, b: 255, a: 255 });
  canvas.setPixel(cx - 1, cy - 1, COLORS.WHITE);
}

function drawProjectileOrb(canvas: PixelCanvas, x: number, y: number, frame: number = 0): void {
  const cx = x + 12;
  const cy = y + 12;

  // Animation: Frame 0 = bright with upright cross, Frame 1 = dim with rotated cross
  const glowAlpha = frame === 0 ? 255 : 200;
  const innerAlpha = frame === 0 ? 255 : 230;

  // Outer glow (pulsing)
  if (frame === 0) {
    canvas.fillCircle(cx, cy, 9, { r: 255, g: 230, b: 100, a: 80 });
  }

  // Bible orb (holy golden)
  canvas.fillCircle(cx, cy, 8, { ...COLORS.PROJ_BIBLE, a: glowAlpha });
  canvas.fillCircle(cx, cy, 6, { r: 255, g: 230, b: 100, a: innerAlpha });

  // Cross pattern (rotated on frame 1)
  if (frame === 0) {
    // Upright cross
    canvas.fillRect(cx - 1, cy - 4, 2, 8, { r: 255, g: 255, b: 200, a: 255 });
    canvas.fillRect(cx - 3, cy - 1, 6, 2, { r: 255, g: 255, b: 200, a: 255 });
  } else {
    // 45-degree rotated cross (X pattern)
    canvas.drawLine(cx - 3, cy - 3, cx + 3, cy + 3, { r: 255, g: 255, b: 200, a: 255 });
    canvas.drawLine(cx + 3, cy - 3, cx - 3, cy + 3, { r: 255, g: 255, b: 200, a: 255 });
    // Thicken the X
    canvas.drawLine(cx - 3, cy - 2, cx + 2, cy + 3, { r: 255, g: 255, b: 200, a: 255 });
    canvas.drawLine(cx + 2, cy - 3, cx - 3, cy + 2, { r: 255, g: 255, b: 200, a: 255 });
  }
}

function drawProjectileLightning(canvas: PixelCanvas, x: number, y: number, frame: number = 0): void {
  // Lightning bolt (16x32)
  const bx = x + 8;
  const by = y + 16;

  // Animation: Frame 0 = standard bolt, Frame 1 = alternate zig-zag + branches
  const offset = frame === 0 ? 0 : 1;

  // Outer glow (electrical aura)
  const glowColor = { r: 100, g: 255, b: 255, a: 60 };
  if (frame === 1) {
    canvas.fillCircle(bx, by - 6, 6, glowColor);
    canvas.fillCircle(bx, by + 2, 5, glowColor);
  }

  // Zig-zag pattern (alternates position each frame)
  canvas.fillRect(bx - 2 + offset, by - 14, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx - 4 - offset, by - 10, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx - 2 + offset, by - 6, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx - offset, by - 2, 6, 4, COLORS.PROJ_LIGHTNING);
  canvas.fillRect(bx + 2 + offset, by + 2, 4, 6, COLORS.PROJ_LIGHTNING);

  // Electrical branches on frame 1
  if (frame === 1) {
    // Left branch
    canvas.setPixel(bx - 5, by - 8, COLORS.PROJ_LIGHTNING);
    canvas.setPixel(bx - 6, by - 7, COLORS.PROJ_LIGHTNING);
    // Right branch
    canvas.setPixel(bx + 5, by - 4, COLORS.PROJ_LIGHTNING);
    canvas.setPixel(bx + 6, by - 3, COLORS.PROJ_LIGHTNING);
  }

  // White core (slightly offset for animation)
  canvas.fillRect(bx + offset, by - 12, 2, 20, COLORS.WHITE);
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

function drawProjectileWhip(canvas: PixelCanvas, x: number, y: number, frame: number = 0): void {
  // Whip (48x24)
  const by = y + 12;

  // Animation: Frame 0 = extending, Frame 1 = crack with impact effect
  const handleColor = { r: 100, g: 60, b: 30, a: 255 };

  // Handle (always same position)
  canvas.fillRect(x + 2, by - 2, 4, 4, handleColor);

  if (frame === 0) {
    // Extending whip - more curved wave pattern
    canvas.fillRect(x + 6, by - 1, 8, 2, COLORS.PROJ_WHIP);
    canvas.fillRect(x + 14, by - 3, 8, 2, COLORS.PROJ_WHIP);
    canvas.fillRect(x + 22, by - 1, 10, 2, COLORS.PROJ_WHIP);
    canvas.fillRect(x + 32, by + 1, 8, 2, COLORS.PROJ_WHIP);
    // Tip moving
    canvas.setPixel(x + 40, by + 2, COLORS.PROJ_WHIP);
  } else {
    // Crack frame - straighter with impact spark
    canvas.fillRect(x + 6, by, 10, 2, COLORS.PROJ_WHIP);
    canvas.fillRect(x + 16, by - 1, 10, 2, COLORS.PROJ_WHIP);
    canvas.fillRect(x + 26, by, 10, 2, COLORS.PROJ_WHIP);
    canvas.fillRect(x + 36, by + 1, 8, 2, COLORS.PROJ_WHIP);
    // Impact crack effect at tip
    canvas.fillRect(x + 44, by, 3, 2, { r: 255, g: 200, b: 100, a: 255 });
    // Spark particles
    canvas.setPixel(x + 45, by - 2, { r: 255, g: 255, b: 200, a: 255 });
    canvas.setPixel(x + 46, by + 3, { r: 255, g: 255, b: 200, a: 255 });
    canvas.setPixel(x + 43, by + 4, { r: 255, g: 200, b: 100, a: 200 });
  }
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

// =============================================================================
// P1.7: ENVIRONMENT TILES
// =============================================================================

// Environment colors
const ENV_COLORS = {
  FLOOR_DARK: { r: 45, g: 45, b: 68, a: 255 },      // Dark blue-gray
  FLOOR_MID: { r: 50, g: 50, b: 76, a: 255 },       // Mid blue-gray
  FLOOR_LIGHT: { r: 58, g: 58, b: 88, a: 255 },     // Light blue-gray
  FLOOR_ACCENT: { r: 65, g: 65, b: 100, a: 255 },   // Accent blue-gray
  BOUNDARY_DANGER: { r: 255, g: 50, b: 50, a: 200 }, // Red danger glow
  BOUNDARY_WARN: { r: 255, g: 150, b: 50, a: 150 },  // Orange warning
  BOUNDARY_EDGE: { r: 100, g: 30, b: 30, a: 100 },   // Dark edge
};

/**
 * Draw arena floor tile (32x32)
 * Creates a pixel art stone/metal floor pattern
 */
function drawFloorTile(canvas: PixelCanvas, x: number, y: number): void {
  // Base fill
  canvas.fillRect(x, y, 32, 32, ENV_COLORS.FLOOR_DARK);

  // Stone pattern - create a grid of tiles with subtle variation
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const tileX = x + tx * 8;
      const tileY = y + ty * 8;

      // Alternate colors for subtle checkerboard
      const isLight = (tx + ty) % 2 === 0;
      const baseColor = isLight ? ENV_COLORS.FLOOR_MID : ENV_COLORS.FLOOR_DARK;

      canvas.fillRect(tileX + 1, tileY + 1, 6, 6, baseColor);

      // Add edge highlight (top-left)
      canvas.fillRect(tileX + 1, tileY + 1, 6, 1, ENV_COLORS.FLOOR_LIGHT);
      canvas.fillRect(tileX + 1, tileY + 1, 1, 6, ENV_COLORS.FLOOR_LIGHT);

      // Add edge shadow (bottom-right)
      canvas.fillRect(tileX + 1, tileY + 6, 6, 1, { r: 30, g: 30, b: 45, a: 255 });
      canvas.fillRect(tileX + 6, tileY + 1, 1, 6, { r: 30, g: 30, b: 45, a: 255 });
    }
  }

  // Add random accent dots for texture
  canvas.setPixel(x + 5, y + 5, ENV_COLORS.FLOOR_ACCENT);
  canvas.setPixel(x + 21, y + 13, ENV_COLORS.FLOOR_ACCENT);
  canvas.setPixel(x + 11, y + 27, ENV_COLORS.FLOOR_ACCENT);
  canvas.setPixel(x + 27, y + 7, ENV_COLORS.FLOOR_ACCENT);
}

/**
 * Draw arena floor tile variant (32x32)
 * Alternative pattern for visual variety
 */
function drawFloorTileAlt(canvas: PixelCanvas, x: number, y: number): void {
  // Base fill
  canvas.fillRect(x, y, 32, 32, ENV_COLORS.FLOOR_DARK);

  // Different pattern - larger tiles with cracks
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const tileX = x + tx * 16;
      const tileY = y + ty * 16;

      canvas.fillRect(tileX + 1, tileY + 1, 14, 14, ENV_COLORS.FLOOR_MID);

      // Highlight
      canvas.fillRect(tileX + 1, tileY + 1, 14, 1, ENV_COLORS.FLOOR_LIGHT);
      canvas.fillRect(tileX + 1, tileY + 1, 1, 14, ENV_COLORS.FLOOR_LIGHT);

      // Shadow
      canvas.fillRect(tileX + 1, tileY + 14, 14, 1, { r: 30, g: 30, b: 45, a: 255 });
      canvas.fillRect(tileX + 14, tileY + 1, 1, 14, { r: 30, g: 30, b: 45, a: 255 });
    }
  }

  // Crack details
  canvas.setPixel(x + 8, y + 8, ENV_COLORS.FLOOR_DARK);
  canvas.setPixel(x + 24, y + 24, ENV_COLORS.FLOOR_DARK);
  canvas.setPixel(x + 9, y + 7, ENV_COLORS.FLOOR_DARK);
}

/**
 * Draw boundary warning edge (32x32)
 * Glowing danger zone indicator
 */
function drawBoundaryEdge(canvas: PixelCanvas, x: number, y: number, frame: number): void {
  // Frame 0 = bright, Frame 1 = dim (for pulsing animation)
  const intensity = frame === 0 ? 1.0 : 0.6;

  // Gradient from inner (safe) to outer (danger)
  for (let i = 0; i < 32; i++) {
    const progress = i / 31; // 0 = top (danger), 1 = bottom (safe)
    const alpha = Math.floor((1 - progress) * 200 * intensity);

    // Red danger gradient
    const color: RGBA = {
      r: Math.floor(255 * (1 - progress * 0.5)),
      g: Math.floor(50 * progress),
      b: Math.floor(50 * progress),
      a: Math.max(0, alpha),
    };

    canvas.fillRect(x, y + i, 32, 1, color);
  }

  // Add warning stripes (diagonal)
  for (let i = 0; i < 32; i += 8) {
    for (let j = 0; j < 8; j++) {
      const stripeX = x + i + j;
      const stripeY = y + j;
      if (stripeX < x + 32 && stripeY < y + 16) {
        canvas.setPixel(stripeX, stripeY, { r: 255, g: 200, b: 0, a: Math.floor(150 * intensity) });
      }
    }
  }

  // Edge line
  canvas.fillRect(x, y, 32, 2, { r: 255, g: 0, b: 0, a: Math.floor(255 * intensity) });
}

/**
 * Draw corner boundary piece (32x32)
 * For arena corners
 */
function drawBoundaryCorner(canvas: PixelCanvas, x: number, y: number): void {
  // Radial gradient from corner
  for (let py = 0; py < 32; py++) {
    for (let px = 0; px < 32; px++) {
      const dist = Math.sqrt(px * px + py * py);
      const maxDist = 45; // diagonal of 32x32
      const progress = Math.min(dist / maxDist, 1);
      const alpha = Math.floor((1 - progress) * 200);

      if (alpha > 0) {
        canvas.setPixel(x + px, y + py, {
          r: Math.floor(255 * (1 - progress * 0.3)),
          g: 50,
          b: 50,
          a: alpha,
        });
      }
    }
  }
}

// =============================================================================
// P1.8: UI FRAME SPRITES
// =============================================================================

// UI Colors
const UI_COLORS = {
  FRAME_OUTER: { r: 255, g: 255, b: 255, a: 255 },  // White border
  FRAME_MID: { r: 150, g: 150, b: 150, a: 255 },    // Gray middle
  FRAME_INNER: { r: 80, g: 80, b: 80, a: 255 },     // Dark inner
  FRAME_BG: { r: 0, g: 0, b: 0, a: 200 },           // Semi-transparent black
  HEALTH_FILL: { r: 255, g: 107, b: 107, a: 255 },  // Red health
  HEALTH_DARK: { r: 192, g: 57, b: 43, a: 255 },    // Dark red
  XP_FILL: { r: 78, g: 205, b: 196, a: 255 },       // Teal XP
  XP_DARK: { r: 26, g: 188, b: 156, a: 255 },       // Dark teal
  GOLD: { r: 255, g: 215, b: 0, a: 255 },           // Gold accent
};

/**
 * Draw health bar frame (64x16)
 * Pixel art frame for the health bar
 */
function drawHealthBarFrame(canvas: PixelCanvas, x: number, y: number): void {
  // Outer border (white)
  canvas.fillRect(x, y, 64, 16, UI_COLORS.FRAME_OUTER);

  // Inner dark area
  canvas.fillRect(x + 2, y + 2, 60, 12, UI_COLORS.FRAME_BG);

  // Inner border detail
  canvas.fillRect(x + 1, y + 1, 62, 1, UI_COLORS.FRAME_MID);
  canvas.fillRect(x + 1, y + 14, 62, 1, UI_COLORS.FRAME_INNER);
  canvas.fillRect(x + 1, y + 1, 1, 14, UI_COLORS.FRAME_MID);
  canvas.fillRect(x + 62, y + 1, 1, 14, UI_COLORS.FRAME_INNER);

  // Corner accents
  canvas.setPixel(x, y, COLORS.TRANSPARENT);
  canvas.setPixel(x + 63, y, COLORS.TRANSPARENT);
  canvas.setPixel(x, y + 15, COLORS.TRANSPARENT);
  canvas.setPixel(x + 63, y + 15, COLORS.TRANSPARENT);
}

/**
 * Draw health bar fill sample (60x12)
 * The actual fill portion (shows full health example)
 */
function drawHealthBarFill(canvas: PixelCanvas, x: number, y: number): void {
  // Gradient fill
  canvas.fillRect(x, y, 60, 6, UI_COLORS.HEALTH_FILL);
  canvas.fillRect(x, y + 6, 60, 6, UI_COLORS.HEALTH_DARK);

  // Shine highlight
  canvas.fillRect(x + 2, y + 2, 56, 2, { r: 255, g: 150, b: 150, a: 255 });
}

/**
 * Draw XP bar frame (64x12)
 * Pixel art frame for the XP bar
 */
function drawXPBarFrame(canvas: PixelCanvas, x: number, y: number): void {
  // Outer border (white)
  canvas.fillRect(x, y, 64, 12, UI_COLORS.FRAME_OUTER);

  // Inner dark area
  canvas.fillRect(x + 2, y + 2, 60, 8, UI_COLORS.FRAME_BG);

  // Inner border detail
  canvas.fillRect(x + 1, y + 1, 62, 1, UI_COLORS.FRAME_MID);
  canvas.fillRect(x + 1, y + 10, 62, 1, UI_COLORS.FRAME_INNER);

  // Corner accents
  canvas.setPixel(x, y, COLORS.TRANSPARENT);
  canvas.setPixel(x + 63, y, COLORS.TRANSPARENT);
  canvas.setPixel(x, y + 11, COLORS.TRANSPARENT);
  canvas.setPixel(x + 63, y + 11, COLORS.TRANSPARENT);
}

/**
 * Draw XP bar fill sample (60x8)
 */
function drawXPBarFill(canvas: PixelCanvas, x: number, y: number): void {
  // Gradient fill
  canvas.fillRect(x, y, 60, 4, UI_COLORS.XP_FILL);
  canvas.fillRect(x, y + 4, 60, 4, UI_COLORS.XP_DARK);

  // Shine highlight
  canvas.fillRect(x + 2, y + 1, 56, 1, { r: 150, g: 230, b: 220, a: 255 });
}

/**
 * Draw weapon slot frame (48x48)
 * Frame for weapon icons
 */
function drawWeaponSlotFrame(canvas: PixelCanvas, x: number, y: number): void {
  // Outer border
  canvas.fillRect(x, y, 48, 48, UI_COLORS.FRAME_OUTER);

  // Inner dark area
  canvas.fillRect(x + 2, y + 2, 44, 44, UI_COLORS.FRAME_BG);

  // 3D border effect
  canvas.fillRect(x + 1, y + 1, 46, 1, UI_COLORS.FRAME_MID);
  canvas.fillRect(x + 1, y + 46, 46, 1, UI_COLORS.FRAME_INNER);
  canvas.fillRect(x + 1, y + 1, 1, 46, UI_COLORS.FRAME_MID);
  canvas.fillRect(x + 46, y + 1, 1, 46, UI_COLORS.FRAME_INNER);

  // Round corners
  canvas.setPixel(x, y, COLORS.TRANSPARENT);
  canvas.setPixel(x + 47, y, COLORS.TRANSPARENT);
  canvas.setPixel(x, y + 47, COLORS.TRANSPARENT);
  canvas.setPixel(x + 47, y + 47, COLORS.TRANSPARENT);
  canvas.setPixel(x + 1, y, COLORS.TRANSPARENT);
  canvas.setPixel(x + 46, y, COLORS.TRANSPARENT);
  canvas.setPixel(x, y + 1, COLORS.TRANSPARENT);
  canvas.setPixel(x + 47, y + 1, COLORS.TRANSPARENT);
  canvas.setPixel(x + 1, y + 47, COLORS.TRANSPARENT);
  canvas.setPixel(x + 46, y + 47, COLORS.TRANSPARENT);
  canvas.setPixel(x, y + 46, COLORS.TRANSPARENT);
  canvas.setPixel(x + 47, y + 46, COLORS.TRANSPARENT);
}

/**
 * Draw modal border corner (16x16)
 * 9-slice corner piece for modals
 */
function drawModalCorner(canvas: PixelCanvas, x: number, y: number): void {
  // Gold outer border
  canvas.fillRect(x, y, 16, 16, UI_COLORS.GOLD);

  // Inner dark
  canvas.fillRect(x + 4, y + 4, 12, 12, UI_COLORS.FRAME_BG);

  // Border detail
  canvas.fillRect(x + 2, y + 2, 14, 2, { r: 200, g: 170, b: 0, a: 255 });
  canvas.fillRect(x + 2, y + 2, 2, 14, { r: 200, g: 170, b: 0, a: 255 });

  // Outer rounded corner
  canvas.setPixel(x, y, COLORS.TRANSPARENT);
  canvas.setPixel(x + 1, y, COLORS.TRANSPARENT);
  canvas.setPixel(x, y + 1, COLORS.TRANSPARENT);
}

/**
 * Draw modal border edge horizontal (32x16)
 * 9-slice edge piece for top/bottom of modals
 */
function drawModalEdgeH(canvas: PixelCanvas, x: number, y: number): void {
  // Gold border
  canvas.fillRect(x, y, 32, 4, UI_COLORS.GOLD);
  canvas.fillRect(x, y + 2, 32, 2, { r: 200, g: 170, b: 0, a: 255 });

  // Inner dark
  canvas.fillRect(x, y + 4, 32, 12, UI_COLORS.FRAME_BG);
}

/**
 * Draw modal border edge vertical (16x32)
 * 9-slice edge piece for left/right of modals
 */
function drawModalEdgeV(canvas: PixelCanvas, x: number, y: number): void {
  // Gold border
  canvas.fillRect(x, y, 4, 32, UI_COLORS.GOLD);
  canvas.fillRect(x + 2, y, 2, 32, { r: 200, g: 170, b: 0, a: 255 });

  // Inner dark
  canvas.fillRect(x + 4, y, 12, 32, UI_COLORS.FRAME_BG);
}

/**
 * Draw leaderboard entry highlight (128x16)
 * For highlighting the local player in leaderboard
 */
function drawLeaderboardHighlight(canvas: PixelCanvas, x: number, y: number): void {
  // Gradient highlight bar
  for (let i = 0; i < 128; i++) {
    const edgeFade = Math.min(i / 16, (127 - i) / 16, 1);
    const alpha = Math.floor(100 * edgeFade);
    canvas.fillRect(x + i, y, 1, 16, { r: 78, g: 205, b: 196, a: alpha });
  }

  // Border lines
  canvas.fillRect(x, y, 128, 1, { r: 78, g: 205, b: 196, a: 150 });
  canvas.fillRect(x, y + 15, 128, 1, { r: 26, g: 188, b: 156, a: 150 });
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

  // Projectiles (row 1, starting at x=200) - Now with animation frames
  // Slash: 2 frames (animated)
  drawProjectileSlash(canvas, 200, 32, 0);   // 24x24 - frame 0
  drawProjectileSlash(canvas, 456, 32, 1);   // 24x24 - frame 1 (new position)

  drawProjectileBullet(canvas, 224, 32);     // 16x16 - static

  // Orb (Bible): 2 frames (animated)
  drawProjectileOrb(canvas, 240, 32, 0);     // 24x24 - frame 0
  drawProjectileOrb(canvas, 480, 32, 1);     // 24x24 - frame 1 (new position at row end)

  // Lightning: 2 frames (animated) - placed on row 2 for space
  drawProjectileLightning(canvas, 264, 32, 0); // 16x32 - frame 0
  drawProjectileLightning(canvas, 160, 64, 1); // 16x32 - frame 1 (row 2)

  // Axe: 2 frames (already animated)
  drawProjectileAxe(canvas, 280, 32, 0);     // 24x24
  drawProjectileAxe(canvas, 304, 32, 1);     // 24x24

  // Fireball: 2 frames (already animated)
  drawProjectileFireball(canvas, 328, 32, 0); // 24x24
  drawProjectileFireball(canvas, 352, 32, 1); // 24x24

  // Whip: 2 frames (animated) - placed on row 2 for space
  drawProjectileWhip(canvas, 376, 32, 0);    // 48x24 - frame 0
  drawProjectileWhip(canvas, 176, 64, 1);    // 48x24 - frame 1 (row 2)

  drawProjectileGarlic(canvas, 424, 32);     // 32x32 - static (garlic is AOE, doesn't need animation)

  // =============================================================================
  // P1.7: ENVIRONMENT TILES (row 5, y=160)
  // =============================================================================
  drawFloorTile(canvas, 0, 160);           // 32x32 - floor_tile
  drawFloorTileAlt(canvas, 32, 160);       // 32x32 - floor_tile_alt
  drawBoundaryEdge(canvas, 64, 160, 0);    // 32x32 - boundary_edge_0 (bright)
  drawBoundaryEdge(canvas, 96, 160, 1);    // 32x32 - boundary_edge_1 (dim)
  drawBoundaryCorner(canvas, 128, 160);    // 32x32 - boundary_corner

  // =============================================================================
  // P1.8: UI FRAME SPRITES (row 6, y=192)
  // =============================================================================
  drawHealthBarFrame(canvas, 0, 192);      // 64x16 - ui_health_frame
  drawHealthBarFill(canvas, 0, 208);       // 60x12 - ui_health_fill
  drawXPBarFrame(canvas, 64, 192);         // 64x12 - ui_xp_frame
  drawXPBarFill(canvas, 64, 204);          // 60x8 - ui_xp_fill
  drawWeaponSlotFrame(canvas, 128, 192);   // 48x48 - ui_weapon_frame
  drawModalCorner(canvas, 176, 192);       // 16x16 - ui_modal_corner
  drawModalEdgeH(canvas, 192, 192);        // 32x16 - ui_modal_edge_h
  drawModalEdgeV(canvas, 224, 192);        // 16x32 - ui_modal_edge_v
  drawLeaderboardHighlight(canvas, 240, 192); // 128x16 - ui_leaderboard_highlight

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
  console.log('  - Projectile sprites: 15 (slash x2, bullet, orb x2, lightning x2, axe x2, fireball x2, whip x2, garlic)');
  console.log('  - Environment tiles: 5 (P1.7)');
  console.log('  - UI frames: 9 (P1.8)');
  console.log('  Total: 64 sprites');
}

generateAtlas().catch(console.error);
