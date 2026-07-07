export const ENGINE_DATA_STORAGE_KEY = 'dungeon-tunnels-engine-data-v1';

export const ENTITY_CATEGORIES = ['enemy', 'resource', 'prop', 'treasure'];
export const MODEL_KINDS = ['melee', 'caster', 'ore', 'chest', 'rock', 'stalagmite', 'debris'];
export const BEHAVIORS = ['melee', 'caster'];
export const SPAWN_RULE_FIELDS = [
  'surface',
  'distanceFromStart',
  'nodeType',
  'nearWall',
  'lineOfSightFromStart',
  'openNeighbors',
  'onMainPath'
];
export const SPAWN_RULE_OPERATORS = ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte'];

const DEFAULT_ENTITIES = [
  {
    id: 'enemy-melee-lurker',
    name: 'Melee Lurker',
    category: 'enemy',
    model: { kind: 'melee', color: '#223027', emissive: '#000000', scale: 1 },
    combat: {
      behavior: 'melee',
      health: 3,
      speed: 2.25,
      aggroRange: 16,
      visionRange: 24,
      attackRate: 0.85,
      damage: 10,
      range: 1.12,
      projectileSpeed: 0
    },
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'floor' },
      { field: 'distanceFromStart', op: 'gte', value: 18 },
      { field: 'openNeighbors', op: 'gte', value: 2 }
    ]
  },
  {
    id: 'enemy-gloom-caster',
    name: 'Gloom Caster',
    category: 'enemy',
    model: { kind: 'caster', color: '#202436', emissive: '#000000', scale: 1 },
    combat: {
      behavior: 'caster',
      health: 2,
      speed: 1.65,
      aggroRange: 16,
      visionRange: 24,
      attackRate: 0.45,
      damage: 12,
      range: 10.5,
      projectileSpeed: 5.4
    },
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'floor' },
      { field: 'distanceFromStart', op: 'gte', value: 22 },
      { field: 'lineOfSightFromStart', op: 'equals', value: false }
    ]
  },
  {
    id: 'resource-iron-mine',
    name: 'Iron Mine',
    category: 'resource',
    model: { kind: 'ore', color: '#8d9990', emissive: '#141816', scale: 1 },
    combat: null,
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'wall' },
      { field: 'nearWall', op: 'equals', value: true }
    ]
  },
  {
    id: 'resource-gold-mine',
    name: 'Gold Mine',
    category: 'resource',
    model: { kind: 'ore', color: '#d0a441', emissive: '#332407', scale: 1 },
    combat: null,
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'wall' },
      { field: 'nearWall', op: 'equals', value: true },
      { field: 'distanceFromStart', op: 'gte', value: 22 }
    ]
  },
  {
    id: 'resource-zinc-mine',
    name: 'Zinc Mine',
    category: 'resource',
    model: { kind: 'ore', color: '#b7c5c9', emissive: '#1b2426', scale: 1 },
    combat: null,
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'wall' },
      { field: 'nearWall', op: 'equals', value: true }
    ]
  },
  {
    id: 'treasure-wood-chest',
    name: 'Wood Chest',
    category: 'treasure',
    model: { kind: 'chest', color: '#704521', emissive: '#120d07', scale: 1 },
    combat: null,
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'floor' },
      { field: 'nodeType', op: 'equals', value: 'deadEnd' },
      { field: 'distanceFromStart', op: 'gte', value: 15 }
    ]
  },
  {
    id: 'prop-cave-rock',
    name: 'Cave Rock',
    category: 'prop',
    model: { kind: 'rock', color: '#37352d', emissive: '#000000', scale: 1 },
    combat: null,
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'floor' },
      { field: 'nearWall', op: 'equals', value: true }
    ]
  },
  {
    id: 'prop-stalagmite',
    name: 'Stalagmite',
    category: 'prop',
    model: { kind: 'stalagmite', color: '#4b4537', emissive: '#000000', scale: 1 },
    combat: null,
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'floor' },
      { field: 'nearWall', op: 'equals', value: true },
      { field: 'onMainPath', op: 'equals', value: false }
    ]
  },
  {
    id: 'prop-debris',
    name: 'Debris',
    category: 'prop',
    model: { kind: 'debris', color: '#2f2c24', emissive: '#000000', scale: 1 },
    combat: null,
    spawnRules: [
      { field: 'surface', op: 'equals', value: 'floor' },
      { field: 'nearWall', op: 'equals', value: true }
    ]
  }
];

const DEFAULT_DUNGEON_SETTINGS = {
  enemySpawns: [
    { entityId: 'enemy-melee-lurker', count: 4, chancePercent: 75, enabled: true },
    { entityId: 'enemy-gloom-caster', count: 2, chancePercent: 35, enabled: true }
  ],
  entitySpawns: [
    { entityId: 'resource-iron-mine', count: 8, chancePercent: 80, enabled: true },
    { entityId: 'resource-gold-mine', count: 3, chancePercent: 35, enabled: true },
    { entityId: 'resource-zinc-mine', count: 6, chancePercent: 55, enabled: true },
    { entityId: 'prop-cave-rock', count: 10, chancePercent: 65, enabled: true },
    { entityId: 'prop-stalagmite', count: 8, chancePercent: 55, enabled: true },
    { entityId: 'prop-debris', count: 10, chancePercent: 60, enabled: true }
  ],
  treasureSpawns: [
    { entityId: 'treasure-wood-chest', count: 2, chancePercent: 100, enabled: true }
  ]
};

const DEFAULT_PLAYER_PROPERTIES = {
  maxHealth: 100,
  moveSpeed: 4.4,
  sprintSpeed: 7.2,
  attackDamage: 1,
  attackSpeed: 2.38,
  attackRange: 2.05,
  lightRadius: 16.5,
  lightIntensity: 6.2,
  lightFlicker: 0.34
};

export function createDefaultEngineData() {
  return deepClone({
    version: 1,
    selectedEntityId: 'enemy-melee-lurker',
    entities: DEFAULT_ENTITIES,
    dungeonSettings: DEFAULT_DUNGEON_SETTINGS,
    player: DEFAULT_PLAYER_PROPERTIES
  });
}

export function loadEngineData(storage = localStorage) {
  try {
    const raw = storage.getItem(ENGINE_DATA_STORAGE_KEY);
    if (!raw) return createDefaultEngineData();
    return normalizeEngineData(JSON.parse(raw));
  } catch (_) {
    return createDefaultEngineData();
  }
}

export function saveEngineData(data, storage = localStorage) {
  storage.setItem(ENGINE_DATA_STORAGE_KEY, JSON.stringify(normalizeEngineData(data)));
}

export function resetEngineData(storage = localStorage) {
  const data = createDefaultEngineData();
  saveEngineData(data, storage);
  return data;
}

export function createEntity(base = {}) {
  const name = typeof base.name === 'string' && base.name.trim() ? base.name.trim() : 'New Entity';
  const category = normalizeCategory(base.category);
  const kind = normalizeModelKind(base.model?.kind || (category === 'treasure' ? 'chest' : 'ore'));
  return normalizeEntity({
    id: base.id || uniqueId(slugify(name) || 'entity'),
    name,
    category,
    model: {
      kind,
      color: base.model?.color || '#8d9990',
      emissive: base.model?.emissive || '#000000',
      scale: base.model?.scale ?? 1
    },
    combat: base.combat || (category === 'enemy' ? {
      behavior: 'melee',
      health: 3,
      speed: 2,
      aggroRange: 16,
      visionRange: 24,
      attackRate: 0.8,
      damage: 10,
      range: 1.1,
      projectileSpeed: 0
    } : null),
    spawnRules: base.spawnRules || [
      { field: 'surface', op: 'equals', value: category === 'resource' ? 'wall' : 'floor' }
    ]
  });
}

export function duplicateEntity(entity, existingIds = new Set()) {
  const copy = createEntity(deepClone(entity));
  copy.name = `${entity?.name || 'Entity'} Copy`;
  copy.id = uniqueEntityId(slugify(copy.name) || 'entity', existingIds);
  return copy;
}

export function createSpawnRow(entityId = '', values = {}) {
  return normalizeSpawnRow({
    entityId,
    count: values.count ?? 1,
    chancePercent: values.chancePercent ?? 100,
    enabled: values.enabled ?? true
  });
}

export function normalizeEngineData(input) {
  const defaults = createDefaultEngineData();
  const entities = Array.isArray(input?.entities)
    ? input.entities.map(normalizeEntity).filter(Boolean)
    : defaults.entities;
  const entityIds = new Set();
  const uniqueEntities = [];
  for (const entity of entities) {
    if (entityIds.has(entity.id)) entity.id = uniqueEntityId(entity.id, entityIds);
    entityIds.add(entity.id);
    uniqueEntities.push(entity);
  }
  const firstId = uniqueEntities[0]?.id || defaults.entities[0].id;
  return {
    version: 1,
    selectedEntityId: uniqueEntities.some(entity => entity.id === input?.selectedEntityId) ? input.selectedEntityId : firstId,
    entities: uniqueEntities.length ? uniqueEntities : defaults.entities,
    dungeonSettings: normalizeDungeonSettings(input?.dungeonSettings, uniqueEntities),
    player: normalizePlayerProperties(input?.player)
  };
}

export function normalizeRule(rule = {}) {
  const field = SPAWN_RULE_FIELDS.includes(rule.field) ? rule.field : 'surface';
  const op = SPAWN_RULE_OPERATORS.includes(rule.op) ? rule.op : 'equals';
  return {
    field,
    op,
    value: normalizeRuleValue(field, rule.value)
  };
}

function normalizeDungeonSettings(settings = {}, entities = DEFAULT_ENTITIES) {
  const findDefault = category => entities.find(entity => entity.category === category)?.id || entities[0]?.id || '';
  const defaults = createDefaultEngineData().dungeonSettings;
  return {
    enemySpawns: normalizeSpawnRows(Array.isArray(settings.enemySpawns) ? settings.enemySpawns : defaults.enemySpawns, findDefault('enemy')),
    entitySpawns: normalizeSpawnRows(Array.isArray(settings.entitySpawns) ? settings.entitySpawns : defaults.entitySpawns, findDefault('resource')),
    treasureSpawns: normalizeSpawnRows(Array.isArray(settings.treasureSpawns) ? settings.treasureSpawns : defaults.treasureSpawns, findDefault('treasure'))
  };
}

function normalizePlayerProperties(player = {}) {
  return {
    maxHealth: clampNumber(player.maxHealth, 1, 500, DEFAULT_PLAYER_PROPERTIES.maxHealth),
    moveSpeed: clampFloat(player.moveSpeed, 0.5, 20, DEFAULT_PLAYER_PROPERTIES.moveSpeed),
    sprintSpeed: clampFloat(player.sprintSpeed, 0.5, 30, DEFAULT_PLAYER_PROPERTIES.sprintSpeed),
    attackDamage: clampNumber(player.attackDamage, 1, 200, DEFAULT_PLAYER_PROPERTIES.attackDamage),
    attackSpeed: clampFloat(player.attackSpeed, 0.1, 12, DEFAULT_PLAYER_PROPERTIES.attackSpeed),
    attackRange: clampFloat(player.attackRange, 0.4, 10, DEFAULT_PLAYER_PROPERTIES.attackRange),
    lightRadius: clampFloat(player.lightRadius, 1, 80, DEFAULT_PLAYER_PROPERTIES.lightRadius),
    lightIntensity: clampFloat(player.lightIntensity, 0, 30, DEFAULT_PLAYER_PROPERTIES.lightIntensity),
    lightFlicker: clampFloat(player.lightFlicker, 0, 5, DEFAULT_PLAYER_PROPERTIES.lightFlicker)
  };
}

function normalizeSpawnRows(rows, fallbackEntityId) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => normalizeSpawnRow(row, fallbackEntityId)).filter(Boolean);
}

function normalizeSpawnRow(row = {}, fallbackEntityId = '') {
  return {
    entityId: typeof row.entityId === 'string' && row.entityId ? row.entityId : fallbackEntityId,
    count: clampNumber(row.count, 0, 99, 1),
    chancePercent: clampNumber(row.chancePercent, 0, 100, 100),
    enabled: row.enabled !== false
  };
}

function normalizeEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const category = normalizeCategory(entity.category);
  const combat = normalizeCombat(entity.combat, category);
  return {
    id: typeof entity.id === 'string' && entity.id ? entity.id : uniqueId('entity'),
    name: typeof entity.name === 'string' && entity.name.trim() ? entity.name.trim() : 'Entity',
    category,
    model: normalizeModel(entity.model, category),
    combat,
    spawnRules: Array.isArray(entity.spawnRules) ? entity.spawnRules.map(normalizeRule) : []
  };
}

function normalizeModel(model = {}, category = 'prop') {
  const fallbackKind = category === 'enemy' ? 'melee' : (category === 'treasure' ? 'chest' : 'ore');
  return {
    kind: normalizeModelKind(model.kind || fallbackKind),
    color: normalizeHex(model.color, '#8d9990'),
    emissive: normalizeHex(model.emissive, '#000000'),
    scale: clampFloat(model.scale, 0.35, 3, 1)
  };
}

function normalizeCombat(combat, category) {
  if (!combat || category !== 'enemy') return null;
  const behavior = BEHAVIORS.includes(combat.behavior) ? combat.behavior : 'melee';
  return {
    behavior,
    health: clampNumber(combat.health, 1, 100, 3),
    speed: clampFloat(combat.speed, 0.1, 10, 2),
    aggroRange: clampFloat(combat.aggroRange, 1, 80, 16),
    visionRange: clampFloat(combat.visionRange, 1, 100, 24),
    attackRate: clampFloat(combat.attackRate, 0.1, 5, 0.8),
    damage: clampNumber(combat.damage, 1, 100, 10),
    range: clampFloat(combat.range, 0.2, 40, behavior === 'caster' ? 10.5 : 1.1),
    projectileSpeed: clampFloat(combat.projectileSpeed, 0, 30, behavior === 'caster' ? 5.4 : 0)
  };
}

function normalizeCategory(category) {
  return ENTITY_CATEGORIES.includes(category) ? category : 'prop';
}

function normalizeModelKind(kind) {
  return MODEL_KINDS.includes(kind) ? kind : 'ore';
}

function normalizeRuleValue(field, value) {
  if (field === 'nearWall' || field === 'lineOfSightFromStart' || field === 'onMainPath') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return false;
  }
  if (field === 'distanceFromStart' || field === 'openNeighbors') {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }
  if (field === 'surface') return value === 'wall' ? 'wall' : 'floor';
  if (field === 'nodeType') {
    return ['corridor', 'room', 'junction', 'deadEnd'].includes(value) ? value : 'corridor';
  }
  return value ?? '';
}

function normalizeHex(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clampFloat(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Number(parsed.toFixed(2))));
}

function uniqueEntityId(base, existingIds) {
  let id = base;
  let index = 2;
  while (existingIds.has(id)) {
    id = `${base}-${index++}`;
  }
  return id;
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
