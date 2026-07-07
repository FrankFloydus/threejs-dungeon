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
} from './render/canvas-shapes.js';
import {
  loadMap as loadStoredMap,
  saveMap as saveStoredMap
} from './core/storage.js';
import { createPlay3d } from './play/play3d.js';

const canvas = document.getElementById('mapCanvas');
const viewportWrap = document.querySelector('.viewport-wrap');
const ctx = canvas.getContext('2d');
const pieceStrip = document.getElementById('pieceStrip');
const currentStatus = document.getElementById('currentStatus');
const cellStatus = document.getElementById('cellStatus');
const rotateLeftBtn = document.getElementById('rotateLeft');
const rotateRightBtn = document.getElementById('rotateRight');
const clearMapBtn = document.getElementById('clearMap');
const centerViewBtn = document.getElementById('centerView');
const play3dBtn = document.getElementById('play3d');
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

function readPlaySettings() {
  return {
    enemyCount: readOptionalNumberInput(enemyCountInput, 0, 24, 5),
    chestCount: readOptionalNumberInput(chestCountInput, 0, 12, 2),
    oreDensity: readOptionalNumberInput(oreDensityInput, 0, 100, 18) / 18,
    clutterDensity: readOptionalNumberInput(clutterDensityInput, 0, 100, 28) / 28,
    enemyMeleeChance: readOptionalNumberInput(enemyMeleeChanceInput, 0, 100, 65),
    enemyCasterChance: readOptionalNumberInput(enemyCasterChanceInput, 0, 100, 20),
    enemyAggroRange: readOptionalNumberInput(enemyAggroRangeInput, 1, 60, 16),
    enemyVisionRange: readOptionalNumberInput(enemyVisionRangeInput, 1, 80, 24)
  };
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
    setValidationResult,
    showToast
  }
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

play3dBtn.addEventListener('click', play3d.start);
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
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleResize);
  window.visualViewport.addEventListener('resize', play3d.resize);
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
resize();
window.setTimeout(scheduleResize, 0);
