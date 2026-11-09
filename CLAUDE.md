# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build step, package manager, linter, or test suite. The project is three static files with no dependencies, so don't add a `package.json` or bundler unless asked.

Run it by opening `index.html` directly (`start index.html` on Windows) or by serving the directory:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npx serve .
```

Changes can only be verified in a browser: `game.js` touches the DOM at load, so it won't run under plain Node.

## Architecture

All game logic is in `game.js`, a classic (non-module) `'use strict'` script loaded at the end of `index.html`. State lives in module-level `let` variables (`board`, `current`, `next`, `score`, `paused`, `gameOver`, ...) that `init()` resets. `init()` is also the restart handler.

There are two entry points into game state, and both end up in the same lock path:

- **Gravity:** `loop()` runs on `requestAnimationFrame`, accumulates `dropAccum`, and moves the piece down once it reaches `dropInterval`.
- **Input:** the `keydown` listener calls the movement functions directly, outside the frame loop. It only redraws on the next frame, but it does call `updateHUD()` after every key.

Lock path: `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. `spawn()` calls `endGame()` if the new piece collides immediately.

## Invariants across files

- **Piece type = cell value = color index.** `PIECES[n]` is filled with the value `n`, and that value is written to `board` and used to look up `COLORS[n]`. Index 0 is `null` in both arrays and means an empty cell. A new piece needs matching entries in both; `randomPiece()` picks from `PIECES.length`.
- **Canvas size is set in HTML, not derived.** `<canvas id="board">` must stay `COLS*BLOCK` × `ROWS*BLOCK` (300×600). `#next-canvas` is 120×120, matching the hardcoded 4-cell grid and `NB = 30` in `drawNext()`.
- **`dropInterval` is set in two places:** the starting value in `init()` and the level formula in `clearLines()`. Keep them consistent when changing speed.
- **DOM ids are looked up at load** at the top of `game.js`, so renaming one in `index.html` breaks the script.
- **The `.hidden` class on `#overlay` is the only thing that hides it.** The overlay is shared by the pause and game-over states, and `game.js` sets its text for each.

## Conventions

User-facing text and the README are in Spanish (`lang="es"`, e.g. `PAUSA`, `Reiniciar`, `Puntuación`), though the panel labels (`SCORE`, `LINES`, `LEVEL`) are English. Code identifiers are in English.

## Known issues

Found by reading the code. Remove these entries once fixed.

- `togglePause()` never hides the overlay on resume, so the game continues behind the `PAUSA` overlay.
