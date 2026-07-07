const MAX_FLOOR_CELLS = 90000;
const MAX_HEIGHT_VOXELS = 64;
const MAX_VOLUME_VOXELS = 2500000;
const FLOOR_THICKNESS_RATIO = 0.08;
const GRAPH_STEP = 10;
const DIRS = [
  { dir: 0, dx: 0, dz: -1 },
  { dir: 1, dx: 1, dz: 0 },
  { dir: 2, dx: 0, dz: 1 },
  { dir: 3, dx: -1, dz: 0 }
];
const OPPOSITE = [2, 3, 0, 1];
const ASSET_DB_NAME = 'dungeon-tunnels-assets-v1';
const ASSET_STORE_NAME = 'textures';

export const DEFAULT_VOXEL_DUNGEON_SETTINGS = {
  levelSize: 'medium',
  mainPathLength: 34,
  branchCount: 9,
  branchDepth: 8,
  deadEndChance: 65,
  loopChance: 12,
  chamberChance: 26,
  chamberSize: 5,
  voxelSize: 1,
  height: 9,
  seed: 1337,
  erosion: 35,
  floorWidth: 42,
  sideRoughness: 55,
  ceilingVariation: 45,
  noiseScale: 1.2,
  smoothing: 1,
  asymmetry: 25,
  wallBulge: 45,
  pocketStrength: 38,
  floorClearance: 2,
  capBottom: true,
  showBox: false,
  wireOverlay: true,
  backfaceCulling: false,
  useTexture: false,
  textureId: '',
  textureName: '',
  uvScaleX: 1,
  uvScaleY: 1,
  uvRotation: 0,
  pixelated: true,
  floorColor: '#6f6652',
  wallColor: '#4b4539',
  ceilingColor: '#2f2c25',
  wireColor: '#d7e7c2'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function integerOr(value, fallback, min, max) {
  return Math.round(numberOr(value, fallback, min, max));
}

function normalizeHex(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

export function normalizeVoxelDungeonSettings(settings = {}) {
  const defaults = DEFAULT_VOXEL_DUNGEON_SETTINGS;
  const levelSize = ['small', 'medium', 'large'].includes(settings.levelSize) ? settings.levelSize : defaults.levelSize;
  return {
    levelSize,
    mainPathLength: integerOr(settings.mainPathLength, defaults.mainPathLength, 8, 120),
    branchCount: integerOr(settings.branchCount, defaults.branchCount, 0, 40),
    branchDepth: integerOr(settings.branchDepth, defaults.branchDepth, 1, 30),
    deadEndChance: integerOr(settings.deadEndChance, defaults.deadEndChance, 0, 100),
    loopChance: integerOr(settings.loopChance, defaults.loopChance, 0, 80),
    chamberChance: integerOr(settings.chamberChance, defaults.chamberChance, 0, 100),
    chamberSize: numberOr(settings.chamberSize, defaults.chamberSize, 2, 14),
    voxelSize: numberOr(settings.voxelSize, defaults.voxelSize, 0.25, 4),
    height: numberOr(settings.height, defaults.height, 2, 80),
    seed: integerOr(settings.seed, defaults.seed, 1, 2147483647),
    erosion: integerOr(settings.erosion, defaults.erosion, 0, 100),
    floorWidth: integerOr(settings.floorWidth, defaults.floorWidth, 10, 90),
    sideRoughness: integerOr(settings.sideRoughness, defaults.sideRoughness, 0, 100),
    ceilingVariation: integerOr(settings.ceilingVariation, defaults.ceilingVariation, 0, 100),
    noiseScale: numberOr(settings.noiseScale, defaults.noiseScale, 0.15, 8),
    smoothing: integerOr(settings.smoothing, defaults.smoothing, 0, 4),
    asymmetry: integerOr(settings.asymmetry, defaults.asymmetry, 0, 100),
    wallBulge: integerOr(settings.wallBulge, defaults.wallBulge, 0, 100),
    pocketStrength: integerOr(settings.pocketStrength, defaults.pocketStrength, 0, 100),
    floorClearance: integerOr(settings.floorClearance, defaults.floorClearance, 1, 8),
    capBottom: settings.capBottom !== false,
    showBox: settings.showBox === true,
    wireOverlay: settings.wireOverlay !== false,
    backfaceCulling: settings.backfaceCulling === true,
    useTexture: settings.useTexture === true,
    textureId: typeof settings.textureId === 'string' ? settings.textureId : '',
    textureName: typeof settings.textureName === 'string' ? settings.textureName : '',
    uvScaleX: numberOr(settings.uvScaleX, defaults.uvScaleX, 0.1, 16),
    uvScaleY: numberOr(settings.uvScaleY, defaults.uvScaleY, 0.1, 16),
    uvRotation: [0, 90, 180, 270].includes(Number(settings.uvRotation)) ? Number(settings.uvRotation) : 0,
    pixelated: settings.pixelated !== false,
    floorColor: normalizeHex(settings.floorColor, defaults.floorColor),
    wallColor: normalizeHex(settings.wallColor, defaults.wallColor),
    ceilingColor: normalizeHex(settings.ceilingColor, defaults.ceilingColor),
    wireColor: normalizeHex(settings.wireColor, defaults.wireColor)
  };
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

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function valueNoise(seed, x, z, salt) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = smoothstep(0, 1, fx);
  const sz = smoothstep(0, 1, fz);
  const a = randomSeeded(seed, ix, iz, salt);
  const b = randomSeeded(seed, ix + 1, iz, salt);
  const c = randomSeeded(seed, ix, iz + 1, salt);
  const d = randomSeeded(seed, ix + 1, iz + 1, salt);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

function fbm(seed, x, z, salt) {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < 4; octave++) {
    value += valueNoise(seed, x * frequency, z * frequency, salt + octave * 41) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return value / Math.max(0.0001, total);
}

function valueNoise3(seed, x, y, z, salt) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = smoothstep(0, 1, fx);
  const sy = smoothstep(0, 1, fy);
  const sz = smoothstep(0, 1, fz);
  const c000 = randomSeeded(seed, ix, iy, iz + salt);
  const c100 = randomSeeded(seed, ix + 1, iy, iz + salt);
  const c010 = randomSeeded(seed, ix, iy + 1, iz + salt);
  const c110 = randomSeeded(seed, ix + 1, iy + 1, iz + salt);
  const c001 = randomSeeded(seed, ix, iy, iz + 1 + salt);
  const c101 = randomSeeded(seed, ix + 1, iy, iz + 1 + salt);
  const c011 = randomSeeded(seed, ix, iy + 1, iz + 1 + salt);
  const c111 = randomSeeded(seed, ix + 1, iy + 1, iz + 1 + salt);
  const x00 = lerp(c000, c100, sx);
  const x10 = lerp(c010, c110, sx);
  const x01 = lerp(c001, c101, sx);
  const x11 = lerp(c011, c111, sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

function fbm3(seed, x, y, z, salt) {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < 4; octave++) {
    value += valueNoise3(seed, x * frequency, y * frequency, z * frequency, salt + octave * 47) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / Math.max(0.0001, total) * 2 - 1;
}

function graphKey(x, z) {
  return `${x},${z}`;
}

function createRng(seed) {
  let t = seed >>> 0 || 0x9e3779b9;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function addGraphNode(nodes, nodeByKey, x, z) {
  const key = graphKey(x, z);
  let node = nodeByKey.get(key);
  if (!node) {
    node = { id: nodes.length, x, z, chamber: false, edges: new Set() };
    nodes.push(node);
    nodeByKey.set(key, node);
  }
  return node;
}

function connectGraph(nodes, edges, nodeByKey, a, dir) {
  const info = DIRS[dir];
  const b = addGraphNode(nodes, nodeByKey, a.x + info.dx, a.z + info.dz);
  a.edges.add(b.id);
  b.edges.add(a.id);
  if (!edges.some(edge => (edge.a === a.id && edge.b === b.id) || (edge.a === b.id && edge.b === a.id))) {
    edges.push({ a: a.id, b: b.id });
  }
  return b;
}

function dirBetween(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

function chooseDirection(rng, previousDir, turnChance = 0.34) {
  if (previousDir !== null && rng() > turnChance) return previousDir;
  const choices = previousDir === null
    ? [0, 1, 2, 3]
    : [previousDir, (previousDir + 1) % 4, (previousDir + 3) % 4];
  return choices[Math.floor(rng() * choices.length)];
}

function generateGraph(settings) {
  const rng = createRng(settings.seed);
  const sizeScale = settings.levelSize === 'small' ? 0.68 : (settings.levelSize === 'large' ? 1.38 : 1);
  const mainPathLength = Math.max(4, Math.round(settings.mainPathLength * sizeScale));
  const branchCount = Math.max(0, Math.round(settings.branchCount * sizeScale));
  const branchDepthBase = Math.max(1, Math.round(settings.branchDepth * (0.82 + sizeScale * 0.18)));
  const nodes = [];
  const edges = [];
  const nodeByKey = new Map();
  let current = addGraphNode(nodes, nodeByKey, 0, 0);
  let dir = Math.floor(rng() * 4);
  const mainPath = [current.id];

  for (let i = 0; i < mainPathLength; i++) {
    dir = chooseDirection(rng, dir, 0.32);
    current = connectGraph(nodes, edges, nodeByKey, current, dir);
    mainPath.push(current.id);
  }

  let branches = 0;
  let deadEnds = 0;
  const branchable = mainPath.slice(2, -2);
  for (let branch = 0; branch < branchCount; branch++) {
    if (!branchable.length) break;
    const start = nodes[branchable[Math.floor(rng() * branchable.length)]];
    let branchNode = start;
    let branchDir = chooseDirection(rng, null, 1);
    if (start.edges.size) {
      const neighbor = nodes[[...start.edges][Math.floor(rng() * start.edges.size)]];
      branchDir = (dirBetween(start, neighbor) + (rng() > 0.5 ? 1 : 3)) % 4;
    }
    const depthJitter = Math.round((rng() - 0.5) * branchDepthBase * 0.55);
    const depth = clamp(branchDepthBase + depthJitter, 1, branchDepthBase * 2);
    branches++;
    for (let step = 0; step < depth; step++) {
      branchDir = chooseDirection(rng, branchDir, 0.46);
      branchNode = connectGraph(nodes, edges, nodeByKey, branchNode, branchDir);
      if (step > 2 && rng() * 100 < settings.deadEndChance) break;
    }
    if (branchNode.edges.size === 1) deadEnds++;
  }

  const possibleLoops = [];
  for (const node of nodes) {
    for (const info of DIRS) {
      const target = nodeByKey.get(graphKey(node.x + info.dx, node.z + info.dz));
      if (!target || node.edges.has(target.id)) continue;
      if (node.id < target.id) possibleLoops.push({ a: node, dir: info.dir });
    }
  }
  let loops = 0;
  for (const option of possibleLoops) {
    if (rng() * 100 > settings.loopChance) continue;
    connectGraph(nodes, edges, nodeByKey, option.a, option.dir);
    loops++;
  }

  let chambers = 0;
  for (const node of nodes) {
    const endpoint = node.edges.size === 1;
    const junction = node.edges.size >= 3;
    const eligible = endpoint || junction || randomSeeded(settings.seed, node.x, node.z, 403) > 0.74;
    if (eligible && rng() * 100 < settings.chamberChance) {
      node.chamber = true;
      chambers++;
    }
  }
  nodes[0].chamber = true;
  if (!chambers) chambers = 1;

  return { nodes, edges, branches, deadEnds, loops, chambers };
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const c1 = vx * wx + vz * wz;
  if (c1 <= 0) return Math.hypot(px - ax, pz - az);
  const c2 = vx * vx + vz * vz;
  if (c2 <= c1) return Math.hypot(px - bx, pz - bz);
  const t = c1 / c2;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function indexFor(x, z, widthVoxels) {
  return z * widthVoxels + x;
}

function voxelIndex(x, y, z, widthVoxels, heightVoxels) {
  return (z * heightVoxels + y) * widthVoxels + x;
}

function estimateFootprintBounds(graph, settings) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const chamberRadius = settings.chamberSize;
  for (const node of graph.nodes) {
    minX = Math.min(minX, node.x * GRAPH_STEP - chamberRadius - GRAPH_STEP);
    minZ = Math.min(minZ, node.z * GRAPH_STEP - chamberRadius - GRAPH_STEP);
    maxX = Math.max(maxX, node.x * GRAPH_STEP + chamberRadius + GRAPH_STEP);
    maxZ = Math.max(maxZ, node.z * GRAPH_STEP + chamberRadius + GRAPH_STEP);
  }

  const voxelSize = settings.voxelSize;
  const originX = Math.floor(minX / voxelSize) * voxelSize;
  const originZ = Math.floor(minZ / voxelSize) * voxelSize;
  const widthVoxels = Math.max(1, Math.ceil((maxX - originX) / voxelSize));
  const depthVoxels = Math.max(1, Math.ceil((maxZ - originZ) / voxelSize));
  return { widthVoxels, depthVoxels, originX, originZ };
}

function rasterizeFootprint(graph, settings, bounds = estimateFootprintBounds(graph, settings)) {
  const { widthVoxels, depthVoxels, originX, originZ } = bounds;
  const voxelSize = settings.voxelSize;
  const mask = new Uint8Array(widthVoxels * depthVoxels);
  const coreMask = new Uint8Array(widthVoxels * depthVoxels);
  const scale = Math.max(0.15, settings.noiseScale);
  const erosion = settings.erosion / 100;
  const roughness = settings.sideRoughness / 100;
  const baseRadius = 1.2 + settings.floorWidth / 100 * 4.4;

  for (let z = 0; z < depthVoxels; z++) {
    for (let x = 0; x < widthVoxels; x++) {
      const wx = originX + (x + 0.5) * voxelSize;
      const wz = originZ + (z + 0.5) * voxelSize;
      let best = Infinity;
      let core = false;
      for (const edge of graph.edges) {
        const a = graph.nodes[edge.a];
        const b = graph.nodes[edge.b];
        const dist = distanceToSegment(wx, wz, a.x * GRAPH_STEP, a.z * GRAPH_STEP, b.x * GRAPH_STEP, b.z * GRAPH_STEP);
        best = Math.min(best, dist);
        if (dist < Math.max(1, baseRadius * 0.46)) core = true;
      }
      let chamberBoost = -Infinity;
      for (const node of graph.nodes) {
        if (!node.chamber) continue;
        const rx = settings.chamberSize * (0.82 + randomSeeded(settings.seed, node.x, node.z, 901) * 0.62);
        const rz = settings.chamberSize * (0.82 + randomSeeded(settings.seed, node.x, node.z, 902) * 0.62);
        const dx = (wx - node.x * GRAPH_STEP) / rx;
        const dz = (wz - node.z * GRAPH_STEP) / rz;
        chamberBoost = Math.max(chamberBoost, 1 - Math.hypot(dx, dz));
        if (Math.hypot(dx, dz) < 0.42) core = true;
      }

      const n = fbm(settings.seed, wx / (5.2 * scale), wz / (5.2 * scale), 100);
      const low = fbm(settings.seed, wx / (15 * scale), wz / (13 * scale), 180);
      const radius = baseRadius * (1 - erosion * 0.2) + (n - 0.5) * roughness * 2.8 + (low - 0.5) * roughness * 2.2;
      const openTunnel = best <= radius;
      const openChamber = chamberBoost > -0.06 - roughness * 0.12;
      const idx = indexFor(x, z, widthVoxels);
      if (openTunnel || openChamber || core) {
        mask[idx] = 1;
        if (core) coreMask[idx] = 1;
      }
    }
  }
  return { mask, coreMask, widthVoxels, depthVoxels, originX, originZ };
}

function distanceTransform2d(mask, widthVoxels, depthVoxels, zeroWhenSet) {
  const inf = 1e6;
  const dist = new Float32Array(widthVoxels * depthVoxels);
  for (let i = 0; i < dist.length; i++) {
    dist[i] = (mask[i] ? zeroWhenSet : !zeroWhenSet) ? 0 : inf;
  }
  const diag = Math.SQRT2;
  for (let z = 0; z < depthVoxels; z++) {
    for (let x = 0; x < widthVoxels; x++) {
      const idx = indexFor(x, z, widthVoxels);
      let best = dist[idx];
      if (x > 0) best = Math.min(best, dist[indexFor(x - 1, z, widthVoxels)] + 1);
      if (z > 0) best = Math.min(best, dist[indexFor(x, z - 1, widthVoxels)] + 1);
      if (x > 0 && z > 0) best = Math.min(best, dist[indexFor(x - 1, z - 1, widthVoxels)] + diag);
      if (x < widthVoxels - 1 && z > 0) best = Math.min(best, dist[indexFor(x + 1, z - 1, widthVoxels)] + diag);
      dist[idx] = best;
    }
  }
  for (let z = depthVoxels - 1; z >= 0; z--) {
    for (let x = widthVoxels - 1; x >= 0; x--) {
      const idx = indexFor(x, z, widthVoxels);
      let best = dist[idx];
      if (x < widthVoxels - 1) best = Math.min(best, dist[indexFor(x + 1, z, widthVoxels)] + 1);
      if (z < depthVoxels - 1) best = Math.min(best, dist[indexFor(x, z + 1, widthVoxels)] + 1);
      if (x < widthVoxels - 1 && z < depthVoxels - 1) best = Math.min(best, dist[indexFor(x + 1, z + 1, widthVoxels)] + diag);
      if (x > 0 && z < depthVoxels - 1) best = Math.min(best, dist[indexFor(x - 1, z + 1, widthVoxels)] + diag);
      dist[idx] = best;
    }
  }
  return dist;
}

function createSignedDistance(mask, widthVoxels, depthVoxels) {
  const distToAir = distanceTransform2d(mask, widthVoxels, depthVoxels, false);
  const distToFloor = distanceTransform2d(mask, widthVoxels, depthVoxels, true);
  const signed = new Float32Array(mask.length);
  for (let i = 0; i < signed.length; i++) signed[i] = mask[i] ? -distToAir[i] : distToFloor[i];
  return signed;
}

function createCeilings(mask, signedDistance, widthVoxels, depthVoxels, heightVoxels, settings) {
  const ceilings = new Uint16Array(widthVoxels * depthVoxels);
  const scale = Math.max(0.15, settings.noiseScale);
  const variation = settings.ceilingVariation / 100;
  const erosion = settings.erosion / 100;
  const minCeiling = Math.max(2, Math.min(heightVoxels - 1, settings.floorClearance + 2));
  const variationVoxels = Math.max(1, heightVoxels * 0.32 * variation);
  for (let z = 0; z < depthVoxels; z++) {
    for (let x = 0; x < widthVoxels; x++) {
      const idx = indexFor(x, z, widthVoxels);
      const insideDepth = Math.max(0, -signedDistance[idx]);
      const depthBoost = smoothstep(0, Math.max(2, widthVoxels * 0.08), insideDepth);
      const n = fbm(settings.seed, x / (4.4 * scale), z / (4.4 * scale), 500) - 0.5;
      const low = fbm(settings.seed, x / (12 * scale), z / (10 * scale), 540) - 0.5;
      const base = minCeiling + heightVoxels * (0.38 + depthBoost * 0.34);
      ceilings[idx] = clamp(Math.round(base + (n * 1.25 + low * 0.55) * variationVoxels - erosion * heightVoxels * 0.08), minCeiling, heightVoxels - 1);
    }
  }
  return ceilings;
}

function countAirNeighbors26(air, x, y, z, widthVoxels, heightVoxels, depthVoxels) {
  let count = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= widthVoxels || ny >= heightVoxels || nz >= depthVoxels) continue;
        count += air[voxelIndex(nx, ny, nz, widthVoxels, heightVoxels)] ? 1 : 0;
      }
    }
  }
  return count;
}

function smoothAirVolume(air, mask, widthVoxels, heightVoxels, depthVoxels, settings) {
  let current = air;
  const clearance = clamp(settings.floorClearance, 1, Math.max(1, heightVoxels - 1));
  for (let pass = 0; pass < settings.smoothing; pass++) {
    const next = new Uint8Array(current);
    for (let z = 0; z < depthVoxels; z++) {
      for (let y = 0; y < heightVoxels; y++) {
        for (let x = 0; x < widthVoxels; x++) {
          const floorIdx = indexFor(x, z, widthVoxels);
          const idx = voxelIndex(x, y, z, widthVoxels, heightVoxels);
          if (mask[floorIdx] && y <= clearance) {
            next[idx] = 1;
            continue;
          }
          const airNeighbors = countAirNeighbors26(current, x, y, z, widthVoxels, heightVoxels, depthVoxels);
          const solidNeighbors = 26 - airNeighbors;
          if (solidNeighbors >= 17) next[idx] = 0;
          else if (solidNeighbors <= 9) next[idx] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function createAirVolume(mask, signedDistance, ceilings, widthVoxels, heightVoxels, depthVoxels, settings) {
  const air = new Uint8Array(widthVoxels * heightVoxels * depthVoxels);
  const scale = Math.max(0.15, settings.noiseScale);
  const erosion = settings.erosion / 100;
  const roughness = settings.sideRoughness / 100;
  const wallBulge = settings.wallBulge / 100;
  const pockets = settings.pocketStrength / 100;
  const asymmetry = settings.asymmetry / 100;
  const clearance = clamp(settings.floorClearance, 1, Math.max(1, heightVoxels - 1));
  const sideRoughnessVoxels = roughness * Math.max(2, widthVoxels * 0.08);
  const bulgeVoxels = wallBulge * Math.max(1.5, widthVoxels * 0.08) * (0.55 + erosion * 0.85);
  const pocketVoxels = pockets * Math.max(1, widthVoxels * 0.055);
  for (let z = 0; z < depthVoxels; z++) {
    for (let y = 0; y < heightVoxels; y++) {
      const h = heightVoxels <= 1 ? 0 : y / (heightVoxels - 1);
      const floorProtect = smoothstep(clearance, clearance + Math.max(2, heightVoxels * 0.18), y);
      const upperBulge = Math.sin(h * Math.PI);
      const ceilingPinch = 1 - smoothstep(0.72, 1, h);
      for (let x = 0; x < widthVoxels; x++) {
        const floorIdx = indexFor(x, z, widthVoxels);
        const idx = voxelIndex(x, y, z, widthVoxels, heightVoxels);
        if (mask[floorIdx] && y <= clearance) {
          air[idx] = 1;
          continue;
        }
        const ceiling = ceilings[floorIdx];
        const n1 = fbm3(settings.seed, x / (4.6 * scale), y / (3.4 * scale), z / (4.6 * scale), 900);
        const n2 = fbm3(settings.seed, x / (2.2 * scale), y / (2.8 * scale), z / (2.2 * scale), 980);
        const lowBias = fbm3(settings.seed, x / (13 * scale), y / (8 * scale), z / (12 * scale), 1040);
        const pocketNoise = fbm3(settings.seed, x / (3.8 * scale), y / (3.2 * scale), z / (3.8 * scale), 1120);
        const baseAllowance = bulgeVoxels * floorProtect * (0.28 + 0.72 * upperBulge) * ceilingPinch;
        const wallNoise = (n1 * 0.76 + n2 * 0.24) * sideRoughnessVoxels * floorProtect;
        const asymBias = lowBias * asymmetry * Math.max(1, widthVoxels * 0.07) * floorProtect;
        const upperPocket = y > ceiling - Math.max(2, heightVoxels * 0.22) && pocketNoise > 0.15 ? pocketVoxels * (pocketNoise - 0.15) * floorProtect : 0;
        const ceilingPocket = pocketNoise > 0.38 ? Math.round((pocketNoise - 0.38) * pockets * heightVoxels * 0.28) : 0;
        if (signedDistance[floorIdx] <= baseAllowance + wallNoise + asymBias + upperPocket + erosion * 0.8 && y <= ceiling + ceilingPocket) {
          air[idx] = 1;
        }
      }
    }
  }
  return smoothAirVolume(air, mask, widthVoxels, heightVoxels, depthVoxels, settings);
}

function graphToMaskMap(graph) {
  const maskMap = new Map();
  for (const node of graph.nodes) {
    let mask = 0;
    for (const neighborId of node.edges) {
      const neighbor = graph.nodes[neighborId];
      mask |= 1 << dirBetween(node, neighbor);
    }
    maskMap.set(graphKey(node.x, node.z), { x: node.x, y: node.z, mask, room: node.chamber });
  }
  return maskMap;
}

function buildWalkableData(layout) {
  const walkableVoxels = new Set();
  const heights = new Map();
  const step = 1;
  const minX = Math.floor(layout.originX);
  const maxX = Math.ceil(layout.originX + layout.widthVoxels * layout.voxelSize);
  const minZ = Math.floor(layout.originZ);
  const maxZ = Math.ceil(layout.originZ + layout.depthVoxels * layout.voxelSize);
  for (let z = minZ; z < maxZ; z += step) {
    for (let x = minX; x < maxX; x += step) {
      if (!hasVoxelDungeonHeadroomAt(layout, x + 0.5, z + 0.5, 1.8)) continue;
      const key = `${x},${z}`;
      walkableVoxels.add(key);
      const lx = Math.floor((x + 0.5 - layout.originX) / layout.voxelSize);
      const lz = Math.floor((z + 0.5 - layout.originZ) / layout.voxelSize);
      const floorIdx = indexFor(clamp(lx, 0, layout.widthVoxels - 1), clamp(lz, 0, layout.depthVoxels - 1), layout.widthVoxels);
      heights.set(key, Math.max(2, layout.ceilings[floorIdx] * layout.voxelSize));
    }
  }
  layout.walkableVoxels = walkableVoxels;
  layout.heights = heights;
  return layout;
}

export function generateVoxelDungeonLayout(settingsInput = {}) {
  const settings = normalizeVoxelDungeonSettings(settingsInput);
  const graph = generateGraph(settings);
  const footprintBounds = estimateFootprintBounds(graph, settings);
  const heightVoxels = Math.max(2, Math.ceil(settings.height / settings.voxelSize));
  if (footprintBounds.widthVoxels * footprintBounds.depthVoxels > MAX_FLOOR_CELLS) {
    return { error: `Grid is ${footprintBounds.widthVoxels * footprintBounds.depthVoxels} floor cells. Increase voxel size or reduce level size.` };
  }
  if (heightVoxels > MAX_HEIGHT_VOXELS) {
    return { error: `Height is ${heightVoxels} voxels. Increase voxel size or reduce height.` };
  }
  if (footprintBounds.widthVoxels * footprintBounds.depthVoxels * heightVoxels > MAX_VOLUME_VOXELS) {
    return { error: `Volume is ${footprintBounds.widthVoxels * footprintBounds.depthVoxels * heightVoxels} voxels. Increase voxel size or reduce level size.` };
  }
  const footprint = rasterizeFootprint(graph, settings, footprintBounds);
  const signedDistance = createSignedDistance(footprint.mask, footprint.widthVoxels, footprint.depthVoxels);
  const ceilings = createCeilings(footprint.mask, signedDistance, footprint.widthVoxels, footprint.depthVoxels, heightVoxels, settings);
  const air = createAirVolume(footprint.mask, signedDistance, ceilings, footprint.widthVoxels, heightVoxels, footprint.depthVoxels, settings);
  let carvedCells = 0;
  for (let i = 0; i < footprint.mask.length; i++) carvedCells += footprint.mask[i] ? 1 : 0;
  let airVoxels = 0;
  for (let i = 0; i < air.length; i++) airVoxels += air[i] ? 1 : 0;
  const layout = {
    settings,
    graph,
    maskMap: graphToMaskMap(graph),
    voxelSize: settings.voxelSize,
    widthVoxels: footprint.widthVoxels,
    heightVoxels,
    depthVoxels: footprint.depthVoxels,
    originX: footprint.originX,
    originZ: footprint.originZ,
    mask: footprint.mask,
    signedDistance,
    ceilings,
    air,
    carvedCells,
    airVoxels,
    branches: graph.branches,
    deadEnds: graph.deadEnds,
    loops: graph.loops,
    chambers: graph.chambers
  };
  return buildWalkableData(layout);
}

function hexToRgbUnit(value) {
  const hex = normalizeHex(value, '#808080').slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  ];
}

function colorForFace(type, x, y, z, layout) {
  let base;
  let shade;
  if (type === 'floor') {
    base = hexToRgbUnit(layout.settings.floorColor);
    shade = 0.9;
  } else if (type === 'bottom') {
    base = hexToRgbUnit(layout.settings.floorColor);
    shade = 0.55;
  } else if (type === 'ceiling') {
    base = hexToRgbUnit(layout.settings.ceilingColor);
    shade = 0.62;
  } else {
    base = hexToRgbUnit(layout.settings.wallColor);
    shade = 0.66 + y * 0.018;
  }
  const variation = 0.76 + randomSeeded(layout.settings.seed, Math.round(x * 8), Math.round(z * 8), Math.round(y * 19) + type.length * 53) * 0.32;
  const light = clamp(shade * variation, 0.2, 1.08);
  return base.map(channel => clamp(channel * light, 0, 1));
}

function transformUv(u, v, settings) {
  const su = u / Math.max(0.1, settings.uvScaleX);
  const sv = v / Math.max(0.1, settings.uvScaleY);
  if (settings.uvRotation === 90) return [sv, -su];
  if (settings.uvRotation === 180) return [-su, -sv];
  if (settings.uvRotation === 270) return [-sv, su];
  return [su, sv];
}

function uvForCorner(corner, normal, layout) {
  const [x, y, z] = corner;
  const size = layout.voxelSize || 1;
  let u;
  let v;
  if (Math.abs(normal[1]) > 0.5) {
    u = x / size;
    v = z / size;
  } else if (Math.abs(normal[2]) > 0.5) {
    u = x / size;
    v = y / size;
  } else {
    u = z / size;
    v = y / size;
  }
  return transformUv(u, v, layout.settings);
}

function addQuad(buffers, corners, normal, color, layout) {
  const offset = buffers.positions.length / 3;
  for (const corner of corners) {
    const uv = uvForCorner(corner, normal, layout);
    buffers.positions.push(corner[0], corner[1], corner[2]);
    buffers.normals.push(normal[0], normal[1], normal[2]);
    buffers.colors.push(color[0], color[1], color[2]);
    buffers.uvs.push(uv[0], uv[1]);
  }
  buffers.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  buffers.faceCount++;
}

function isAir(layout, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= layout.widthVoxels || y >= layout.heightVoxels || z >= layout.depthVoxels) return false;
  return layout.air[voxelIndex(x, y, z, layout.widthVoxels, layout.heightVoxels)] === 1;
}

function addTopFace(buffers, x0, z0, size, y, type, layout) {
  addQuad(buffers, [
    [x0, y, z0],
    [x0, y, z0 + size],
    [x0 + size, y, z0 + size],
    [x0 + size, y, z0]
  ], [0, 1, 0], colorForFace(type, x0, y, z0, layout), layout);
}

function addBottomFace(buffers, x0, z0, size, y, layout) {
  addQuad(buffers, [
    [x0, y, z0],
    [x0 + size, y, z0],
    [x0 + size, y, z0 + size],
    [x0, y, z0 + size]
  ], [0, -1, 0], colorForFace('bottom', x0, y, z0, layout), layout);
}

function addCeilingFace(buffers, x0, z0, size, y, layout) {
  addQuad(buffers, [
    [x0, y, z0],
    [x0 + size, y, z0],
    [x0 + size, y, z0 + size],
    [x0, y, z0 + size]
  ], [0, -1, 0], colorForFace('ceiling', x0, y, z0, layout), layout);
}

function addWallFace(buffers, x0, z0, size, y0, dir, layout) {
  const y1 = y0 + size;
  if (dir === 'north') {
    addQuad(buffers, [[x0, y0, z0], [x0 + size, y0, z0], [x0 + size, y1, z0], [x0, y1, z0]], [0, 0, 1], colorForFace('wall', x0, y0, z0, layout), layout);
  } else if (dir === 'south') {
    addQuad(buffers, [[x0, y0, z0 + size], [x0, y1, z0 + size], [x0 + size, y1, z0 + size], [x0 + size, y0, z0 + size]], [0, 0, -1], colorForFace('wall', x0, y0, z0, layout), layout);
  } else if (dir === 'west') {
    addQuad(buffers, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z0 + size], [x0, y0, z0 + size]], [1, 0, 0], colorForFace('wall', x0, y0, z0, layout), layout);
  } else if (dir === 'east') {
    addQuad(buffers, [[x0 + size, y0, z0], [x0 + size, y0, z0 + size], [x0 + size, y1, z0 + size], [x0 + size, y1, z0]], [-1, 0, 0], colorForFace('wall', x0, y0, z0, layout), layout);
  }
}

export function buildVoxelDungeonMesh(THREE, layout, materialOptions = {}) {
  const buffers = { positions: [], normals: [], colors: [], uvs: [], indices: [], faceCount: 0 };
  const size = layout.voxelSize;
  const bottomY = -size * FLOOR_THICKNESS_RATIO;
  for (let z = 0; z < layout.depthVoxels; z++) {
    for (let y = 0; y < layout.heightVoxels; y++) {
      for (let x = 0; x < layout.widthVoxels; x++) {
        if (!isAir(layout, x, y, z)) continue;
        const x0 = layout.originX + x * size;
        const y0 = y * size;
        const z0 = layout.originZ + z * size;
        if (y === 0) {
          addTopFace(buffers, x0, z0, size, 0, 'floor', layout);
          if (layout.settings.capBottom) addBottomFace(buffers, x0, z0, size, bottomY, layout);
        } else if (!isAir(layout, x, y - 1, z)) {
          addTopFace(buffers, x0, z0, size, y0, 'ledge', layout);
        }
        if (!isAir(layout, x, y + 1, z)) addCeilingFace(buffers, x0, z0, size, y0 + size, layout);
        if (!isAir(layout, x, y, z - 1)) addWallFace(buffers, x0, z0, size, y0, 'north', layout);
        if (!isAir(layout, x + 1, y, z)) addWallFace(buffers, x0, z0, size, y0, 'east', layout);
        if (!isAir(layout, x, y, z + 1)) addWallFace(buffers, x0, z0, size, y0, 'south', layout);
        if (!isAir(layout, x - 1, y, z)) addWallFace(buffers, x0, z0, size, y0, 'west', layout);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const useTexture = !!materialOptions.texture;
  const material = new THREE.MeshLambertMaterial({
    map: useTexture ? materialOptions.texture : null,
    vertexColors: !useTexture,
    fog: true,
    side: layout.settings.backfaceCulling ? THREE.FrontSide : THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'procedural-voxel-dungeon';
  return { mesh, geometry, faceCount: buffers.faceCount, voxelCount: layout.airVoxels };
}

export function hasVoxelDungeonAirAt(layout, worldX, worldY, worldZ) {
  if (!layout) return true;
  const x = Math.floor((worldX - layout.originX) / layout.voxelSize);
  const y = Math.floor(worldY / layout.voxelSize);
  const z = Math.floor((worldZ - layout.originZ) / layout.voxelSize);
  return isAir(layout, x, y, z);
}

export function hasVoxelDungeonHeadroomAt(layout, worldX, worldZ, height = 1.8) {
  if (!hasVoxelDungeonAirAt(layout, worldX, 0.15, worldZ)) return false;
  const top = Math.max(1, Math.ceil(height / layout.voxelSize));
  for (let y = 1; y <= top; y++) {
    if (!hasVoxelDungeonAirAt(layout, worldX, y * layout.voxelSize, worldZ)) return false;
  }
  return true;
}

export function hasVoxelDungeonLineOfSight(layout, fromX, fromY, fromZ, toX, toY, toZ) {
  const distance = Math.hypot(toX - fromX, toY - fromY, toZ - fromZ);
  const steps = Math.max(4, Math.ceil(distance / Math.max(0.25, layout.voxelSize * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!hasVoxelDungeonAirAt(layout, lerp(fromX, toX, t), lerp(fromY, toY, t), lerp(fromZ, toZ, t))) return false;
  }
  return true;
}

function openAssetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function saveVoxelTextureAsset(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const db = await openAssetDb();
  const id = `texture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record = { id, name: file.name || 'Block texture', type: file.type || 'image/png', dataUrl, createdAt: Date.now() };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function loadVoxelTextureAsset(id) {
  if (!id) return null;
  const db = await openAssetDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readonly');
    const request = tx.objectStore(ASSET_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

export async function deleteVoxelTextureAsset(id) {
  if (!id) return;
  const db = await openAssetDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE_NAME, 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
