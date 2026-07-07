import {
  DIR,
  DIR_DATA,
  countBits,
  hasDir,
  keyFor,
  validateMaskMap
} from '../core/dungeon.js';

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

export function createPlay3d(elements, callbacks) {
  const {
    playOverlay,
    playCanvas,
    minimapCanvas,
    lockPlayBtn,
    playStatus
  } = elements;
  const {
    getMaskMap,
    getPlacedSize,
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
      player: { x: 0, z: 0, yaw: 0, pitch: 0 },
      map: null,
      walkableVoxels: null,
      torchLight: null,
      playerMarker: null,
      minimapData: null,
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
    runtime.discoveredVoxels.clear();
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

  function yawForDir(dir) {
    switch (dir) {
      case DIR.E: return -Math.PI / 2;
      case DIR.S: return Math.PI;
      case DIR.W: return Math.PI / 2;
      default: return 0;
    }
  }

  function firstOpenDir(mask) {
    for (const info of DIR_DATA) {
      if (hasDir(mask, info.dir)) return info.dir;
    }
    return DIR.N;
  }

  function buildPlayScene(runtime, maskMap, validation) {
    const { THREE } = runtime;
    disposePlayScene(runtime);
    runtime.map = maskMap;
    runtime.scene.background = new THREE.Color(0x020202);
    runtime.scene.fog = new THREE.Fog(0x020202, 9, 34);

    const caveLayout = createCaveLayout(maskMap);
    const terrain = buildVoxelCaveMesh(THREE, caveLayout);
    runtime.walkableVoxels = caveLayout.walkableVoxels;
    runtime.scene.add(terrain.mesh);

    runtime.minimapScene.background = new THREE.Color(0x000000);
    runtime.minimapData = buildMinimapMesh(THREE, caveLayout);
    runtime.minimapScene.add(runtime.minimapData.mesh);
    runtime.playerMarker = createPlayerMarker(THREE);
    runtime.minimapScene.add(runtime.playerMarker);

    while (runtime.camera.children.length) runtime.camera.remove(runtime.camera.children[0]);
    runtime.scene.add(runtime.camera);

    const ambient = new THREE.AmbientLight(0x101414, 0.035);
    runtime.scene.add(ambient);

    runtime.torchLight = new THREE.PointLight(0xff8a38, 6.2, 16.5, 2.0);
    runtime.torchLight.position.set(0, -0.18, 0.1);
    runtime.camera.add(runtime.torchLight);

    const start = maskMap.get(keyFor(0, 0)) || maskMap.values().next().value;
    runtime.player.x = start.x * PLAY_TILE_SIZE;
    runtime.player.z = start.y * PLAY_TILE_SIZE;
    runtime.player.yaw = yawForDir(firstOpenDir(start.mask));
    runtime.player.pitch = 0;
    runtime.camera.rotation.order = 'YXZ';
    updatePlayCamera(runtime);
    revealMinimapArea(runtime);
    playSceneLabel = `Voxel Cave - ${validation.cells} cells, ${terrain.faceCount} faces`;
    playStatus.textContent = playSceneLabel;
  }

  function canStandOnVoxel(runtime, x, z) {
    if (!runtime.walkableVoxels) return true;
    return runtime.walkableVoxels.has(voxelKey(Math.floor(x), Math.floor(z)));
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
    return true;
  }

  function movePlayPlayer(runtime, dx, dz) {
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

    if (moveX || moveZ) {
      const length = Math.hypot(moveX, moveZ) || 1;
      moveX /= length;
      moveZ /= length;
      const speed = (playKeys.has('ShiftLeft') || playKeys.has('ShiftRight')) ? 7.2 : 4.4;
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
    if (runtime.torchLight) {
      const flicker = Math.sin(time * 0.018) * 0.22 + Math.sin(time * 0.041) * 0.12;
      runtime.torchLight.intensity = 6.1 + flicker;
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
    const maskMap = getMaskMap();
    const validation = validateMaskMap(maskMap);
    setValidationResult(validation);
    if (!validation.valid) {
      showToast(getPlacedSize() ? 'Fix invalid sections before Play' : 'Generate or place a dungeon first');
      return;
    }

    try {
      const runtime = await ensurePlayRuntime();
      playOverlay.classList.add('active');
      playOverlay.setAttribute('aria-hidden', 'false');
      playActive = true;
      playKeys.clear();
      buildPlayScene(runtime, maskMap, validation);
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

  return {
    get active() {
      return playActive;
    },
    handleKeyDown,
    handleKeyUp,
    handlePointerMove,
    requestPointerLock,
    resize: resizePlayRenderer,
    start,
    stop,
    updateLockState
  };
}
