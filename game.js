'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Each skin's colors follow the indices of PIECES (0 is null, an empty cell).
// drawBlock and drawHole receive the cell's top-left corner in pixels.
const SKINS = {
  retro: {
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#90caf9', // J - pale blue
      '#ffb74d', // L - orange
      '#b0bec5', // Nut - steel
    ],
    drawBlock: drawRetroBlock,
    drawHole: drawRetroHole,
  },
  neon: {
    colors: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#d000ff', // T
      '#39ff14', // S
      '#ff2052', // Z
      '#2e7bff', // J
      '#ff8c00', // L
      '#c8d6e5', // Nut
    ],
    drawBlock: drawNeonBlock,
    drawHole: drawNeonHole,
  },
  pastel: {
    colors: [
      null,
      '#aee6e6', // I
      '#fdeaa8', // O
      '#d7bde2', // T
      '#b5e8c0', // S
      '#f7b7b2', // Z
      '#b8d0f0', // J
      '#fbd0a5', // L
      '#d5d8e0', // Nut
    ],
    drawBlock: drawPastelBlock,
    drawHole: drawPastelHole,
  },
  pixel: {
    colors: [
      null,
      '#00b8d8', // I
      '#f8c800', // O
      '#a040e0', // T
      '#30b830', // S
      '#e03030', // Z
      '#3068e8', // J
      '#f07800', // L
      '#98a0b0', // Nut
    ],
    drawBlock: drawPixelBlock,
    drawHole: drawPixelHole,
  },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut
];

const NUT = 8;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let skin = SKINS.retro;
let gridColor, blockEdge;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.globalAlpha = 1;
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.strokeStyle = blockEdge;
  context.lineWidth = 1;
  context.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawRetroHole(context, px, py, size, color) {
  context.fillStyle = color;
  context.beginPath();
  context.rect(px + 1, py + 1, size - 2, size - 2);
  context.arc(px + size / 2, py + size / 2, size * 0.4, 0, Math.PI * 2);
  context.fill('evenodd');
}

// Sub-path of its own: without the moveTo, stroking joins the circle to the previous shape.
function addCircle(context, cx, cy, radius) {
  context.moveTo(cx + radius, cy);
  context.arc(cx, cy, radius, 0, Math.PI * 2);
}

// Paints the current path. The glow must end here or it would spread to everything drawn next.
function paintNeon(context, size, color) {
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.stroke();
  context.shadowBlur = 0;
  context.globalAlpha *= 0.3;
  context.fillStyle = color;
  context.fill('evenodd');
}

function drawNeonBlock(context, px, py, size, color) {
  context.beginPath();
  context.rect(px + 2, py + 2, size - 4, size - 4);
  paintNeon(context, size, color);
}

function drawNeonHole(context, px, py, size, color) {
  context.beginPath();
  context.rect(px + 2, py + 2, size - 4, size - 4);
  addCircle(context, px + size / 2, py + size / 2, size * 0.3);
  paintNeon(context, size, color);
}

function addRoundedSquare(context, px, py, side, radius) {
  const right = px + side, bottom = py + side;
  context.moveTo(px + radius, py);
  context.arcTo(right, py, right, bottom, radius);
  context.arcTo(right, bottom, px, bottom, radius);
  context.arcTo(px, bottom, px, py, radius);
  context.arcTo(px, py, right, py, radius);
  context.closePath();
}

function paintPastel(context, color) {
  context.fillStyle = color;
  context.fill('evenodd');
  context.strokeStyle = blockEdge;
  context.lineWidth = 1;
  context.stroke();
}

function drawPastelBlock(context, px, py, size, color) {
  context.beginPath();
  addRoundedSquare(context, px + 1.5, py + 1.5, size - 3, size * 0.25);
  paintPastel(context, color);
}

function drawPastelHole(context, px, py, size, color) {
  context.beginPath();
  addRoundedSquare(context, px + 1.5, py + 1.5, size - 3, size * 0.25);
  addCircle(context, px + size / 2, py + size / 2, size * 0.35);
  paintPastel(context, color);
}

// Every pixel-art tile is a PIXEL_GRID × PIXEL_GRID mosaic scaled to the block size.
const PIXEL_GRID = 10;

function fillPixels(context, px, py, size, color, isOn) {
  const at = n => Math.round(n * size / PIXEL_GRID);
  context.fillStyle = color;
  context.beginPath();
  for (let j = 0; j < PIXEL_GRID; j++)
    for (let i = 0; i < PIXEL_GRID; i++)
      if (isOn(i, j)) context.rect(px + at(i), py + at(j), at(i + 1) - at(i), at(j + 1) - at(j));
  context.fill();
}

// Only translucent layers go over the base color, so globalAlpha (ghost piece) applies to all of them.
function drawPixelTile(context, px, py, size, color, isSolid) {
  const last = PIXEL_GRID - 1;
  const isEdge = (i, j) => i === 0 || j === 0 || i === last || j === last;
  fillPixels(context, px, py, size, color, isSolid);
  fillPixels(context, px, py, size, 'rgba(0,0,0,0.14)', (i, j) =>
    isSolid(i, j) && !isEdge(i, j) && (i + j * 2) % 4 === 0);
  fillPixels(context, px, py, size, 'rgba(255,255,255,0.4)', (i, j) =>
    (i === 0 || j === 0) && i < last && j < last);
  fillPixels(context, px, py, size, 'rgba(0,0,0,0.35)', (i, j) => i === last || j === last);
}

function drawPixelBlock(context, px, py, size, color) {
  drawPixelTile(context, px, py, size, color, () => true);
}

function drawPixelHole(context, px, py, size, color) {
  const center = (PIXEL_GRID - 1) / 2;
  drawPixelTile(context, px, py, size, color, (i, j) => (i - center) ** 2 + (j - center) ** 2 > 16);
}

// An empty cell fully ringed by nut cells. Purely visual: the cell stays 0, so it
// collides with nothing and keeps its row from clearing.
function isNutHole(grid, r, c) {
  if (grid[r][c]) return false;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if ((dr || dc) && grid[r + dr]?.[c + dc] !== NUT) return false;
  return true;
}

function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  skin.drawHole(context, x * size, y * size, size, skin.colors[NUT]);
  context.globalAlpha = 1;
}

function drawCell(context, grid, r, c, x, y, size, alpha) {
  if (isNutHole(grid, r, c)) drawNutHole(context, x, y, size, alpha);
  else drawBlock(context, x, y, grid[r][c], size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawCell(ctx, board, r, c, c, r, BLOCK);

  // the piece that didn't fit is not part of the final board
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawCell(ctx, current.shape, r, c, current.x + c, gy + r, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawCell(ctx, current.shape, r, c, current.x + c, current.y + r, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawCell(nextCtx, shape, r, c, offX + c, offY + r, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return; // endGame() already drew the final frame
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// Colores de canvas que dependen del tema y de la skin: lee el CSS y redibuja.
function refreshCanvasColors() {
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim();
  blockEdge = styles.getPropertyValue('--block-edge').trim();
  // En pausa o game over el bucle está cancelado: redibujar a mano.
  if (current) draw();
  if (next) drawNext();
}

// ---- Tema claro/oscuro ----
function applyTheme(theme, save) {
  document.documentElement.setAttribute('data-theme', theme);
  if (save) {
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }
  themeBtn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
  themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  refreshCanvasColors();
}

themeBtn.addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(dark ? 'light' : 'dark', true);
  themeBtn.blur(); // evita que Space reactive el botón durante la partida
});

// Sigue la preferencia del sistema mientras no haya elección guardada.
const systemQuery = window.matchMedia('(prefers-color-scheme: light)');
systemQuery.addEventListener('change', e => {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (err) {}
  if (!saved) applyTheme(e.matches ? 'light' : 'dark', false);
});

// ---- Skins ----
function applySkin(name, save) {
  const valid = Object.keys(SKINS).includes(name) ? name : 'retro';
  skin = SKINS[valid];
  document.documentElement.setAttribute('data-skin', valid);
  skinSelect.value = valid;
  if (save) {
    try { localStorage.setItem('skin', valid); } catch (e) {}
  }
  refreshCanvasColors();
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value, true);
  skinSelect.blur(); // evita que las flechas y Space cambien la skin durante la partida
});

// Abrir y cerrar el selector sin cambiar de opción no dispara change y deja aquí el foco.
skinSelect.addEventListener('keydown', e => {
  const changesOption = e.key.length === 1 || e.key.startsWith('Arrow'); // incluye la búsqueda por letra
  if (!changesOption || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.code !== 'KeyP' && (paused || gameOver || !current)) return;
  e.preventDefault();
  skinSelect.blur();
});

applySkin(document.documentElement.getAttribute('data-skin'), false);
applyTheme(document.documentElement.getAttribute('data-theme') || 'dark', false);

init();
