import {
  PIECES,
  createRng,
  formatValidationResult,
  generateMaskDungeon,
  keyFor,
  maskMapToPlaced,
  mod,
  parseKey,
  pieceById,
  placedToMaskMap as mapPlacedToMaskMap,
  validateMaskMap
} from './core/dungeon.js';
import {
  drawPieceShape
} from './render/canvas-shapes.js?v=engine-ui-4';
import {
  loadMap as loadStoredMap,
  saveMap as saveStoredMap
} from './core/storage.js?v=engine-ui-4';
import {
  BEHAVIORS,
  ENTITY_CATEGORIES,
  MODEL_KINDS,
  SPAWN_RULE_FIELDS,
  SPAWN_RULE_OPERATORS,
  createEntity,
  createSpawnRow,
  duplicateEntity,
  loadEngineData,
  normalizeEngineData,
  resetEngineData,
  saveEngineData
} from './core/engine-data.js?v=engine-ui-4';
import { createPlay3d } from './play/play3d.js?v=organic-cave-2';
import { createVoxelizerTool } from './tools/voxelizer.js?v=organic-cave-2';

const canvas = document.getElementById('mapCanvas');
const viewportWrap = document.querySelector('.viewport-wrap');
const ctx = canvas.getContext('2d');
const generationPanel = document.querySelector('.generation-panel');
const generationPanelTitle = generationPanel?.querySelector('h2');
const generationPanelSubtitle = generationPanel?.querySelector('.subtle');
const toolRailButtons = document.querySelectorAll('.tool-rail-btn[data-tool-page]');
const toolPages = document.querySelectorAll('.tool-page[data-tool-page]');
const workspacePages = document.querySelectorAll('.workspace-page[data-engine-page]');
const pieceStrip = document.getElementById('pieceStrip');
const currentStatus = document.getElementById('currentStatus');
const cellStatus = document.getElementById('cellStatus');
const rotateLeftBtn = document.getElementById('rotateLeft');
const rotateRightBtn = document.getElementById('rotateRight');
const clearMapBtn = document.getElementById('clearMap');
const centerViewBtn = document.getElementById('centerView');
const play3dBtn = document.getElementById('play3d');
const voxelPlay3dBtn = document.getElementById('voxelPlay3d');
const toast = document.getElementById('toast');
const hint = document.querySelector('.hint');
const genSeedInput = document.getElementById('genSeed');
const genAutoSeedInput = document.getElementById('genAutoSeed');
const genTargetCellsInput = document.getElementById('genTargetCells');
const genMainLengthInput = document.getElementById('genMainLength');
const genBranchCountInput = document.getElementById('genBranchCount');
const genBranchLengthInput = document.getElementById('genBranchLength');
const genLoopChanceInput = document.getElementById('genLoopChance');
const genRoomChanceInput = document.getElementById('genRoomChance');
const genLoopChanceValue = document.getElementById('genLoopChanceValue');
const genRoomChanceValue = document.getElementById('genRoomChanceValue');
const generateDungeonBtn = document.getElementById('generateDungeon');
const randomSeedBtn = document.getElementById('randomSeed');
const validateMapBtn = document.getElementById('validateMap');
const validationSummary = document.getElementById('validationSummary');
const playOverlay = document.getElementById('playOverlay');
const playCanvas = document.getElementById('playCanvas');
const minimapCanvas = document.getElementById('minimapCanvas');
const lockPlayBtn = document.getElementById('lockPlay');
const exitPlayBtn = document.getElementById('exitPlay');
const playerHealthFill = document.getElementById('playerHealthFill');
const playerHealthText = document.getElementById('playerHealthText');
const playStatus = document.getElementById('playStatus');
const enemyCountInput = document.getElementById('enemyCount');
const chestCountInput = document.getElementById('chestCount');
const oreDensityInput = document.getElementById('oreDensity');
const clutterDensityInput = document.getElementById('clutterDensity');
const enemyMeleeChanceInput = document.getElementById('enemyMeleeChance');
const enemyCasterChanceInput = document.getElementById('enemyCasterChance');
const enemyAggroRangeInput = document.getElementById('enemyAggroRange');
const enemyVisionRangeInput = document.getElementById('enemyVisionRange');
const meleeHealthInput = document.getElementById('meleeHealth');
const meleeSpeedInput = document.getElementById('meleeSpeed');
const meleeAttackRateInput = document.getElementById('meleeAttackRate');
const meleeDamageInput = document.getElementById('meleeDamage');
const meleeRangeInput = document.getElementById('meleeRange');
const casterHealthInput = document.getElementById('casterHealth');
const casterSpeedInput = document.getElementById('casterSpeed');
const casterAttackRateInput = document.getElementById('casterAttackRate');
const casterDamageInput = document.getElementById('casterDamage');
const casterRangeInput = document.getElementById('casterRange');
const casterProjectileSpeedInput = document.getElementById('casterProjectileSpeed');
const entitySearchInput = document.getElementById('entitySearch');
const addEntityBtn = document.getElementById('addEntityBtn');
const entityList = document.getElementById('entityList');
const entityPreviewCanvas = document.getElementById('entityPreviewCanvas');
const entityNameInput = document.getElementById('entityName');
const entityCategoryInput = document.getElementById('entityCategory');
const entityModelKindInput = document.getElementById('entityModelKind');
const entityColorInput = document.getElementById('entityColor');
const entityEmissiveInput = document.getElementById('entityEmissive');
const entityScaleInput = document.getElementById('entityScale');
const entityCombatEnabledInput = document.getElementById('entityCombatEnabled');
const entityBehaviorInput = document.getElementById('entityBehavior');
const entityHealthInput = document.getElementById('entityHealth');
const entitySpeedInput = document.getElementById('entitySpeed');
const entityAggroRangeEditorInput = document.getElementById('entityAggroRange');
const entityVisionRangeEditorInput = document.getElementById('entityVisionRange');
const entityAttackRateInput = document.getElementById('entityAttackRate');
const entityDamageInput = document.getElementById('entityDamage');
const entityRangeInput = document.getElementById('entityRange');
const entityProjectileSpeedInput = document.getElementById('entityProjectileSpeed');
const entityCombatFields = document.getElementById('entityCombatFields');
const entityRules = document.getElementById('entityRules');
const addRuleBtn = document.getElementById('addRuleBtn');
const duplicateEntityBtn = document.getElementById('duplicateEntityBtn');
const deleteEntityBtn = document.getElementById('deleteEntityBtn');
const resetEngineDataBtn = document.getElementById('resetEngineDataBtn');
const enemySpawnRows = document.getElementById('enemySpawnRows');
const addEnemySpawnRowBtn = document.getElementById('addEnemySpawnRow');
const entitySpawnRows = document.getElementById('entitySpawnRows');
const addEntitySpawnRowBtn = document.getElementById('addEntitySpawnRow');
const treasureSpawnRows = document.getElementById('treasureSpawnRows');
const addTreasureSpawnRowBtn = document.getElementById('addTreasureSpawnRow');
const playerMaxHealthInput = document.getElementById('playerMaxHealth');
const playerMoveSpeedInput = document.getElementById('playerMoveSpeed');
const playerSprintSpeedInput = document.getElementById('playerSprintSpeed');
const playerAttackDamageInput = document.getElementById('playerAttackDamage');
const playerAttackSpeedInput = document.getElementById('playerAttackSpeed');
const playerAttackRangeInput = document.getElementById('playerAttackRange');
const playerLightRadiusInput = document.getElementById('playerLightRadius');
const playerLightIntensityInput = document.getElementById('playerLightIntensity');
const playerLightFlickerInput = document.getElementById('playerLightFlicker');

let width = 0;
let height = 0;
let dpr = Math.max(1, window.devicePixelRatio || 1);
let cellSize = 64;
let currentPiece = 'straight';
let rotation = 0;
let hoverCell = null;
let mouseScreen = { x: 0, y: 0 };
let isPanning = false;
let isPainting = false;
let spaceDown = false;
let lastPointer = { x: 0, y: 0 };
let camera = { x: 0, y: 0 };
const placed = new Map();
let activeScatterSeed = 'manual';
let engineData = normalizeEngineData(loadEngineData());
let selectedEntityId = engineData.selectedEntityId;
const TOOL_PAGE_META = {
  creator: ['Dungeon Creator', 'Seed, build actions, validation'],
  settings: ['Dungeon Settings', 'Spawn composition'],
  player: ['Player Properties', 'Movement, combat, and torch tuning'],
  entities: ['Entity Catalog', 'Author enemies, mines, props, and treasure'],
  voxelizer: ['Voxel Tool', 'Procedural cave generator']
};

function placedToMaskMap() {
  return mapPlacedToMaskMap(placed);
}
function setCanvasTransform() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function resize() {
  const oldWidth = width;
  const oldHeight = height;
  const rect = viewportWrap.getBoundingClientRect();
  const nextWidth = Math.max(1, Math.floor(rect.width));
  const nextHeight = Math.max(1, Math.floor(rect.height));
  const nextDpr = Math.max(1, window.devicePixelRatio || 1);

  width = nextWidth;
  height = nextHeight;
  dpr = nextDpr;

  const nextCanvasWidth = Math.floor(width * dpr);
  const nextCanvasHeight = Math.floor(height * dpr);
  if (canvas.width !== nextCanvasWidth) canvas.width = nextCanvasWidth;
  if (canvas.height !== nextCanvasHeight) canvas.height = nextCanvasHeight;

  setCanvasTransform();
  if (!oldWidth || !oldHeight) {
    camera.x = Math.round(width / 2);
    camera.y = Math.round(height / 2);
  } else if (oldWidth !== width || oldHeight !== height) {
    camera.x += (width - oldWidth) / 2;
    camera.y += (height - oldHeight) / 2;
  }
  draw();
}

let resizeFrame = 0;
function scheduleResize() {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(resize);
}

function screenToCell(sx, sy) {
  return {
    x: Math.floor((sx - camera.x) / cellSize),
    y: Math.floor((sy - camera.y) / cellSize)
  };
}
function cellToScreen(x, y) {
  return {
    x: camera.x + x * cellSize,
    y: camera.y + y * cellSize
  };
}

function drawGrid() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#141518';
  ctx.fillRect(0, 0, width, height);

  const left = Math.floor((-camera.x) / cellSize) - 1;
  const right = Math.ceil((width - camera.x) / cellSize) + 1;
  const top = Math.floor((-camera.y) / cellSize) - 1;
  const bottom = Math.ceil((height - camera.y) / cellSize) + 1;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(84, 86, 92, .28)';
  ctx.beginPath();
  for (let gx = left; gx <= right; gx++) {
    const sx = Math.round(camera.x + gx * cellSize) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (let gy = top; gy <= bottom; gy++) {
    const sy = Math.round(camera.y + gy * cellSize) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(148, 201, 115, .22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const originX = Math.round(camera.x) + 0.5;
  const originY = Math.round(camera.y) + 0.5;
  ctx.moveTo(originX, 0);
  ctx.lineTo(originX, height);
  ctx.moveTo(0, originY);
  ctx.lineTo(width, originY);
  ctx.stroke();
  ctx.restore();
}

function drawPlacedPieces() {
  for (const [key, value] of placed.entries()) {
    const { x, y } = parseKey(key);
    const pos = cellToScreen(x, y);
    if (pos.x + cellSize < -cellSize || pos.x > width + cellSize || pos.y + cellSize < -cellSize || pos.y > height + cellSize) continue;
    drawPieceShape(ctx, pos.x, pos.y, cellSize, value.type, value.rot);
  }
}

function drawHover() {
  if (!hoverCell) return;
  const pos = cellToScreen(hoverCell.x, hoverCell.y);
  ctx.save();
  ctx.fillStyle = 'rgba(148, 201, 115, .055)';
  ctx.fillRect(pos.x, pos.y, cellSize, cellSize);
  drawPieceShape(ctx, pos.x, pos.y, cellSize, currentPiece, rotation, { alpha: 0.72, ghost: true });
  ctx.restore();
}

function draw() {
  if (!ctx) return;
  setCanvasTransform();
  drawGrid();
  drawPlacedPieces();
  drawHover();
}

function updateStatus() {
  const piece = pieceById[currentPiece];
  const degrees = piece.room ? 0 : mod(rotation, 4) * 90;
  currentStatus.textContent = `Current: ${piece.name} - ${degrees} deg`;
  cellStatus.textContent = hoverCell ? `Cell: ${hoverCell.x}, ${hoverCell.y}` : 'Cell: --';
  document.querySelectorAll('.piece-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.piece === currentPiece);
  });
}

function rotate(delta) {
  if (!pieceById[currentPiece].room) {
    rotation = mod(rotation + delta, 4);
  }
  updateStatus();
  draw();
}

function placeAt(cell) {
  if (!cell) return;
  const piece = pieceById[currentPiece];
  placed.set(keyFor(cell.x, cell.y), {
    type: currentPiece,
    rot: piece.room ? 0 : mod(rotation, 4)
  });
  activeScatterSeed = 'manual';
  saveMap();
  draw();
}

function eraseAt(cell) {
  if (!cell) return;
  placed.delete(keyFor(cell.x, cell.y));
  activeScatterSeed = 'manual';
  saveMap();
  draw();
}

function saveMap() {
  try {
    saveStoredMap(placed);
  } catch (_) {}
}

function loadMap() {
  try {
    const saved = loadStoredMap();
    placed.clear();
    for (const [key, value] of saved.entries()) placed.set(key, value);
  } catch (_) {}
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function readNumberInput(input, min, max, fallback) {
  const value = clampNumber(input.value, min, max, fallback);
  input.value = String(value);
  return value;
}

function syncChanceOutputs() {
  genLoopChanceValue.textContent = `${genLoopChanceInput.value}%`;
  genRoomChanceValue.textContent = `${genRoomChanceInput.value}%`;
}

function createRandomSeedValue() {
  return `dungeon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function assignRandomSeed() {
  genSeedInput.value = createRandomSeedValue();
}

function readGenerationSettings() {
  const seed = (genSeedInput.value || '').trim() || 'dungeon-001';
  genSeedInput.value = seed;
  const targetCells = readNumberInput(genTargetCellsInput, 8, 180, 48);
  return {
    seed,
    targetCells,
    mainLength: readNumberInput(genMainLengthInput, 3, 120, Math.min(20, targetCells - 1)),
    branchCount: readNumberInput(genBranchCountInput, 0, 40, 8),
    branchLength: readNumberInput(genBranchLengthInput, 1, 24, 5),
    loopChance: readNumberInput(genLoopChanceInput, 0, 70, 14),
    roomChance: readNumberInput(genRoomChanceInput, 0, 100, 35)
  };
}

function readOptionalNumberInput(input, min, max, fallback) {
  if (!input) return fallback;
  return readNumberInput(input, min, max, fallback);
}

function readFloatInput(input, min, max, fallback) {
  if (!input) return fallback;
  const parsed = Number(input.value);
  const value = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  input.value = String(Number(value.toFixed(2)));
  return value;
}

function readPlaySettings() {
  engineData = normalizeEngineData(engineData);
  return engineData;
}

function persistEngineData() {
  engineData.selectedEntityId = selectedEntityId;
  engineData = normalizeEngineData(engineData);
  selectedEntityId = engineData.selectedEntityId;
  saveEngineData(engineData);
}

function getSelectedEntity() {
  return engineData.entities.find(entity => entity.id === selectedEntityId) || engineData.entities[0] || null;
}

function entitiesForSpawnGroup(groupKey) {
  if (groupKey === 'enemySpawns') return engineData.entities.filter(entity => entity.combat);
  if (groupKey === 'treasureSpawns') return engineData.entities.filter(entity => entity.category === 'treasure');
  return engineData.entities.filter(entity => !entity.combat && entity.category !== 'treasure');
}

function setOptions(select, options, selectedValue) {
  if (!select) return;
  select.textContent = '';
  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  }
  select.value = selectedValue;
}

function renderSpawnRows(container, groupKey) {
  if (!container) return;
  const rows = engineData.dungeonSettings[groupKey] || [];
  const entities = entitiesForSpawnGroup(groupKey);
  container.textContent = '';

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No spawn rows configured.';
    container.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    const item = document.createElement('div');
    item.className = 'spawn-row';
    item.dataset.group = groupKey;
    item.dataset.index = String(index);

    const select = document.createElement('select');
    select.className = 'spawn-entity-select';
    setOptions(
      select,
      entities.map(entity => ({ value: entity.id, label: entity.name })),
      row.entityId
    );
    if (!select.value && entities[0]) select.value = entities[0].id;
    select.addEventListener('change', () => {
      row.entityId = select.value;
      persistEngineData();
      renderEngineEditor();
    });

    const count = document.createElement('input');
    count.type = 'number';
    count.min = '0';
    count.max = '99';
    count.step = '1';
    count.value = String(row.count);
    count.setAttribute('aria-label', 'Count');
    count.addEventListener('change', () => {
      row.count = clampNumber(count.value, 0, 99, 1);
      persistEngineData();
      renderEngineEditor();
    });

    const chance = document.createElement('input');
    chance.type = 'number';
    chance.min = '0';
    chance.max = '100';
    chance.step = '1';
    chance.value = String(row.chancePercent);
    chance.setAttribute('aria-label', 'Chance percent');
    chance.addEventListener('change', () => {
      row.chancePercent = clampNumber(chance.value, 0, 100, 100);
      persistEngineData();
      renderEngineEditor();
    });

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'row-toggle';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = row.enabled;
    enabled.addEventListener('change', () => {
      row.enabled = enabled.checked;
      persistEngineData();
    });
    enabledLabel.append(enabled, document.createTextNode('On'));

    const remove = document.createElement('button');
    remove.className = 'icon-action danger';
    remove.type = 'button';
    remove.title = 'Remove spawn row';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => {
      rows.splice(index, 1);
      persistEngineData();
      renderEngineEditor();
    });

    item.append(select, count, chance, enabledLabel, remove);
    container.appendChild(item);
  });
}

function renderEntityList() {
  if (!entityList) return;
  const query = (entitySearchInput?.value || '').trim().toLowerCase();
  const entities = engineData.entities.filter(entity => {
    if (!query) return true;
    return `${entity.name} ${entity.category} ${entity.model.kind}`.toLowerCase().includes(query);
  });
  entityList.textContent = '';

  for (const entity of entities) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entity-list-item';
    button.classList.toggle('active', entity.id === selectedEntityId);
    button.dataset.entityId = entity.id;

    const name = document.createElement('span');
    name.className = 'entity-list-name';
    name.textContent = entity.name;
    const meta = document.createElement('span');
    meta.className = 'entity-list-meta';
    meta.textContent = entity.combat ? `${entity.category} / ${entity.combat.behavior}` : `${entity.category} / ${entity.model.kind}`;
    button.append(name, meta);

    button.addEventListener('click', () => {
      selectedEntityId = entity.id;
      engineData.selectedEntityId = selectedEntityId;
      persistEngineData();
      renderEngineEditor();
    });
    entityList.appendChild(button);
  }
}

function setInputValue(input, value) {
  if (input && input.value !== String(value ?? '')) input.value = String(value ?? '');
}

function renderEntityInspector() {
  const entity = getSelectedEntity();
  const disabled = !entity;
  for (const input of [
    entityNameInput,
    entityCategoryInput,
    entityModelKindInput,
    entityColorInput,
    entityEmissiveInput,
    entityScaleInput,
    entityCombatEnabledInput,
    entityBehaviorInput,
    entityHealthInput,
    entitySpeedInput,
    entityAggroRangeEditorInput,
    entityVisionRangeEditorInput,
    entityAttackRateInput,
    entityDamageInput,
    entityRangeInput,
    entityProjectileSpeedInput
  ]) {
    if (input) input.disabled = disabled;
  }
  if (!entity) return;

  setOptions(entityCategoryInput, ENTITY_CATEGORIES.map(value => ({ value, label: value })), entity.category);
  setOptions(entityModelKindInput, MODEL_KINDS.map(value => ({ value, label: value })), entity.model.kind);
  setOptions(entityBehaviorInput, BEHAVIORS.map(value => ({ value, label: value })), entity.combat?.behavior || 'melee');
  setInputValue(entityNameInput, entity.name);
  setInputValue(entityColorInput, entity.model.color);
  setInputValue(entityEmissiveInput, entity.model.emissive);
  setInputValue(entityScaleInput, entity.model.scale);
  if (entityCombatEnabledInput) entityCombatEnabledInput.checked = !!entity.combat;
  if (entityCombatFields) entityCombatFields.hidden = !entity.combat;

  const combat = entity.combat || {};
  setInputValue(entityHealthInput, combat.health ?? 3);
  setInputValue(entitySpeedInput, combat.speed ?? 2);
  setInputValue(entityAggroRangeEditorInput, combat.aggroRange ?? 16);
  setInputValue(entityVisionRangeEditorInput, combat.visionRange ?? 24);
  setInputValue(entityAttackRateInput, combat.attackRate ?? 0.8);
  setInputValue(entityDamageInput, combat.damage ?? 10);
  setInputValue(entityRangeInput, combat.range ?? 1.1);
  setInputValue(entityProjectileSpeedInput, combat.projectileSpeed ?? 0);
  renderRuleRows(entity);
  drawEntityPreview(entity);
}

function renderRuleRows(entity) {
  if (!entityRules) return;
  entityRules.textContent = '';
  if (!entity.spawnRules.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No spawn rules. This entity can use any valid candidate for its spawn section.';
    entityRules.appendChild(empty);
    return;
  }

  entity.spawnRules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.className = 'rule-row';
    const field = document.createElement('select');
    setOptions(field, SPAWN_RULE_FIELDS.map(value => ({ value, label: value })), rule.field);
    const op = document.createElement('select');
    setOptions(op, SPAWN_RULE_OPERATORS.map(value => ({ value, label: value })), rule.op);
    const value = createRuleValueInput(rule);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-action danger';
    remove.textContent = 'Delete';

    field.addEventListener('change', () => {
      rule.field = field.value;
      rule.value = defaultRuleValue(rule.field);
      persistEngineData();
      renderEngineEditor();
    });
    op.addEventListener('change', () => {
      rule.op = op.value;
      persistEngineData();
    });
    value.addEventListener('change', () => {
      rule.value = parseRuleInputValue(rule.field, value.value);
      persistEngineData();
      renderEngineEditor();
    });
    remove.addEventListener('click', () => {
      entity.spawnRules.splice(index, 1);
      persistEngineData();
      renderEngineEditor();
    });

    row.append(field, op, value, remove);
    entityRules.appendChild(row);
  });
}

function renderPlayerProperties() {
  const player = engineData.player || {};
  setInputValue(playerMaxHealthInput, player.maxHealth ?? 100);
  setInputValue(playerMoveSpeedInput, player.moveSpeed ?? 4.4);
  setInputValue(playerSprintSpeedInput, player.sprintSpeed ?? 7.2);
  setInputValue(playerAttackDamageInput, player.attackDamage ?? 1);
  setInputValue(playerAttackSpeedInput, player.attackSpeed ?? 2.38);
  setInputValue(playerAttackRangeInput, player.attackRange ?? 2.05);
  setInputValue(playerLightRadiusInput, player.lightRadius ?? 16.5);
  setInputValue(playerLightIntensityInput, player.lightIntensity ?? 6.2);
  setInputValue(playerLightFlickerInput, player.lightFlicker ?? 0.34);
}

function mutatePlayerProperties(mutator) {
  engineData.player = engineData.player || {};
  mutator(engineData.player);
  persistEngineData();
  renderPlayerProperties();
}

function createRuleValueInput(rule) {
  const enumValues = ruleValuesForField(rule.field);
  if (enumValues) {
    const select = document.createElement('select');
    setOptions(select, enumValues.map(value => ({ value: String(value), label: String(value) })), String(rule.value));
    return select;
  }
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '1';
  input.value = String(rule.value ?? 0);
  return input;
}

function ruleValuesForField(field) {
  if (field === 'surface') return ['floor', 'wall'];
  if (field === 'nodeType') return ['corridor', 'room', 'junction', 'deadEnd'];
  if (field === 'nearWall' || field === 'lineOfSightFromStart' || field === 'onMainPath') return [true, false];
  return null;
}

function defaultRuleValue(field) {
  const values = ruleValuesForField(field);
  if (values) return values[0];
  return 0;
}

function parseRuleInputValue(field, value) {
  if (field === 'nearWall' || field === 'lineOfSightFromStart' || field === 'onMainPath') return value === 'true';
  if (field === 'distanceFromStart' || field === 'openNeighbors') return Number(value) || 0;
  return value;
}

function drawEntityPreview(entity = getSelectedEntity()) {
  if (!entityPreviewCanvas || !entity) return;
  const ctx2d = entityPreviewCanvas.getContext('2d');
  const width2d = entityPreviewCanvas.width;
  const height2d = entityPreviewCanvas.height;
  ctx2d.clearRect(0, 0, width2d, height2d);
  ctx2d.fillStyle = '#111214';
  ctx2d.fillRect(0, 0, width2d, height2d);
  ctx2d.strokeStyle = 'rgba(231,231,228,.08)';
  for (let x = 16; x < width2d; x += 16) {
    ctx2d.beginPath();
    ctx2d.moveTo(x, 0);
    ctx2d.lineTo(x, height2d);
    ctx2d.stroke();
  }
  for (let y = 16; y < height2d; y += 16) {
    ctx2d.beginPath();
    ctx2d.moveTo(0, y);
    ctx2d.lineTo(width2d, y);
    ctx2d.stroke();
  }

  const color = entity.model.color || '#8d9990';
  const emissive = entity.model.emissive || '#000000';
  const cx = width2d / 2;
  const cy = height2d / 2 + 10;
  ctx2d.fillStyle = color;
  ctx2d.strokeStyle = '#050607';
  ctx2d.lineWidth = 5;

  if (entity.model.kind === 'chest') {
    drawPreviewBox(ctx2d, cx - 44, cy - 16, 88, 42, color);
    drawPreviewBox(ctx2d, cx - 36, cy - 40, 72, 28, shadeHex(color, 1.22));
    drawPreviewBox(ctx2d, cx - 6, cy - 8, 12, 16, '#8b806d');
  } else if (entity.model.kind === 'stalagmite') {
    drawPreviewTriangle(ctx2d, cx, cy - 62, cx - 38, cy + 42, cx + 38, cy + 42, color);
  } else if (entity.model.kind === 'rock') {
    drawPreviewBox(ctx2d, cx - 42, cy - 20, 84, 50, color);
    drawPreviewBox(ctx2d, cx - 18, cy - 46, 50, 34, shadeHex(color, 1.12));
  } else if (entity.model.kind === 'debris') {
    drawPreviewBox(ctx2d, cx - 52, cy + 8, 38, 16, color);
    drawPreviewBox(ctx2d, cx - 4, cy - 2, 44, 14, shadeHex(color, 1.12));
    drawPreviewBox(ctx2d, cx + 30, cy + 20, 28, 12, shadeHex(color, 0.84));
  } else if (entity.model.kind === 'ore') {
    drawPreviewBox(ctx2d, cx - 54, cy - 52, 108, 104, '#24211b');
    ctx2d.fillStyle = color;
    for (const [dx, dy, size] of [[-28, -20, 20], [4, -8, 26], [28, 16, 18], [-12, 24, 16]]) {
      drawPreviewBox(ctx2d, cx + dx, cy + dy, size, size, color);
    }
    ctx2d.fillStyle = emissive;
    ctx2d.globalAlpha = 0.45;
    ctx2d.fillRect(cx - 30, cy - 22, 60, 42);
    ctx2d.globalAlpha = 1;
  } else {
    drawPreviewBox(ctx2d, cx - 32, cy - 16, 64, 70, color);
    drawPreviewBox(ctx2d, cx - 24, cy - 58, 48, 40, shadeHex(color, 0.82));
    drawPreviewBox(ctx2d, cx - 14, cy - 48, 8, 8, emissive === '#000000' ? '#21180e' : emissive);
    drawPreviewBox(ctx2d, cx + 8, cy - 48, 8, 8, emissive === '#000000' ? '#21180e' : emissive);
    if (entity.combat?.behavior === 'caster') drawPreviewBox(ctx2d, cx - 18, cy - 72, 36, 10, shadeHex(color, 1.2));
  }
}

function drawPreviewBox(context, x, y, w, h, color) {
  context.fillStyle = color;
  context.strokeRect(x, y, w, h);
  context.fillRect(x, y, w, h);
}

function drawPreviewTriangle(context, x1, y1, x2, y2, x3, y3, color) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.lineTo(x3, y3);
  context.closePath();
  context.stroke();
  context.fill();
}

function shadeHex(hex, factor) {
  const value = hex.replace('#', '');
  const r = Math.max(0, Math.min(255, Math.round(parseInt(value.slice(0, 2), 16) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(value.slice(2, 4), 16) * factor)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(value.slice(4, 6), 16) * factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function renderEngineEditor() {
  engineData = normalizeEngineData(engineData);
  selectedEntityId = engineData.selectedEntityId;
  renderSpawnRows(enemySpawnRows, 'enemySpawns');
  renderSpawnRows(entitySpawnRows, 'entitySpawns');
  renderSpawnRows(treasureSpawnRows, 'treasureSpawns');
  renderPlayerProperties();
  renderEntityList();
  renderEntityInspector();
}

function defaultCombat(behavior = 'melee') {
  return {
    behavior,
    health: behavior === 'caster' ? 2 : 3,
    speed: behavior === 'caster' ? 1.65 : 2.25,
    aggroRange: 16,
    visionRange: 24,
    attackRate: behavior === 'caster' ? 0.45 : 0.85,
    damage: behavior === 'caster' ? 12 : 10,
    range: behavior === 'caster' ? 10.5 : 1.12,
    projectileSpeed: behavior === 'caster' ? 5.4 : 0
  };
}

function mutateSelectedEntity(mutator, rerender = true) {
  const entity = getSelectedEntity();
  if (!entity) return;
  mutator(entity);
  persistEngineData();
  if (rerender) renderEngineEditor();
  else {
    renderEntityList();
    drawEntityPreview(entity);
  }
}

function addSpawnRow(groupKey) {
  const candidates = entitiesForSpawnGroup(groupKey);
  const entityId = candidates[0]?.id || engineData.entities[0]?.id || '';
  engineData.dungeonSettings[groupKey].push(createSpawnRow(entityId));
  persistEngineData();
  renderEngineEditor();
}

function removeEntityReferences(entityId) {
  for (const groupKey of ['enemySpawns', 'entitySpawns', 'treasureSpawns']) {
    engineData.dungeonSettings[groupKey] = engineData.dungeonSettings[groupKey].filter(row => row.entityId !== entityId);
  }
}

function bindEngineEditorEvents() {
  entitySearchInput?.addEventListener('input', renderEntityList);
  addEntityBtn?.addEventListener('click', () => {
    const entity = createEntity({
      name: 'New Enemy',
      category: 'enemy',
      model: { kind: 'melee', color: '#223027', emissive: '#000000', scale: 1 },
      combat: defaultCombat('melee')
    });
    engineData.entities.push(entity);
    selectedEntityId = entity.id;
    persistEngineData();
    renderEngineEditor();
  });
  duplicateEntityBtn?.addEventListener('click', () => {
    const entity = getSelectedEntity();
    if (!entity) return;
    const clone = duplicateEntity(entity, new Set(engineData.entities.map(item => item.id)));
    engineData.entities.push(clone);
    selectedEntityId = clone.id;
    persistEngineData();
    renderEngineEditor();
  });
  deleteEntityBtn?.addEventListener('click', () => {
    const entity = getSelectedEntity();
    if (!entity || engineData.entities.length <= 1) {
      showToast('Keep at least one entity');
      return;
    }
    engineData.entities = engineData.entities.filter(item => item.id !== entity.id);
    removeEntityReferences(entity.id);
    selectedEntityId = engineData.entities[0]?.id || '';
    persistEngineData();
    renderEngineEditor();
  });
  resetEngineDataBtn?.addEventListener('click', () => {
    if (!window.confirm('Reset entity catalog, dungeon spawn settings, and player properties?')) return;
    engineData = resetEngineData();
    selectedEntityId = engineData.selectedEntityId;
    renderEngineEditor();
    showToast('Engine data reset');
  });
  addEnemySpawnRowBtn?.addEventListener('click', () => addSpawnRow('enemySpawns'));
  addEntitySpawnRowBtn?.addEventListener('click', () => addSpawnRow('entitySpawns'));
  addTreasureSpawnRowBtn?.addEventListener('click', () => addSpawnRow('treasureSpawns'));

  playerMaxHealthInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.maxHealth = readOptionalNumberInput(playerMaxHealthInput, 1, 500, 100);
  }));
  playerMoveSpeedInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.moveSpeed = readFloatInput(playerMoveSpeedInput, 0.5, 20, 4.4);
  }));
  playerSprintSpeedInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.sprintSpeed = readFloatInput(playerSprintSpeedInput, 0.5, 30, 7.2);
  }));
  playerAttackDamageInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.attackDamage = readOptionalNumberInput(playerAttackDamageInput, 1, 200, 1);
  }));
  playerAttackSpeedInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.attackSpeed = readFloatInput(playerAttackSpeedInput, 0.1, 12, 2.38);
  }));
  playerAttackRangeInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.attackRange = readFloatInput(playerAttackRangeInput, 0.4, 10, 2.05);
  }));
  playerLightRadiusInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.lightRadius = readFloatInput(playerLightRadiusInput, 1, 80, 16.5);
  }));
  playerLightIntensityInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.lightIntensity = readFloatInput(playerLightIntensityInput, 0, 30, 6.2);
  }));
  playerLightFlickerInput?.addEventListener('change', () => mutatePlayerProperties(player => {
    player.lightFlicker = readFloatInput(playerLightFlickerInput, 0, 5, 0.34);
  }));

  entityNameInput?.addEventListener('input', () => {
    mutateSelectedEntity(entity => {
      entity.name = entityNameInput.value.trim() || 'Entity';
    }, false);
  });
  entityCategoryInput?.addEventListener('change', () => {
    mutateSelectedEntity(entity => {
      entity.category = entityCategoryInput.value;
      if (entity.category === 'enemy' && !entity.combat) entity.combat = defaultCombat('melee');
    });
  });
  entityModelKindInput?.addEventListener('change', () => {
    mutateSelectedEntity(entity => {
      entity.model.kind = entityModelKindInput.value;
    });
  });
  entityColorInput?.addEventListener('input', () => {
    mutateSelectedEntity(entity => {
      entity.model.color = entityColorInput.value;
    }, false);
  });
  entityEmissiveInput?.addEventListener('input', () => {
    mutateSelectedEntity(entity => {
      entity.model.emissive = entityEmissiveInput.value;
    }, false);
  });
  entityScaleInput?.addEventListener('change', () => {
    mutateSelectedEntity(entity => {
      entity.model.scale = readFloatInput(entityScaleInput, 0.35, 3, 1);
    });
  });
  entityCombatEnabledInput?.addEventListener('change', () => {
    mutateSelectedEntity(entity => {
      if (entityCombatEnabledInput.checked) {
        entity.category = 'enemy';
        entity.combat = entity.combat || defaultCombat('melee');
      } else {
        entity.combat = null;
        if (entity.category === 'enemy') entity.category = 'prop';
      }
    });
  });
  entityBehaviorInput?.addEventListener('change', () => {
    mutateSelectedEntity(entity => {
      entity.combat = entity.combat || defaultCombat(entityBehaviorInput.value);
      entity.combat.behavior = entityBehaviorInput.value;
      if (entity.combat.behavior === 'melee') entity.combat.projectileSpeed = 0;
    });
  });
  entityHealthInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat();
    entity.combat.health = readOptionalNumberInput(entityHealthInput, 1, 100, 3);
  }));
  entitySpeedInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat();
    entity.combat.speed = readFloatInput(entitySpeedInput, 0.1, 10, 2);
  }));
  entityAggroRangeEditorInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat();
    entity.combat.aggroRange = readFloatInput(entityAggroRangeEditorInput, 1, 80, 16);
  }));
  entityVisionRangeEditorInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat();
    entity.combat.visionRange = readFloatInput(entityVisionRangeEditorInput, 1, 100, 24);
  }));
  entityAttackRateInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat();
    entity.combat.attackRate = readFloatInput(entityAttackRateInput, 0.1, 5, 0.8);
  }));
  entityDamageInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat();
    entity.combat.damage = readOptionalNumberInput(entityDamageInput, 1, 100, 10);
  }));
  entityRangeInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat();
    entity.combat.range = readFloatInput(entityRangeInput, 0.2, 40, 1.1);
  }));
  entityProjectileSpeedInput?.addEventListener('change', () => mutateSelectedEntity(entity => {
    entity.combat = entity.combat || defaultCombat('caster');
    entity.combat.projectileSpeed = readFloatInput(entityProjectileSpeedInput, 0, 30, 0);
  }));
  addRuleBtn?.addEventListener('click', () => {
    mutateSelectedEntity(entity => {
      entity.spawnRules.push({ field: 'surface', op: 'equals', value: 'floor' });
    });
  });
}

function setValidationResult(result) {
  validationSummary.textContent = formatValidationResult(result);
  validationSummary.classList.toggle('valid', !!result && result.valid);
  validationSummary.classList.toggle('invalid', !result || !result.valid);
}

function validateCurrentMap() {
  const result = validateMaskMap(placedToMaskMap());
  setValidationResult(result);
  return result;
}

function generateDungeonFromSettings() {
  if (genAutoSeedInput.checked) assignRandomSeed();
  const settings = readGenerationSettings();
  let lastResult = null;

  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = createRng(`${settings.seed}:${attempt}`);
    const maskMap = generateMaskDungeon(settings, rng);
    const result = validateMaskMap(maskMap);
    lastResult = result;

    if (!result.valid || maskMap.size !== settings.targetCells) continue;

    const nextPlaced = maskMapToPlaced(maskMap);
    if (!nextPlaced) continue;

    placed.clear();
    for (const [key, value] of nextPlaced.entries()) {
      placed.set(key, value);
    }

    activeScatterSeed = `${settings.seed}:${attempt}`;
    saveMap();
    camera.x = Math.round(width / 2);
    camera.y = Math.round(height / 2);
    draw();
    setValidationResult(validateMaskMap(placedToMaskMap()));
    showToast(`Generated ${placed.size} cells`);
    return;
  }

  setValidationResult(lastResult);
  showToast('Generation failed validation');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 1300);
}

function setActiveToolPage(button) {
  const page = button?.dataset.toolPage;
  if (!page) return;

  toolRailButtons.forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (workspacePages.length) {
    workspacePages.forEach(section => {
      const active = section.dataset.enginePage === page;
      section.classList.toggle('active', active);
      section.hidden = !active;
    });
  } else {
    toolPages.forEach(section => {
      const active = section.dataset.toolPage === page;
      section.classList.toggle('active', active);
      section.hidden = !active;
    });
  }

  const meta = TOOL_PAGE_META[page];
  if (meta) {
    if (generationPanelTitle) generationPanelTitle.textContent = meta[0];
    if (generationPanelSubtitle) generationPanelSubtitle.textContent = meta[1];
  }
  document.body.dataset.activePage = page;
  if (generationPanel) generationPanel.scrollTop = 0;
  if (page === 'creator') scheduleResize();
  if (page === 'entities') drawEntityPreview();
  if (page === 'voxelizer') voxelizerTool.activate();
}

let voxelizerTool = null;

const play3d = createPlay3d(
  {
    playOverlay,
    playCanvas,
    minimapCanvas,
    lockPlayBtn,
    playerHealthFill,
    playerHealthText,
    playStatus
  },
  {
    getMaskMap: placedToMaskMap,
    getPlacedSize: () => placed.size,
    getScatterSeed: () => activeScatterSeed,
    getPlaySettings: readPlaySettings,
    getVoxelDungeonState: () => voxelizerTool?.getPlayState?.(),
    setValidationResult,
    showToast
  }
);

voxelizerTool = createVoxelizerTool(
  document.getElementById('pageVoxelizer'),
  { showToast }
);

function pointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function updateHoverFromEvent(event) {
  mouseScreen = pointerFromEvent(event);
  hoverCell = screenToCell(mouseScreen.x, mouseScreen.y);
  updateStatus();
  draw();
}

function createToolbar() {
  for (const piece of PIECES) {
    const button = document.createElement('button');
    button.className = 'piece-btn';
    button.dataset.piece = piece.id;
    button.title = piece.name;
    button.setAttribute('aria-label', piece.name);

    const icon = document.createElement('canvas');
    icon.width = 44;
    icon.height = 36;
    icon.style.width = '44px';
    icon.style.height = '36px';
    const label = document.createElement('span');
    label.textContent = piece.short;
    button.append(icon, label);
    pieceStrip.appendChild(button);

    button.addEventListener('click', () => {
      currentPiece = piece.id;
      if (piece.room) rotation = 0;
      updateStatus();
      draw();
    });

    const iconCtx = icon.getContext('2d');
    iconCtx.setTransform(1, 0, 0, 1, 0, 0);
    iconCtx.clearRect(0, 0, icon.width, icon.height);
    drawPieceShape(iconCtx, 4, 0, 36, piece.id, 0, { icon: true, selected: piece.id === currentPiece });
  }
  updateStatus();
}

canvas.addEventListener('pointermove', event => {
  const pt = pointerFromEvent(event);
  if (isPanning) {
    camera.x += pt.x - lastPointer.x;
    camera.y += pt.y - lastPointer.y;
    lastPointer = pt;
    hoverCell = screenToCell(pt.x, pt.y);
    updateStatus();
    draw();
    return;
  }
  updateHoverFromEvent(event);
  if (isPainting && event.buttons === 1 && !spaceDown) {
    placeAt(hoverCell);
  }
});

canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  const pt = pointerFromEvent(event);
  lastPointer = pt;
  hoverCell = screenToCell(pt.x, pt.y);
  if (event.button === 1 || spaceDown) {
    isPanning = true;
    canvas.style.cursor = 'grabbing';
    event.preventDefault();
    return;
  }
  if (event.button === 2) {
    eraseAt(hoverCell);
    event.preventDefault();
    return;
  }
  if (event.button === 0) {
    isPainting = true;
    placeAt(hoverCell);
    event.preventDefault();
  }
});

canvas.addEventListener('pointerup', event => {
  isPanning = false;
  isPainting = false;
  try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
});

canvas.addEventListener('pointerleave', () => {
  hoverCell = null;
  isPainting = false;
  updateStatus();
  draw();
});

canvas.addEventListener('contextmenu', event => event.preventDefault());

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const pt = pointerFromEvent(event);
  const oldSize = cellSize;
  const factor = event.deltaY < 0 ? 1.08 : 0.925;
  cellSize = Math.max(34, Math.min(112, cellSize * factor));
  const scale = cellSize / oldSize;
  camera.x = pt.x - (pt.x - camera.x) * scale;
  camera.y = pt.y - (pt.y - camera.y) * scale;
  hoverCell = screenToCell(pt.x, pt.y);
  updateStatus();
  draw();
}, { passive: false });

window.addEventListener('keydown', event => {
  if (play3d.handleKeyDown(event)) return;

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    rotate(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    rotate(1);
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (hoverCell) {
      event.preventDefault();
      eraseAt(hoverCell);
    }
  } else if (event.key === ' ') {
    if (!spaceDown) {
      spaceDown = true;
      canvas.style.cursor = 'grab';
    }
    event.preventDefault();
  } else if (event.key.toLowerCase() === 'c' && (event.ctrlKey || event.metaKey)) {
    // Let browser copy operate normally.
  }
});

window.addEventListener('keyup', event => {
  if (play3d.handleKeyUp(event)) return;

  if (event.key === ' ') {
    spaceDown = false;
    isPanning = false;
    canvas.style.cursor = 'crosshair';
    event.preventDefault();
  }
});

rotateLeftBtn.addEventListener('click', () => rotate(-1));
rotateRightBtn.addEventListener('click', () => rotate(1));
centerViewBtn.addEventListener('click', () => {
  camera.x = Math.round(width / 2);
  camera.y = Math.round(height / 2);
  cellSize = 64;
  showToast('View centered');
  draw();
});
clearMapBtn.addEventListener('click', () => {
  if (!placed.size) {
    showToast('Map is already empty');
    return;
  }
  placed.clear();
  activeScatterSeed = 'manual';
  saveMap();
  showToast('Map cleared');
  draw();
});

toolRailButtons.forEach(button => {
  button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
  button.addEventListener('click', () => setActiveToolPage(button));
  button.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setActiveToolPage(button);
  });
});
setActiveToolPage(document.querySelector('.tool-rail-btn.active[data-tool-page]') || toolRailButtons[0]);

play3dBtn.addEventListener('click', play3d.start);
voxelPlay3dBtn?.addEventListener('click', play3d.start);
lockPlayBtn.addEventListener('click', play3d.requestPointerLock);
exitPlayBtn.addEventListener('click', play3d.stop);
playCanvas.addEventListener('click', play3d.requestPointerLock);
document.addEventListener('pointerlockchange', play3d.updateLockState);
document.addEventListener('mousemove', play3d.handlePointerMove);
document.addEventListener('mousedown', event => {
  play3d.handlePointerDown(event);
});

genLoopChanceInput.addEventListener('input', syncChanceOutputs);
genRoomChanceInput.addEventListener('input', syncChanceOutputs);
generateDungeonBtn.addEventListener('click', generateDungeonFromSettings);
randomSeedBtn.addEventListener('click', () => {
  assignRandomSeed();
  showToast('Seed randomized');
});
validateMapBtn.addEventListener('click', validateCurrentMap);

window.addEventListener('resize', scheduleResize);
window.addEventListener('resize', play3d.resize);
window.addEventListener('resize', voxelizerTool.resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleResize);
  window.visualViewport.addEventListener('resize', play3d.resize);
  window.visualViewport.addEventListener('resize', voxelizerTool.resize);
}
if ('ResizeObserver' in window) {
  const observer = new ResizeObserver(scheduleResize);
  observer.observe(viewportWrap);
}

rotateLeftBtn.textContent = 'Rotate L';
rotateRightBtn.textContent = 'Rotate R';
if (hint) {
  hint.innerHTML = 'Select a piece, then click the grid to place it. Hover shows a preview. Use <span class="kbd">Left</span>/<span class="kbd">Right</span> to rotate 90 deg. Right-click or <span class="kbd">Delete</span> erases. Hold <span class="kbd">Space</span> and drag to pan; mouse wheel zooms.';
}
syncChanceOutputs();
createToolbar();
loadMap();
bindEngineEditorEvents();
renderEngineEditor();
resize();
window.setTimeout(scheduleResize, 0);
