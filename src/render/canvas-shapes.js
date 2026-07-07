import {
  DIR_DATA,
  dirEnd,
  hasDir,
  pieceById,
  rotatedDirs
} from '../core/dungeon.js';

function roundRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function drawArms(context, x, y, size, dirs, color, lineWidth, cap = 'butt') {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const half = size / 2;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = cap;
  context.lineJoin = 'round';
  context.beginPath();
  for (const dir of dirs) {
    const end = dirEnd(cx, cy, half, dir);
    context.moveTo(cx, cy);
    context.lineTo(end.x, end.y);
  }
  context.stroke();
  context.restore();
}

function drawMinimapArms(context, x, y, size, dirs, color, lineWidth) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const half = size / 2 + Math.max(0.35, Math.min(1, size * 0.04));
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = 'butt';
  context.lineJoin = 'round';
  context.beginPath();
  for (const dir of dirs) {
    const end = dirEnd(cx, cy, half, dir);
    context.moveTo(cx, cy);
    context.lineTo(end.x, end.y);
  }
  context.stroke();
  context.restore();
}

function drawMinimapCenter(context, x, y, size, boxSize, radius, color) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  roundRect(context, cx - boxSize / 2, cy - boxSize / 2, boxSize, boxSize, radius);
  context.fillStyle = color;
  context.fill();
}

export function drawMinimapNodeShape(context, node, x, y, size, pass) {
  const dirs = DIR_DATA
    .filter(info => hasDir(node.mask, info.dir))
    .map(info => info.dir);
  const isUnderlay = pass === 'underlay';
  const isStart = node.x === 0 && node.y === 0;
  const floorColor = isStart
    ? 'rgba(125, 211, 252, .9)'
    : (node.room ? 'rgba(209, 213, 219, .82)' : 'rgba(148, 163, 184, .72)');
  const color = isUnderlay ? 'rgba(8, 17, 31, .92)' : floorColor;

  if (node.room) {
    const armWidth = isUnderlay ? Math.max(2, size * 0.48) : Math.max(1.5, size * 0.28);
    const centerSize = isUnderlay ? size * 0.70 : size * 0.54;
    drawMinimapArms(context, x, y, size, dirs, color, armWidth);
    drawMinimapCenter(context, x, y, size, centerSize, size * 0.07, color);
  } else {
    const armWidth = isUnderlay ? Math.max(2, size * 0.50) : Math.max(1.5, size * 0.34);
    const centerSize = isUnderlay ? size * 0.50 : size * 0.36;
    drawMinimapArms(context, x, y, size, dirs, color, armWidth);
    drawMinimapCenter(context, x, y, size, centerSize, size * 0.04, color);
  }
}

export function drawPieceShape(context, x, y, size, pieceId, rot = 0, options = {}) {
  const piece = pieceById[pieceId];
  if (!piece) return;
  const alpha = options.alpha ?? 1;
  const ghost = !!options.ghost;
  const selected = !!options.selected;
  const icon = !!options.icon;
  const dirs = rotatedDirs(piece, piece.room ? 0 : rot);
  const pad = icon ? size * 0.06 : size * 0.08;
  const tileRadius = size * 0.11;
  const corridor = size * 0.34;
  const wall = corridor + size * 0.12;
  const cx = x + size / 2;
  const cy = y + size / 2;

  context.save();
  context.globalAlpha = alpha;

  roundRect(context, x + pad, y + pad, size - pad * 2, size - pad * 2, tileRadius);
  context.fillStyle = ghost ? 'rgba(125, 211, 252, .14)' : (selected ? 'rgba(56, 189, 248, .16)' : 'rgba(30, 41, 59, .88)');
  context.fill();
  context.lineWidth = Math.max(1, size * 0.025);
  context.strokeStyle = ghost ? 'rgba(125, 211, 252, .65)' : 'rgba(148, 163, 184, .18)';
  context.stroke();

  if (piece.room) {
    drawArms(context, x, y, size, dirs, ghost ? '#164e63' : '#070b15', wall, 'butt');
    drawArms(context, x, y, size, dirs, ghost ? '#7dd3fc' : '#9ca3af', corridor * 0.78, 'butt');

    const outer = size * 0.62;
    const inner = size * 0.50;
    roundRect(context, cx - outer / 2, cy - outer / 2, outer, outer, size * 0.09);
    context.fillStyle = ghost ? '#164e63' : '#070b15';
    context.fill();
    roundRect(context, cx - inner / 2, cy - inner / 2, inner, inner, size * 0.075);
    context.fillStyle = ghost ? '#7dd3fc' : '#a8b0bb';
    context.fill();
    context.strokeStyle = ghost ? 'rgba(224, 242, 254, .85)' : 'rgba(226, 232, 240, .32)';
    context.lineWidth = Math.max(1, size * 0.022);
    context.stroke();
  } else {
    drawArms(context, x, y, size, dirs, ghost ? '#164e63' : '#070b15', wall, 'butt');
    context.fillStyle = ghost ? '#164e63' : '#070b15';
    roundRect(context, cx - wall / 2, cy - wall / 2, wall, wall, size * 0.05);
    context.fill();

    drawArms(context, x, y, size, dirs, ghost ? '#7dd3fc' : '#9ca3af', corridor, 'butt');
    context.fillStyle = ghost ? '#7dd3fc' : '#9ca3af';
    roundRect(context, cx - corridor / 2, cy - corridor / 2, corridor, corridor, size * 0.04);
    context.fill();

    context.strokeStyle = ghost ? 'rgba(224, 242, 254, .85)' : 'rgba(226, 232, 240, .28)';
    context.lineWidth = Math.max(1, size * 0.018);
    context.beginPath();
    for (const dir of dirs) {
      const end = dirEnd(cx, cy, size / 2 - size * 0.03, dir);
      context.moveTo(cx, cy);
      context.lineTo(end.x, end.y);
    }
    context.stroke();
  }

  if (ghost) {
    context.setLineDash([Math.max(4, size * 0.08), Math.max(4, size * 0.06)]);
    context.strokeStyle = 'rgba(186, 230, 253, .85)';
    context.lineWidth = Math.max(1, size * 0.028);
    context.strokeRect(x + 2, y + 2, size - 4, size - 4);
  }

  context.restore();
}
