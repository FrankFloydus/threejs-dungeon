import {
  DEFAULT_VOXEL_DUNGEON_SETTINGS,
  buildVoxelDungeonMesh,
  deleteVoxelTextureAsset,
  generateVoxelDungeonLayout,
  loadVoxelTextureAsset,
  normalizeVoxelDungeonSettings,
  saveVoxelTextureAsset
} from '../core/voxel-dungeon.js?v=organic-cave-2';

const THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
const STORAGE_KEY = 'dungeon-tunnels-voxelizer-v3';

const CONTROL_TOOLTIPS = {
  voxelLevelSize: 'Scales the procedural graph before voxelization.',
  voxelMainPathLength: 'Controls how long the primary cave route grows from the start.',
  voxelBranchCount: 'Adds side paths from the main route.',
  voxelBranchDepth: 'Controls the average length of each side branch.',
  voxelDeadEndChance: 'Increases the chance that branches stop early instead of continuing.',
  voxelLoopChance: 'Connects nearby tunnel cells to create alternate routes.',
  voxelChamberChance: 'Turns endpoints and junctions into larger cave chambers.',
  voxelChamberSize: 'Controls the radius of generated chambers.',
  voxelHeight: 'Sets the maximum cave height. The floor stays fixed at Y=0.',
  voxelVoxelSize: 'Controls voxel resolution. Smaller values create more blocks and more detail.',
  voxelSeed: 'Deterministic integer seed for the cave shape.',
  voxelErosion: 'Raises the carving threshold and breaks away more side and ceiling material.',
  voxelFloorWidth: 'Preserves a wider or narrower navigable tunnel spine.',
  voxelSideRoughness: 'Adds side pockets, jagged edges, and width variation around the spine.',
  voxelCeilingVariation: 'Varies local ceiling height to avoid flat rectangular roofs.',
  voxelAsymmetry: 'Offsets tunnels and side chambers so both sides do not match.',
  voxelWallBulge: 'Pushes side walls outward more strongly at middle heights.',
  voxelPocketStrength: 'Adds noisy upper-wall and ceiling pockets.',
  voxelFloorClearance: 'Protects lower voxel layers from aggressive side erosion.',
  voxelNoiseScale: 'Controls feature scale. Lower values make tighter noisy details.',
  voxelSmoothing: 'Runs cellular-automata cleanup passes.',
  voxelCapBottom: 'Adds underside faces below the floor shell.',
  voxelShowBox: 'Shows the generated dungeon bounds.',
  voxelWireOverlay: 'Draws a transparent wireframe over the generated cave mesh.',
  voxelBackfaceCulling: 'When enabled, hidden back faces are culled.',
  voxelUseTexture: 'Uses the imported block texture instead of vertex colors.',
  voxelTextureFile: 'Imports a local PNG, JPG, or WebP block texture into browser storage.',
  voxelUvScaleX: 'Controls horizontal texture tiling.',
  voxelUvScaleY: 'Controls vertical texture tiling.',
  voxelUvRotation: 'Rotates generated UVs in 90 degree steps.',
  voxelPixelated: 'Uses nearest-neighbor filtering for crisp voxel-style textures.',
  voxelFloorColor: 'Base vertex color for floor voxels when texture is disabled.',
  voxelWallColor: 'Base vertex color for side wall voxels when texture is disabled.',
  voxelCeilingColor: 'Base vertex color for ceiling voxels when texture is disabled.',
  voxelWireColor: 'Color of the bounding box and generated wire overlay.'
};

function noopTool() {
  return {
    activate() {},
    resize() {},
    render() {},
    getPlayState: async () => null
  };
}

function createSeedValue() {
  return Math.max(1, Math.floor(Math.random() * 2147483646));
}

function loadState(storage = window.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return normalizeVoxelDungeonSettings(DEFAULT_VOXEL_DUNGEON_SETTINGS);
    return normalizeVoxelDungeonSettings(JSON.parse(raw));
  } catch (_) {
    return normalizeVoxelDungeonSettings(DEFAULT_VOXEL_DUNGEON_SETTINGS);
  }
}

function saveState(settings, storage = window.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeVoxelDungeonSettings(settings)));
  } catch (_) {}
}

function setValue(input, value) {
  if (input) input.value = String(value);
}

function setChecked(input, value) {
  if (input) input.checked = !!value;
}

function disposeObject(object) {
  if (!object) return;
  object.traverse(item => {
    if (item.geometry) item.geometry.dispose();
    if (item.material) {
      const materials = Array.isArray(item.material) ? item.material : [item.material];
      for (const material of materials) {
        if (material.map) material.map.dispose();
        material.dispose();
      }
    }
  });
}

export function createVoxelizerTool(root, callbacks = {}) {
  if (!root) return noopTool();
  const canvas = root.querySelector('#voxelCanvas');
  if (!canvas) return noopTool();

  const showToast = typeof callbacks.showToast === 'function' ? callbacks.showToast : () => {};
  const status = root.querySelector('#voxelStatus');
  const controls = {
    generate: root.querySelector('#voxelizeBtn'),
    randomSeed: root.querySelector('#voxelRandomSeed'),
    levelSize: root.querySelector('#voxelLevelSize'),
    mainPathLength: root.querySelector('#voxelMainPathLength'),
    mainPathLengthValue: root.querySelector('#voxelMainPathLengthValue'),
    branchCount: root.querySelector('#voxelBranchCount'),
    branchCountValue: root.querySelector('#voxelBranchCountValue'),
    branchDepth: root.querySelector('#voxelBranchDepth'),
    branchDepthValue: root.querySelector('#voxelBranchDepthValue'),
    deadEndChance: root.querySelector('#voxelDeadEndChance'),
    deadEndChanceValue: root.querySelector('#voxelDeadEndChanceValue'),
    loopChance: root.querySelector('#voxelLoopChance'),
    loopChanceValue: root.querySelector('#voxelLoopChanceValue'),
    chamberChance: root.querySelector('#voxelChamberChance'),
    chamberChanceValue: root.querySelector('#voxelChamberChanceValue'),
    chamberSize: root.querySelector('#voxelChamberSize'),
    chamberSizeValue: root.querySelector('#voxelChamberSizeValue'),
    height: root.querySelector('#voxelHeight'),
    voxelSize: root.querySelector('#voxelVoxelSize'),
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
    capBottom: root.querySelector('#voxelCapBottom'),
    showBox: root.querySelector('#voxelShowBox'),
    wireOverlay: root.querySelector('#voxelWireOverlay'),
    backfaceCulling: root.querySelector('#voxelBackfaceCulling'),
    useTexture: root.querySelector('#voxelUseTexture'),
    textureFile: root.querySelector('#voxelTextureFile'),
    textureName: root.querySelector('#voxelTextureName'),
    clearTexture: root.querySelector('#voxelClearTexture'),
    uvScaleX: root.querySelector('#voxelUvScaleX'),
    uvScaleY: root.querySelector('#voxelUvScaleY'),
    uvRotation: root.querySelector('#voxelUvRotation'),
    pixelated: root.querySelector('#voxelPixelated'),
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
  let textureAsset = null;
  const textureCache = new Map();
  const view = {
    targetX: 0,
    targetY: state.height * 0.42,
    targetZ: 0,
    distance: 88,
    yaw: -0.72,
    pitch: 0.58
  };

  function setStatus(message) {
    if (status) status.textContent = message;
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

  function syncOutputs() {
    const pct = (control, fallback) => `${control?.value || fallback}%`;
    if (controls.mainPathLengthValue) controls.mainPathLengthValue.textContent = `${controls.mainPathLength?.value || state.mainPathLength}`;
    if (controls.branchCountValue) controls.branchCountValue.textContent = `${controls.branchCount?.value || state.branchCount}`;
    if (controls.branchDepthValue) controls.branchDepthValue.textContent = `${controls.branchDepth?.value || state.branchDepth}`;
    if (controls.deadEndChanceValue) controls.deadEndChanceValue.textContent = pct(controls.deadEndChance, state.deadEndChance);
    if (controls.loopChanceValue) controls.loopChanceValue.textContent = pct(controls.loopChance, state.loopChance);
    if (controls.chamberChanceValue) controls.chamberChanceValue.textContent = pct(controls.chamberChance, state.chamberChance);
    if (controls.chamberSizeValue) controls.chamberSizeValue.textContent = Number(controls.chamberSize?.value || state.chamberSize).toFixed(1);
    if (controls.erosionValue) controls.erosionValue.textContent = pct(controls.erosion, state.erosion);
    if (controls.floorWidthValue) controls.floorWidthValue.textContent = pct(controls.floorWidth, state.floorWidth);
    if (controls.sideRoughnessValue) controls.sideRoughnessValue.textContent = pct(controls.sideRoughness, state.sideRoughness);
    if (controls.ceilingVariationValue) controls.ceilingVariationValue.textContent = pct(controls.ceilingVariation, state.ceilingVariation);
    if (controls.noiseScaleValue) controls.noiseScaleValue.textContent = Number(controls.noiseScale?.value || state.noiseScale).toFixed(2);
    if (controls.smoothingValue) controls.smoothingValue.textContent = `${controls.smoothing?.value || state.smoothing}`;
    if (controls.asymmetryValue) controls.asymmetryValue.textContent = pct(controls.asymmetry, state.asymmetry);
    if (controls.wallBulgeValue) controls.wallBulgeValue.textContent = pct(controls.wallBulge, state.wallBulge);
    if (controls.pocketStrengthValue) controls.pocketStrengthValue.textContent = pct(controls.pocketStrength, state.pocketStrength);
    if (controls.floorClearanceValue) controls.floorClearanceValue.textContent = `${controls.floorClearance?.value || state.floorClearance}`;
    if (controls.textureName) controls.textureName.textContent = state.textureName || 'No texture loaded';
  }

  function syncControls() {
    setValue(controls.levelSize, state.levelSize);
    setValue(controls.mainPathLength, state.mainPathLength);
    setValue(controls.branchCount, state.branchCount);
    setValue(controls.branchDepth, state.branchDepth);
    setValue(controls.deadEndChance, state.deadEndChance);
    setValue(controls.loopChance, state.loopChance);
    setValue(controls.chamberChance, state.chamberChance);
    setValue(controls.chamberSize, state.chamberSize);
    setValue(controls.height, state.height);
    setValue(controls.voxelSize, state.voxelSize);
    setValue(controls.seed, state.seed);
    setValue(controls.erosion, state.erosion);
    setValue(controls.floorWidth, state.floorWidth);
    setValue(controls.sideRoughness, state.sideRoughness);
    setValue(controls.ceilingVariation, state.ceilingVariation);
    setValue(controls.noiseScale, state.noiseScale);
    setValue(controls.smoothing, state.smoothing);
    setValue(controls.asymmetry, state.asymmetry);
    setValue(controls.wallBulge, state.wallBulge);
    setValue(controls.pocketStrength, state.pocketStrength);
    setValue(controls.floorClearance, state.floorClearance);
    setChecked(controls.capBottom, state.capBottom);
    setChecked(controls.showBox, state.showBox);
    setChecked(controls.wireOverlay, state.wireOverlay);
    setChecked(controls.backfaceCulling, state.backfaceCulling);
    setChecked(controls.useTexture, state.useTexture);
    setValue(controls.uvScaleX, state.uvScaleX);
    setValue(controls.uvScaleY, state.uvScaleY);
    setValue(controls.uvRotation, state.uvRotation);
    setChecked(controls.pixelated, state.pixelated);
    setValue(controls.floorColor, state.floorColor);
    setValue(controls.wallColor, state.wallColor);
    setValue(controls.ceilingColor, state.ceilingColor);
    setValue(controls.wireColor, state.wireColor);
    syncOutputs();
  }

  function readStateFromControls() {
    state = normalizeVoxelDungeonSettings({
      levelSize: controls.levelSize?.value,
      mainPathLength: controls.mainPathLength?.value,
      branchCount: controls.branchCount?.value,
      branchDepth: controls.branchDepth?.value,
      deadEndChance: controls.deadEndChance?.value,
      loopChance: controls.loopChance?.value,
      chamberChance: controls.chamberChance?.value,
      chamberSize: controls.chamberSize?.value,
      height: controls.height?.value,
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
      capBottom: controls.capBottom?.checked,
      showBox: controls.showBox?.checked,
      wireOverlay: controls.wireOverlay?.checked,
      backfaceCulling: controls.backfaceCulling?.checked,
      useTexture: controls.useTexture?.checked,
      textureId: state.textureId,
      textureName: state.textureName,
      uvScaleX: controls.uvScaleX?.value,
      uvScaleY: controls.uvScaleY?.value,
      uvRotation: controls.uvRotation?.value,
      pixelated: controls.pixelated?.checked,
      floorColor: controls.floorColor?.value,
      wallColor: controls.wallColor?.value,
      ceilingColor: controls.ceilingColor?.value,
      wireColor: controls.wireColor?.value
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
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x111214, 1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111214);
    scene.fog = new THREE.Fog(0x111214, 86, 230);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 1600);
    const grid = new THREE.GridHelper(240, 240, 0x5b5e66, 0x303238);
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
    scene.add(grid);
    scene.add(new THREE.AmbientLight(0x859080, 0.34));
    const keyLight = new THREE.DirectionalLight(0xf4ead2, 2.6);
    keyLight.position.set(-16, 28, 18);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8cc2cf, 0.56);
    fillLight.position.set(18, 12, -26);
    scene.add(fillLight);
    runtime = { THREE, renderer, scene, camera, terrain: null, wire: null, boxHelper: null, lastLayout: null, faceCount: 0 };
    resize();
    return runtime;
  }

  function disposeRuntimeObject(name) {
    if (!runtime?.[name]) return;
    runtime.scene.remove(runtime[name]);
    disposeObject(runtime[name]);
    runtime[name] = null;
  }

  async function ensureTexture(THREE) {
    if (!state.useTexture || !state.textureId) return null;
    const record = textureAsset?.id === state.textureId ? textureAsset : await loadVoxelTextureAsset(state.textureId);
    textureAsset = record;
    if (!record?.dataUrl) return null;
    const cacheKey = `${record.id}:${state.pixelated}`;
    if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
    const texture = await new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(record.dataUrl, resolve, undefined, reject);
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = state.pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = state.pixelated ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    textureCache.set(cacheKey, texture);
    return texture;
  }

  function updateBoxHelper(layout) {
    if (!runtime) return;
    disposeRuntimeObject('boxHelper');
    if (!state.showBox || !layout) {
      render();
      return;
    }
    const { THREE } = runtime;
    const width = layout.widthVoxels * layout.voxelSize;
    const height = layout.heightVoxels * layout.voxelSize;
    const depth = layout.depthVoxels * layout.voxelSize;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    const material = new THREE.LineBasicMaterial({ color: state.wireColor, transparent: true, opacity: 0.86 });
    const helper = new THREE.LineSegments(edges, material);
    helper.name = 'voxelizer-box';
    helper.position.set(layout.originX + width / 2, height / 2, layout.originZ + depth / 2);
    runtime.boxHelper = helper;
    runtime.scene.add(helper);
  }

  function clearRebuildTimers() {
    window.clearTimeout(rebuildTimer);
    window.cancelAnimationFrame(rebuildFrame);
  }

  function scheduleGenerate(delay = 120) {
    clearRebuildTimers();
    rebuildTimer = window.setTimeout(() => {
      rebuildFrame = window.requestAnimationFrame(() => {
        generate({ preserveView: true, quiet: true });
      });
    }, delay);
  }

  function statusForLayout(layout, terrain) {
    return `${layout.widthVoxels} x ${layout.heightVoxels} x ${layout.depthVoxels} voxels, ${layout.branches} branches, ${layout.deadEnds} dead ends, ${layout.loops} loops, ${layout.chambers} chambers, ${layout.airVoxels} air voxels, ${terrain.faceCount} faces, seed ${layout.settings.seed}`;
  }

  async function generate(options = {}) {
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
    const layout = generateVoxelDungeonLayout(state);
    if (layout.error) {
      setStatus(layout.error);
      if (!quiet) showToast('Voxel grid limit hit');
      return;
    }
    disposeRuntimeObject('terrain');
    disposeRuntimeObject('wire');
    const texture = await ensureTexture(runtime.THREE);
    const terrain = buildVoxelDungeonMesh(runtime.THREE, layout, { texture });
    runtime.terrain = terrain.mesh;
    runtime.faceCount = terrain.faceCount;
    runtime.lastLayout = layout;
    runtime.scene.add(runtime.terrain);
    if (state.wireOverlay) {
      const wireGeometry = new runtime.THREE.WireframeGeometry(terrain.geometry);
      const wireMaterial = new runtime.THREE.LineBasicMaterial({ color: state.wireColor, transparent: true, opacity: 0.16 });
      runtime.wire = new runtime.THREE.LineSegments(wireGeometry, wireMaterial);
      runtime.wire.name = 'voxelizer-wire';
      runtime.scene.add(runtime.wire);
    }
    updateBoxHelper(layout);
    if (!preserveView) {
      const width = layout.widthVoxels * layout.voxelSize;
      const depth = layout.depthVoxels * layout.voxelSize;
      const height = layout.heightVoxels * layout.voxelSize;
      view.targetX = layout.originX + width / 2;
      view.targetY = Math.max(1.5, height * 0.42);
      view.targetZ = layout.originZ + depth / 2;
      view.distance = Math.max(18, Math.min(190, Math.max(width, depth, height) * 0.92));
    }
    setStatus(statusForLayout(layout, terrain));
    render();
  }

  function randomizeSeed() {
    state.seed = createSeedValue();
    syncControls();
    saveState(state);
    setStatus(`Seed randomized to ${state.seed}.`);
    showToast('Voxel seed randomized');
    scheduleGenerate(0);
  }

  function handleControlChange(kind) {
    readStateFromControls();
    setStatus('Updating procedural cave...');
    scheduleGenerate(kind === 'layout' ? 160 : 80);
    render();
  }

  async function importTexture(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const record = await saveVoxelTextureAsset(file);
      state.textureId = record.id;
      state.textureName = record.name;
      state.useTexture = true;
      textureAsset = record;
      syncControls();
      saveState(state);
      showToast('Texture imported');
      scheduleGenerate(0);
    } catch (error) {
      console.error(error);
      showToast('Texture import failed');
    } finally {
      if (controls.textureFile) controls.textureFile.value = '';
    }
  }

  async function clearTexture() {
    const id = state.textureId;
    state.textureId = '';
    state.textureName = '';
    state.useTexture = false;
    textureAsset = null;
    syncControls();
    saveState(state);
    if (id) {
      try { await deleteVoxelTextureAsset(id); } catch (_) {}
    }
    showToast('Texture cleared');
    scheduleGenerate(0);
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
    controls.generate?.addEventListener('click', () => generate({ preserveView: false }));
    controls.randomSeed?.addEventListener('click', randomizeSeed);
    controls.textureFile?.addEventListener('change', importTexture);
    controls.clearTexture?.addEventListener('click', clearTexture);

    for (const control of [
      controls.levelSize,
      controls.mainPathLength,
      controls.branchCount,
      controls.branchDepth,
      controls.deadEndChance,
      controls.loopChance,
      controls.chamberChance,
      controls.chamberSize,
      controls.height,
      controls.voxelSize,
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
      controls.capBottom,
      controls.backfaceCulling,
      controls.useTexture,
      controls.uvScaleX,
      controls.uvScaleY,
      controls.uvRotation,
      controls.pixelated,
      controls.floorColor,
      controls.wallColor,
      controls.ceilingColor,
      controls.wireColor
    ]) {
      const eventName = control?.type === 'range' ? 'input' : 'change';
      control?.addEventListener(eventName, () => handleControlChange('layout'));
      if (control?.type === 'color') control.addEventListener('input', () => handleControlChange('visual'));
    }
    for (const control of [controls.showBox, controls.wireOverlay]) {
      control?.addEventListener('change', () => handleControlChange('visual'));
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
      if (dragMode === 'pan') panView(dx, dy);
      else {
        view.yaw -= dx * 0.006;
        view.pitch = Math.max(-0.32, Math.min(1.35, view.pitch + dy * 0.006));
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
      view.distance = Math.max(4, Math.min(520, view.distance * (event.deltaY > 0 ? 1.1 : 0.9)));
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
      if (!runtime.terrain) await generate({ preserveView: false });
      render();
    } catch (error) {
      console.error(error);
      setStatus('Three.js failed to load.');
    }
  }

  async function getPlayState() {
    readStateFromControls();
    const layout = runtime?.lastLayout || generateVoxelDungeonLayout(state);
    if (layout.error) return { error: layout.error };
    const asset = state.useTexture && state.textureId ? await loadVoxelTextureAsset(state.textureId) : null;
    return {
      layout,
      settings: { ...state },
      textureAsset: asset
    };
  }

  syncControls();
  setupTooltips();
  bindEvents();
  setStatus('Procedural cave generator ready.');

  return {
    activate,
    resize: scheduleResize,
    render: () => {
      if (active) render();
    },
    getPlayState
  };
}
