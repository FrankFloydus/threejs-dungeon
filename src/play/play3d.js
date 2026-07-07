import {
  DIR,
  DIR_DATA,
  OPPOSITE,
  countBits,
  hasDir,
  keyFor,
  validateMaskMap
} from '../core/dungeon.js';
import {
  buildVoxelDungeonMesh,
  hasVoxelDungeonAirAt,
  hasVoxelDungeonHeadroomAt,
  hasVoxelDungeonLineOfSight
} from '../core/voxel-dungeon.js?v=organic-cave-2';

const THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
const VOXELS_PER_TILE = 10;
const PLAY_TILE_SIZE = VOXELS_PER_TILE;
const PLAY_EYE_HEIGHT = 1.62;
const PLAY_PLAYER_RADIUS = 0.36;
const VOXEL_SIZE = 1;
const TILE_HALF_VOXELS = VOXELS_PER_TILE / 2;
const CONNECTION_HALF_WIDTH = 3;
const CAVE_MIN_HEIGHT = 6;
const CAVE_MAX_HEIGHT = 11;
const MINIMAP_REVEAL_RADIUS = 12;
const SCATTER_DENSITY = {
  oreDivisor: 340,
  clutterDivisor: 220,
  chestDivisor: 1250
};
const SCATTER_KIND_ORDER = ['ore', 'chest', 'rock', 'stalagmite', 'debris'];
const EMPTY_BLOCKED_VOXELS = new Set();
const ENEMY_RADIUS = 0.34;
const ENEMY_AGGRO_RANGE = 4.2;
const ENEMY_VISION_RANGE = 13;
const ENEMY_VISION_DOT = Math.cos(Math.PI * 0.36);
const ENEMY_PATH_REFRESH = 0.38;
const ENEMY_MOVE_SPEED = 2.05;
const ENEMY_SPAWN_DISTANCE = 18;
const ENEMY_MELEE_RANGE = 1.12;
const ENEMY_MELEE_COOLDOWN = 1.15;
const ENEMY_MELEE_DAMAGE = 10;
const ENEMY_CAST_MIN_RANGE = 3.2;
const ENEMY_CAST_RANGE = 10.5;
const ENEMY_CAST_COOLDOWN = 2.1;
const ENEMY_PROJECTILE_SPEED = 5.4;
const ENEMY_PROJECTILE_LIFE = 3.2;
const ENEMY_PROJECTILE_DAMAGE = 12;
const PLAYER_ATTACK_RANGE = 2.05;
const PLAYER_ATTACK_DOT = Math.cos(Math.PI * 0.17);
const PLAYER_ATTACK_COOLDOWN = 0.42;
const PLAYER_ATTACK_DAMAGE = 1;
const PLAYER_MAX_HEALTH = 100;
const DEFAULT_PLAY_SETTINGS = {
  enemyCount: null,
  chestCount: null,
  oreDensity: 1,
  clutterDensity: 1,
  enemyMeleeChance: 62,
  enemyCasterChance: 38,
  enemyAggroRange: ENEMY_AGGRO_RANGE,
  enemyVisionRange: ENEMY_VISION_RANGE,
  player: {
    maxHealth: PLAYER_MAX_HEALTH,
    moveSpeed: 4.4,
    sprintSpeed: 7.2,
    attackDamage: PLAYER_ATTACK_DAMAGE,
    attackSpeed: 1 / PLAYER_ATTACK_COOLDOWN,
    attackRange: PLAYER_ATTACK_RANGE,
    lightRadius: 16.5,
    lightIntensity: 6.2,
    lightFlicker: 0.34
  },
  enemyTypes: {
    melee: {
      health: 3,
      speed: 2.25,
      attackRate: 0.85,
      damage: ENEMY_MELEE_DAMAGE,
      range: ENEMY_MELEE_RANGE
    },
    caster: {
      health: 2,
      speed: 1.65,
      attackRate: 0.45,
      damage: ENEMY_PROJECTILE_DAMAGE,
      range: ENEMY_CAST_RANGE,
      minRange: ENEMY_CAST_MIN_RANGE,
      projectileSpeed: ENEMY_PROJECTILE_SPEED
    }
  }
};
const PLAY_MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight'
]);

function voxelKey(x, z) {
  return `${x},${z}`;
}

function randomUnit(x, y, z = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function carveVoxel(walkableVoxels, x, z) {
  walkableVoxels.add(voxelKey(x, z));
}

function carveRect(walkableVoxels, node, minX, maxX, minZ, maxZ) {
  const baseX = node.x * VOXELS_PER_TILE - TILE_HALF_VOXELS;
  const baseZ = node.y * VOXELS_PER_TILE - TILE_HALF_VOXELS;
  for (let lx = minX; lx <= maxX; lx++) {
    for (let lz = minZ; lz <= maxZ; lz++) {
      carveVoxel(walkableVoxels, baseX + lx, baseZ + lz);
    }
  }
}

function carveWorldRect(walkableVoxels, minX, maxX, minZ, maxZ) {
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      carveVoxel(walkableVoxels, x, z);
    }
  }
}

function carveNodeFootprint(walkableVoxels, node) {
  carveRect(walkableVoxels, node, 3, 6, 3, 6);

  if (hasDir(node.mask, DIR.N)) carveRect(walkableVoxels, node, 3, 6, 0, 4);
  if (hasDir(node.mask, DIR.S)) carveRect(walkableVoxels, node, 3, 6, 5, 9);
  if (hasDir(node.mask, DIR.W)) carveRect(walkableVoxels, node, 0, 4, 3, 6);
  if (hasDir(node.mask, DIR.E)) carveRect(walkableVoxels, node, 5, 9, 3, 6);

  const baseX = node.x * VOXELS_PER_TILE - TILE_HALF_VOXELS;
  const baseZ = node.y * VOXELS_PER_TILE - TILE_HALF_VOXELS;
  const nodeOpenings = countBits(node.mask);
  const organicRadius = node.room || nodeOpenings >= 3 ? 6.15 : (nodeOpenings === 1 ? 4.85 : 5.25);
  const center = (VOXELS_PER_TILE - 1) / 2;
  for (let lx = 0; lx < VOXELS_PER_TILE; lx++) {
    for (let lz = 0; lz < VOXELS_PER_TILE; lz++) {
      const dx = lx - center;
      const dz = lz - center;
      const dist = Math.hypot(dx, dz);
      const roughness = randomUnit(node.x * 31 + lx, node.y * 37 + lz, 11) * 1.75;
      if (dist + roughness < organicRadius) {
        carveVoxel(walkableVoxels, baseX + lx, baseZ + lz);
      }
    }
  }

  if (node.room || countBits(node.mask) >= 3) {
    for (let lx = 0; lx < VOXELS_PER_TILE; lx++) {
      for (let lz = 0; lz < VOXELS_PER_TILE; lz++) {
        const inCore = lx >= 2 && lx <= 7 && lz >= 2 && lz <= 7;
        if (inCore) continue;
        if (randomUnit(node.x * 41 + lx, node.y * 43 + lz, 17) > 0.24) {
          carveVoxel(walkableVoxels, baseX + lx, baseZ + lz);
        }
      }
    }
  }
}

function addCaveErosion(walkableVoxels) {
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];

  for (let pass = 0; pass < 2; pass++) {
    const additions = [];
    for (const key of walkableVoxels) {
      const [x, z] = key.split(',').map(Number);
      for (const [dx, dz] of directions) {
        const nx = x + dx;
        const nz = z + dz;
        if (walkableVoxels.has(voxelKey(nx, nz))) continue;
        const diagonal = dx !== 0 && dz !== 0;
        const threshold = diagonal ? 0.11 : 0.33;
        if (randomUnit(nx, nz, 19 + pass * 29) < threshold) additions.push([nx, nz]);
      }
    }
    for (const [x, z] of additions) carveVoxel(walkableVoxels, x, z);
  }
}

function preserveGraphOpenings(walkableVoxels, maskMap) {
  for (const node of maskMap.values()) {
    const cx = node.x * VOXELS_PER_TILE;
    const cz = node.y * VOXELS_PER_TILE;
    carveWorldRect(
      walkableVoxels,
      cx - CONNECTION_HALF_WIDTH,
      cx + CONNECTION_HALF_WIDTH,
      cz - CONNECTION_HALF_WIDTH,
      cz + CONNECTION_HALF_WIDTH
    );

    if (hasDir(node.mask, DIR.N)) {
      carveWorldRect(walkableVoxels, cx - CONNECTION_HALF_WIDTH, cx + CONNECTION_HALF_WIDTH, cz - VOXELS_PER_TILE, cz);
    }
    if (hasDir(node.mask, DIR.S)) {
      carveWorldRect(walkableVoxels, cx - CONNECTION_HALF_WIDTH, cx + CONNECTION_HALF_WIDTH, cz, cz + VOXELS_PER_TILE);
    }
    if (hasDir(node.mask, DIR.W)) {
      carveWorldRect(walkableVoxels, cx - VOXELS_PER_TILE, cx, cz - CONNECTION_HALF_WIDTH, cz + CONNECTION_HALF_WIDTH);
    }
    if (hasDir(node.mask, DIR.E)) {
      carveWorldRect(walkableVoxels, cx, cx + VOXELS_PER_TILE, cz - CONNECTION_HALF_WIDTH, cz + CONNECTION_HALF_WIDTH);
    }
  }
}

function caveHeightAt(walkableVoxels, x, z) {
  let missingNeighbors = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!walkableVoxels.has(voxelKey(x + dx, z + dz))) missingNeighbors++;
  }

  let height = CAVE_MIN_HEIGHT;
  if (randomUnit(x, z, 41) > 0.26) height++;
  if (randomUnit(x, z, 47) > 0.58) height++;
  if (missingNeighbors >= 1 && randomUnit(x, z, 53) > 0.38) height += 2;
  if (missingNeighbors >= 2 && randomUnit(x, z, 59) > 0.52) height++;
  if (randomUnit(x, z, 67) > 0.88) height += 2;
  return Math.max(CAVE_MIN_HEIGHT, Math.min(CAVE_MAX_HEIGHT, height));
}

function createCaveLayout(maskMap) {
  const walkableVoxels = new Set();
  for (const node of maskMap.values()) {
    carveNodeFootprint(walkableVoxels, node);
  }
  addCaveErosion(walkableVoxels);
  preserveGraphOpenings(walkableVoxels, maskMap);

  const heights = new Map();
  for (const key of walkableVoxels) {
    const [x, z] = key.split(',').map(Number);
    heights.set(key, caveHeightAt(walkableVoxels, x, z));
  }
  return { walkableVoxels, heights };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function integerOr(value, fallback, min, max) {
  return Math.round(numberOr(value, fallback, min, max));
}

function parseColor(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(Math.round(value), 0, 0xffffff);
  }
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : (trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed);
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return fallback;
  const expanded = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex;
  const parsed = Number.parseInt(expanded, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeModelScale(scale, fallback = { x: 1, y: 1, z: 1 }) {
  if (typeof scale === 'number' && Number.isFinite(scale)) {
    const uniform = clamp(scale, 0.05, 6);
    return { x: uniform, y: uniform, z: uniform };
  }
  if (!scale || typeof scale !== 'object') return { ...fallback };
  return {
    x: numberOr(scale.x, fallback.x, 0.05, 6),
    y: numberOr(scale.y, fallback.y, 0.05, 6),
    z: numberOr(scale.z, fallback.z, 0.05, 6)
  };
}

function defaultModelColor(kind, category) {
  const modelKind = String(kind || '').toLowerCase();
  const entityCategory = String(category || '').toLowerCase();
  if (modelKind.includes('crystal')) return 0x4bb8c4;
  if (modelKind.includes('ore') || entityCategory.includes('resource') || entityCategory.includes('mineral')) return 0x8d9990;
  if (modelKind.includes('chest') || entityCategory.includes('treasure')) return 0x704521;
  if (modelKind.includes('stalagmite')) return 0x4b4537;
  if (modelKind.includes('rock')) return 0x37352d;
  if (entityCategory.includes('enemy')) return 0x223027;
  return 0x6c695f;
}

function normalizeModel(model = {}, category = '') {
  const rawKind = typeof model.kind === 'string' && model.kind.trim() ? model.kind.trim().toLowerCase() : 'box';
  const fallbackColor = defaultModelColor(rawKind, category);
  const emissive = parseColor(model.emissive, 0x000000);
  return {
    kind: rawKind,
    color: parseColor(model.color, fallbackColor),
    emissive,
    emissiveIntensity: numberOr(model.emissiveIntensity, emissive ? 0.16 : 0, 0, 2),
    scale: normalizeModelScale(model.scale)
  };
}

function normalizeBehavior(value) {
  const behavior = String(value || '').toLowerCase();
  if (behavior === 'caster' || behavior === 'ranged' || behavior === 'projectile') return 'caster';
  return 'melee';
}

function normalizeCombat(combat) {
  if (!combat || typeof combat !== 'object') return null;
  return {
    behavior: normalizeBehavior(combat.behavior),
    health: combat.health,
    speed: combat.speed,
    aggroRange: combat.aggroRange,
    visionRange: combat.visionRange,
    attackRate: combat.attackRate,
    damage: combat.damage,
    range: combat.range,
    projectileSpeed: combat.projectileSpeed
  };
}

function normalizeSpawnRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .filter(rule => rule && typeof rule === 'object')
    .map(rule => ({
      field: String(rule.field || ''),
      op: String(rule.op || 'equals'),
      value: rule.value
    }))
    .filter(rule => rule.field);
}

function normalizeEntity(entity) {
  if (!entity || typeof entity !== 'object' || !entity.id) return null;
  const category = String(entity.category || '');
  return {
    id: String(entity.id),
    name: String(entity.name || entity.id),
    category,
    model: normalizeModel(entity.model || {}, category),
    combat: normalizeCombat(entity.combat),
    spawnRules: normalizeSpawnRules(entity.spawnRules)
  };
}

function normalizeSpawnRows(rows, maxCount = 256) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => row && typeof row === 'object')
    .map(row => ({
      entityId: String(row.entityId || ''),
      count: integerOr(row.count, 0, 0, maxCount),
      chancePercent: numberOr(row.chancePercent, 100, 0, 100),
      enabled: row.enabled !== false
    }))
    .filter(row => row.entityId);
}

function normalizePlayerSettings(player = {}) {
  const fallback = DEFAULT_PLAY_SETTINGS.player;
  return {
    maxHealth: integerOr(player.maxHealth, fallback.maxHealth, 1, 500),
    moveSpeed: numberOr(player.moveSpeed, fallback.moveSpeed, 0.5, 20),
    sprintSpeed: numberOr(player.sprintSpeed, fallback.sprintSpeed, 0.5, 30),
    attackDamage: integerOr(player.attackDamage, fallback.attackDamage, 1, 200),
    attackSpeed: numberOr(player.attackSpeed, fallback.attackSpeed, 0.1, 12),
    attackRange: numberOr(player.attackRange, fallback.attackRange, 0.4, 10),
    lightRadius: numberOr(player.lightRadius, fallback.lightRadius, 1, 80),
    lightIntensity: numberOr(player.lightIntensity, fallback.lightIntensity, 0, 30),
    lightFlicker: numberOr(player.lightFlicker, fallback.lightFlicker, 0, 5)
  };
}

function normalizePlaySettings(settings = {}) {
  const enemyCount = Number(settings.enemyCount);
  const chestCount = Number(settings.chestCount);
  const typeSettings = settings.enemyTypes || {};
  const meleeSettings = typeSettings.melee || {};
  const casterSettings = typeSettings.caster || {};
  const entities = Array.isArray(settings.entities)
    ? settings.entities.map(normalizeEntity).filter(Boolean)
    : [];
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const rawDungeonSettings = settings.dungeonSettings && typeof settings.dungeonSettings === 'object'
    ? settings.dungeonSettings
    : null;

  return {
    enemyCount: Number.isFinite(enemyCount) ? clamp(Math.round(enemyCount), 0, 24) : DEFAULT_PLAY_SETTINGS.enemyCount,
    chestCount: Number.isFinite(chestCount) ? clamp(Math.round(chestCount), 0, 12) : DEFAULT_PLAY_SETTINGS.chestCount,
    oreDensity: numberOr(settings.oreDensity, DEFAULT_PLAY_SETTINGS.oreDensity, 0, 3),
    clutterDensity: numberOr(settings.clutterDensity, DEFAULT_PLAY_SETTINGS.clutterDensity, 0, 3),
    enemyMeleeChance: numberOr(settings.enemyMeleeChance, DEFAULT_PLAY_SETTINGS.enemyMeleeChance, 0, 100),
    enemyCasterChance: numberOr(settings.enemyCasterChance, DEFAULT_PLAY_SETTINGS.enemyCasterChance, 0, 100),
    enemyAggroRange: numberOr(settings.enemyAggroRange, DEFAULT_PLAY_SETTINGS.enemyAggroRange, 1, 60),
    enemyVisionRange: numberOr(settings.enemyVisionRange, DEFAULT_PLAY_SETTINGS.enemyVisionRange, 2, 80),
    player: normalizePlayerSettings(settings.player),
    enemyTypes: {
      melee: {
        health: Math.round(numberOr(meleeSettings.health, DEFAULT_PLAY_SETTINGS.enemyTypes.melee.health, 1, 20)),
        speed: numberOr(meleeSettings.speed, DEFAULT_PLAY_SETTINGS.enemyTypes.melee.speed, 0.25, 8),
        attackRate: numberOr(meleeSettings.attackRate, DEFAULT_PLAY_SETTINGS.enemyTypes.melee.attackRate, 0.1, 5),
        damage: Math.round(numberOr(meleeSettings.damage, DEFAULT_PLAY_SETTINGS.enemyTypes.melee.damage, 1, 50)),
        range: numberOr(meleeSettings.range, DEFAULT_PLAY_SETTINGS.enemyTypes.melee.range, 0.4, 4)
      },
      caster: {
        health: Math.round(numberOr(casterSettings.health, DEFAULT_PLAY_SETTINGS.enemyTypes.caster.health, 1, 20)),
        speed: numberOr(casterSettings.speed, DEFAULT_PLAY_SETTINGS.enemyTypes.caster.speed, 0.25, 8),
        attackRate: numberOr(casterSettings.attackRate, DEFAULT_PLAY_SETTINGS.enemyTypes.caster.attackRate, 0.1, 5),
        damage: Math.round(numberOr(casterSettings.damage, DEFAULT_PLAY_SETTINGS.enemyTypes.caster.damage, 1, 50)),
        range: numberOr(casterSettings.range, DEFAULT_PLAY_SETTINGS.enemyTypes.caster.range, 1, 24),
        minRange: Math.min(ENEMY_CAST_MIN_RANGE, numberOr(casterSettings.range, DEFAULT_PLAY_SETTINGS.enemyTypes.caster.range, 1, 24) * 0.42),
        projectileSpeed: numberOr(casterSettings.projectileSpeed, DEFAULT_PLAY_SETTINGS.enemyTypes.caster.projectileSpeed, 1, 18)
      }
    },
    entities,
    entityById,
    hasDungeonSettings: !!rawDungeonSettings,
    authoredSpawnRows: {
      enemySpawns: Array.isArray(rawDungeonSettings?.enemySpawns),
      entitySpawns: Array.isArray(rawDungeonSettings?.entitySpawns),
      treasureSpawns: Array.isArray(rawDungeonSettings?.treasureSpawns)
    },
    dungeonSettings: {
      enemySpawns: normalizeSpawnRows(rawDungeonSettings?.enemySpawns, 64),
      entitySpawns: normalizeSpawnRows(rawDungeonSettings?.entitySpawns, 256),
      treasureSpawns: normalizeSpawnRows(rawDungeonSettings?.treasureSpawns, 64)
    }
  };
}

function hashString(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomSeeded(seed, x = 0, z = 0, salt = 0) {
  let h = seed >>> 0;
  h ^= Math.imul(Math.floor(x), 374761393);
  h ^= Math.imul(Math.floor(z), 668265263);
  h ^= Math.imul(Math.floor(salt), 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mapSignature(maskMap) {
  return [...maskMap.values()]
    .sort((a, b) => (a.x - b.x) || (a.y - b.y))
    .map(node => `${node.x},${node.y}:${node.mask & 15}:${node.room ? 1 : 0}`)
    .join('|');
}

function scatterSeedFor(maskMap, baseSeed) {
  return hashString(`${baseSeed || 'manual'}|${mapSignature(maskMap)}`);
}

function directionInfo(dir) {
  return DIR_DATA.find(info => info.dir === dir);
}

function wallPlacementFor(x, z, dir) {
  switch (dir) {
    case DIR.N:
      return { x: x + 0.5, z: z + 0.055, rotationY: 0 };
    case DIR.S:
      return { x: x + 0.5, z: z + 0.945, rotationY: Math.PI };
    case DIR.W:
      return { x: x + 0.055, z: z + 0.5, rotationY: Math.PI / 2 };
    case DIR.E:
      return { x: x + 0.945, z: z + 0.5, rotationY: -Math.PI / 2 };
    default:
      return { x: x + 0.5, z: z + 0.5, rotationY: 0 };
  }
}

function yawForDir(dir) {
  switch (dir) {
    case DIR.E: return -Math.PI / 2;
    case DIR.S: return Math.PI;
    case DIR.W: return Math.PI / 2;
    default: return 0;
  }
}

function neighborSummary(walkableVoxels, x, z) {
  const missingDirs = [];
  let cardinalOpen = 0;
  let allOpen = 0;

  for (const info of DIR_DATA) {
    if (walkableVoxels.has(voxelKey(x + info.dx, z + info.dy))) {
      cardinalOpen++;
    } else {
      missingDirs.push(info.dir);
    }
  }

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      if (walkableVoxels.has(voxelKey(x + dx, z + dz))) allOpen++;
    }
  }

  return {
    missingDirs,
    cardinalOpen,
    allOpen,
    nearWall: missingDirs.length > 0
  };
}

function distanceToNodeCenter(x, z, node) {
  return Math.hypot((x + 0.5) - node.x * VOXELS_PER_TILE, (z + 0.5) - node.y * VOXELS_PER_TILE);
}

function nearestNode(maskMap, x, z) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of maskMap.values()) {
    const distance = distanceToNodeCenter(x, z, node);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return { node: best, distance: bestDistance };
}

function isOnOpenGraphPath(worldX, worldZ, maskMap, padding = 0.42) {
  for (const node of maskMap.values()) {
    const cx = node.x * VOXELS_PER_TILE;
    const cz = node.y * VOXELS_PER_TILE;
    if (Math.abs(worldX - cx) <= 1.55 + padding && Math.abs(worldZ - cz) <= 1.55 + padding) return true;

    for (const info of DIR_DATA) {
      if (!hasDir(node.mask, info.dir)) continue;
      if (info.dir === DIR.N || info.dir === DIR.S) {
        const minZ = info.dir === DIR.N ? cz - VOXELS_PER_TILE : cz;
        const maxZ = info.dir === DIR.N ? cz : cz + VOXELS_PER_TILE;
        if (
          Math.abs(worldX - cx) <= CONNECTION_HALF_WIDTH + padding &&
          worldZ >= minZ - padding &&
          worldZ <= maxZ + padding
        ) {
          return true;
        }
      } else {
        const minX = info.dir === DIR.W ? cx - VOXELS_PER_TILE : cx;
        const maxX = info.dir === DIR.W ? cx : cx + VOXELS_PER_TILE;
        if (
          Math.abs(worldZ - cz) <= CONNECTION_HALF_WIDTH + padding &&
          worldX >= minX - padding &&
          worldX <= maxX + padding
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function nodeTypeFor(node, startNode = null) {
  if (!node) return 'unknown';
  if (startNode && node.x === startNode.x && node.y === startNode.y) return 'start';
  if (node.room) return 'room';
  const openings = countBits(node.mask);
  if (openings <= 1) return 'deadend';
  if (openings >= 3) return 'junction';
  return 'corridor';
}

function candidateContextFor({ caveLayout, maskMap, start, x, z, worldX, worldZ, summary, surface, blockedVoxels = null, includeLineOfSight = true }) {
  const nodeContext = nearestNode(maskMap, x, z);
  const onMainPath = isOnOpenGraphPath(worldX, worldZ, maskMap, surface === 'wall' ? 0.2 : 0.1);
  return {
    surface,
    distanceFromStart: Math.hypot(worldX - start.x, worldZ - start.z),
    nodeType: nodeTypeFor(nodeContext.node, start.node),
    nearWall: !!summary.nearWall,
    lineOfSightFromStart: includeLineOfSight && hasVoxelLineOfSight(
      caveLayout.walkableVoxels,
      blockedVoxels || EMPTY_BLOCKED_VOXELS,
      start.x,
      start.z,
      worldX,
      worldZ
    ),
    openNeighbors: summary.cardinalOpen,
    onMainPath
  };
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function ruleValuesEqual(actual, expected) {
  if (typeof actual === 'boolean') {
    const expectedBoolean = coerceBoolean(expected);
    return expectedBoolean === null ? false : actual === expectedBoolean;
  }

  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return actualNumber === expectedNumber;
  }

  return String(actual).toLowerCase() === String(expected).toLowerCase();
}

function spawnRuleMatches(context, rule) {
  if (!context || !rule || !(rule.field in context)) return false;
  const actual = context[rule.field];
  const op = String(rule.op || 'equals');

  if (op === 'equals') return ruleValuesEqual(actual, rule.value);
  if (op === 'notEquals') return !ruleValuesEqual(actual, rule.value);

  const actualNumber = Number(actual);
  const expectedNumber = Number(rule.value);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;

  switch (op) {
    case 'gt':
      return actualNumber > expectedNumber;
    case 'gte':
      return actualNumber >= expectedNumber;
    case 'lt':
      return actualNumber < expectedNumber;
    case 'lte':
      return actualNumber <= expectedNumber;
    default:
      return false;
  }
}

function spawnRulesMatch(entity, context) {
  const rules = entity?.spawnRules || [];
  return rules.every(rule => spawnRuleMatches(context, rule));
}

function enabledSpawnRows(rows) {
  return (rows || []).filter(row => row.enabled && row.count > 0);
}

function hasAuthoredSpawnRows(playSettings, key) {
  return !!playSettings?.authoredSpawnRows?.[key];
}

function authoredRowsUseField(playSettings, keys, field) {
  for (const key of keys) {
    if (!hasAuthoredSpawnRows(playSettings, key)) continue;
    for (const row of enabledSpawnRows(playSettings.dungeonSettings[key])) {
      const entity = playSettings.entityById.get(row.entityId);
      if (entity?.spawnRules?.some(rule => rule.field === field)) return true;
    }
  }
  return false;
}

function passesSpawnChance(row, seed, entityId, candidate, salt) {
  if (row.chancePercent >= 100) return true;
  if (row.chancePercent <= 0) return false;
  const roll = randomSeeded(
    seed ^ hashString(entityId),
    candidate.position.x * 31,
    candidate.position.z * 37,
    salt
  ) * 100;
  return roll < row.chancePercent;
}

function solidVoxelKeysFor(item) {
  const keys = [];
  const radius = item.blockRadius || item.radius || 0.42;
  const minX = Math.floor(item.position.x - radius);
  const maxX = Math.floor(item.position.x + radius);
  const minZ = Math.floor(item.position.z - radius);
  const maxZ = Math.floor(item.position.z + radius);

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const dx = (x + 0.5) - item.position.x;
      const dz = (z + 0.5) - item.position.z;
      if (dx * dx + dz * dz <= (radius + 0.12) * (radius + 0.12)) keys.push(voxelKey(x, z));
    }
  }
  return keys.length ? keys : [voxelKey(Math.floor(item.position.x), Math.floor(item.position.z))];
}

function buildCriticalTraversalKeys(maskMap, walkableVoxels) {
  const keys = [];
  for (const node of maskMap.values()) {
    const key = voxelKey(node.x * VOXELS_PER_TILE, node.y * VOXELS_PER_TILE);
    if (walkableVoxels.has(key)) keys.push(key);
  }
  return keys;
}

function keepsTraversalOpen(walkableVoxels, blockedVoxels, criticalKeys) {
  const startKey = criticalKeys.find(key => walkableVoxels.has(key) && !blockedVoxels.has(key));
  if (!startKey) return false;

  const seen = new Set([startKey]);
  const queue = [startKey];
  let index = 0;
  while (index < queue.length) {
    const key = queue[index++];
    const [x, z] = key.split(',').map(Number);
    for (const info of DIR_DATA) {
      const nextKey = voxelKey(x + info.dx, z + info.dy);
      if (!walkableVoxels.has(nextKey) || blockedVoxels.has(nextKey) || seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push(nextKey);
    }
  }

  return criticalKeys.every(key => !walkableVoxels.has(key) || seen.has(key));
}

function isFarFromItems(candidate, items, minDistance, filter = null) {
  for (const item of items) {
    if (filter && !filter(item)) continue;
    const distance = Math.hypot(candidate.position.x - item.position.x, candidate.position.z - item.position.z);
    if (distance < minDistance) return false;
  }
  return true;
}

function sortScatterCandidates(candidates, seed, salt) {
  return candidates
    .map(candidate => ({
      ...candidate,
      score: candidate.score + randomSeeded(seed, candidate.position.x * 17, candidate.position.z * 19, salt) * 0.65
    }))
    .sort((a, b) => b.score - a.score);
}

function oreSubtype(seed, x, z, dir) {
  const roll = randomSeeded(seed, x, z, 300 + dir);
  if (roll > 0.88) return 'crystal';
  if (roll > 0.54) return 'copper';
  return 'iron';
}

function buildOreCandidates(caveLayout, maskMap, seed, start, options = {}) {
  const candidates = [];
  for (const key of caveLayout.walkableVoxels) {
    const [x, z] = key.split(',').map(Number);
    const summary = neighborSummary(caveLayout.walkableVoxels, x, z);
    if (!summary.missingDirs.length) continue;
    const distanceFromStart = Math.hypot((x + 0.5) - start.x, (z + 0.5) - start.z);
    const nodeContext = nearestNode(maskMap, x, z);

    for (const dir of summary.missingDirs) {
      const wall = wallPlacementFor(x, z, dir);
      const height = caveLayout.heights.get(key) || CAVE_MIN_HEIGHT;
      const y = clamp(1.05 + randomSeeded(seed, x, z, 310 + dir) * Math.min(2.8, height - 2), 0.9, height - 1.25);
      const subtype = oreSubtype(seed, x, z, dir);
      const rarityBoost = subtype === 'crystal' ? 0.34 : (subtype === 'copper' ? 0.16 : 0);
      const corridorPenalty = isOnOpenGraphPath(wall.x, wall.z, maskMap, 0.2) ? 0.38 : 0;
      const context = candidateContextFor({
        caveLayout,
        maskMap,
        start,
        x,
        z,
        worldX: wall.x,
        worldZ: wall.z,
        summary,
        surface: 'wall',
        includeLineOfSight: !!options.includeLineOfSight
      });

      candidates.push({
        type: 'ore',
        subtype,
        sourceKey: `${key}:${dir}`,
        position: { x: wall.x, y, z: wall.z },
        rotationY: wall.rotationY,
        radius: 0.22,
        blockRadius: 0,
        solid: false,
        scale: {
          x: 0.82 + randomSeeded(seed, x, z, 320 + dir) * 0.55,
          y: 0.72 + randomSeeded(seed, x, z, 330 + dir) * 0.65,
          z: 0.75 + randomSeeded(seed, x, z, 340 + dir) * 0.4
        },
        tags: ['wall', 'mineral'],
        context,
        score: 0.45 + summary.missingDirs.length * 0.16 + rarityBoost + Math.min(distanceFromStart / 90, 0.24) - corridorPenalty - nodeContext.distance * 0.006
      });
    }
  }
  return candidates;
}

function itemFromFloorCandidate(type, subtype, sourceKey, x, z, seed, score, tags = []) {
  const jitterX = (randomSeeded(seed, x, z, 710) - 0.5) * 0.34;
  const jitterZ = (randomSeeded(seed, x, z, 711) - 0.5) * 0.34;
  const rotationY = randomSeeded(seed, x, z, 712) * Math.PI * 2;
  const base = {
    type,
    subtype,
    sourceKey,
    position: { x: x + 0.5 + jitterX, y: 0, z: z + 0.5 + jitterZ },
    rotationY,
    score,
    tags,
    solid: false,
    radius: 0.22,
    blockRadius: 0
  };

  if (type === 'rock') {
    const size = 0.72 + randomSeeded(seed, x, z, 720) * 0.45;
    return {
      ...base,
      solid: true,
      radius: 0.42,
      blockRadius: 0.42,
      position: { ...base.position, y: 0.22 + size * 0.12 },
      scale: { x: size, y: 0.46 + randomSeeded(seed, x, z, 721) * 0.24, z: 0.62 + randomSeeded(seed, x, z, 722) * 0.38 }
    };
  }

  if (type === 'stalagmite') {
    const height = 0.95 + randomSeeded(seed, x, z, 730) * 0.85;
    return {
      ...base,
      solid: true,
      radius: 0.36,
      blockRadius: 0.36,
      position: { ...base.position, y: height / 2 },
      scale: { x: 0.72 + randomSeeded(seed, x, z, 731) * 0.35, y: height, z: 0.72 + randomSeeded(seed, x, z, 732) * 0.35 }
    };
  }

  return {
    ...base,
    position: { ...base.position, y: 0.07 },
    scale: { x: 0.5 + randomSeeded(seed, x, z, 740) * 0.35, y: 0.16, z: 0.36 + randomSeeded(seed, x, z, 741) * 0.28 }
  };
}

function buildClutterCandidates(caveLayout, maskMap, seed, start, options = {}) {
  const candidates = [];
  for (const key of caveLayout.walkableVoxels) {
    const [x, z] = key.split(',').map(Number);
    const summary = neighborSummary(caveLayout.walkableVoxels, x, z);
    if (!summary.nearWall || summary.cardinalOpen < 2) continue;

    const wx = x + 0.5;
    const wz = z + 0.5;
    if (isOnOpenGraphPath(wx, wz, maskMap, 0.1)) continue;

    const distanceFromStart = Math.hypot(wx - start.x, wz - start.z);
    if (distanceFromStart < 9) continue;

    const roll = randomSeeded(seed, x, z, 760);
    const type = roll > 0.72 ? 'stalagmite' : (roll > 0.38 ? 'rock' : 'debris');
    const score = 0.42 + summary.missingDirs.length * 0.2 + summary.allOpen * 0.035 + Math.min(distanceFromStart / 120, 0.2);
    const candidate = itemFromFloorCandidate(type, type, key, x, z, seed, score, ['floor', 'clutter']);
    candidate.context = candidateContextFor({
      caveLayout,
      maskMap,
      start,
      x,
      z,
      worldX: candidate.position.x,
      worldZ: candidate.position.z,
      summary,
      surface: 'floor',
      includeLineOfSight: !!options.includeLineOfSight
    });
    candidates.push(candidate);
  }
  return candidates;
}

function nearestWalkableAround(caveLayout, maskMap, targetX, targetZ, maxRadius = 3) {
  const candidates = [];
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = Math.floor(targetX + dx);
        const z = Math.floor(targetZ + dz);
        const key = voxelKey(x, z);
        if (!caveLayout.walkableVoxels.has(key)) continue;
        const summary = neighborSummary(caveLayout.walkableVoxels, x, z);
        if (summary.cardinalOpen < 2) continue;
        if (isOnOpenGraphPath(x + 0.5, z + 0.5, maskMap, 0.05)) continue;
        candidates.push({ x, z, distance: Math.hypot((x + 0.5) - targetX, (z + 0.5) - targetZ), summary });
      }
    }
    if (candidates.length) break;
  }
  return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
}

function chestCandidateForNode(caveLayout, maskMap, node, seed, start, options = {}) {
  const openDirs = DIR_DATA.filter(info => hasDir(node.mask, info.dir));
  if (openDirs.length !== 1) return null;

  const openDir = openDirs[0].dir;
  const backInfo = directionInfo(OPPOSITE[openDir]);
  const cx = node.x * VOXELS_PER_TILE;
  const cz = node.y * VOXELS_PER_TILE;
  const targetX = cx + backInfo.dx * 4.25;
  const targetZ = cz + backInfo.dy * 4.25;
  const floor = nearestWalkableAround(caveLayout, maskMap, targetX, targetZ, 3);
  if (!floor) return null;

  const distanceFromStart = Math.hypot((floor.x + 0.5) - start.x, (floor.z + 0.5) - start.z);
  if (distanceFromStart < 15) return null;
  const context = candidateContextFor({
    caveLayout,
    maskMap,
    start,
    x: floor.x,
    z: floor.z,
    worldX: floor.x + 0.5,
    worldZ: floor.z + 0.5,
    summary: floor.summary,
    surface: 'floor',
    includeLineOfSight: !!options.includeLineOfSight
  });

  return {
    type: 'chest',
    subtype: 'wood',
    sourceKey: `${node.x},${node.y}:deadend`,
    position: { x: floor.x + 0.5, y: 0.34, z: floor.z + 0.5 },
    rotationY: yawForDir(openDir),
    radius: 0.52,
    blockRadius: 0.46,
    solid: true,
    scale: { x: 1, y: 1, z: 1 },
    tags: ['reward', 'deadend'],
    context,
    score: 1.2 + Math.min(distanceFromStart / 80, 0.45) + randomSeeded(seed, node.x, node.y, 810) * 0.25
  };
}

function buildChestCandidates(caveLayout, maskMap, seed, start, options = {}) {
  const candidates = [];
  for (const node of maskMap.values()) {
    const deadEnd = chestCandidateForNode(caveLayout, maskMap, node, seed, start, options);
    if (deadEnd) candidates.push(deadEnd);
  }

  for (const key of caveLayout.walkableVoxels) {
    const [x, z] = key.split(',').map(Number);
    const summary = neighborSummary(caveLayout.walkableVoxels, x, z);
    if (!summary.nearWall || summary.cardinalOpen < 3 || summary.allOpen < 5) continue;
    if (isOnOpenGraphPath(x + 0.5, z + 0.5, maskMap, 0.15)) continue;

    const context = nearestNode(maskMap, x, z);
    if (!context.node || countBits(context.node.mask) < 3) continue;
    const distanceFromStart = Math.hypot((x + 0.5) - start.x, (z + 0.5) - start.z);
    if (distanceFromStart < 18) continue;
    const chestContext = candidateContextFor({
      caveLayout,
      maskMap,
      start,
      x,
      z,
      worldX: x + 0.5,
      worldZ: z + 0.5,
      summary,
      surface: 'floor',
      includeLineOfSight: !!options.includeLineOfSight
    });

    candidates.push({
      type: 'chest',
      subtype: 'wood',
      sourceKey: `${key}:pocket`,
      position: { x: x + 0.5, y: 0.34, z: z + 0.5 },
      rotationY: randomSeeded(seed, x, z, 830) * Math.PI * 2,
      radius: 0.52,
      blockRadius: 0.46,
      solid: true,
      scale: { x: 1, y: 1, z: 1 },
      tags: ['reward', 'pocket'],
      context: chestContext,
      score: 0.62 + summary.missingDirs.length * 0.13 + Math.min(distanceFromStart / 95, 0.36)
    });
  }

  return candidates;
}

function canReserveSolidItem(item, caveLayout, maskMap, blockedVoxels, criticalKeys) {
  const itemKeys = solidVoxelKeysFor(item);
  for (const key of itemKeys) {
    if (!caveLayout.walkableVoxels.has(key) || blockedVoxels.has(key)) return false;
    const [x, z] = key.split(',').map(Number);
    if (isOnOpenGraphPath(x + 0.5, z + 0.5, maskMap, 0.1)) return false;
  }

  const nextBlocked = new Set(blockedVoxels);
  for (const key of itemKeys) nextBlocked.add(key);
  if (!keepsTraversalOpen(caveLayout.walkableVoxels, nextBlocked, criticalKeys)) return false;
  return itemKeys;
}

function pushScatterItem(items, item) {
  item.id = `${item.type}-${items.length + 1}-${hashString(item.sourceKey).toString(36)}`;
  items.push(item);
}

function addSolidScatterItem(items, item, caveLayout, maskMap, blockedVoxels, criticalKeys) {
  const itemKeys = canReserveSolidItem(item, caveLayout, maskMap, blockedVoxels, criticalKeys);
  if (!itemKeys) return false;
  for (const key of itemKeys) blockedVoxels.add(key);
  item.solidVoxelKeys = itemKeys;
  pushScatterItem(items, item);
  return true;
}

function multiplyScale(a = { x: 1, y: 1, z: 1 }, b = { x: 1, y: 1, z: 1 }) {
  return {
    x: (a.x || 1) * (b.x || 1),
    y: (a.y || 1) * (b.y || 1),
    z: (a.z || 1) * (b.z || 1)
  };
}

function entityText(entity) {
  return `${entity?.category || ''} ${entity?.model?.kind || ''} ${entity?.id || ''}`.toLowerCase();
}

function surfaceRuleValue(entity) {
  const rule = (entity?.spawnRules || []).find(candidateRule => (
    candidateRule.field === 'surface' &&
    candidateRule.op === 'equals' &&
    typeof candidateRule.value === 'string'
  ));
  return rule ? rule.value.toLowerCase() : null;
}

function entityPrefersWall(entity) {
  const surface = surfaceRuleValue(entity);
  if (surface === 'wall') return true;
  if (surface === 'floor') return false;
  const text = entityText(entity);
  return text.includes('resource') || text.includes('mineral') || text.includes('ore') || text.includes('crystal');
}

function entityPrefersTreasure(entity) {
  const text = entityText(entity);
  return text.includes('treasure') || text.includes('loot') || text.includes('chest');
}

function candidatesForEntity(entity, rowType, pools) {
  const surface = surfaceRuleValue(entity);
  if (surface === 'wall') return pools.ore;
  if (surface === 'floor' && rowType !== 'treasure') return pools.clutter;
  if (rowType === 'treasure' || entityPrefersTreasure(entity)) return pools.chest;
  if (entityPrefersWall(entity)) return pools.ore;
  return pools.clutter;
}

function scatterMinDistanceFor(item, rowType) {
  if (rowType === 'treasure' || entityPrefersTreasure(item.entity)) return 13.5;
  if (item.context?.surface === 'wall') return 4.2;
  return 2.8;
}

function scatterDistanceFilterFor(item, rowType) {
  if (rowType === 'treasure' || entityPrefersTreasure(item.entity)) {
    return existing => existing.type === 'chest' || entityPrefersTreasure(existing.entity);
  }
  if (item.context?.surface === 'wall') {
    return existing => existing.context?.surface === 'wall' || existing.type === 'ore';
  }
  return existing => existing.context?.surface !== 'wall' && existing.type !== 'ore';
}

function createEntityScatterItem(candidate, entity, rowType, rowIndex) {
  const model = entity.model || normalizeModel({}, entity.category);
  const surface = candidate.context?.surface || 'floor';
  const tags = [...new Set([
    ...(candidate.tags || []),
    entity.category,
    rowType,
    entity.id
  ].filter(Boolean))];
  const item = {
    ...candidate,
    type: entity.category || model.kind || candidate.type,
    subtype: entity.id,
    entityId: entity.id,
    entityName: entity.name,
    entity,
    model,
    sourceKey: `${candidate.sourceKey}:${rowType}:${rowIndex}:${entity.id}`,
    scale: multiplyScale(candidate.scale, model.scale),
    tags
  };

  if (surface === 'wall') {
    item.solid = false;
    item.blockRadius = 0;
  } else if (rowType === 'treasure' || model.kind === 'chest') {
    item.solid = true;
    item.radius = Math.max(item.radius || 0, 0.52);
    item.blockRadius = Math.max(item.blockRadius || 0, 0.46);
  }

  return item;
}

function placeAuthoredScatterRows({ rows, rowType, playSettings, pools, items, caveLayout, maskMap, blockedVoxels, criticalKeys, seed }) {
  const activeRows = enabledSpawnRows(rows);
  for (let rowIndex = 0; rowIndex < activeRows.length; rowIndex++) {
    const row = activeRows[rowIndex];
    const entity = playSettings.entityById.get(row.entityId);
    if (!entity || entity.combat) continue;

    const baseCandidates = candidatesForEntity(entity, rowType, pools);
    const sortedCandidates = sortScatterCandidates(
      baseCandidates,
      seed ^ hashString(`${rowType}:${entity.id}:${rowIndex}`),
      1210 + rowIndex * 37
    );

    let placed = 0;
    for (const candidate of sortedCandidates) {
      if (placed >= row.count) break;
      if (!spawnRulesMatch(entity, candidate.context)) continue;
      if (!passesSpawnChance(row, seed, entity.id, candidate, 1240 + rowIndex * 41)) continue;

      const item = createEntityScatterItem(candidate, entity, rowType, rowIndex);
      if (!isFarFromItems(item, items, scatterMinDistanceFor(item, rowType), scatterDistanceFilterFor(item, rowType))) continue;

      if (item.solid) {
        if (!addSolidScatterItem(items, item, caveLayout, maskMap, blockedVoxels, criticalKeys)) continue;
      } else {
        pushScatterItem(items, item);
      }
      placed++;
    }
  }
}

function scatterKindIndex(item) {
  const defaultIndex = SCATTER_KIND_ORDER.indexOf(item.type);
  if (defaultIndex >= 0) return defaultIndex;
  if (item.context?.surface === 'wall' || entityPrefersWall(item.entity)) return 0;
  if (entityPrefersTreasure(item.entity)) return 1;
  return 3;
}

function generateScatterItems(maskMap, caveLayout, baseSeed, playSettings = DEFAULT_PLAY_SETTINGS) {
  const seed = scatterSeedFor(maskMap, baseSeed);
  const floorCount = caveLayout.walkableVoxels.size;
  const startNode = maskMap.get(keyFor(0, 0)) || maskMap.values().next().value;
  const start = { x: startNode.x * VOXELS_PER_TILE, z: startNode.y * VOXELS_PER_TILE, node: startNode };
  const items = [];
  const blockedVoxels = new Set();
  const criticalKeys = buildCriticalTraversalKeys(maskMap, caveLayout.walkableVoxels);

  const defaultChestTarget = clamp(Math.round(floorCount / SCATTER_DENSITY.chestDivisor), floorCount > 900 ? 1 : 0, 4);
  const oreTarget = playSettings.oreDensity <= 0 ? 0 : clamp(Math.round((floorCount / SCATTER_DENSITY.oreDivisor) * playSettings.oreDensity), 1, 20);
  const clutterTarget = playSettings.clutterDensity <= 0 ? 0 : clamp(Math.round((floorCount / SCATTER_DENSITY.clutterDivisor) * playSettings.clutterDensity), 1, 34);
  const targets = {
    ore: oreTarget,
    chest: playSettings.chestCount === null ? defaultChestTarget : playSettings.chestCount,
    clutter: clutterTarget
  };

  const hasAuthoredEntityRows = hasAuthoredSpawnRows(playSettings, 'entitySpawns');
  const hasAuthoredTreasureRows = hasAuthoredSpawnRows(playSettings, 'treasureSpawns');
  const includeScatterLineOfSight = authoredRowsUseField(playSettings, ['entitySpawns', 'treasureSpawns'], 'lineOfSightFromStart');

  const pools = {
    ore: buildOreCandidates(caveLayout, maskMap, seed, start, { includeLineOfSight: includeScatterLineOfSight }),
    chest: buildChestCandidates(caveLayout, maskMap, seed, start, { includeLineOfSight: includeScatterLineOfSight }),
    clutter: buildClutterCandidates(caveLayout, maskMap, seed, start, { includeLineOfSight: includeScatterLineOfSight })
  };

  if (hasAuthoredEntityRows) {
    placeAuthoredScatterRows({
      rows: playSettings.dungeonSettings.entitySpawns,
      rowType: 'entity',
      playSettings,
      pools,
      items,
      caveLayout,
      maskMap,
      blockedVoxels,
      criticalKeys,
      seed
    });
  } else {
    const oreCandidates = sortScatterCandidates(pools.ore, seed, 910);
    for (const candidate of oreCandidates) {
      if (items.filter(item => item.type === 'ore').length >= targets.ore) break;
      if (!isFarFromItems(candidate, items, 4.2, item => item.type === 'ore')) continue;
      pushScatterItem(items, candidate);
    }
  }

  if (hasAuthoredTreasureRows) {
    placeAuthoredScatterRows({
      rows: playSettings.dungeonSettings.treasureSpawns,
      rowType: 'treasure',
      playSettings,
      pools,
      items,
      caveLayout,
      maskMap,
      blockedVoxels,
      criticalKeys,
      seed: seed ^ hashString('treasure')
    });
  } else {
    const chestCandidates = sortScatterCandidates(pools.chest, seed, 920);
    for (const candidate of chestCandidates) {
      if (items.filter(item => item.type === 'chest').length >= targets.chest) break;
      if (!isFarFromItems(candidate, items, 13.5, item => item.type === 'chest')) continue;
      addSolidScatterItem(items, candidate, caveLayout, maskMap, blockedVoxels, criticalKeys);
    }
  }

  if (!hasAuthoredEntityRows) {
    const clutterCandidates = sortScatterCandidates(pools.clutter, seed, 930);
    for (const candidate of clutterCandidates) {
      if (items.filter(item => ['rock', 'stalagmite', 'debris'].includes(item.type)).length >= targets.clutter) break;
      if (!isFarFromItems(candidate, items, 2.8, item => item.type !== 'ore')) continue;
      if (candidate.solid) {
        addSolidScatterItem(items, candidate, caveLayout, maskMap, blockedVoxels, criticalKeys);
      } else {
        pushScatterItem(items, candidate);
      }
    }
  }

  items.sort((a, b) => scatterKindIndex(a) - scatterKindIndex(b) || a.id.localeCompare(b.id));
  return { items, blockedVoxels, seed };
}

function hasVoxelLineOfSight(walkableVoxels, blockedVoxels, fromX, fromZ, toX, toZ) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.max(1, Math.ceil(distance * 2.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(fromX + (toX - fromX) * t);
    const z = Math.floor(fromZ + (toZ - fromZ) * t);
    const key = voxelKey(x, z);
    if (!walkableVoxels.has(key) || blockedVoxels.has(key)) return false;
  }
  return true;
}

function enemyKindFor(seed, candidate, playSettings) {
  const melee = Math.max(0, playSettings.enemyMeleeChance);
  const caster = Math.max(0, playSettings.enemyCasterChance);
  const total = melee + caster;
  if (total <= 0) return 'melee';
  return randomSeeded(seed, candidate.position.x, candidate.position.z, 1130) * total < caster ? 'caster' : 'melee';
}

function statsForEnemyKind(kind, playSettings) {
  const fallback = DEFAULT_PLAY_SETTINGS.enemyTypes[kind] || DEFAULT_PLAY_SETTINGS.enemyTypes.melee;
  const stats = playSettings.enemyTypes?.[kind] || fallback;
  const range = numberOr(stats.range, fallback.range, kind === 'caster' ? 1 : 0.4, kind === 'caster' ? 24 : 4);
  return {
    kind,
    maxHealth: integerOr(stats.health, fallback.health, 1, 50),
    speed: numberOr(stats.speed, fallback.speed, 0.25, 8),
    attackRate: numberOr(stats.attackRate, fallback.attackRate, 0.1, 5),
    damage: integerOr(stats.damage, fallback.damage, 1, 80),
    range,
    minRange: kind === 'caster' ? Math.min(ENEMY_CAST_MIN_RANGE, range * 0.42) : 0,
    projectileSpeed: kind === 'caster' ? numberOr(stats.projectileSpeed, ENEMY_PROJECTILE_SPEED, 1, 18) : 0,
    aggroRange: numberOr(playSettings.enemyAggroRange, ENEMY_AGGRO_RANGE, 1, 60),
    visionRange: numberOr(playSettings.enemyVisionRange, ENEMY_VISION_RANGE, 2, 80)
  };
}

function statsForEntityCombat(entity, playSettings) {
  const combat = entity.combat || {};
  const kind = normalizeBehavior(combat.behavior);
  const fallback = statsForEnemyKind(kind, playSettings);
  const range = numberOr(combat.range, fallback.range, kind === 'caster' ? 1 : 0.4, kind === 'caster' ? 30 : 6);
  return {
    kind,
    maxHealth: integerOr(combat.health, fallback.maxHealth, 1, 100),
    speed: numberOr(combat.speed, fallback.speed, 0.25, 10),
    attackRate: numberOr(combat.attackRate, fallback.attackRate, 0.1, 8),
    damage: integerOr(combat.damage, fallback.damage, 1, 120),
    range,
    minRange: kind === 'caster' ? Math.min(ENEMY_CAST_MIN_RANGE, range * 0.42) : 0,
    projectileSpeed: kind === 'caster' ? numberOr(combat.projectileSpeed, fallback.projectileSpeed || ENEMY_PROJECTILE_SPEED, 1, 24) : 0,
    aggroRange: numberOr(combat.aggroRange, fallback.aggroRange, 1, 80),
    visionRange: numberOr(combat.visionRange, fallback.visionRange, 2, 100)
  };
}

function createEnemyFromCandidate(candidate, entity, stats, seed, index) {
  const maxHealth = stats.maxHealth;
  const attackCooldownDuration = 1 / Math.max(0.1, stats.attackRate);
  const entityPrefix = entity ? `${entity.id}-` : '';
  return {
    id: `enemy-${entityPrefix}${index + 1}-${hashString(candidate.key).toString(36)}`,
    entityId: entity?.id || null,
    entityName: entity?.name || null,
    entity: entity || null,
    model: entity?.model || null,
    kind: stats.kind,
    x: candidate.position.x,
    z: candidate.position.z,
    yaw: candidate.yaw,
    state: 'idle',
    health: maxHealth,
    maxHealth,
    speed: stats.speed,
    damage: stats.damage,
    range: stats.range,
    minRange: stats.minRange || 0,
    projectileSpeed: stats.projectileSpeed || 0,
    aggroRange: stats.aggroRange,
    visionRange: stats.visionRange,
    attackCooldownDuration,
    path: [],
    pathTimer: randomSeeded(seed, candidate.position.x, candidate.position.z, 1120) * ENEMY_PATH_REFRESH,
    attackCooldown: randomSeeded(seed, candidate.position.x, candidate.position.z, 1140) * attackCooldownDuration,
    hitTimer: 0,
    aggroFlash: 0,
    mesh: null,
    eyeMaterial: null,
    bodyMaterial: null
  };
}

function buildEnemyCandidates(maskMap, caveLayout, blockedVoxels, seed, start) {
  const candidates = [];

  for (const key of caveLayout.walkableVoxels) {
    if (blockedVoxels.has(key)) continue;
    const [x, z] = key.split(',').map(Number);
    const wx = x + 0.5;
    const wz = z + 0.5;
    const distanceFromStart = Math.hypot(wx - start.x, wz - start.z);
    if (distanceFromStart < ENEMY_SPAWN_DISTANCE) continue;
    if (isOnOpenGraphPath(wx, wz, maskMap, 0.2)) continue;

    const summary = neighborSummary(caveLayout.walkableVoxels, x, z);
    if (summary.cardinalOpen < 2) continue;

    const context = nearestNode(maskMap, x, z);
    const deadEndBoost = context.node && countBits(context.node.mask) === 1 ? 0.42 : 0;
    const pocketBoost = summary.nearWall ? 0.18 : 0;
    const spawnContext = candidateContextFor({
      caveLayout,
      maskMap,
      start,
      x,
      z,
      worldX: wx,
      worldZ: wz,
      summary,
      surface: 'floor',
      blockedVoxels
    });
    const hiddenBoost = spawnContext.lineOfSightFromStart ? -0.6 : 0.18;
    candidates.push({
      key,
      position: { x: wx, z: wz },
      yaw: randomSeeded(seed, x, z, 1100) * Math.PI * 2,
      context: spawnContext,
      score: distanceFromStart / 120 + deadEndBoost + pocketBoost + hiddenBoost + randomSeeded(seed, x, z, 1110) * 0.55
    });
  }

  return candidates;
}

function generateAuthoredEnemies(candidates, playSettings, seed) {
  const enemies = [];
  const rows = enabledSpawnRows(playSettings.dungeonSettings.enemySpawns);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const entity = playSettings.entityById.get(row.entityId);
    if (!entity?.combat) continue;

    const stats = statsForEntityCombat(entity, playSettings);
    const rowCandidates = candidates
      .map(candidate => ({
        ...candidate,
        score: candidate.score + randomSeeded(seed ^ hashString(entity.id), candidate.position.x, candidate.position.z, 1310 + rowIndex * 43) * 0.55
      }))
      .sort((a, b) => b.score - a.score);

    let spawned = 0;
    for (const candidate of rowCandidates) {
      if (spawned >= row.count) break;
      if (enemies.some(enemy => Math.hypot(enemy.x - candidate.position.x, enemy.z - candidate.position.z) < 10)) continue;
      if (!spawnRulesMatch(entity, candidate.context)) continue;
      if (!passesSpawnChance(row, seed, entity.id, candidate, 1330 + rowIndex * 47)) continue;
      enemies.push(createEnemyFromCandidate(candidate, entity, stats, seed, enemies.length));
      spawned++;
    }
  }

  return enemies;
}

function generateEnemies(maskMap, caveLayout, blockedVoxels, baseSeed, playSettings = DEFAULT_PLAY_SETTINGS) {
  const seed = hashString(`enemies|${baseSeed || 'manual'}|${mapSignature(maskMap)}`);
  const startNode = maskMap.get(keyFor(0, 0)) || maskMap.values().next().value;
  const start = { x: startNode.x * VOXELS_PER_TILE, z: startNode.y * VOXELS_PER_TILE, node: startNode };
  const candidates = buildEnemyCandidates(maskMap, caveLayout, blockedVoxels, seed, start);

  if (hasAuthoredSpawnRows(playSettings, 'enemySpawns')) {
    return { enemies: generateAuthoredEnemies(candidates, playSettings, seed), seed };
  }

  const defaultTargetCount = clamp(Math.round(caveLayout.walkableVoxels.size / 850), 2, 7);
  const targetCount = playSettings.enemyCount === null ? defaultTargetCount : playSettings.enemyCount;
  candidates.sort((a, b) => b.score - a.score);
  const enemies = [];
  for (const candidate of candidates) {
    if (enemies.length >= targetCount) break;
    if (enemies.some(enemy => Math.hypot(enemy.x - candidate.position.x, enemy.z - candidate.position.z) < 10)) continue;
    const kind = enemyKindFor(seed, candidate, playSettings);
    enemies.push(createEnemyFromCandidate(candidate, null, statsForEnemyKind(kind, playSettings), seed, enemies.length));
  }

  return { enemies, seed };
}

function colorForFace(type, x, y, z, normal) {
  let base;
  let shade;
  if (type === 'floor') {
    base = [0.18, 0.16, 0.12];
    shade = 0.82;
  } else if (type === 'ceiling') {
    base = [0.10, 0.095, 0.085];
    shade = 0.58;
  } else {
    base = [0.16, 0.155, 0.13];
    shade = 0.62 + y * 0.032;
    if (normal[0] > 0 || normal[2] > 0) shade += 0.08;
    if (y >= 1 && y <= 2) {
      const ore = randomUnit(x, z, y + 71);
      if (ore > 0.986) base = [0.10, 0.24, 0.28];
      else if (ore > 0.972) base = [0.33, 0.22, 0.09];
    }
  }

  const variation = 0.68 + randomUnit(x, z, y + type.length * 17) * 0.42;
  const light = Math.max(0.22, Math.min(1.08, shade * variation));
  return base.map(channel => Math.min(1, channel * light));
}

function addQuad(buffers, corners, normal, color) {
  const offset = buffers.positions.length / 3;
  for (const corner of corners) {
    buffers.positions.push(corner[0], corner[1], corner[2]);
    buffers.normals.push(normal[0], normal[1], normal[2]);
    buffers.colors.push(color[0], color[1], color[2]);
  }
  buffers.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  buffers.faceCount++;
}

function addFloorFace(buffers, x, z) {
  addQuad(buffers, [
    [x, 0, z],
    [x, 0, z + VOXEL_SIZE],
    [x + VOXEL_SIZE, 0, z + VOXEL_SIZE],
    [x + VOXEL_SIZE, 0, z]
  ], [0, 1, 0], colorForFace('floor', x, 0, z, [0, 1, 0]));
}

function addCeilingFace(buffers, x, z, height) {
  addQuad(buffers, [
    [x, height, z],
    [x + VOXEL_SIZE, height, z],
    [x + VOXEL_SIZE, height, z + VOXEL_SIZE],
    [x, height, z + VOXEL_SIZE]
  ], [0, -1, 0], colorForFace('ceiling', x, height, z, [0, -1, 0]));
}

function addWallFace(buffers, x, z, y, dir) {
  if (dir === DIR.N) {
    addQuad(buffers, [
      [x, y, z],
      [x + VOXEL_SIZE, y, z],
      [x + VOXEL_SIZE, y + VOXEL_SIZE, z],
      [x, y + VOXEL_SIZE, z]
    ], [0, 0, 1], colorForFace('wall', x, y, z, [0, 0, 1]));
  } else if (dir === DIR.S) {
    addQuad(buffers, [
      [x, y, z + VOXEL_SIZE],
      [x, y + VOXEL_SIZE, z + VOXEL_SIZE],
      [x + VOXEL_SIZE, y + VOXEL_SIZE, z + VOXEL_SIZE],
      [x + VOXEL_SIZE, y, z + VOXEL_SIZE]
    ], [0, 0, -1], colorForFace('wall', x, y, z, [0, 0, -1]));
  } else if (dir === DIR.W) {
    addQuad(buffers, [
      [x, y, z],
      [x, y + VOXEL_SIZE, z],
      [x, y + VOXEL_SIZE, z + VOXEL_SIZE],
      [x, y, z + VOXEL_SIZE]
    ], [1, 0, 0], colorForFace('wall', x, y, z, [1, 0, 0]));
  } else if (dir === DIR.E) {
    addQuad(buffers, [
      [x + VOXEL_SIZE, y, z],
      [x + VOXEL_SIZE, y, z + VOXEL_SIZE],
      [x + VOXEL_SIZE, y + VOXEL_SIZE, z + VOXEL_SIZE],
      [x + VOXEL_SIZE, y + VOXEL_SIZE, z]
    ], [-1, 0, 0], colorForFace('wall', x, y, z, [-1, 0, 0]));
  }
}

function buildVoxelCaveMesh(THREE, caveLayout) {
  const buffers = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    faceCount: 0
  };

  const neighborDirs = [
    { dir: DIR.N, dx: 0, dz: -1 },
    { dir: DIR.E, dx: 1, dz: 0 },
    { dir: DIR.S, dx: 0, dz: 1 },
    { dir: DIR.W, dx: -1, dz: 0 }
  ];

  for (const key of caveLayout.walkableVoxels) {
    const [x, z] = key.split(',').map(Number);
    const height = caveLayout.heights.get(key) || CAVE_MIN_HEIGHT;
    addFloorFace(buffers, x, z);
    addCeilingFace(buffers, x, z, height);

    for (const info of neighborDirs) {
      const neighborKey = voxelKey(x + info.dx, z + info.dz);
      const neighborWalkable = caveLayout.walkableVoxels.has(neighborKey);
      const neighborHeight = neighborWalkable ? (caveLayout.heights.get(neighborKey) || CAVE_MIN_HEIGHT) : 0;
      const startY = neighborWalkable ? neighborHeight : 0;
      if (startY >= height) continue;
      for (let y = startY; y < height; y++) {
        addWallFace(buffers, x, z, y, info.dir);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    fog: true,
    side: THREE.FrontSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return { mesh, faceCount: buffers.faceCount, voxelCount: caveLayout.walkableVoxels.size };
}

function buildMinimapMesh(THREE, caveLayout) {
  const maxCells = caveLayout.walkableVoxels.size;
  const positions = new Float32Array(maxCells * 4 * 3);
  const colors = new Float32Array(maxCells * 4 * 3);
  const indices = [];
  const cells = new Map();
  let cellIndex = 0;

  for (const key of caveLayout.walkableVoxels) {
    const [x, z] = key.split(',').map(Number);
    let openSides = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!caveLayout.walkableVoxels.has(voxelKey(x + dx, z + dz))) openSides++;
    }

    const edgeBoost = openSides ? 0.14 : 0;
    const variation = randomUnit(x, z, 97) * 0.08;
    const color = [
      0.16 + edgeBoost + variation,
      0.19 + edgeBoost + variation,
      0.15 + edgeBoost * 0.75 + variation
    ];
    cells.set(key, { x, z, color });

    const vertexOffset = cellIndex * 4;
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
    cellIndex++;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  if (THREE.DynamicDrawUsage) {
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
  }
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    cells,
    positionAttribute,
    colorAttribute,
    discoveredCount: 0
  };
}

function createPlayerMarker(THREE) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.12, -1.15,
    -0.7, 0.12, 0.72,
    0.7, 0.12, 0.72
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    side: THREE.DoubleSide
  });
  return new THREE.Mesh(geometry, material);
}

function revealMinimapArea(runtime) {
  if (!runtime.minimapData || !runtime.discoveredVoxels || !runtime.walkableVoxels) return;

  const px = Math.floor(runtime.player.x);
  const pz = Math.floor(runtime.player.z);
  const radiusSq = MINIMAP_REVEAL_RADIUS * MINIMAP_REVEAL_RADIUS;
  let changed = false;

  for (let x = px - MINIMAP_REVEAL_RADIUS; x <= px + MINIMAP_REVEAL_RADIUS; x++) {
    for (let z = pz - MINIMAP_REVEAL_RADIUS; z <= pz + MINIMAP_REVEAL_RADIUS; z++) {
      const dx = x + 0.5 - runtime.player.x;
      const dz = z + 0.5 - runtime.player.z;
      if (dx * dx + dz * dz > radiusSq) continue;

      const key = voxelKey(x, z);
      if (!runtime.walkableVoxels.has(key) || runtime.discoveredVoxels.has(key)) continue;

      const cell = runtime.minimapData.cells.get(key);
      if (!cell) continue;

      const vertexOffset = runtime.minimapData.discoveredCount * 4;
      runtime.minimapData.positionAttribute.setXYZ(vertexOffset, cell.x, 0, cell.z);
      runtime.minimapData.positionAttribute.setXYZ(vertexOffset + 1, cell.x, 0, cell.z + VOXEL_SIZE);
      runtime.minimapData.positionAttribute.setXYZ(vertexOffset + 2, cell.x + VOXEL_SIZE, 0, cell.z + VOXEL_SIZE);
      runtime.minimapData.positionAttribute.setXYZ(vertexOffset + 3, cell.x + VOXEL_SIZE, 0, cell.z);

      runtime.discoveredVoxels.add(key);
      for (let vertex = 0; vertex < 4; vertex++) {
        const index = vertexOffset + vertex;
        runtime.minimapData.colorAttribute.setXYZ(index, cell.color[0], cell.color[1], cell.color[2]);
      }
      runtime.minimapData.discoveredCount++;
      changed = true;
    }
  }

  if (changed) {
    runtime.minimapData.mesh.geometry.setDrawRange(0, runtime.minimapData.discoveredCount * 6);
    runtime.minimapData.positionAttribute.needsUpdate = true;
    runtime.minimapData.colorAttribute.needsUpdate = true;
  }
}

function scatterMaterial(THREE, color, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity,
    fog: true
  });
}

function createModelGeometry(THREE, model) {
  const kind = String(model?.kind || 'box').toLowerCase();
  if (kind === 'ore' || kind === 'crystal' || kind === 'gem') return new THREE.BoxGeometry(0.58, 0.34, 0.12);
  if (kind === 'rock' || kind === 'boulder') return new THREE.BoxGeometry(0.82, 0.55, 0.76);
  if (kind === 'stalagmite' || kind === 'spike') return new THREE.ConeGeometry(0.42, 1, 5);
  if (kind === 'debris' || kind === 'plank') return new THREE.BoxGeometry(0.42, 0.16, 0.34);
  if (kind === 'chest' || kind === 'crate') return new THREE.BoxGeometry(1.08, 0.68, 0.76);
  if (kind === 'sphere' || kind === 'orb') return new THREE.SphereGeometry(0.42, 10, 8);
  if (kind === 'cylinder' || kind === 'barrel') return new THREE.CylinderGeometry(0.36, 0.36, 0.8, 8);
  if (kind === 'cone') return new THREE.ConeGeometry(0.42, 0.9, 8);
  return new THREE.BoxGeometry(0.72, 0.72, 0.72);
}

function addAuthoredScatterMeshes(THREE, group, items) {
  const batches = new Map();
  for (const item of items) {
    if (!item.entity || !item.model) continue;
    const model = item.model;
    const key = `${item.entityId}|${model.kind}|${model.color}|${model.emissive}|${model.emissiveIntensity}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(item);
  }

  for (const batchItems of batches.values()) {
    const model = batchItems[0].model;
    addInstancedScatterMesh(
      THREE,
      group,
      batchItems,
      createModelGeometry(THREE, model),
      scatterMaterial(THREE, model.color, model.emissive, model.emissiveIntensity)
    );
  }
}

function applyInstanceTransform(THREE, dummy, item) {
  const scale = item.scale || { x: 1, y: 1, z: 1 };
  dummy.position.set(item.position.x, item.position.y, item.position.z);
  dummy.rotation.set(0, item.rotationY || 0, 0);
  dummy.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
  dummy.updateMatrix();
}

function addInstancedScatterMesh(THREE, group, items, geometry, material) {
  if (!items.length) {
    geometry.dispose();
    material.dispose();
    return;
  }

  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < items.length; i++) {
    applyInstanceTransform(THREE, dummy, items[i]);
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  group.add(mesh);
}

function groupedItems(items, type, subtype = null) {
  return items.filter(item => item.type === type && (subtype === null || item.subtype === subtype));
}

function createChestMesh(THREE, item) {
  const group = new THREE.Group();
  group.position.set(item.position.x, 0, item.position.z);
  group.rotation.y = item.rotationY || 0;

  const wood = scatterMaterial(THREE, 0x5b371c);
  const lid = scatterMaterial(THREE, 0x704521);
  const metal = scatterMaterial(THREE, 0x8b806d, 0x120d07, 0.06);

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.44, 0.76), wood);
  base.position.y = 0.26;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.24, 0.7), lid);
  top.position.y = 0.6;

  const strapGeometry = new THREE.BoxGeometry(0.12, 0.76, 0.84);
  const leftStrap = new THREE.Mesh(strapGeometry, metal);
  leftStrap.position.set(-0.28, 0.44, 0);
  const rightStrap = new THREE.Mesh(strapGeometry.clone(), metal);
  rightStrap.position.set(0.28, 0.44, 0);

  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.08), metal);
  latch.position.set(0, 0.45, -0.42);

  for (const mesh of [base, top, leftStrap, rightStrap, latch]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  return group;
}

function createScatterGroup(THREE, scatter) {
  const group = new THREE.Group();
  group.name = 'cave-scatter';
  const items = scatter.items || [];
  const fallbackItems = items.filter(item => !item.entity);
  addAuthoredScatterMeshes(THREE, group, items);

  const oreGeometry = new THREE.BoxGeometry(0.58, 0.34, 0.12);
  addInstancedScatterMesh(THREE, group, groupedItems(fallbackItems, 'ore', 'iron'), oreGeometry.clone(), scatterMaterial(THREE, 0x8d9990, 0x141816, 0.08));
  addInstancedScatterMesh(THREE, group, groupedItems(fallbackItems, 'ore', 'copper'), oreGeometry.clone(), scatterMaterial(THREE, 0xb87534, 0x2c1205, 0.14));
  addInstancedScatterMesh(THREE, group, groupedItems(fallbackItems, 'ore', 'crystal'), oreGeometry.clone(), scatterMaterial(THREE, 0x4bb8c4, 0x0f3a45, 0.28));
  oreGeometry.dispose();

  addInstancedScatterMesh(
    THREE,
    group,
    groupedItems(fallbackItems, 'rock'),
    new THREE.BoxGeometry(0.82, 0.55, 0.76),
    scatterMaterial(THREE, 0x37352d)
  );
  addInstancedScatterMesh(
    THREE,
    group,
    groupedItems(fallbackItems, 'stalagmite'),
    new THREE.ConeGeometry(0.42, 1, 5),
    scatterMaterial(THREE, 0x4b4537)
  );
  addInstancedScatterMesh(
    THREE,
    group,
    groupedItems(fallbackItems, 'debris'),
    new THREE.BoxGeometry(0.42, 0.16, 0.34),
    scatterMaterial(THREE, 0x2f2c24)
  );

  for (const chest of groupedItems(fallbackItems, 'chest')) {
    group.add(createChestMesh(THREE, chest));
  }

  return group;
}

function scaleColor(color, factor) {
  const r = clamp(Math.round(((color >> 16) & 255) * factor), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 255) * factor), 0, 255);
  const b = clamp(Math.round((color & 255) * factor), 0, 255);
  return (r << 16) | (g << 8) | b;
}

function mixColor(color, target, amount) {
  const mix = clamp(amount, 0, 1);
  const r = Math.round(((color >> 16) & 255) * (1 - mix) + ((target >> 16) & 255) * mix);
  const g = Math.round(((color >> 8) & 255) * (1 - mix) + ((target >> 8) & 255) * mix);
  const b = Math.round((color & 255) * (1 - mix) + (target & 255) * mix);
  return (r << 16) | (g << 8) | b;
}

function enemyBodyGeometry(THREE, modelKind) {
  if (modelKind === 'sphere' || modelKind === 'orb' || modelKind === 'slime') {
    const geometry = new THREE.SphereGeometry(0.48, 10, 8);
    return { geometry, y: 0.68 };
  }
  if (modelKind === 'cone' || modelKind === 'spike') {
    const geometry = new THREE.ConeGeometry(0.46, 0.98, 8);
    return { geometry, y: 0.52 };
  }
  return { geometry: new THREE.BoxGeometry(0.72, 0.92, 0.5), y: 0.56 };
}

function createEnemyMesh(THREE, enemy) {
  const group = new THREE.Group();
  group.name = enemy.id;
  const caster = enemy.kind === 'caster';
  const model = enemy.model;
  const modelKind = model?.kind || '';
  const defaultBodyColor = caster ? 0x202436 : 0x223027;
  const defaultHeadColor = caster ? 0x191b2a : 0x19231d;
  const bodyColor = model?.color ?? defaultBodyColor;
  const headColor = model ? scaleColor(bodyColor, 0.72) : defaultHeadColor;
  const emissive = model?.emissive || 0x000000;
  const emissiveIntensity = model?.emissiveIntensity || 0;

  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: bodyColor,
    emissive,
    emissiveIntensity,
    fog: true
  });
  const headMaterial = new THREE.MeshLambertMaterial({
    color: headColor,
    emissive,
    emissiveIntensity: emissiveIntensity * 0.75,
    fog: true
  });
  const eyeMaterial = new THREE.MeshLambertMaterial({
    color: emissive || 0x21180e,
    fog: true
  });

  const bodyShape = enemyBodyGeometry(THREE, modelKind);
  const body = new THREE.Mesh(bodyShape.geometry, bodyMaterial);
  body.position.y = bodyShape.y;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.42), headMaterial);
  head.position.set(0, 1.18, -0.03);
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.03), eyeMaterial);
  leftEye.position.set(-0.12, 1.2, -0.255);
  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.03), eyeMaterial);
  rightEye.position.set(0.12, 1.2, -0.255);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(caster ? 0.36 : 0.26, 0.08, 0.28), headMaterial);
  crown.position.set(0, 1.44, 0);

  for (const mesh of [body, head, leftEye, rightEye, crown]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  enemy.bodyMaterial = bodyMaterial;
  enemy.eyeMaterial = eyeMaterial;
  enemy.idleBodyColor = bodyColor;
  enemy.alertBodyColor = model ? mixColor(bodyColor, caster ? 0x6670aa : 0x887044, 0.32) : (caster ? 0x34324a : 0x2f3d30);
  enemy.eyeIdleColor = emissive || 0x21180e;
  enemy.eyeAlertColor = emissive || 0x4a1710;
  enemy.eyeFlashColor = emissive ? scaleColor(emissive, 1.45) : 0x9a5d2d;
  enemy.baseMeshScale = model?.scale || { x: 1, y: 1, z: 1 };
  group.scale.set(enemy.baseMeshScale.x, enemy.baseMeshScale.y, enemy.baseMeshScale.z);
  enemy.mesh = group;
  return group;
}

function createEnemyGroup(THREE, enemies) {
  const group = new THREE.Group();
  group.name = 'cave-enemies';
  for (const enemy of enemies) {
    group.add(createEnemyMesh(THREE, enemy));
  }
  return group;
}

function createSwordSlash(THREE) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xd8d1bd,
    transparent: true,
    opacity: 0.54,
    depthTest: false
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.86, 1.24), material);
  blade.position.set(0.48, -0.28, -1.02);
  blade.rotation.set(-0.2, -0.18, -0.72);
  blade.visible = false;
  return blade;
}

function createProjectileMesh(THREE) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x6d7cff,
    transparent: true,
    opacity: 0.72,
    fog: true
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function createPlay3d(elements, callbacks) {
  const {
    playOverlay,
    playCanvas,
    minimapCanvas,
    lockPlayBtn,
    playerHealthFill,
    playerHealthText,
    playStatus
  } = elements;
  const {
    getMaskMap,
    getPlacedSize,
    getScatterSeed,
    getPlaySettings,
    getVoxelDungeonState,
    setValidationResult,
    showToast
  } = callbacks;

  let playActive = false;
  let playRuntime = null;
  let playAnimationFrame = 0;
  let playLastFrame = 0;
  let playSceneLabel = 'Voxel Cave';
  const playKeys = new Set();

  async function ensurePlayRuntime() {
    if (playRuntime) return playRuntime;

    const THREE = await import(THREE_MODULE_URL);
    const renderer = new THREE.WebGLRenderer({
      canvas: playCanvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;

    const minimapRenderer = new THREE.WebGLRenderer({
      canvas: minimapCanvas,
      antialias: false,
      powerPreference: 'low-power'
    });
    minimapRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if (THREE.SRGBColorSpace) minimapRenderer.outputColorSpace = THREE.SRGBColorSpace;
    minimapRenderer.shadowMap.enabled = false;
    minimapRenderer.setClearColor(0x000000, 1);

    playRuntime = {
      THREE,
      renderer,
      minimapRenderer,
      scene: new THREE.Scene(),
      minimapScene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(74, 1, 0.05, 500),
      minimapCamera: new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500),
      player: { x: 0, z: 0, yaw: 0, pitch: 0, health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH, invulnTimer: 0, dead: false },
      map: null,
      voxelLayout: null,
      playSettings: normalizePlaySettings(),
      walkableVoxels: null,
      torchLight: null,
      playerMarker: null,
      minimapData: null,
      scatterItems: [],
      scatterGroup: null,
      solidScatterVoxels: new Set(),
      enemies: [],
      enemyGroup: null,
      projectiles: [],
      projectileGroup: null,
      swordSlash: null,
      attackCooldown: 0,
      attackTimer: 0,
      discoveredVoxels: new Set()
    };
    return playRuntime;
  }

  function disposeScene(scene) {
    if (!scene) return;
    scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    while (scene.children.length) scene.remove(scene.children[0]);
  }

  function disposePlayScene(runtime) {
    if (!runtime) return;
    disposeScene(runtime.scene);
    disposeScene(runtime.minimapScene);
    runtime.playerMarker = null;
    runtime.minimapData = null;
    runtime.voxelLayout = null;
    runtime.scatterItems = [];
    runtime.scatterGroup = null;
    runtime.solidScatterVoxels.clear();
    runtime.enemies = [];
    runtime.enemyGroup = null;
    runtime.projectiles = [];
    runtime.projectileGroup = null;
    runtime.swordSlash = null;
    runtime.attackCooldown = 0;
    runtime.attackTimer = 0;
    runtime.player.health = PLAYER_MAX_HEALTH;
    runtime.player.maxHealth = PLAYER_MAX_HEALTH;
    runtime.player.invulnTimer = 0;
    runtime.player.dead = false;
    runtime.discoveredVoxels.clear();
    updatePlayerHealthHud(runtime);
  }

  function updatePlayerHealthHud(runtime) {
    if (!runtime?.player) return;
    const maxHealth = Math.max(1, runtime.player.maxHealth || PLAYER_MAX_HEALTH);
    const health = clamp(runtime.player.health, 0, maxHealth);
    const pct = health / maxHealth;
    if (playerHealthFill) {
      playerHealthFill.style.width = `${Math.round(pct * 100)}%`;
      playerHealthFill.classList.toggle('critical', pct <= 0.28);
    }
    if (playerHealthText) {
      playerHealthText.textContent = `${Math.ceil(health)} / ${maxHealth}`;
    }
  }

  function damagePlayer(runtime, amount) {
    if (!runtime || runtime.player.dead || runtime.player.invulnTimer > 0) return;
    runtime.player.health = Math.max(0, runtime.player.health - amount);
    runtime.player.invulnTimer = 0.38;
    updatePlayerHealthHud(runtime);
    if (runtime.player.health <= 0) {
      runtime.player.dead = true;
      playStatus.textContent = `${playSceneLabel} - player down, Escape exits`;
      showToast('You died');
    }
  }

  function resizePlayRenderer() {
    if (!playRuntime) return;
    const rect = playOverlay.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(rect.width));
    const nextHeight = Math.max(1, Math.floor(rect.height));
    playRuntime.renderer.setSize(nextWidth, nextHeight, false);
    playRuntime.camera.aspect = nextWidth / nextHeight;
    playRuntime.camera.updateProjectionMatrix();

    const minimapWidth = minimapCanvas.clientWidth || 184;
    const minimapHeight = minimapCanvas.clientHeight || 184;
    playRuntime.minimapRenderer.setSize(minimapWidth, minimapHeight, false);
  }

  function firstOpenDir(mask) {
    for (const info of DIR_DATA) {
      if (hasDir(mask, info.dir)) return info.dir;
    }
    return DIR.N;
  }

  async function textureFromVoxelState(THREE, voxelState) {
    const settings = voxelState?.settings;
    const asset = voxelState?.textureAsset;
    if (!settings?.useTexture || !asset?.dataUrl) return null;
    const texture = await new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(asset.dataUrl, resolve, undefined, reject);
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = settings.pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = settings.pixelated ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  async function buildPlayScene(runtime, maskMap, validation, voxelState = null) {
    const { THREE } = runtime;
    disposePlayScene(runtime);
    const proceduralLayout = voxelState?.layout && !voxelState.error ? voxelState.layout : null;
    const activeMaskMap = proceduralLayout?.maskMap || maskMap;
    runtime.map = activeMaskMap;
    runtime.playSettings = normalizePlaySettings(getPlaySettings ? getPlaySettings() : {});
    const playerSettings = runtime.playSettings.player;
    runtime.player.maxHealth = playerSettings.maxHealth;
    runtime.scene.background = new THREE.Color(0x020202);
    runtime.scene.fog = new THREE.Fog(0x020202, 9, 34);

    const caveLayout = proceduralLayout || createCaveLayout(activeMaskMap);
    runtime.voxelLayout = proceduralLayout;
    const texture = proceduralLayout ? await textureFromVoxelState(THREE, voxelState) : null;
    const terrain = proceduralLayout
      ? buildVoxelDungeonMesh(THREE, caveLayout, { texture })
      : buildVoxelCaveMesh(THREE, caveLayout);
    const scatter = generateScatterItems(activeMaskMap, caveLayout, getScatterSeed ? getScatterSeed() : 'manual', runtime.playSettings);
    const enemySet = generateEnemies(activeMaskMap, caveLayout, scatter.blockedVoxels, getScatterSeed ? getScatterSeed() : 'manual', runtime.playSettings);
    runtime.walkableVoxels = caveLayout.walkableVoxels;
    runtime.scatterItems = scatter.items;
    runtime.solidScatterVoxels = scatter.blockedVoxels;
    runtime.enemies = enemySet.enemies;
    runtime.scene.add(terrain.mesh);
    runtime.scatterGroup = createScatterGroup(THREE, scatter);
    runtime.scene.add(runtime.scatterGroup);
    runtime.enemyGroup = createEnemyGroup(THREE, enemySet.enemies);
    runtime.scene.add(runtime.enemyGroup);
    runtime.projectiles = [];
    runtime.projectileGroup = new THREE.Group();
    runtime.projectileGroup.name = 'enemy-projectiles';
    runtime.scene.add(runtime.projectileGroup);

    runtime.minimapScene.background = new THREE.Color(0x000000);
    runtime.minimapData = buildMinimapMesh(THREE, caveLayout);
    runtime.minimapScene.add(runtime.minimapData.mesh);
    runtime.playerMarker = createPlayerMarker(THREE);
    runtime.minimapScene.add(runtime.playerMarker);

    while (runtime.camera.children.length) runtime.camera.remove(runtime.camera.children[0]);
    runtime.scene.add(runtime.camera);

    const ambient = new THREE.AmbientLight(0x101414, 0.035);
    runtime.scene.add(ambient);

    runtime.torchLight = new THREE.PointLight(0xff8a38, playerSettings.lightIntensity, playerSettings.lightRadius, 2.0);
    runtime.torchLight.position.set(0, -0.18, 0.1);
    runtime.camera.add(runtime.torchLight);
    runtime.swordSlash = createSwordSlash(THREE);
    runtime.camera.add(runtime.swordSlash);

    const start = activeMaskMap.get(keyFor(0, 0)) || activeMaskMap.values().next().value;
    runtime.player.x = start.x * PLAY_TILE_SIZE;
    runtime.player.z = start.y * PLAY_TILE_SIZE;
    runtime.player.yaw = yawForDir(firstOpenDir(start.mask));
    runtime.player.pitch = 0;
    runtime.player.health = runtime.player.maxHealth;
    runtime.player.invulnTimer = 0;
    runtime.player.dead = false;
    runtime.camera.rotation.order = 'YXZ';
    updatePlayCamera(runtime);
    updatePlayerHealthHud(runtime);
    revealMinimapArea(runtime);
    playSceneLabel = `${proceduralLayout ? 'Procedural Cave' : 'Voxel Cave'} - ${validation.cells} cells, ${terrain.faceCount} faces, ${scatter.items.length} props, ${enemySet.enemies.length} enemies`;
    playStatus.textContent = playSceneLabel;
  }

  function canStandOnVoxel(runtime, x, z) {
    if (!runtime.walkableVoxels) return true;
    const key = voxelKey(Math.floor(x), Math.floor(z));
    if (!runtime.walkableVoxels.has(key) || runtime.solidScatterVoxels.has(key)) return false;
    if (runtime.voxelLayout && !hasVoxelDungeonHeadroomAt(runtime.voxelLayout, x, z, PLAY_EYE_HEIGHT + 0.25)) return false;
    return true;
  }

  function runtimeLineOfSight(runtime, fromX, fromZ, toX, toZ, fromY = PLAY_EYE_HEIGHT, toY = PLAY_EYE_HEIGHT) {
    if (runtime.voxelLayout) {
      return hasVoxelDungeonLineOfSight(runtime.voxelLayout, fromX, fromY, fromZ, toX, toY, toZ);
    }
    return hasVoxelLineOfSight(runtime.walkableVoxels, runtime.solidScatterVoxels, fromX, fromZ, toX, toZ);
  }

  function canStandAt(runtime, fromX, fromZ, toX, toZ) {
    const offsets = [
      [0, 0],
      [PLAY_PLAYER_RADIUS, 0],
      [-PLAY_PLAYER_RADIUS, 0],
      [0, PLAY_PLAYER_RADIUS],
      [0, -PLAY_PLAYER_RADIUS],
      [PLAY_PLAYER_RADIUS, PLAY_PLAYER_RADIUS],
      [-PLAY_PLAYER_RADIUS, PLAY_PLAYER_RADIUS],
      [PLAY_PLAYER_RADIUS, -PLAY_PLAYER_RADIUS],
      [-PLAY_PLAYER_RADIUS, -PLAY_PLAYER_RADIUS]
    ];

    for (const [ox, oz] of offsets) {
      if (!canStandOnVoxel(runtime, toX + ox, toZ + oz)) return false;
    }

    for (const enemy of runtime.enemies) {
      if (enemy.health <= 0 || enemy.state === 'dead') continue;
      if (Math.hypot(enemy.x - toX, enemy.z - toZ) < PLAY_PLAYER_RADIUS + ENEMY_RADIUS + 0.08) return false;
    }
    return true;
  }

  function canEnemyStandAt(runtime, x, z) {
    const offsets = [
      [0, 0],
      [ENEMY_RADIUS, 0],
      [-ENEMY_RADIUS, 0],
      [0, ENEMY_RADIUS],
      [0, -ENEMY_RADIUS]
    ];

    for (const [ox, oz] of offsets) {
      if (!canStandOnVoxel(runtime, x + ox, z + oz)) return false;
    }
    return true;
  }

  function setEnemyAlerted(enemy) {
    if (enemy.state === 'dead' || enemy.state === 'alerted') return;
    enemy.state = 'alerted';
    enemy.aggroFlash = 0.35;
    if (enemy.eyeMaterial) enemy.eyeMaterial.color.setHex(0xff3b1f);
  }

  function enemyCanSeePlayer(runtime, enemy, distance) {
    if (distance > (enemy.visionRange || runtime.playSettings.enemyVisionRange)) return false;
    const toPlayerX = (runtime.player.x - enemy.x) / Math.max(distance, 0.0001);
    const toPlayerZ = (runtime.player.z - enemy.z) / Math.max(distance, 0.0001);
    const forwardX = -Math.sin(enemy.yaw);
    const forwardZ = -Math.cos(enemy.yaw);
    if (forwardX * toPlayerX + forwardZ * toPlayerZ < ENEMY_VISION_DOT) return false;
    return runtimeLineOfSight(runtime, enemy.x, enemy.z, runtime.player.x, runtime.player.z, 1.12, PLAY_EYE_HEIGHT);
  }

  function findEnemyPath(runtime, enemy) {
    const startKey = voxelKey(Math.floor(enemy.x), Math.floor(enemy.z));
    const goalKey = voxelKey(Math.floor(runtime.player.x), Math.floor(runtime.player.z));
    if (startKey === goalKey) return [];

    const queue = [startKey];
    const cameFrom = new Map([[startKey, null]]);
    let readIndex = 0;
    let visited = 0;

    while (readIndex < queue.length && visited++ < 900) {
      const key = queue[readIndex++];
      if (key === goalKey) break;
      const [x, z] = key.split(',').map(Number);
      for (const info of DIR_DATA) {
        const nextKey = voxelKey(x + info.dx, z + info.dy);
        if (cameFrom.has(nextKey)) continue;
        if (!runtime.walkableVoxels.has(nextKey) || runtime.solidScatterVoxels.has(nextKey)) continue;
        cameFrom.set(nextKey, key);
        queue.push(nextKey);
      }
    }

    if (!cameFrom.has(goalKey)) return [];
    const path = [];
    let key = goalKey;
    while (key && key !== startKey) {
      path.push(key);
      key = cameFrom.get(key);
    }
    path.reverse();
    return path.slice(0, 12);
  }

  function moveEnemyToward(runtime, enemy, targetX, targetZ, dt) {
    const dx = targetX - enemy.x;
    const dz = targetZ - enemy.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) return;

    const step = Math.min(distance, (enemy.speed || ENEMY_MOVE_SPEED) * dt);
    const dirX = dx / distance;
    const dirZ = dz / distance;
    enemy.yaw = Math.atan2(-dirX, -dirZ);

    const nextX = enemy.x + dirX * step;
    if (canEnemyStandAt(runtime, nextX, enemy.z)) enemy.x = nextX;
    const nextZ = enemy.z + dirZ * step;
    if (canEnemyStandAt(runtime, enemy.x, nextZ)) enemy.z = nextZ;
  }

  function faceEnemyTowardPlayer(runtime, enemy) {
    const dx = runtime.player.x - enemy.x;
    const dz = runtime.player.z - enemy.z;
    if (Math.hypot(dx, dz) > 0.001) enemy.yaw = Math.atan2(-dx, -dz);
  }

  function spawnEnemyProjectile(runtime, enemy) {
    if (!runtime.projectileGroup) return;
    const dx = runtime.player.x - enemy.x;
    const dz = runtime.player.z - enemy.z;
    const distance = Math.hypot(dx, dz) || 1;
    const startY = 1.12;
    const targetY = PLAY_EYE_HEIGHT - 0.18;
    const projectileSpeed = enemy.projectileSpeed || ENEMY_PROJECTILE_SPEED;
    const velocity = {
      x: (dx / distance) * projectileSpeed,
      y: ((targetY - startY) / Math.max(distance / projectileSpeed, 0.2)) * 0.22,
      z: (dz / distance) * projectileSpeed
    };
    const mesh = createProjectileMesh(runtime.THREE);
    mesh.position.set(enemy.x, startY, enemy.z);
    runtime.projectileGroup.add(mesh);
    runtime.projectiles.push({
      x: enemy.x,
      y: startY,
      z: enemy.z,
      vx: velocity.x,
      vy: velocity.y,
      vz: velocity.z,
      damage: enemy.damage || ENEMY_PROJECTILE_DAMAGE,
      life: ENEMY_PROJECTILE_LIFE,
      mesh
    });
  }

  function removeProjectile(runtime, projectile) {
    if (projectile.mesh) {
      runtime.projectileGroup?.remove(projectile.mesh);
      projectile.mesh.geometry?.dispose();
      projectile.mesh.material?.dispose();
    }
  }

  function updateProjectiles(runtime, dt) {
    const remaining = [];
    for (const projectile of runtime.projectiles) {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.z += projectile.vz * dt;

      const key = voxelKey(Math.floor(projectile.x), Math.floor(projectile.z));
      const hitVoxelWall = runtime.voxelLayout
        ? !hasVoxelDungeonAirAt(runtime.voxelLayout, projectile.x, projectile.y, projectile.z)
        : !runtime.walkableVoxels.has(key);
      const hitWall = projectile.life <= 0 || projectile.y < 0.25 || projectile.y > CAVE_MAX_HEIGHT || hitVoxelWall || runtime.solidScatterVoxels.has(key);
      const hitPlayer = !runtime.player.dead && Math.hypot(projectile.x - runtime.player.x, projectile.z - runtime.player.z) < 0.48 && Math.abs(projectile.y - PLAY_EYE_HEIGHT) < 1.0;

      if (hitPlayer) damagePlayer(runtime, projectile.damage || ENEMY_PROJECTILE_DAMAGE);
      if (hitWall || hitPlayer) {
        removeProjectile(runtime, projectile);
        continue;
      }

      if (projectile.mesh) {
        projectile.mesh.position.set(projectile.x, projectile.y, projectile.z);
        projectile.mesh.rotation.y += dt * 5;
        projectile.mesh.rotation.x += dt * 3.5;
      }
      remaining.push(projectile);
    }
    runtime.projectiles = remaining;
  }

  function updateEnemyMesh(enemy, time, dt) {
    if (!enemy.mesh) return;
    if (enemy.health <= 0) {
      enemy.mesh.visible = false;
      return;
    }

    enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
    enemy.aggroFlash = Math.max(0, enemy.aggroFlash - dt);

    const bob = Math.sin(time * 0.005 + enemy.x * 0.7 + enemy.z * 0.3) * 0.035;
    enemy.mesh.position.set(enemy.x, bob, enemy.z);
    enemy.mesh.rotation.y = enemy.yaw;
    const hitScale = enemy.hitTimer > 0 ? 1.08 : 1;
    const baseScale = enemy.baseMeshScale || { x: 1, y: 1, z: 1 };
    enemy.mesh.scale.set(baseScale.x * hitScale, baseScale.y * hitScale, baseScale.z * hitScale);

    if (enemy.bodyMaterial) {
      if (enemy.hitTimer > 0) {
        enemy.bodyMaterial.color.setHex(0x71322b);
      } else {
        const idleColor = enemy.idleBodyColor ?? (enemy.kind === 'caster' ? 0x202436 : 0x223027);
        const alertColor = enemy.alertBodyColor ?? (enemy.kind === 'caster' ? 0x34324a : 0x2f3d30);
        enemy.bodyMaterial.color.setHex(enemy.state === 'alerted' ? alertColor : idleColor);
      }
    }
    if (enemy.eyeMaterial) {
      if (enemy.state === 'alerted') {
        enemy.eyeMaterial.color.setHex(enemy.aggroFlash > 0 ? (enemy.eyeFlashColor ?? 0x9a5d2d) : (enemy.eyeAlertColor ?? 0x4a1710));
      } else {
        enemy.eyeMaterial.color.setHex(enemy.eyeIdleColor ?? 0x21180e);
      }
    }
  }

  function updateEnemies(runtime, dt, time) {
    for (const enemy of runtime.enemies) {
      if (enemy.health <= 0 || enemy.state === 'dead') {
        updateEnemyMesh(enemy, time, dt);
        continue;
      }

      const distanceToPlayer = Math.hypot(runtime.player.x - enemy.x, runtime.player.z - enemy.z);
      if (enemy.state === 'idle') {
        if (distanceToPlayer <= (enemy.aggroRange || runtime.playSettings.enemyAggroRange) || enemyCanSeePlayer(runtime, enemy, distanceToPlayer)) {
          setEnemyAlerted(enemy);
        }
      }

      if (enemy.state === 'alerted') {
        enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
        enemy.pathTimer -= dt;
        const directLine = runtimeLineOfSight(runtime, enemy.x, enemy.z, runtime.player.x, runtime.player.z, 1.12, PLAY_EYE_HEIGHT);
        const casterReady = enemy.kind === 'caster' && directLine && distanceToPlayer <= enemy.range && distanceToPlayer >= (enemy.minRange || ENEMY_CAST_MIN_RANGE);
        const meleeReady = distanceToPlayer <= enemy.range;

        let targetX = runtime.player.x;
        let targetZ = runtime.player.z;
        if (!directLine) {
          if (enemy.pathTimer <= 0) {
            enemy.path = findEnemyPath(runtime, enemy);
            enemy.pathTimer = ENEMY_PATH_REFRESH;
          }
          if (enemy.path.length) {
            const [pathX, pathZ] = enemy.path[0].split(',').map(Number);
            targetX = pathX + 0.5;
            targetZ = pathZ + 0.5;
            if (Math.hypot(enemy.x - targetX, enemy.z - targetZ) < 0.35) enemy.path.shift();
          }
        } else {
          enemy.path = [];
          enemy.pathTimer = ENEMY_PATH_REFRESH;
        }

        if (casterReady) {
          faceEnemyTowardPlayer(runtime, enemy);
          if (enemy.attackCooldown <= 0 && !runtime.player.dead) {
            spawnEnemyProjectile(runtime, enemy);
            enemy.attackCooldown = enemy.attackCooldownDuration;
          }
        } else if (meleeReady) {
          faceEnemyTowardPlayer(runtime, enemy);
          if (enemy.attackCooldown <= 0 && !runtime.player.dead) {
            damagePlayer(runtime, enemy.damage || ENEMY_MELEE_DAMAGE);
            enemy.attackCooldown = enemy.attackCooldownDuration;
          }
        } else if (distanceToPlayer > 0.85) {
          moveEnemyToward(runtime, enemy, targetX, targetZ, dt);
        }
      }

      updateEnemyMesh(enemy, time, dt);
    }
  }

  function movePlayPlayer(runtime, dx, dz) {
    if (runtime.player.dead) return;
    const player = runtime.player;
    const nextX = player.x + dx;
    if (canStandAt(runtime, player.x, player.z, nextX, player.z)) player.x = nextX;
    const nextZ = player.z + dz;
    if (canStandAt(runtime, player.x, player.z, player.x, nextZ)) player.z = nextZ;
  }

  function updatePlayCamera(runtime) {
    const player = runtime.player;
    runtime.camera.position.set(player.x, PLAY_EYE_HEIGHT, player.z);
    runtime.camera.rotation.y = player.yaw;
    runtime.camera.rotation.x = player.pitch;
  }

  function updateAttackEffects(runtime, dt) {
    runtime.player.invulnTimer = Math.max(0, runtime.player.invulnTimer - dt);
    runtime.attackCooldown = Math.max(0, runtime.attackCooldown - dt);
    runtime.attackTimer = Math.max(0, runtime.attackTimer - dt);
    if (!runtime.swordSlash) return;
    runtime.swordSlash.visible = runtime.attackTimer > 0;
    if (runtime.swordSlash.visible) {
      runtime.swordSlash.material.opacity = 0.18 + (runtime.attackTimer / 0.14) * 0.42;
      runtime.swordSlash.rotation.z = -0.95 + (1 - runtime.attackTimer / 0.14) * 0.85;
    }
  }

  function damageEnemy(runtime, enemy) {
    if (enemy.health <= 0) return;
    enemy.health -= runtime.playSettings.player.attackDamage;
    enemy.hitTimer = 0.16;
    setEnemyAlerted(enemy);
    if (enemy.health <= 0) {
      enemy.state = 'dead';
      if (enemy.mesh) enemy.mesh.visible = false;
    }
  }

  function performPlayerAttack(runtime) {
    if (!runtime || runtime.player.dead || runtime.attackCooldown > 0) return;
    const playerSettings = runtime.playSettings.player;
    runtime.attackCooldown = 1 / Math.max(0.1, playerSettings.attackSpeed);
    runtime.attackTimer = 0.14;
    if (runtime.swordSlash) runtime.swordSlash.visible = true;

    const forward = new runtime.THREE.Vector3();
    runtime.camera.getWorldDirection(forward);
    const origin = runtime.camera.position;
    let bestEnemy = null;
    let bestScore = -Infinity;

    for (const enemy of runtime.enemies) {
      if (enemy.health <= 0 || enemy.state === 'dead') continue;
      const dx = enemy.x - origin.x;
      const dy = 0.78 - origin.y;
      const dz = enemy.z - origin.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > playerSettings.attackRange) continue;

      const dot = (forward.x * dx + forward.y * dy + forward.z * dz) / Math.max(distance, 0.0001);
      if (dot < PLAYER_ATTACK_DOT) continue;
      if (!runtimeLineOfSight(runtime, runtime.player.x, runtime.player.z, enemy.x, enemy.z, PLAY_EYE_HEIGHT, 0.78)) continue;

      const score = dot * 2 - distance * 0.32;
      if (score > bestScore) {
        bestScore = score;
        bestEnemy = enemy;
      }
    }

    if (bestEnemy) damageEnemy(runtime, bestEnemy);
  }

  function drawPlayMinimap(runtime) {
    if (!runtime?.map || !runtime.minimapRenderer || !runtime.minimapCamera) return;

    const cssWidth = minimapCanvas.clientWidth || 184;
    const cssHeight = minimapCanvas.clientHeight || 184;
    const aspect = cssWidth / Math.max(1, cssHeight);
    const viewSize = 34;
    const camera = runtime.minimapCamera;
    camera.left = -viewSize * aspect / 2;
    camera.right = viewSize * aspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.near = 0.1;
    camera.far = 40;
    camera.position.set(runtime.player.x, CAVE_MIN_HEIGHT - 0.25, runtime.player.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(runtime.player.x, 0, runtime.player.z);
    camera.updateProjectionMatrix();

    if (runtime.playerMarker) {
      runtime.playerMarker.position.set(runtime.player.x, 0, runtime.player.z);
      runtime.playerMarker.rotation.y = runtime.player.yaw;
    }

    runtime.minimapRenderer.render(runtime.minimapScene, camera);
  }

  function animatePlay(time) {
    if (!playActive || !playRuntime) return;
    const runtime = playRuntime;
    const dt = Math.min(0.05, Math.max(0, (time - playLastFrame) / 1000 || 0));
    playLastFrame = time;

    let moveX = 0;
    let moveZ = 0;
    if (playKeys.has('KeyW') || playKeys.has('ArrowUp')) moveZ -= 1;
    if (playKeys.has('KeyS') || playKeys.has('ArrowDown')) moveZ += 1;
    if (playKeys.has('KeyA') || playKeys.has('ArrowLeft')) moveX -= 1;
    if (playKeys.has('KeyD') || playKeys.has('ArrowRight')) moveX += 1;

    if ((moveX || moveZ) && !runtime.player.dead) {
      const length = Math.hypot(moveX, moveZ) || 1;
      moveX /= length;
      moveZ /= length;
      const playerSettings = runtime.playSettings.player;
      const speed = (playKeys.has('ShiftLeft') || playKeys.has('ShiftRight'))
        ? playerSettings.sprintSpeed
        : playerSettings.moveSpeed;
      const yaw = runtime.player.yaw;
      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const dx = (rightX * moveX + forwardX * -moveZ) * speed * dt;
      const dz = (rightZ * moveX + forwardZ * -moveZ) * speed * dt;
      movePlayPlayer(runtime, dx, dz);
    }

    updatePlayCamera(runtime);
    revealMinimapArea(runtime);
    updateEnemies(runtime, dt, time);
    updateProjectiles(runtime, dt);
    updateAttackEffects(runtime, dt);
    if (runtime.torchLight) {
      const playerSettings = runtime.playSettings.player;
      const flicker = (
        Math.sin(time * 0.018) * 0.65 +
        Math.sin(time * 0.041) * 0.35
      ) * playerSettings.lightFlicker;
      runtime.torchLight.intensity = Math.max(0, playerSettings.lightIntensity + flicker);
      runtime.torchLight.distance = playerSettings.lightRadius;
    }
    drawPlayMinimap(runtime);
    runtime.renderer.render(runtime.scene, runtime.camera);
    playAnimationFrame = window.requestAnimationFrame(animatePlay);
  }

  function requestPointerLock() {
    if (!playActive || !playCanvas.requestPointerLock) return;
    playCanvas.requestPointerLock();
  }

  function updateLockState() {
    const locked = document.pointerLockElement === playCanvas;
    playOverlay.classList.toggle('locked', locked);
    lockPlayBtn.textContent = locked ? 'Mouse Captured' : 'Capture Mouse';
    if (playActive && playRuntime?.map) {
      playStatus.textContent = locked
        ? `${playSceneLabel} - WASD to move, mouse to look, Escape exits`
        : `${playSceneLabel} - click Capture Mouse, WASD moves, Escape exits`;
    }
  }

  async function start() {
    const voxelState = getVoxelDungeonState ? await getVoxelDungeonState() : null;
    if (voxelState?.error) {
      showToast(voxelState.error);
      return;
    }
    const proceduralReady = !!voxelState?.layout && !voxelState.error;
    const maskMap = proceduralReady ? voxelState.layout.maskMap : getMaskMap();
    const validation = proceduralReady
      ? {
          valid: true,
          cells: maskMap.size,
          rooms: voxelState.layout.chambers,
          deadEnds: voxelState.layout.deadEnds,
          unmatched: [],
          disconnected: [],
          startKey: keyFor(0, 0)
        }
      : validateMaskMap(maskMap);
    setValidationResult(validation);
    if (!validation.valid) {
      showToast(getPlacedSize() ? 'Fix invalid sections before Play' : 'Generate a procedural cave first');
      return;
    }

    try {
      const runtime = await ensurePlayRuntime();
      playOverlay.classList.add('active');
      playOverlay.setAttribute('aria-hidden', 'false');
      playActive = true;
      playKeys.clear();
      await buildPlayScene(runtime, maskMap, validation, proceduralReady ? voxelState : null);
      resizePlayRenderer();
      updateLockState();
      drawPlayMinimap(runtime);
      playCanvas.focus();
      window.cancelAnimationFrame(playAnimationFrame);
      playLastFrame = performance.now();
      playAnimationFrame = window.requestAnimationFrame(animatePlay);
      showToast('3D mode ready');
    } catch (error) {
      console.error(error);
      playActive = false;
      playOverlay.classList.remove('active');
      playOverlay.setAttribute('aria-hidden', 'true');
      showToast('Three.js failed to load');
    }
  }

  function stop() {
    playActive = false;
    playKeys.clear();
    window.cancelAnimationFrame(playAnimationFrame);
    if (document.pointerLockElement === playCanvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
    playOverlay.classList.remove('active', 'locked');
    playOverlay.setAttribute('aria-hidden', 'true');
    lockPlayBtn.textContent = 'Capture Mouse';
  }

  function handleKeyDown(event) {
    if (!playActive) return false;
    if (event.key === 'Escape') {
      stop();
      event.preventDefault();
      return true;
    }
    playKeys.add(event.code);
    if (PLAY_MOVE_CODES.has(event.code)) event.preventDefault();
    return true;
  }

  function handleKeyUp(event) {
    if (!playActive) return false;
    playKeys.delete(event.code);
    event.preventDefault();
    return true;
  }

  function handlePointerMove(event) {
    if (!playActive || document.pointerLockElement !== playCanvas || !playRuntime) return;
    playRuntime.player.yaw -= event.movementX * 0.0022;
    playRuntime.player.pitch -= event.movementY * 0.0022;
    playRuntime.player.pitch = Math.max(-1.35, Math.min(1.35, playRuntime.player.pitch));
  }

  function handlePointerDown(event) {
    if (!playActive || !playRuntime || document.pointerLockElement !== playCanvas || event.button !== 0) return false;
    performPlayerAttack(playRuntime);
    event.preventDefault();
    return true;
  }

  return {
    get active() {
      return playActive;
    },
    handleKeyDown,
    handleKeyUp,
    handlePointerDown,
    handlePointerMove,
    requestPointerLock,
    resize: resizePlayRenderer,
    start,
    stop,
    updateLockState
  };
}
