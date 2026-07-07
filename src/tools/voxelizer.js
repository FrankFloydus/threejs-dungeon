const THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
const STORAGE_KEY = 'dungeon-tunnels-voxelizer-v2';
const MAX_FLOOR_CELLS = 30000;
const MAX_HEIGHT_VOXELS = 64;
const FLOOR_THICKNESS_RATIO = 0.08;

const DEFAULT_BOX = {
  centerX: 0,
  centerZ: 0,
  width: 18,
  height: 8,
  depth: 28
};

const DEFAULT_SETTINGS = {
  voxelSize: 1,
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
  capFront: false,
  capBottom: true,
  showBox: true,
  wireOverlay: true,
  backfaceCulling: false,
  floorColor: '#6f6652',
  wallColor: '#4b4539',
  ceilingColor: '#2f2c25',
  wireColor: '#d7e7c2'
};

const CONTROL_TOOLTIPS = {
  voxelCenterX: 'Moves the editable box left or right in world space.',
  voxelCenterZ: 'Moves the editable box forward or backward in world space.',
  voxelWidth: 'Sets the left-to-right size of the bounding box before voxelization.',
  voxelHeight: 'Sets the maximum cave height. The floor stays fixed at Y=0.',
  voxelDepth: 'Sets the front-to-back tunnel length.',
  voxelSize: 'Controls voxel resolution. Smaller values create more blocks and more detail.',
  voxelSeed: 'Deterministic integer seed for the cave shape.',
  voxelErosion: 'Raises the carving threshold and breaks away more side and ceiling material.',
  voxelFloorWidth: 'Preserves a wider or narrower navigable tunnel spine.',
  voxelSideRoughness: 'Adds side pockets, jagged edges, and width variation around the spine.',
  voxelCeilingVariation: 'Varies local ceiling height to avoid flat rectangular roofs.',
  voxelAsymmetry: 'Offsets the tunnel spine and side chambers so both sides do not match.',
  voxelWallBulge: 'Pushes side walls outward more strongly at middle heights, breaking vertical curtain walls.',
  voxelPocketStrength: 'Adds noisy upper-wall and ceiling pockets to make the tunnel less rectangular.',
  voxelFloorClearance: 'Protects this many lower voxel layers from aggressive side erosion.',
  voxelNoiseScale: 'Controls feature scale. Lower values make tighter noisy details; higher values make broader forms.',
  voxelSmoothing: 'Runs cellular-automata cleanup passes. Higher values merge noisy cells into larger cave masses.',
  voxelCapFront: 'Closes the front mouth with wall faces when enabled.',
  voxelCapBottom: 'Adds underside faces below the floor shell.',
  voxelShowBox: 'Shows the editable bounding volume as a wire box.',
  voxelWireOverlay: 'Draws a transparent wireframe over the generated cave mesh.',
  voxelBackfaceCulling: 'When enabled, hidden back faces are culled. Disable to render both sides of faces.',
  voxelFloorColor: 'Base vertex color for the floor voxels.',
  voxelWallColor: 'Base vertex color for side wall voxels.',
  voxelCeilingColor: 'Base vertex color for ceiling voxels.',
  voxelWireColor: 'Color of the bounding box and generated wire overlay.'
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

function hexToRgbUnit(value) {
  const hex = normalizeHex(value, '#808080').slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  ];
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

function normalizeBox(box = {}) {
  return {
    centerX: numberOr(box.centerX, DEFAULT_BOX.centerX, -200, 200),
    centerZ: numberOr(box.centerZ, DEFAULT_BOX.centerZ, -200, 200),
    width: numberOr(box.width, DEFAULT_BOX.width, 2, 240),
    height: numberOr(box.height, DEFAULT_BOX.height, 2, 80),
    depth: numberOr(box.depth, DEFAULT_BOX.depth, 2, 320)
  };
}

function normalizeSettings(settings = {}) {
  return {
    voxelSize: numberOr(settings.voxelSize, DEFAULT_SETTINGS.voxelSize, 0.25, 4),
    seed: integerOr(settings.seed, DEFAULT_SETTINGS.seed, 1, 2147483647),
    erosion: integerOr(settings.erosion, DEFAULT_SETTINGS.erosion, 0, 100),
    floorWidth: integerOr(settings.floorWidth, DEFAULT_SETTINGS.floorWidth, 10, 90),
    sideRoughness: integerOr(settings.sideRoughness, DEFAULT_SETTINGS.sideRoughness, 0, 100),
    ceilingVariation: integerOr(settings.ceilingVariation, DEFAULT_SETTINGS.ceilingVariation, 0, 100),
    noiseScale: numberOr(settings.noiseScale, DEFAULT_SETTINGS.noiseScale, 0.15, 8),
    smoothing: integerOr(settings.smoothing, DEFAULT_SETTINGS.smoothing, 0, 4),
    asymmetry: integerOr(settings.asymmetry, DEFAULT_SETTINGS.asymmetry, 0, 100),
    wallBulge: integerOr(settings.wallBulge, DEFAULT_SETTINGS.wallBulge, 0, 100),
    pocketStrength: integerOr(settings.pocketStrength, DEFAULT_SETTINGS.pocketStrength, 0, 100),
    floorClearance: integerOr(settings.floorClearance, DEFAULT_SETTINGS.floorClearance, 1, 8),
    capFront: settings.capFront === true,
    capBottom: settings.capBottom !== false,
    showBox: settings.showBox !== false,
    wireOverlay: settings.wireOverlay !== false,
    backfaceCulling: settings.backfaceCulling === true,
    floorColor: normalizeHex(settings.floorColor, DEFAULT_SETTINGS.floorColor),
    wallColor: normalizeHex(settings.wallColor, DEFAULT_SETTINGS.wallColor),
    ceilingColor: normalizeHex(settings.ceilingColor, DEFAULT_SETTINGS.ceilingColor),
    wireColor: normalizeHex(settings.wireColor, DEFAULT_SETTINGS.wireColor)
  };
}

function normalizeState(state = {}) {
  return {
    box: normalizeBox(state.box),
    settings: normalizeSettings(state.settings)
  };
}

function loadState(storage = window.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return normalizeState();
    return normalizeState(JSON.parse(raw));
  } catch (_) {
    return normalizeState();
  }
}

function saveState(state, storage = window.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  } catch (_) {}
}

function createSeedValue() {
  return Math.max(1, Math.floor(Math.random() * 2147483647));
}

function indexFor(x, z, widthVoxels) {
  return z * widthVoxels + x;
}

function voxelIndex(x, y, z, widthVoxels, heightVoxels) {
  return (z * heightVoxels + y) * widthVoxels + x;
}

function pathInfoAt(z, widthVoxels, depthVoxels, settings, seedHash) {
  const t = depthVoxels <= 1 ? 0 : z / (depthVoxels - 1);
  const scale = Math.max(0.15, settings.noiseScale);
  const roughness = settings.sideRoughness / 100;
  const asymmetry = settings.asymmetry / 100;
  const erosion = settings.erosion / 100;
  const phase = randomSeeded(seedHash, 5, 11, 803) * Math.PI * 2;
  const meander = (fbm(seedHash, z / (6.6 * scale), 0, 810) - 0.5) * 2;
  const longWave = Math.sin(t * Math.PI * 2.35 + phase) * 0.38 + Math.sin(t * Math.PI * 5.1 + phase * 0.47) * 0.16;
  const center = clamp(
    (widthVoxels - 1) / 2 + (meander * 0.72 + longWave) * widthVoxels * (0.08 + asymmetry * 0.34),
    1,
    Math.max(1, widthVoxels - 2)
  );
  const baseRadius = widthVoxels * clamp(settings.floorWidth / 100, 0.1, 0.9) * 0.36;
  const radiusNoise = (fbm(seedHash, z / (5.4 * scale), 0, 830) - 0.5) * widthVoxels * (0.05 + roughness * 0.18);
  const deadEndTaper = Math.min(smoothstep(0, 0.1, t), smoothstep(1, 0.88, t));
  const radius = clamp((baseRadius + radiusNoise) * (1.12 - erosion * 0.34) * (0.72 + deadEndTaper * 0.28), 1.25, widthVoxels * 0.48);
  return { center, radius };
}

function cellShapeInfo(x, z, widthVoxels, depthVoxels, settings, seedHash) {
  const path = pathInfoAt(z, widthVoxels, depthVoxels, settings, seedHash);
  const dist = Math.abs((x + 0.5) - path.center);
  const coreRadius = Math.max(1.05, path.radius * 0.42);
  const sideDistance = smoothstep(coreRadius, Math.max(coreRadius + 0.01, path.radius * 1.75), dist);
  return {
    central: dist <= coreRadius,
    sideDistance,
    edgeDistance: clamp(sideDistance, 0, 1),
    distanceFromPath: dist,
    pathRadius: path.radius
  };
}

function preserveCore(mask, widthVoxels, depthVoxels, settings, seedHash, coreMask = null) {
  for (let z = 0; z < depthVoxels; z++) {
    for (let x = 0; x < widthVoxels; x++) {
      const info = cellShapeInfo(x, z, widthVoxels, depthVoxels, settings, seedHash);
      if (info.central) {
        const idx = indexFor(x, z, widthVoxels);
        mask[idx] = 1;
        if (coreMask) coreMask[idx] = 1;
      }
    }
  }
}

function countOpenNeighbors(mask, x, z, widthVoxels, depthVoxels) {
  let count = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= widthVoxels || nz >= depthVoxels) continue;
      count += mask[indexFor(nx, nz, widthVoxels)] ? 1 : 0;
    }
  }
  return count;
}

function smoothMask(mask, coreMask, widthVoxels, depthVoxels, settings, seedHash) {
  let current = mask;
  for (let pass = 0; pass < settings.smoothing; pass++) {
    const next = new Uint8Array(current);
    for (let z = 0; z < depthVoxels; z++) {
      for (let x = 0; x < widthVoxels; x++) {
        const idx = indexFor(x, z, widthVoxels);
        if (coreMask[idx]) {
          next[idx] = 1;
          continue;
        }

        const neighbors = countOpenNeighbors(current, x, z, widthVoxels, depthVoxels);
        if (current[idx] && neighbors <= 2) next[idx] = 0;
        else if (!current[idx] && neighbors >= 5 && randomSeeded(seedHash, x, z, 700 + pass) > 0.18) next[idx] = 1;
        else if (current[idx] && neighbors >= 5) next[idx] = 1;
      }
    }
    preserveCore(next, widthVoxels, depthVoxels, settings, seedHash, coreMask);
    current = next;
  }
  return current;
}

function createFloorMask(widthVoxels, depthVoxels, settings, seedHash) {
  const mask = new Uint8Array(widthVoxels * depthVoxels);
  const coreMask = new Uint8Array(widthVoxels * depthVoxels);
  const erosion = settings.erosion / 100;
  const roughness = settings.sideRoughness / 100;
  const scale = Math.max(0.15, settings.noiseScale);
  const sideReach = widthVoxels * (0.10 + roughness * 0.24);

  for (let z = 0; z < depthVoxels; z++) {
    for (let x = 0; x < widthVoxels; x++) {
      const idx = indexFor(x, z, widthVoxels);
      const info = cellShapeInfo(x, z, widthVoxels, depthVoxels, settings, seedHash);
      if (info.central) {
        mask[idx] = 1;
        coreMask[idx] = 1;
        continue;
      }

      const dist = info.distanceFromPath;
      const falloff = smoothstep(info.pathRadius * 0.78, info.pathRadius + sideReach, dist);
      const caveNoise = fbm(seedHash, x / (4.6 * scale), z / (4.6 * scale), 100);
      const lowFreq = fbm(seedHash, x / (12 * scale), z / (9.5 * scale), 190);
      const worm = 1 - Math.abs(fbm(seedHash, x / (5.2 * scale), z / (5.2 * scale), 240) - 0.5) * 2;
      const wormScore = worm * worm;
      const pocket = fbm(seedHash, x / (7.8 * scale), z / (7.8 * scale), 310);
      const pocketBoost = pocket > 0.66 - roughness * 0.22 && dist < info.pathRadius + sideReach ? 0.24 : 0;
      const keepScore = (1 - falloff) * 0.56 + caveNoise * 0.2 + lowFreq * 0.18 + wormScore * (0.18 + roughness * 0.18) + pocketBoost;
      const threshold = 0.43 + erosion * 0.31 + falloff * (0.2 + erosion * 0.16) - roughness * 0.14;
      mask[idx] = keepScore >= threshold ? 1 : 0;
    }
  }

  preserveCore(mask, widthVoxels, depthVoxels, settings, seedHash, coreMask);
  return smoothMask(mask, coreMask, widthVoxels, depthVoxels, settings, seedHash);
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
  for (let i = 0; i < signed.length; i++) {
    signed[i] = mask[i] ? -distToAir[i] : distToFloor[i];
  }
  return signed;
}

function createCeilings(mask, signedDistance, widthVoxels, depthVoxels, heightVoxels, settings, seedHash) {
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
      const depthBoost = smoothstep(0, Math.max(2, widthVoxels * 0.12), insideDepth);
      const n = fbm(seedHash, x / (4.4 * scale), z / (4.4 * scale), 500) - 0.5;
      const low = fbm(seedHash, x / (12 * scale), z / (10 * scale), 540) - 0.5;
      const base = minCeiling + heightVoxels * (0.38 + depthBoost * 0.34);
      const ceiling = base + (n * 1.25 + low * 0.55) * variationVoxels - erosion * heightVoxels * 0.08;
      ceilings[idx] = clamp(Math.round(ceiling), minCeiling, heightVoxels - 1);
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

function smoothAirVolume(air, floorMask, widthVoxels, heightVoxels, depthVoxels, settings) {
  let current = air;
  const clearance = clamp(settings.floorClearance, 1, Math.max(1, heightVoxels - 1));
  for (let pass = 0; pass < settings.smoothing; pass++) {
    const next = new Uint8Array(current);
    for (let z = 0; z < depthVoxels; z++) {
      for (let y = 0; y < heightVoxels; y++) {
        for (let x = 0; x < widthVoxels; x++) {
          const floorIdx = indexFor(x, z, widthVoxels);
          const idx = voxelIndex(x, y, z, widthVoxels, heightVoxels);
          if (floorMask[floorIdx] && y <= clearance) {
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

function createAirVolume(floorMask, signedDistance, ceilings, widthVoxels, heightVoxels, depthVoxels, settings, seedHash) {
  const air = new Uint8Array(widthVoxels * heightVoxels * depthVoxels);
  const scale = Math.max(0.15, settings.noiseScale);
  const erosion = settings.erosion / 100;
  const roughness = settings.sideRoughness / 100;
  const wallBulge = settings.wallBulge / 100;
  const pockets = settings.pocketStrength / 100;
  const asymmetry = settings.asymmetry / 100;
  const clearance = clamp(settings.floorClearance, 1, Math.max(1, heightVoxels - 1));
  const sideRoughnessVoxels = roughness * Math.max(2, widthVoxels * 0.13);
  const bulgeVoxels = wallBulge * Math.max(1.5, widthVoxels * 0.12) * (0.55 + erosion * 0.85);
  const pocketVoxels = pockets * Math.max(1, widthVoxels * 0.08);

  for (let z = 0; z < depthVoxels; z++) {
    for (let y = 0; y < heightVoxels; y++) {
      const h = heightVoxels <= 1 ? 0 : y / (heightVoxels - 1);
      const floorProtect = smoothstep(clearance, clearance + Math.max(2, heightVoxels * 0.18), y);
      const upperBulge = Math.sin(h * Math.PI);
      const ceilingPinch = 1 - smoothstep(0.72, 1, h);

      for (let x = 0; x < widthVoxels; x++) {
        const floorIdx = indexFor(x, z, widthVoxels);
        const idx = voxelIndex(x, y, z, widthVoxels, heightVoxels);
        if (floorMask[floorIdx] && y <= clearance) {
          air[idx] = 1;
          continue;
        }

        const ceiling = ceilings[floorIdx];
        const n1 = fbm3(seedHash, x / (4.6 * scale), y / (3.4 * scale), z / (4.6 * scale), 900);
        const n2 = fbm3(seedHash, x / (2.2 * scale), y / (2.8 * scale), z / (2.2 * scale), 980);
        const lowBias = fbm3(seedHash, x / (13 * scale), y / (8 * scale), z / (12 * scale), 1040);
        const baseAllowance = bulgeVoxels * floorProtect * (0.28 + 0.72 * upperBulge) * ceilingPinch;
        const wallNoise = (n1 * 0.76 + n2 * 0.24) * sideRoughnessVoxels * floorProtect;
        const asymBias = lowBias * asymmetry * Math.max(1, widthVoxels * 0.12) * floorProtect;
        const pocketNoise = fbm3(seedHash, x / (3.8 * scale), y / (3.2 * scale), z / (3.8 * scale), 1120);
        const upperPocket = y > ceiling - Math.max(2, heightVoxels * 0.22) && pocketNoise > 0.15 ? pocketVoxels * (pocketNoise - 0.15) * floorProtect : 0;
        const allowance = baseAllowance + wallNoise + asymBias + upperPocket + erosion * 0.8;
        const ceilingPocket = pocketNoise > 0.38 ? Math.round((pocketNoise - 0.38) * pockets * heightVoxels * 0.28) : 0;

        if (signedDistance[floorIdx] <= allowance && y <= ceiling + ceilingPocket) {
          air[idx] = 1;
        }
      }
    }
  }

  return smoothAirVolume(air, floorMask, widthVoxels, heightVoxels, depthVoxels, settings);
}

export function generateVoxelTunnel(boxInput, settingsInput) {
  const box = normalizeBox(boxInput);
  const settings = normalizeSettings(settingsInput);
  const voxelSize = settings.voxelSize;
  const widthVoxels = Math.max(1, Math.ceil(box.width / voxelSize));
  const depthVoxels = Math.max(1, Math.ceil(box.depth / voxelSize));
  const heightVoxels = Math.max(2, Math.ceil(box.height / voxelSize));

  if (widthVoxels * depthVoxels > MAX_FLOOR_CELLS) {
    return {
      error: `Grid is ${widthVoxels * depthVoxels} floor cells. Increase voxel size or reduce width/depth.`
    };
  }
  if (heightVoxels > MAX_HEIGHT_VOXELS) {
    return {
      error: `Height is ${heightVoxels} voxels. Increase voxel size or reduce height.`
    };
  }

  const seedHash = settings.seed >>> 0;
  const mask = createFloorMask(widthVoxels, depthVoxels, settings, seedHash);
  const signedDistance = createSignedDistance(mask, widthVoxels, depthVoxels);
  const ceilings = createCeilings(mask, signedDistance, widthVoxels, depthVoxels, heightVoxels, settings, seedHash);
  const air = createAirVolume(mask, signedDistance, ceilings, widthVoxels, heightVoxels, depthVoxels, settings, seedHash);
  let carvedCells = 0;
  for (let i = 0; i < mask.length; i++) carvedCells += mask[i] ? 1 : 0;
  let airVoxels = 0;
  for (let i = 0; i < air.length; i++) airVoxels += air[i] ? 1 : 0;

  return {
    box,
    settings,
    seedHash,
    voxelSize,
    widthVoxels,
    heightVoxels,
    depthVoxels,
    originX: box.centerX - widthVoxels * voxelSize / 2,
    originZ: box.centerZ - depthVoxels * voxelSize / 2,
    mask,
    signedDistance,
    ceilings,
    air,
    carvedCells,
    airVoxels
  };
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

  const variation = 0.76 + randomSeeded(layout.seedHash, Math.round(x * 8), Math.round(z * 8), Math.round(y * 19) + type.length * 53) * 0.32;
  const light = clamp(shade * variation, 0.2, 1.08);
  return base.map(channel => clamp(channel * light, 0, 1));
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

function addTopFace(buffers, x0, z0, size, y, type, layout) {
  addQuad(buffers, [
    [x0, y, z0],
    [x0, y, z0 + size],
    [x0 + size, y, z0 + size],
    [x0 + size, y, z0]
  ], [0, 1, 0], colorForFace(type, x0, y, z0, layout));
}

function addFloorFace(buffers, x0, z0, size, layout) {
  addTopFace(buffers, x0, z0, size, 0, 'floor', layout);
}

function addBottomFace(buffers, x0, z0, size, y, layout) {
  addQuad(buffers, [
    [x0, y, z0],
    [x0 + size, y, z0],
    [x0 + size, y, z0 + size],
    [x0, y, z0 + size]
  ], [0, -1, 0], colorForFace('bottom', x0, y, z0, layout));
}

function addCeilingFace(buffers, x0, z0, size, y, layout) {
  addQuad(buffers, [
    [x0, y, z0],
    [x0 + size, y, z0],
    [x0 + size, y, z0 + size],
    [x0, y, z0 + size]
  ], [0, -1, 0], colorForFace('ceiling', x0, y, z0, layout));
}

function addWallFace(buffers, x0, z0, size, y0, dir, layout) {
  const y1 = y0 + size;
  if (dir === 'north') {
    addQuad(buffers, [
      [x0, y0, z0],
      [x0 + size, y0, z0],
      [x0 + size, y1, z0],
      [x0, y1, z0]
    ], [0, 0, 1], colorForFace('wall', x0, y0, z0, layout));
  } else if (dir === 'south') {
    addQuad(buffers, [
      [x0, y0, z0 + size],
      [x0, y1, z0 + size],
      [x0 + size, y1, z0 + size],
      [x0 + size, y0, z0 + size]
    ], [0, 0, -1], colorForFace('wall', x0, y0, z0, layout));
  } else if (dir === 'west') {
    addQuad(buffers, [
      [x0, y0, z0],
      [x0, y1, z0],
      [x0, y1, z0 + size],
      [x0, y0, z0 + size]
    ], [1, 0, 0], colorForFace('wall', x0, y0, z0, layout));
  } else if (dir === 'east') {
    addQuad(buffers, [
      [x0 + size, y0, z0],
      [x0 + size, y0, z0 + size],
      [x0 + size, y1, z0 + size],
      [x0 + size, y1, z0]
    ], [-1, 0, 0], colorForFace('wall', x0, y0, z0, layout));
  }
}

function isAir(layout, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= layout.widthVoxels || y >= layout.heightVoxels || z >= layout.depthVoxels) return false;
  return layout.air[voxelIndex(x, y, z, layout.widthVoxels, layout.heightVoxels)] === 1;
}

function buildVoxelTunnelMesh(THREE, layout) {
  const buffers = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    faceCount: 0
  };
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
          addFloorFace(buffers, x0, z0, size, layout);
          if (layout.settings.capBottom) addBottomFace(buffers, x0, z0, size, bottomY, layout);
        } else if (!isAir(layout, x, y - 1, z)) {
          addTopFace(buffers, x0, z0, size, y0, 'ledge', layout);
        }
        if (!isAir(layout, x, y + 1, z)) addCeilingFace(buffers, x0, z0, size, y0 + size, layout);
        if (!(z === 0 && !layout.settings.capFront) && !isAir(layout, x, y, z - 1)) {
          addWallFace(buffers, x0, z0, size, y0, 'north', layout);
        }
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
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    fog: true,
    side: layout.settings.backfaceCulling ? THREE.FrontSide : THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'voxelized-tunnel';
  return { mesh, geometry, faceCount: buffers.faceCount };
}

function disposeObject(object) {
  if (!object) return;
  object.traverse(item => {
    if (item.geometry) item.geometry.dispose();
    if (item.material) {
      const materials = Array.isArray(item.material) ? item.material : [item.material];
      for (const material of materials) material.dispose();
    }
  });
}

function noopTool() {
  return {
    activate() {},
    resize() {},
    render() {}
  };
}

export function createVoxelizerTool(root, callbacks = {}) {
  if (!root) return noopTool();

  const canvas = root.querySelector('#voxelCanvas');
  if (!canvas) return noopTool();

  const showToast = typeof callbacks.showToast === 'function' ? callbacks.showToast : () => {};
  const status = root.querySelector('#voxelStatus');
  const controls = {
    createBox: root.querySelector('#voxelCreateBox'),
    voxelize: root.querySelector('#voxelizeBtn'),
    randomSeed: root.querySelector('#voxelRandomSeed'),
    centerX: root.querySelector('#voxelCenterX'),
    centerZ: root.querySelector('#voxelCenterZ'),
    width: root.querySelector('#voxelWidth'),
    height: root.querySelector('#voxelHeight'),
    depth: root.querySelector('#voxelDepth'),
    voxelSize: root.querySelector('#voxelSize'),
    seed: root.querySelector('#voxelSeed'),
    erosion: root.querySelector('#voxelErosion'),
    erosionValue: root.querySelector('#voxelErosionValue'),
    floorWidth: root.querySelector('#voxelFloorWidth'),
    floorWidthValue: root.querySelector('#voxelFloorWidthValue'),
    sideRoughness: root.querySelector('#voxelSideRoughness'),
    sideRoughnessValue: root.querySelector('#voxelSideRoughnessValue'),
    ceilingVariation: root.querySelector('#voxelCeilingVariation'),
    ceilingVariationValue: root.querySelector('#voxelCeilingVariationValue'),
    noiseScale: root.querySelector('#voxelNoiseScale'),
    noiseScaleValue: root.querySelector('#voxelNoiseScaleValue'),
    smoothing: root.querySelector('#voxelSmoothing'),
    smoothingValue: root.querySelector('#voxelSmoothingValue'),
    asymmetry: root.querySelector('#voxelAsymmetry'),
    asymmetryValue: root.querySelector('#voxelAsymmetryValue'),
    wallBulge: root.querySelector('#voxelWallBulge'),
    wallBulgeValue: root.querySelector('#voxelWallBulgeValue'),
    pocketStrength: root.querySelector('#voxelPocketStrength'),
    pocketStrengthValue: root.querySelector('#voxelPocketStrengthValue'),
    floorClearance: root.querySelector('#voxelFloorClearance'),
    floorClearanceValue: root.querySelector('#voxelFloorClearanceValue'),
    capFront: root.querySelector('#voxelCapFront'),
    capBottom: root.querySelector('#voxelCapBottom'),
    showBox: root.querySelector('#voxelShowBox'),
    wireOverlay: root.querySelector('#voxelWireOverlay'),
    backfaceCulling: root.querySelector('#voxelBackfaceCulling'),
    floorColor: root.querySelector('#voxelFloorColor'),
    wallColor: root.querySelector('#voxelWallColor'),
    ceilingColor: root.querySelector('#voxelCeilingColor'),
    wireColor: root.querySelector('#voxelWireColor')
  };

  let state = loadState();
  let runtime = null;
  let active = false;
  let resizeFrame = 0;
  let rebuildFrame = 0;
  let rebuildTimer = 0;
  let dragMode = null;
  let lastPointer = { x: 0, y: 0 };
  const view = {
    targetX: 0,
    targetY: state.box.height * 0.42,
    targetZ: 0,
    distance: 44,
    yaw: -0.72,
    pitch: 0.58
  };

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setValue(input, value) {
    if (input) input.value = String(value);
  }

  function setChecked(input, value) {
    if (input) input.checked = !!value;
  }

  function syncOutputs() {
    if (controls.erosionValue) controls.erosionValue.textContent = `${controls.erosion?.value || state.settings.erosion}%`;
    if (controls.floorWidthValue) controls.floorWidthValue.textContent = `${controls.floorWidth?.value || state.settings.floorWidth}%`;
    if (controls.sideRoughnessValue) controls.sideRoughnessValue.textContent = `${controls.sideRoughness?.value || state.settings.sideRoughness}%`;
    if (controls.ceilingVariationValue) controls.ceilingVariationValue.textContent = `${controls.ceilingVariation?.value || state.settings.ceilingVariation}%`;
    if (controls.noiseScaleValue) controls.noiseScaleValue.textContent = Number(controls.noiseScale?.value || state.settings.noiseScale).toFixed(2);
    if (controls.smoothingValue) controls.smoothingValue.textContent = `${controls.smoothing?.value || state.settings.smoothing}`;
    if (controls.asymmetryValue) controls.asymmetryValue.textContent = `${controls.asymmetry?.value || state.settings.asymmetry}%`;
    if (controls.wallBulgeValue) controls.wallBulgeValue.textContent = `${controls.wallBulge?.value || state.settings.wallBulge}%`;
    if (controls.pocketStrengthValue) controls.pocketStrengthValue.textContent = `${controls.pocketStrength?.value || state.settings.pocketStrength}%`;
    if (controls.floorClearanceValue) controls.floorClearanceValue.textContent = `${controls.floorClearance?.value || state.settings.floorClearance}`;
  }

  function setupTooltips() {
    for (const [id, tooltip] of Object.entries(CONTROL_TOOLTIPS)) {
      const element = root.querySelector(`#${id}`);
      if (!element) continue;
      element.title = tooltip;
      element.setAttribute('aria-description', tooltip);
      const label = root.querySelector(`label[for="${id}"]`);
      if (label) label.title = tooltip;
    }
  }

  function syncControls() {
    const { box, settings } = state;
    setValue(controls.centerX, box.centerX);
    setValue(controls.centerZ, box.centerZ);
    setValue(controls.width, box.width);
    setValue(controls.height, box.height);
    setValue(controls.depth, box.depth);
    setValue(controls.voxelSize, settings.voxelSize);
    setValue(controls.seed, settings.seed);
    setValue(controls.erosion, settings.erosion);
    setValue(controls.floorWidth, settings.floorWidth);
    setValue(controls.sideRoughness, settings.sideRoughness);
    setValue(controls.ceilingVariation, settings.ceilingVariation);
    setValue(controls.noiseScale, settings.noiseScale);
    setValue(controls.smoothing, settings.smoothing);
    setValue(controls.asymmetry, settings.asymmetry);
    setValue(controls.wallBulge, settings.wallBulge);
    setValue(controls.pocketStrength, settings.pocketStrength);
    setValue(controls.floorClearance, settings.floorClearance);
    setChecked(controls.capFront, settings.capFront);
    setChecked(controls.capBottom, settings.capBottom);
    setChecked(controls.showBox, settings.showBox);
    setChecked(controls.wireOverlay, settings.wireOverlay);
    setChecked(controls.backfaceCulling, settings.backfaceCulling);
    setValue(controls.floorColor, settings.floorColor);
    setValue(controls.wallColor, settings.wallColor);
    setValue(controls.ceilingColor, settings.ceilingColor);
    setValue(controls.wireColor, settings.wireColor);
    syncOutputs();
  }

  function readStateFromControls() {
    state = normalizeState({
      box: {
        centerX: controls.centerX?.value,
        centerZ: controls.centerZ?.value,
        width: controls.width?.value,
        height: controls.height?.value,
        depth: controls.depth?.value
      },
      settings: {
        voxelSize: controls.voxelSize?.value,
        seed: controls.seed?.value,
        erosion: controls.erosion?.value,
        floorWidth: controls.floorWidth?.value,
        sideRoughness: controls.sideRoughness?.value,
        ceilingVariation: controls.ceilingVariation?.value,
        noiseScale: controls.noiseScale?.value,
        smoothing: controls.smoothing?.value,
        asymmetry: controls.asymmetry?.value,
        wallBulge: controls.wallBulge?.value,
        pocketStrength: controls.pocketStrength?.value,
        floorClearance: controls.floorClearance?.value,
        capFront: controls.capFront?.checked,
        capBottom: controls.capBottom?.checked,
        showBox: controls.showBox?.checked,
        wireOverlay: controls.wireOverlay?.checked,
        backfaceCulling: controls.backfaceCulling?.checked,
        floorColor: controls.floorColor?.value,
        wallColor: controls.wallColor?.value,
        ceilingColor: controls.ceilingColor?.value,
        wireColor: controls.wireColor?.value
      }
    });
    syncControls();
    saveState(state);
    return state;
  }

  function updateCamera() {
    if (!runtime) return;
    const { THREE, camera } = runtime;
    const target = new THREE.Vector3(view.targetX, view.targetY, view.targetZ);
    const cp = Math.cos(view.pitch);
    camera.position.set(
      target.x + Math.sin(view.yaw) * cp * view.distance,
      target.y + Math.sin(view.pitch) * view.distance,
      target.z + Math.cos(view.yaw) * cp * view.distance
    );
    camera.lookAt(target);
  }

  function render() {
    if (!runtime) return;
    updateCamera();
    runtime.renderer.render(runtime.scene, runtime.camera);
  }

  function resize() {
    if (!runtime) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    runtime.renderer.setSize(width, height, false);
    runtime.camera.aspect = width / height;
    runtime.camera.updateProjectionMatrix();
    render();
  }

  function scheduleResize() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(resize);
  }

  async function ensureRuntime() {
    if (runtime) return runtime;

    const THREE = await import(THREE_MODULE_URL);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x111214, 1);
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111214);
    scene.fog = new THREE.Fog(0x111214, 76, 190);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 1200);

    const grid = new THREE.GridHelper(140, 140, 0x5b5e66, 0x303238);
    grid.material.transparent = true;
    grid.material.opacity = 0.48;
    scene.add(grid);

    scene.add(new THREE.AmbientLight(0x859080, 0.34));
    const keyLight = new THREE.DirectionalLight(0xf4ead2, 2.6);
    keyLight.position.set(-16, 28, 18);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8cc2cf, 0.56);
    fillLight.position.set(18, 12, -26);
    scene.add(fillLight);

    runtime = {
      THREE,
      renderer,
      scene,
      camera,
      terrain: null,
      wire: null,
      boxHelper: null,
      lastLayout: null,
      faceCount: 0
    };
    updateBoxHelper();
    resize();
    return runtime;
  }

  function disposeRuntimeObject(name) {
    if (!runtime?.[name]) return;
    runtime.scene.remove(runtime[name]);
    disposeObject(runtime[name]);
    runtime[name] = null;
  }

  function updateBoxHelper() {
    if (!runtime) return;
    disposeRuntimeObject('boxHelper');
    if (!state.settings.showBox) {
      render();
      return;
    }

    const { THREE } = runtime;
    const { box } = state;
    const geometry = new THREE.BoxGeometry(box.width, box.height, box.depth);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    const material = new THREE.LineBasicMaterial({
      color: state.settings.wireColor,
      transparent: true,
      opacity: 0.86
    });
    const helper = new THREE.LineSegments(edges, material);
    helper.name = 'voxelizer-box';
    helper.position.set(box.centerX, box.height / 2, box.centerZ);
    runtime.boxHelper = helper;
    runtime.scene.add(helper);
    render();
  }

  function updateWireVisibility() {
    if (runtime?.wire) runtime.wire.visible = state.settings.wireOverlay;
  }

  function clearRebuildTimers() {
    window.clearTimeout(rebuildTimer);
    window.cancelAnimationFrame(rebuildFrame);
  }

  function scheduleVoxelize(delay = 120) {
    clearRebuildTimers();
    rebuildTimer = window.setTimeout(() => {
      rebuildFrame = window.requestAnimationFrame(() => {
        voxelize({ preserveView: true, quiet: true });
      });
    }, delay);
  }

  async function voxelize(options = {}) {
    const preserveView = !!options.preserveView;
    const quiet = !!options.quiet;
    readStateFromControls();
    try {
      await ensureRuntime();
    } catch (error) {
      console.error(error);
      setStatus('Three.js failed to load.');
      if (!quiet) showToast('Three.js failed to load');
      return;
    }

    const layout = generateVoxelTunnel(state.box, state.settings);
    if (layout.error) {
      setStatus(layout.error);
      if (!quiet) showToast('Voxel grid limit hit');
      return;
    }

    disposeRuntimeObject('terrain');
    disposeRuntimeObject('wire');
    const terrain = buildVoxelTunnelMesh(runtime.THREE, layout);
    runtime.terrain = terrain.mesh;
    runtime.faceCount = terrain.faceCount;
    runtime.lastLayout = layout;
    runtime.scene.add(runtime.terrain);

    if (state.settings.wireOverlay) {
      const wireGeometry = new runtime.THREE.WireframeGeometry(terrain.geometry);
      const wireMaterial = new runtime.THREE.LineBasicMaterial({
        color: state.settings.wireColor,
        transparent: true,
        opacity: 0.18
      });
      runtime.wire = new runtime.THREE.LineSegments(wireGeometry, wireMaterial);
      runtime.wire.name = 'voxelizer-wire';
      runtime.scene.add(runtime.wire);
    }

    if (!preserveView) {
      view.targetX = state.box.centerX;
      view.targetY = Math.max(1.5, state.box.height * 0.42);
      view.targetZ = state.box.centerZ;
      view.distance = clamp(Math.max(state.box.width, state.box.depth, state.box.height) * 1.75, 12, 220);
    }
    updateBoxHelper();
    setStatus(`${layout.widthVoxels} x ${layout.heightVoxels} x ${layout.depthVoxels} voxels, ${layout.carvedCells} floor cells, ${layout.airVoxels} air voxels, ${terrain.faceCount} faces, seed ${layout.settings.seed}`);
    render();
  }

  function resetBox() {
    state.box = { ...DEFAULT_BOX };
    state = normalizeState(state);
    syncControls();
    saveState(state);
    disposeRuntimeObject('terrain');
    disposeRuntimeObject('wire');
    view.targetX = state.box.centerX;
    view.targetY = state.box.height * 0.42;
    view.targetZ = state.box.centerZ;
    updateBoxHelper();
    setStatus('Default box created.');
    scheduleVoxelize(0);
    render();
  }

  function randomizeSeed() {
    state.settings.seed = createSeedValue();
    syncControls();
    saveState(state);
    setStatus(`Seed randomized to ${state.settings.seed}.`);
    showToast('Voxel seed randomized');
    scheduleVoxelize(0);
  }

  function handleControlChange(kind) {
    readStateFromControls();
    if (kind === 'box' || kind === 'display') updateBoxHelper();
    if (kind === 'display') updateWireVisibility();
    setStatus('Updating voxel preview...');
    if (kind === 'display') scheduleVoxelize(0);
    else scheduleVoxelize(kind === 'box' ? 180 : 90);
    render();
  }

  function panView(dx, dy) {
    if (!runtime) return;
    const { THREE, camera } = runtime;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const scale = view.distance / Math.max(1, Math.max(canvas.clientWidth, canvas.clientHeight)) * 1.75;
    view.targetX += (-dx * right.x + dy * up.x) * scale;
    view.targetY += (-dx * right.y + dy * up.y) * scale;
    view.targetZ += (-dx * right.z + dy * up.z) * scale;
  }

  function bindEvents() {
    controls.createBox?.addEventListener('click', resetBox);
    controls.voxelize?.addEventListener('click', voxelize);
    controls.randomSeed?.addEventListener('click', randomizeSeed);

    for (const control of [controls.centerX, controls.centerZ, controls.width, controls.height, controls.depth, controls.voxelSize]) {
      control?.addEventListener('change', () => handleControlChange('box'));
    }

    for (const control of [
      controls.seed,
      controls.erosion,
      controls.floorWidth,
      controls.sideRoughness,
      controls.ceilingVariation,
      controls.noiseScale,
      controls.smoothing,
      controls.asymmetry,
      controls.wallBulge,
      controls.pocketStrength,
      controls.floorClearance,
      controls.capFront,
      controls.capBottom,
      controls.backfaceCulling,
      controls.floorColor,
      controls.wallColor,
      controls.ceilingColor,
      controls.wireColor
    ]) {
      const eventName = control?.type === 'range' ? 'input' : 'change';
      control?.addEventListener(eventName, () => handleControlChange('settings'));
      if (control?.type === 'color') {
        control.addEventListener('input', () => handleControlChange('settings'));
      }
    }

    for (const control of [controls.showBox, controls.wireOverlay]) {
      control?.addEventListener('change', () => handleControlChange('display'));
    }

    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 1) return;
      dragMode = event.shiftKey ? 'pan' : 'orbit';
      lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = dragMode === 'pan' ? 'grabbing' : 'move';
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', event => {
      if (!dragMode) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      if (dragMode === 'pan') {
        panView(dx, dy);
      } else {
        view.yaw -= dx * 0.006;
        view.pitch = clamp(view.pitch + dy * 0.006, -0.32, 1.35);
      }
      render();
      event.preventDefault();
    });

    canvas.addEventListener('pointerup', event => {
      dragMode = null;
      canvas.style.cursor = 'default';
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointerleave', () => {
      dragMode = null;
      canvas.style.cursor = 'default';
    });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('auxclick', event => {
      if (event.button === 1) event.preventDefault();
    });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1.1 : 0.9;
      view.distance = clamp(view.distance * factor, 4, 420);
      render();
    }, { passive: false });

    window.addEventListener('resize', scheduleResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(scheduleResize);
      observer.observe(canvas.parentElement || canvas);
    }
  }

  async function activate() {
    active = true;
    try {
      await ensureRuntime();
      resize();
      if (!runtime.terrain) await voxelize();
      render();
    } catch (error) {
      console.error(error);
      setStatus('Three.js failed to load.');
    }
  }

  syncControls();
  setupTooltips();
  bindEvents();
  setStatus('Voxel tool ready.');

  return {
    activate,
    resize: scheduleResize,
    render: () => {
      if (active) render();
    }
  };
}
