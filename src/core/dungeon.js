export const DIR = { N: 0, E: 1, S: 2, W: 3 };

export const PIECES = [
  { id: 'straight', name: 'Straight', short: 'Straight', dirs: [DIR.N, DIR.S] },
  { id: 'corner', name: 'Corner', short: 'Corner', dirs: [DIR.N, DIR.E] },
  { id: 'tjunction', name: 'T Junction', short: 'T', dirs: [DIR.W, DIR.N, DIR.E] },
  { id: 'cross', name: 'Cross Junction', short: 'Cross', dirs: [DIR.N, DIR.E, DIR.S, DIR.W] },
  { id: 'deadend', name: 'Dead End', short: 'Dead End', dirs: [DIR.N] },
  { id: 'room', name: 'Room Node', short: 'Room', dirs: [DIR.N, DIR.E, DIR.S, DIR.W], room: true }
];

export const pieceById = Object.fromEntries(PIECES.map(piece => [piece.id, piece]));

export const DIR_DATA = [
  { dir: DIR.N, name: 'N', dx: 0, dy: -1 },
  { dir: DIR.E, name: 'E', dx: 1, dy: 0 },
  { dir: DIR.S, name: 'S', dx: 0, dy: 1 },
  { dir: DIR.W, name: 'W', dx: -1, dy: 0 }
];

export const OPPOSITE = [DIR.S, DIR.W, DIR.N, DIR.E];

export function keyFor(x, y) {
  return `${x},${y}`;
}

export function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}

export function rotatedDirs(piece, rot) {
  return piece.dirs.map(dir => mod(dir + rot, 4));
}

function bitFor(dir) {
  return 1 << dir;
}

export function hasDir(mask, dir) {
  return (mask & bitFor(dir)) !== 0;
}

function addDir(mask, dir) {
  return mask | bitFor(dir);
}

function maskFromDirs(dirs) {
  return dirs.reduce((mask, dir) => addDir(mask, dir), 0);
}

export function countBits(mask) {
  let count = 0;
  for (const info of DIR_DATA) {
    if (hasDir(mask, info.dir)) count++;
  }
  return count;
}

export function neighborFor(x, y, dir) {
  const info = DIR_DATA[dir];
  return { x: x + info.dx, y: y + info.dy };
}

export function pieceMask(type, rot = 0) {
  const piece = pieceById[type];
  if (!piece) return 0;
  return maskFromDirs(rotatedDirs(piece, piece.room ? 0 : rot));
}

export function pieceFromMask(mask, preferRoom = false) {
  const cleanMask = mask & 15;
  if (!cleanMask) return null;
  if (cleanMask === 15) return { type: preferRoom ? 'room' : 'cross', rot: 0 };

  for (const type of ['deadend', 'straight', 'corner', 'tjunction']) {
    for (let rot = 0; rot < 4; rot++) {
      if (pieceMask(type, rot) === cleanMask) return { type, rot };
    }
  }
  return null;
}

export function placedToMaskMap(placed) {
  const maskMap = new Map();
  for (const [key, value] of placed.entries()) {
    const { x, y } = parseKey(key);
    maskMap.set(key, {
      x,
      y,
      mask: pieceMask(value.type, value.rot),
      room: value.type === 'room'
    });
  }
  return maskMap;
}

export function dirEnd(cx, cy, half, dir) {
  switch (dir) {
    case DIR.N: return { x: cx, y: cy - half };
    case DIR.E: return { x: cx + half, y: cy };
    case DIR.S: return { x: cx, y: cy + half };
    case DIR.W: return { x: cx - half, y: cy };
    default: return { x: cx, y: cy };
  }
}

function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let t = hashSeed(seed) || 0x9e3779b9;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffleCopy(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createMaskNode(maskMap, x, y) {
  const key = keyFor(x, y);
  let node = maskMap.get(key);
  if (!node) {
    node = { x, y, mask: 0, room: false };
    maskMap.set(key, node);
  }
  return node;
}

function connectMaskCells(maskMap, x, y, dir) {
  const node = createMaskNode(maskMap, x, y);
  const next = neighborFor(x, y, dir);
  const neighbor = createMaskNode(maskMap, next.x, next.y);
  node.mask = addDir(node.mask, dir);
  neighbor.mask = addDir(neighbor.mask, OPPOSITE[dir]);
  return neighbor;
}

function isInsideRadius(x, y, radius) {
  return Math.abs(x) <= radius && Math.abs(y) <= radius;
}

function availableEmptyDirs(maskMap, node, radius) {
  const dirs = [];
  for (const info of DIR_DATA) {
    const next = neighborFor(node.x, node.y, info.dir);
    if (!isInsideRadius(next.x, next.y, radius)) continue;
    if (!maskMap.has(keyFor(next.x, next.y))) dirs.push(info.dir);
  }
  return dirs;
}

function randomGrowableNode(maskMap, rng, radius) {
  const candidates = [...maskMap.values()].filter(node => availableEmptyDirs(maskMap, node, radius).length);
  if (!candidates.length) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function growOneStep(maskMap, node, rng, radius) {
  if (!node) return null;
  const dirs = shuffleCopy(availableEmptyDirs(maskMap, node, radius), rng);
  if (!dirs.length) return null;
  return connectMaskCells(maskMap, node.x, node.y, dirs[0]);
}

function addLoops(maskMap, loopChance, rng) {
  if (loopChance <= 0) return;
  const pairs = [];
  for (const node of maskMap.values()) {
    for (const dir of [DIR.E, DIR.S]) {
      const next = neighborFor(node.x, node.y, dir);
      const neighbor = maskMap.get(keyFor(next.x, next.y));
      if (!neighbor) continue;
      if (hasDir(node.mask, dir) || hasDir(neighbor.mask, OPPOSITE[dir])) continue;
      pairs.push({ node, neighbor, dir });
    }
  }

  for (const pair of shuffleCopy(pairs, rng)) {
    if (rng() * 100 > loopChance) continue;
    pair.node.mask = addDir(pair.node.mask, pair.dir);
    pair.neighbor.mask = addDir(pair.neighbor.mask, OPPOSITE[pair.dir]);
  }
}

export function generateMaskDungeon(settings, rng) {
  const maskMap = new Map();
  const radius = Math.max(4, Math.ceil(Math.sqrt(settings.targetCells)) + Math.ceil(settings.branchLength / 2) + 3);
  const origin = createMaskNode(maskMap, 0, 0);
  origin.room = true;

  for (const dir of shuffleCopy(DIR_DATA.map(info => info.dir), rng)) {
    connectMaskCells(maskMap, 0, 0, dir);
  }

  const originNeighbors = DIR_DATA
    .map(info => maskMap.get(keyFor(info.dx, info.dy)))
    .filter(Boolean);
  let current = originNeighbors[Math.floor(rng() * originNeighbors.length)] || origin;

  for (let i = 0; i < settings.mainLength && maskMap.size < settings.targetCells; i++) {
    const next = growOneStep(maskMap, current, rng, radius);
    current = next || randomGrowableNode(maskMap, rng, radius) || current;
  }

  for (let branch = 0; branch < settings.branchCount && maskMap.size < settings.targetCells; branch++) {
    current = randomGrowableNode(maskMap, rng, radius);
    if (!current) break;
    const length = randomInt(rng, 1, settings.branchLength);
    for (let step = 0; step < length && maskMap.size < settings.targetCells; step++) {
      const next = growOneStep(maskMap, current, rng, radius);
      if (!next) {
        current = randomGrowableNode(maskMap, rng, radius);
        if (!current) break;
      } else {
        current = next;
      }
    }
  }

  let safety = settings.targetCells * 16;
  while (maskMap.size < settings.targetCells && safety-- > 0) {
    current = randomGrowableNode(maskMap, rng, radius);
    if (!current) break;
    growOneStep(maskMap, current, rng, radius);
  }

  addLoops(maskMap, settings.loopChance, rng);

  for (const node of maskMap.values()) {
    if (node.x === 0 && node.y === 0) {
      node.room = node.mask === 15;
    } else {
      node.room = node.mask === 15 && rng() * 100 <= settings.roomChance;
    }
  }

  return maskMap;
}

export function validateMaskMap(maskMap) {
  const result = {
    valid: false,
    cells: maskMap.size,
    rooms: 0,
    deadEnds: 0,
    unmatched: [],
    disconnected: [],
    startKey: null
  };

  if (!maskMap.size) return result;

  for (const [key, node] of maskMap.entries()) {
    const mask = node.mask & 15;
    if (node.room) result.rooms++;
    if (countBits(mask) === 1) result.deadEnds++;
    if (!mask) result.unmatched.push(`${key} has no openings`);

    for (const info of DIR_DATA) {
      if (!hasDir(mask, info.dir)) continue;
      const next = neighborFor(node.x, node.y, info.dir);
      const neighborKey = keyFor(next.x, next.y);
      const neighbor = maskMap.get(neighborKey);
      if (!neighbor) {
        result.unmatched.push(`${key} opens ${info.name} into empty cell`);
      } else if (!hasDir(neighbor.mask, OPPOSITE[info.dir])) {
        result.unmatched.push(`${key} opens ${info.name}, but ${neighborKey} does not match`);
      }
    }
  }

  result.startKey = maskMap.has(keyFor(0, 0)) ? keyFor(0, 0) : maskMap.keys().next().value;
  const seen = new Set([result.startKey]);
  const queue = [result.startKey];
  while (queue.length) {
    const key = queue.shift();
    const node = maskMap.get(key);
    for (const info of DIR_DATA) {
      if (!hasDir(node.mask, info.dir)) continue;
      const next = neighborFor(node.x, node.y, info.dir);
      const neighborKey = keyFor(next.x, next.y);
      const neighbor = maskMap.get(neighborKey);
      if (!neighbor || !hasDir(neighbor.mask, OPPOSITE[info.dir]) || seen.has(neighborKey)) continue;
      seen.add(neighborKey);
      queue.push(neighborKey);
    }
  }

  result.disconnected = [...maskMap.keys()].filter(key => !seen.has(key));
  result.valid = !result.unmatched.length && !result.disconnected.length;
  return result;
}

export function maskMapToPlaced(maskMap) {
  const nextPlaced = new Map();
  for (const [key, node] of maskMap.entries()) {
    const piece = pieceFromMask(node.mask, node.room);
    if (!piece) return null;
    nextPlaced.set(key, piece);
  }
  return nextPlaced;
}

export function formatValidationResult(result) {
  if (!result || !result.cells) return 'Invalid: map is empty.';
  const lines = [
    `${result.valid ? 'Valid' : 'Invalid'}: ${result.cells} cells, ${result.rooms} rooms, ${result.deadEnds} dead ends.`
  ];

  if (result.valid) {
    lines.push('All openings match.');
    lines.push(`Reachable from ${result.startKey}.`);
  } else {
    if (result.unmatched.length) {
      lines.push(`${result.unmatched.length} unmatched opening(s).`);
      lines.push(...result.unmatched.slice(0, 3));
    }
    if (result.disconnected.length) {
      lines.push(`${result.disconnected.length} disconnected cell(s).`);
      lines.push(...result.disconnected.slice(0, 3).map(key => `${key} is unreachable`));
    }
  }

  return lines.join('\n');
}
