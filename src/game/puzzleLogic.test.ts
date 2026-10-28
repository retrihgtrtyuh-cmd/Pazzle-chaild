import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeterministicEdges,
  calculateWorkspaceBounds,
  createPuzzlePieces,
  moveGroup,
  trySnapGroup,
  autoSnapOnePiece,
  isPuzzleComplete,
  getAdaptiveDifficulties,
  calculateResolutionAdaptiveGrid,
} from './puzzleLogic';
import {
  computeStatsSummary,
  recordCompletedPuzzleRun,
} from './statsManager';
import { isSupportedImagePath, cleanImageTitle } from './archiveLoader';

test('createDeterministicEdges creates flat outer borders and complementary inner tabs', () => {
  const rows = 3;
  const cols = 4;
  const edges = createDeterministicEdges(rows, cols, 42);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = edges[r][c];
      if (r === 0) assert.equal(cell.top, 0);
      if (r === rows - 1) assert.equal(cell.bottom, 0);
      if (c === 0) assert.equal(cell.left, 0);
      if (c === cols - 1) assert.equal(cell.right, 0);

      if (r > 0) {
        assert.equal(cell.top + edges[r - 1][c].bottom, 0);
        assert.notEqual(cell.top, 0);
      }
      if (c > 0) {
        assert.equal(cell.left + edges[r][c - 1].right, 0);
        assert.notEqual(cell.left, 0);
      }
    }
  }
});

test('trySnapGroup connects two neighboring pieces in free space and moves them together as a cluster', () => {
  const bounds = calculateWorkspaceBounds(1440, 900);
  const rows = 2;
  const cols = 2;
  const pieceW = bounds.boardWidth / cols;
  const pieceH = bounds.boardHeight / rows;

  let pieces = createPuzzlePieces(rows, cols, bounds, 99);
  const p0 = pieces.find((p) => p.row === 0 && p.col === 0)!;
  const p1 = pieces.find((p) => p.row === 0 && p.col === 1)!;

  // Position p0 at (120, 200) and p1 just slightly to the right of p0 + pieceW (within snap tolerance)
  pieces = pieces.map((p) => {
    if (p.id === p0.id) return { ...p, x: 120, y: 200 };
    if (p.id === p1.id) return { ...p, x: 120 + pieceW + 10, y: 200 - 6 };
    return p;
  });

  const snapRes = trySnapGroup(pieces, p1.groupId, pieceW, pieceH, 40);
  assert.equal(snapRes.snapped, true);
  assert.equal(snapRes.snapType, 'neighbor');
  assert.equal(snapRes.mergedGroupSize, 2);

  const afterP0 = snapRes.pieces.find((p) => p.id === p0.id)!;
  const afterP1 = snapRes.pieces.find((p) => p.id === p1.id)!;
  assert.equal(afterP0.groupId, afterP1.groupId);
  assert.equal(Math.round(afterP1.x - afterP0.x), Math.round(pieceW));
  assert.equal(Math.round(afterP1.y - afterP0.y), 0);

  // Moving the joined group moves both pieces together
  const movedPieces = moveGroup(
    snapRes.pieces,
    afterP0.groupId,
    50,
    30,
    bounds,
    pieceW,
    pieceH
  );
  const movedP0 = movedPieces.find((p) => p.id === p0.id)!;
  const movedP1 = movedPieces.find((p) => p.id === p1.id)!;
  assert.equal(Math.round(movedP0.x), 170);
  assert.equal(Math.round(movedP1.x), Math.round(170 + pieceW));
});

test('autoSnapOnePiece snaps pieces step by step until isPuzzleComplete is true', () => {
  const bounds = calculateWorkspaceBounds(1440, 900);
  const rows = 2;
  const cols = 2;
  const pieceW = bounds.boardWidth / cols;
  const pieceH = bounds.boardHeight / rows;

  let pieces = createPuzzlePieces(rows, cols, bounds, 777);
  assert.equal(isPuzzleComplete(pieces), false);

  for (let step = 0; step < rows * cols; step++) {
    const res = autoSnapOnePiece(pieces, pieceW, pieceH);
    pieces = res.pieces;
  }

  assert.equal(isPuzzleComplete(pieces), true);
  for (const p of pieces) {
    assert.equal(p.isLocked, true);
    assert.equal(Math.round(p.x), Math.round(p.targetX));
    assert.equal(Math.round(p.y), Math.round(p.targetY));
  }
});

test('dragging and locking a non-zero piece first never prevents piece id=0 from moving and locking to its board slot', () => {
  const bounds = calculateWorkspaceBounds(1440, 900);
  const rows = 2;
  const cols = 2;
  const pieceW = bounds.boardWidth / cols;
  const pieceH = bounds.boardHeight / rows;

  let pieces = createPuzzlePieces(rows, cols, bounds, 2026);

  // 1. First drag piece id=1 (row=0, col=1) to its board target and snap
  const p1 = pieces.find((p) => p.id === 1)!;
  pieces = moveGroup(
    pieces,
    p1.groupId,
    p1.targetX - p1.x,
    p1.targetY - p1.y,
    bounds,
    pieceW,
    pieceH
  );
  const snap1 = trySnapGroup(pieces, p1.groupId, pieceW, pieceH);
  assert.equal(snap1.snapped, true);
  assert.equal(snap1.lockedCount, 1);
  pieces = snap1.pieces;

  // 2. Now drag piece id=0 (row=0, col=0) across the board to its targetX, targetY
  const p0Before = pieces.find((p) => p.id === 0)!;
  assert.equal(p0Before.isLocked, false);
  const dx = p0Before.targetX - p0Before.x;
  const dy = p0Before.targetY - p0Before.y;

  pieces = moveGroup(pieces, p0Before.groupId, dx, dy, bounds, pieceW, pieceH);
  const p0Moved = pieces.find((p) => p.id === 0)!;
  assert.equal(Math.round(p0Moved.x), Math.round(p0Before.targetX));
  assert.equal(Math.round(p0Moved.y), Math.round(p0Before.targetY));

  const snap0 = trySnapGroup(pieces, p0Moved.groupId, pieceW, pieceH);
  assert.equal(snap0.snapped, true);
  assert.equal(snap0.lockedCount, 2);
  const p0After = snap0.pieces.find((p) => p.id === 0)!;
  assert.equal(p0After.isLocked, true);
});

test('getAdaptiveDifficulties adapts grid rows and cols to portrait, square, wide, and arbitrary resolutions', () => {
  const squareDiffs = getAdaptiveDifficulties(1.0, 1000, 1000);
  assert.equal(squareDiffs.length, 5);
  assert.equal(squareDiffs[0].rows, squareDiffs[0].cols);
  assert.equal(squareDiffs[3].rows, squareDiffs[3].cols);
  assert.equal(squareDiffs[4].id, 'auto-res');
  assert.ok(squareDiffs[3].totalPieces >= 32 && squareDiffs[3].totalPieces <= 48);

  // Landscape 16:9 -> more columns than rows on every tier
  const wideDiffs = getAdaptiveDifficulties(16 / 9, 1920, 1080);
  for (const tier of wideDiffs) {
    assert.ok(tier.cols >= tier.rows, `Expected cols >= rows for 16:9, got ${tier.cols}x${tier.rows}`);
  }

  // Portrait 3:4 -> exact transpose of 4:3 (more rows than columns)
  const portraitDiffs = getAdaptiveDifficulties(3 / 4, 900, 1200);
  const landscapeDiffs = getAdaptiveDifficulties(4 / 3, 1200, 900);
  for (let i = 0; i < 4; i++) {
    assert.equal(portraitDiffs[i].rows, landscapeDiffs[i].cols);
    assert.equal(portraitDiffs[i].cols, landscapeDiffs[i].rows);
  }

  // Resolution adaptation: tiny pixel-art image (160x120) vs high-res image (2400x1800)
  const tinyGrid = calculateResolutionAdaptiveGrid(160, 120);
  const highResGrid = calculateResolutionAdaptiveGrid(2400, 1800);
  assert.ok(tinyGrid.rows * tinyGrid.cols < highResGrid.rows * highResGrid.cols);

  // Workspace bounds preserve aspect ratio of portrait and wide images without strict restriction
  const portraitBounds = calculateWorkspaceBounds(1440, 900, 0.75);
  assert.ok(portraitBounds.boardHeight > portraitBounds.boardWidth);
  assert.ok(
    Math.abs(portraitBounds.boardWidth / portraitBounds.boardHeight - 0.75) < 0.02
  );
});

test('statsManager computes best time and average time grouped by exact piece count and overall', () => {
  let runs: any[] = [];

  // Record two 6-piece runs (20s and 10s -> best=10s, avg=15s) and one 12-piece run (34s)
  const r1 = recordCompletedPuzzleRun(runs, {
    totalPieces: 6,
    gridLabel: '3×2',
    clearTimeSec: 20,
    movesCount: 8,
    artworkTitle: 'Лесная Поляна',
    imageResolution: '480×360',
  });
  runs = r1.runs;
  assert.equal(r1.result.isNewBestForPieceCount, true);

  const r2 = recordCompletedPuzzleRun(runs, {
    totalPieces: 6,
    gridLabel: '3×2',
    clearTimeSec: 10,
    movesCount: 6,
    artworkTitle: 'Космо-Динозаврик',
    imageResolution: '600×800',
  });
  runs = r2.runs;
  assert.equal(r2.result.isNewBestForPieceCount, true);
  assert.equal(r2.result.pieceStats.bestTimeSec, 10);
  assert.equal(r2.result.pieceStats.avgTimeSec, 15);
  assert.equal(r2.result.pieceStats.completedCount, 2);

  const r3 = recordCompletedPuzzleRun(runs, {
    totalPieces: 12,
    gridLabel: '4×3',
    clearTimeSec: 33,
    movesCount: 15,
    artworkTitle: 'Чудо-Паровозик',
    imageResolution: '960×540',
  });
  runs = r3.runs;
  const summary = computeStatsSummary(runs);
  assert.equal(summary.totalCompleted, 3);
  assert.equal(summary.overallBestTimeSec, 10);
  assert.equal(summary.overallAvgTimeSec, 21); // (20 + 10 + 33) / 3 = 21
  assert.equal(summary.byPieceCount[6].bestTimeSec, 10);
  assert.equal(summary.byPieceCount[6].avgTimeSec, 15);
  assert.equal(summary.byPieceCount[12].bestTimeSec, 33);
  assert.equal(summary.byPieceCount[12].avgTimeSec, 33);
});

test('archiveLoader filters valid image paths inside ZIP and cleans Russian filenames', () => {
  assert.equal(isSupportedImagePath('folder/01_Лисёнок.jpg'), true);
  assert.equal(isSupportedImagePath('nested/art.webp'), true);
  assert.equal(isSupportedImagePath('__MACOSX/._01_Лисёнок.jpg'), false);
  assert.equal(isSupportedImagePath('.DS_Store'), false);
  assert.equal(isSupportedImagePath('readme.txt'), false);
  assert.equal(cleanImageTitle('albums/01_Лесная_Поляна.png'), '01 Лесная Поляна');
});



