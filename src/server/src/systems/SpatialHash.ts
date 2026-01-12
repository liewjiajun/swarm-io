export interface SpatialEntity {
  id: string;
  x: number;
  y: number;
  type: 'player' | 'enemy' | 'projectile' | 'xp';
  entity: any;
}

export class SpatialHash {
  private cellSize: number;
  private cells = new Map<string, Set<SpatialEntity>>();

  constructor(cellSize: number = 50) {
    this.cellSize = cellSize;
  }

  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  clear() {
    this.cells.clear();
  }

  insert(entity: SpatialEntity) {
    const key = this.getKey(entity.x, entity.y);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(entity);
  }

  queryRadius(x: number, y: number, radius: number, type?: string): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);

    const radiusSq = radius * radius;

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) {
          for (const entity of cell) {
            if (type && entity.type !== type) continue;
            const dx = entity.x - x;
            const dy = entity.y - y;
            if (dx * dx + dy * dy <= radiusSq) {
              results.push(entity);
            }
          }
        }
      }
    }

    return results;
  }

  queryNearestOfType(x: number, y: number, type: string, maxRadius: number): SpatialEntity | null {
    const entities = this.queryRadius(x, y, maxRadius, type);
    if (entities.length === 0) return null;

    let nearest: SpatialEntity | null = null;
    let nearestDistSq = Infinity;

    for (const entity of entities) {
      const dx = entity.x - x;
      const dy = entity.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = entity;
      }
    }

    return nearest;
  }
}