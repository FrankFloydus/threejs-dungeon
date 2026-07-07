import {
  keyFor,
  mod,
  parseKey,
  pieceById
} from './dungeon.js';

export const STORAGE_KEY = 'dungeon-tunnels-prototype-v1';

export function saveMap(placed, storage = localStorage) {
  const payload = [...placed.entries()].map(([key, value]) => ({ ...parseKey(key), ...value }));
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadMap(storage = localStorage) {
  const placed = new Map();
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return placed;

  const payload = JSON.parse(raw);
  if (!Array.isArray(payload)) return placed;

  for (const item of payload) {
    if (typeof item.x !== 'number' || typeof item.y !== 'number' || !pieceById[item.type]) continue;
    placed.set(keyFor(item.x, item.y), { type: item.type, rot: mod(item.rot || 0, 4) });
  }

  return placed;
}
