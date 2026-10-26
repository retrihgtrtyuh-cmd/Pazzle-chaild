export type EdgeTab = -1 | 0 | 1;

export interface PieceEdges {
  top: EdgeTab;
  right: EdgeTab;
  bottom: EdgeTab;
  left: EdgeTab;
}

export interface PuzzlePiece {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  groupId: number;
  isLocked: boolean;
  edges: PieceEdges;
  snapPulse: number;
  zOrder: number;
}

export interface WorkspaceBounds {
  width: number;
  height: number;
  boardX: number;
  boardY: number;
  boardWidth: number;
  boardHeight: number;
  imageAspect: number;
}

export interface SnapResult {
  pieces: PuzzlePiece[];
  snapped: boolean;
  snapType: 'none' | 'neighbor' | 'board';
  mergedGroupSize: number;
  connectedPairsCount: number;
  lockedCount: number;
  isComplete: boolean;
  snapCenter?: { x: number; y: number };
}

export interface AdaptiveDifficultyOption {
  id: string;
  badge: string;
  rows: number;
  cols: number;
  totalPieces: number;
  label: string;
  shortGridLabel: string;
}

interface DifficultyTierSpec {
  id: string;
  badge: string;
  targetCount: number;
  minCount: number;
  maxCount: number;
  minDim: number;
  maxDim: number;
}

export const DIFFICULTY_TIERS: DifficultyTierSpec[] = [
  {
    id: 'baby',
    badge: 'Малыш',
    targetCount: 5,
    minCount: 4,
    maxCount: 6,
    minDim: 2,
    maxDim: 3,
  },
  {
    id: 'easy',
    badge: 'Дружок',
    targetCount: 10,
    minCount: 8,
    maxCount: 14,
    minDim: 2,
    maxDim: 5,
  },
  {
    id: 'medium',
    badge: 'Мастер',
    targetCount: 20,
    minCount: 15,
    maxCount: 25,
    minDim: 3,
    maxDim: 7,
  },
  {
    id: 'expert',
    badge: 'Эксперт',
    targetCount: 40,
    minCount: 32,
    maxCount: 48,
    minDim: 4,
    maxDim: 9,
  },
];

/**
 * Formats Russian plural noun for puzzle piece counts (e.g. 4 детали, 6 деталей, 21 деталь).
 */
export function formatPieceCountRu(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 19) {
    return `${count} деталей`;
  }
  if (mod10 === 1) {
    return `${count} деталь`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} детали`;
  }
  return `${count} деталей`;
}

/**
 * Calculates the optimal (rows, cols) grid for a given image aspect ratio (width / height)
 * and difficulty tier so that each individual puzzle piece stays as close to square (1:1)
 * as possible while matching the target piece count of the tier.
 */
export function calculateAdaptiveGrid(
  imageAspect: number,
  tierIndex: number
): { rows: number; cols: number } {
  const safeAspect = Math.max(0.25, Math.min(4.0, Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 4 / 3));
  const tier =
    DIFFICULTY_TIERS[
      Math.max(0, Math.min(DIFFICULTY_TIERS.length - 1, tierIndex))
    ];

  let bestRows = tier.minDim;
  let bestCols = tier.minDim;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let r = tier.minDim; r <= tier.maxDim; r++) {
    for (let c = tier.minDim; c <= tier.maxDim; c++) {
      const total = r * c;
      if (total < tier.minCount || total > tier.maxCount) continue;

      // Keep landscape orientation (cols >= rows) for wide images and portrait (rows >= cols) for tall images
      if (safeAspect >= 1.05 && c < r) continue;
      if (safeAspect <= 0.95 && r < c) continue;

      // Piece aspect ratio = (imageWidth / cols) / (imageHeight / rows) = safeAspect * (rows / cols)
      const pieceAspect = safeAspect * (r / c);
      const squarenessError = Math.abs(Math.log(pieceAspect));
      const countError =
        (Math.abs(total - tier.targetCount) / tier.targetCount) * 0.22;
      const score = squarenessError + countError;

      if (score < bestScore) {
        bestScore = score;
        bestRows = r;
        bestCols = c;
      }
    }
  }

  return { rows: bestRows, cols: bestCols };
}

/**
 * Returns all 4 adaptive difficulty options tailored to the given image aspect ratio.
 */
export function getAdaptiveDifficulties(
  imageAspect: number
): AdaptiveDifficultyOption[] {
  const seenTotals = new Set<number>();

  return DIFFICULTY_TIERS.map((tier, idx) => {
    const { rows, cols } = calculateAdaptiveGrid(imageAspect, idx);
    const totalPieces = rows * cols;
    seenTotals.add(totalPieces);
    const shortGridLabel = `${cols}×${rows}`;
    return {
      id: tier.id,
      badge: tier.badge,
      rows,
      cols,
      totalPieces,
      label: `${formatPieceCountRu(totalPieces)} (${shortGridLabel})`,
      shortGridLabel,
    };
  });
}

export function createSeededRng(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeterministicEdges(
  rows: number,
  cols: number,
  seed = 101
): PieceEdges[][] {
  const rng = createSeededRng(seed);
  const grid: PieceEdges[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }))
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top: EdgeTab = r === 0 ? 0 : ((-grid[r - 1][c].bottom) as EdgeTab);
      const left: EdgeTab = c === 0 ? 0 : ((-grid[r][c - 1].right) as EdgeTab);
      const right: EdgeTab = c === cols - 1 ? 0 : rng() > 0.5 ? 1 : -1;
      const bottom: EdgeTab = r === rows - 1 ? 0 : rng() > 0.5 ? 1 : -1;

      grid[r][c] = { top, right, bottom, left };
    }
  }

  return grid;
}

/**
 * Computes workspace layout for a given viewport size and exact image aspect ratio (width / height).
 * Preserves the exact aspect ratio of the image without cropping while leaving left and right trays.
 */
export function calculateWorkspaceBounds(
  viewportWidth: number,
  viewportHeight: number,
  aspect = 4 / 3
): WorkspaceBounds {
  const safeW = Math.max(
    360,
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1024
  );
  const safeH = Math.max(
    360,
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 768
  );
  const safeAspect = Math.max(
    0.35,
    Math.min(2.8, Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3)
  );

  const safeTop = 86;
  const safeBottom = 28;
  const availH = Math.max(200, safeH - safeTop - safeBottom);
  const maxBoardW = Math.max(220, safeW * 0.45);
  const maxBoardH = Math.max(180, availH * 0.8);

  let boardWidth = maxBoardW;
  let boardHeight = boardWidth / safeAspect;

  if (boardHeight > maxBoardH) {
    boardHeight = maxBoardH;
    boardWidth = boardHeight * safeAspect;
  }

  boardWidth = Math.round(boardWidth);
  boardHeight = Math.round(boardHeight);

  const boardX = Math.round((safeW - boardWidth) / 2);
  const boardY = Math.round(safeTop + (availH - boardHeight) / 2);

  return {
    width: safeW,
    height: safeH,
    boardX,
    boardY,
    boardWidth,
    boardHeight,
    imageAspect: safeAspect,
  };
}

export const BOARD_GROUP_ID = 0;

export function createPuzzlePieces(
  rows: number,
  cols: number,
  bounds: WorkspaceBounds,
  seed = 2026
): PuzzlePiece[] {
  const rng = createSeededRng(seed);
  const edgeGrid = createDeterministicEdges(rows, cols, seed);
  const pieceW = bounds.boardWidth / cols;
  const pieceH = bounds.boardHeight / rows;
  const tabAllowance = Math.round(Math.min(pieceW, pieceH) * 0.26);

  const total = rows * cols;
  const pieces: PuzzlePiece[] = [];

  const outerPadX = 18 + tabAllowance;
  const boardGapX = 18 + tabAllowance;

  const leftTrayMinX = outerPadX;
  const leftTrayMaxX = Math.max(
    leftTrayMinX,
    bounds.boardX - pieceW - boardGapX
  );

  const rightTrayMinX = Math.min(
    bounds.width - pieceW - outerPadX,
    bounds.boardX + bounds.boardWidth + boardGapX
  );
  const rightTrayMaxX = Math.max(
    rightTrayMinX,
    bounds.width - pieceW - outerPadX
  );

  const minY = 86 + tabAllowance;
  const maxY = Math.max(minY + 16, bounds.height - pieceH - 22 - tabAllowance);

  const slotIndices = Array.from({ length: total }, (_, i) => i);
  for (let i = slotIndices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = slotIndices[i];
    slotIndices[i] = slotIndices[j];
    slotIndices[j] = tmp;
  }

  const half = Math.ceil(total / 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      const slotIdx = slotIndices[id];
      const isLeft = slotIdx < half;
      const localIdx = isLeft ? slotIdx : slotIdx - half;
      const sideCount = isLeft ? half : total - half;

      // Adapt tray columns (1, 2, or 3) so up to 48 pieces fit neatly in the side trays
      const trayCols = sideCount > 14 ? 3 : sideCount > 4 ? 2 : 1;
      const trayRows = Math.max(1, Math.ceil(sideCount / trayCols));
      const tCol = localIdx % trayCols;
      const tRow = Math.floor(localIdx / trayCols);

      const trayMinX = isLeft ? leftTrayMinX : rightTrayMinX;
      const trayMaxX = isLeft ? leftTrayMaxX : rightTrayMaxX;

      const u = trayCols === 1 ? 0.5 : tCol / (trayCols - 1);
      const v = trayRows === 1 ? 0.5 : tRow / (trayRows - 1);

      const jitterX = (rng() - 0.5) * Math.min(10, pieceW * 0.08);
      const jitterY = (rng() - 0.5) * Math.min(10, pieceH * 0.08);

      const rawX = trayMinX + u * (trayMaxX - trayMinX) + jitterX;
      const rawY = minY + v * (maxY - minY) + jitterY;

      const x = Math.round(
        Math.max(outerPadX, Math.min(bounds.width - pieceW - outerPadX, rawX))
      );
      const y = Math.round(Math.max(minY, Math.min(maxY, rawY)));

      pieces.push({
        id,
        row: r,
        col: c,
        x,
        y,
        targetX: bounds.boardX + c * pieceW,
        targetY: bounds.boardY + r * pieceH,
        groupId: id + 1, // 1..N so unlocked pieces never collide with BOARD_GROUP_ID (0)
        isLocked: false,
        edges: edgeGrid[r][c],
        snapPulse: 0,
        zOrder: id + 1,
      });
    }
  }

  return pieces;
}

export function bringGroupToFront(
  pieces: PuzzlePiece[],
  groupId: number
): PuzzlePiece[] {
  const maxZ = pieces.reduce((acc, p) => Math.max(acc, p.zOrder), 0);
  let offset = 1;
  return pieces.map((p) => {
    if (p.groupId === groupId && !p.isLocked) {
      return { ...p, zOrder: maxZ + offset++ };
    }
    return p;
  });
}

export function moveGroup(
  pieces: PuzzlePiece[],
  groupId: number,
  dx: number,
  dy: number,
  bounds: WorkspaceBounds,
  pieceWidth: number,
  pieceHeight: number
): PuzzlePiece[] {
  if (groupId === BOARD_GROUP_ID) return pieces;
  const groupPieces = pieces.filter((p) => p.groupId === groupId && !p.isLocked);
  if (groupPieces.length === 0) {
    return pieces;
  }

  let clampedDx = dx;
  let clampedDy = dy;

  const minX = Math.min(...groupPieces.map((p) => p.x));
  const maxX = Math.max(...groupPieces.map((p) => p.x + pieceWidth));
  const minY = Math.min(...groupPieces.map((p) => p.y));
  const maxY = Math.max(...groupPieces.map((p) => p.y + pieceHeight));

  const margin = 8;
  const topMargin = 68;

  if (minX + clampedDx < margin) {
    clampedDx = margin - minX;
  } else if (maxX + clampedDx > bounds.width - margin) {
    clampedDx = bounds.width - margin - maxX;
  }

  if (minY + clampedDy < topMargin) {
    clampedDy = topMargin - minY;
  } else if (maxY + clampedDy > bounds.height - margin) {
    clampedDy = bounds.height - margin - maxY;
  }

  return pieces.map((p) =>
    p.groupId === groupId && !p.isLocked
      ? {
          ...p,
          x: p.x + clampedDx,
          y: p.y + clampedDy,
        }
      : p
  );
}

export function countConnectedOrthogonalPairs(pieces: PuzzlePiece[]): number {
  let pairs = 0;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      const manhattan = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
      if (
        manhattan === 1 &&
        (a.groupId === b.groupId || (a.isLocked && b.isLocked))
      ) {
        pairs++;
      }
    }
  }
  return pairs;
}

export function isPuzzleComplete(pieces: PuzzlePiece[]): boolean {
  if (pieces.length === 0) return false;
  const allLocked = pieces.every((p) => p.isLocked);
  if (allLocked) return true;
  const firstGroup = pieces[0].groupId;
  return pieces.every((p) => p.groupId === firstGroup);
}

export function trySnapGroup(
  pieces: PuzzlePiece[],
  activeGroupId: number,
  pieceWidth: number,
  pieceHeight: number,
  snapThreshold = Math.min(pieceWidth, pieceHeight) * 0.48
): SnapResult {
  const activeGroup = pieces.filter(
    (p) => p.groupId === activeGroupId && !p.isLocked
  );
  if (activeGroup.length === 0) {
    return {
      pieces,
      snapped: false,
      snapType: 'none',
      mergedGroupSize: 0,
      connectedPairsCount: countConnectedOrthogonalPairs(pieces),
      lockedCount: pieces.filter((p) => p.isLocked).length,
      isComplete: isPuzzleComplete(pieces),
    };
  }

  let updated = pieces.map((p) => ({ ...p }));
  let snapped = false;
  let snapType: 'none' | 'neighbor' | 'board' = 'none';
  let snapCenter: { x: number; y: number } | undefined;

  // 1. Check if any piece in activeGroup is within snapThreshold of its target slot on the board
  for (const piece of activeGroup) {
    const distToBoard = Math.hypot(
      piece.x - piece.targetX,
      piece.y - piece.targetY
    );
    if (distToBoard <= snapThreshold) {
      updated = updated.map((p) => {
        if (p.groupId === activeGroupId) {
          return {
            ...p,
            x: p.targetX,
            y: p.targetY,
            groupId: BOARD_GROUP_ID,
            isLocked: true,
            snapPulse: 1,
          };
        }
        return p;
      });
      snapped = true;
      snapType = 'board';
      snapCenter = {
        x: piece.targetX + pieceWidth / 2,
        y: piece.targetY + pieceHeight / 2,
      };
      break;
    }
  }

  // 2. Check if active group is within snapThreshold of any orthogonally adjacent piece
  let mergedAnyNeighbor = true;
  while (mergedAnyNeighbor) {
    mergedAnyNeighbor = false;
    const anchorPiece = updated.find((p) => p.id === activeGroup[0].id)!;
    const currentGroupId = anchorPiece.groupId;
    const currentCluster = updated.filter((p) => p.groupId === currentGroupId);
    const otherPieces = updated.filter((p) => p.groupId !== currentGroupId);

    for (const a of currentCluster) {
      for (const b of otherPieces) {
        const rowDiff = a.row - b.row;
        const colDiff = a.col - b.col;
        if (Math.abs(rowDiff) + Math.abs(colDiff) !== 1) continue;

        const expectedX = b.x + colDiff * pieceWidth;
        const expectedY = b.y + rowDiff * pieceHeight;
        const dist = Math.hypot(a.x - expectedX, a.y - expectedY);

        if (dist <= snapThreshold) {
          const willBeLocked = a.isLocked || b.isLocked;
          const targetGroupId = willBeLocked
            ? BOARD_GROUP_ID
            : Math.min(currentGroupId, b.groupId);

          if (willBeLocked) {
            updated = updated.map((p) => {
              if (
                p.groupId === currentGroupId ||
                p.groupId === b.groupId ||
                p.isLocked
              ) {
                return {
                  ...p,
                  x: p.targetX,
                  y: p.targetY,
                  groupId: BOARD_GROUP_ID,
                  isLocked: true,
                  snapPulse: p.isLocked ? p.snapPulse : 1,
                };
              }
              return p;
            });
          } else {
            const shiftX = expectedX - a.x;
            const shiftY = expectedY - a.y;
            updated = updated.map((p) => {
              if (p.groupId === currentGroupId) {
                return {
                  ...p,
                  x: p.x + shiftX,
                  y: p.y + shiftY,
                  groupId: targetGroupId,
                  snapPulse: 1,
                };
              }
              if (p.groupId === b.groupId) {
                return {
                  ...p,
                  groupId: targetGroupId,
                  snapPulse: 1,
                };
              }
              return p;
            });
          }

          snapped = true;
          if (snapType === 'none') {
            snapType = willBeLocked ? 'board' : 'neighbor';
          }
          snapCenter = {
            x: (a.x + b.x + pieceWidth) / 2,
            y: (a.y + b.y + pieceHeight) / 2,
          };
          mergedAnyNeighbor = true;
          break;
        }
      }
      if (mergedAnyNeighbor) break;
    }
  }

  // 3. If all pieces now share a single groupId, lock the finished picture onto the board
  const uniqueGroups = new Set(updated.map((p) => p.groupId));
  if (uniqueGroups.size === 1) {
    updated = updated.map((p) => ({
      ...p,
      x: p.targetX,
      y: p.targetY,
      groupId: BOARD_GROUP_ID,
      isLocked: true,
      snapPulse: 1,
    }));
    snapped = true;
  }

  const finalGroupId = updated.find((p) => p.id === activeGroup[0].id)!.groupId;
  const mergedGroupSize = updated.filter((p) => p.groupId === finalGroupId).length;
  const complete = isPuzzleComplete(updated);

  return {
    pieces: updated,
    snapped,
    snapType,
    mergedGroupSize,
    connectedPairsCount: countConnectedOrthogonalPairs(updated),
    lockedCount: updated.filter((p) => p.isLocked).length,
    isComplete: complete,
    snapCenter,
  };
}

export function autoSnapOnePiece(
  pieces: PuzzlePiece[],
  pieceWidth: number,
  pieceHeight: number
): SnapResult {
  const unlocked = pieces.filter((p) => !p.isLocked);
  if (unlocked.length === 0) {
    return {
      pieces,
      snapped: false,
      snapType: 'none',
      mergedGroupSize: pieces.length,
      connectedPairsCount: countConnectedOrthogonalPairs(pieces),
      lockedCount: pieces.length,
      isComplete: true,
    };
  }

  const chosen = unlocked[0];
  const shiftX = chosen.targetX - chosen.x;
  const shiftY = chosen.targetY - chosen.y;

  const moved = pieces.map((p) =>
    p.groupId === chosen.groupId
      ? {
          ...p,
          x: p.x + shiftX,
          y: p.y + shiftY,
        }
      : p
  );

  return trySnapGroup(moved, chosen.groupId, pieceWidth, pieceHeight, 100);
}
