import React, { useEffect, useRef } from 'react';
import {
  PuzzlePiece,
  WorkspaceBounds,
  PieceEdges,
  bringGroupToFront,
  moveGroup,
  trySnapGroup,
} from '../game/puzzleLogic';
import { soundManager } from '../game/soundEffects';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vRot: number;
  color: string;
  life: number;
  maxLife: number;
  shape: 'star' | 'confetti' | 'circle';
}

const PARTICLE_POOL_SIZE = 120;
const CELEBRATION_COLORS = [
  '#ffbe0b',
  '#fb5607',
  '#ff006e',
  '#3a86ff',
  '#06d6a0',
  '#8338ec',
];

/**
 * Traces a classic interlocking jigsaw puzzle piece outline with rounded tabs (+1)
 * and sockets (-1) on each of the 4 sides.
 */
export function traceJigsawPiecePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  edges: PieceEdges
) {
  const tabW = Math.min(w, h) * 0.24;
  const neck = tabW * 0.38;

  ctx.beginPath();
  ctx.moveTo(x, y);

  // TOP EDGE (left -> right)
  if (edges.top === 0) {
    ctx.lineTo(x + w, y);
  } else {
    const dir = -edges.top; // -1 = outward up, +1 = inward down
    const midX = x + w * 0.5;
    ctx.lineTo(midX - neck * 1.3, y);
    ctx.bezierCurveTo(
      midX - neck * 0.8,
      y + dir * tabW * 0.15,
      midX - tabW * 0.95,
      y + dir * tabW * 0.95,
      midX,
      y + dir * tabW
    );
    ctx.bezierCurveTo(
      midX + tabW * 0.95,
      y + dir * tabW * 0.95,
      midX + neck * 0.8,
      y + dir * tabW * 0.15,
      midX + neck * 1.3,
      y
    );
    ctx.lineTo(x + w, y);
  }

  // RIGHT EDGE (top -> bottom)
  if (edges.right === 0) {
    ctx.lineTo(x + w, y + h);
  } else {
    const dir = edges.right; // +1 = outward right, -1 = inward left
    const midY = y + h * 0.5;
    ctx.lineTo(x + w, midY - neck * 1.3);
    ctx.bezierCurveTo(
      x + w + dir * tabW * 0.15,
      midY - neck * 0.8,
      x + w + dir * tabW * 0.95,
      midY - tabW * 0.95,
      x + w + dir * tabW,
      midY
    );
    ctx.bezierCurveTo(
      x + w + dir * tabW * 0.95,
      midY + tabW * 0.95,
      x + w + dir * tabW * 0.15,
      midY + neck * 0.8,
      x + w,
      midY + neck * 1.3
    );
    ctx.lineTo(x + w, y + h);
  }

  // BOTTOM EDGE (right -> left)
  if (edges.bottom === 0) {
    ctx.lineTo(x, y + h);
  } else {
    const dir = edges.bottom; // +1 = outward down, -1 = inward up
    const midX = x + w * 0.5;
    ctx.lineTo(midX + neck * 1.3, y + h);
    ctx.bezierCurveTo(
      midX + neck * 0.8,
      y + h + dir * tabW * 0.15,
      midX + tabW * 0.95,
      y + h + dir * tabW * 0.95,
      midX,
      y + h + dir * tabW
    );
    ctx.bezierCurveTo(
      midX - tabW * 0.95,
      y + h + dir * tabW * 0.95,
      midX - neck * 0.8,
      y + h + dir * tabW * 0.15,
      midX - neck * 1.3,
      y + h
    );
    ctx.lineTo(x, y + h);
  }

  // LEFT EDGE (bottom -> top)
  if (edges.left === 0) {
    ctx.lineTo(x, y);
  } else {
    const dir = -edges.left; // -1 = outward left, +1 = inward right
    const midY = y + h * 0.5;
    ctx.lineTo(x, midY + neck * 1.3);
    ctx.bezierCurveTo(
      x + dir * tabW * 0.15,
      midY + neck * 0.8,
      x + dir * tabW * 0.95,
      midY + tabW * 0.95,
      x + dir * tabW,
      midY
    );
    ctx.bezierCurveTo(
      x + dir * tabW * 0.95,
      midY - tabW * 0.95,
      x + dir * tabW * 0.15,
      midY - neck * 0.8,
      x,
      midY - neck * 1.3
    );
    ctx.lineTo(x, y);
  }

  ctx.closePath();
}

function drawFivePointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

interface PuzzleCanvasProps {
  sourceCanvas: HTMLCanvasElement | null;
  rows: number;
  cols: number;
  pieces: PuzzlePiece[];
  bounds: WorkspaceBounds;
  showGhostHint: boolean;
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  onPiecesChange: (
    nextPieces: PuzzlePiece[],
    eventInfo?: {
      moved?: boolean;
      snapped?: boolean;
      isComplete?: boolean;
    }
  ) => void;
  burstTriggerRef: React.MutableRefObject<((x?: number, y?: number, count?: number) => void) | null>;
}

export const PuzzleCanvas: React.FC<PuzzleCanvasProps> = ({
  sourceCanvas,
  rows,
  cols,
  pieces,
  bounds,
  showGhostHint,
  gameState,
  onPiecesChange,
  burstTriggerRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep piecesRef synced when pieces prop changes from outside (e.g. new game, difficulty change, magic snap),
  // NEVER overwriting piecesRef on unrelated parent re-renders (like the 1s timer tick) while dragging!
  const piecesRef = useRef<PuzzlePiece[]>(pieces);
  useEffect(() => {
    if (dragStateRef.current.activeGroupId === null) {
      piecesRef.current = pieces;
    }
  }, [pieces]);

  const boundsRef = useRef<WorkspaceBounds>(bounds);
  boundsRef.current = bounds;

  const rowsColsRef = useRef({ rows, cols });
  rowsColsRef.current = { rows, cols };

  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(sourceCanvas);
  sourceCanvasRef.current = sourceCanvas;

  const showGhostRef = useRef(showGhostHint);
  showGhostRef.current = showGhostHint;

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const onPiecesChangeRef = useRef(onPiecesChange);
  onPiecesChangeRef.current = onPiecesChange;

  const dragStateRef = useRef<{
    activeGroupId: number | null;
    pointerId: number | null;
    lastX: number;
    lastY: number;
    hasMoved: boolean;
  }>({
    activeGroupId: null,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    hasMoved: false,
  });

  const snapComboRef = useRef(0);

  // Pre-allocated zero-GC particle pool
  const particlePoolRef = useRef<Particle[]>(
    Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 8,
      rotation: 0,
      vRot: 0,
      color: '#ffbe0b',
      life: 0,
      maxLife: 1,
      shape: 'star',
    }))
  );
  const poolCursorRef = useRef(0);

  const spawnBurst = (cx: number, cy: number, count = 24) => {
    const pool = particlePoolRef.current;
    const shapes: Array<'star' | 'confetti' | 'circle'> = ['star', 'confetti', 'circle'];
    for (let i = 0; i < count; i++) {
      const p = pool[poolCursorRef.current];
      poolCursorRef.current = (poolCursorRef.current + 1) % PARTICLE_POOL_SIZE;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 110 + Math.random() * 240;
      p.active = true;
      p.x = cx;
      p.y = cy;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 60;
      p.size = 7 + Math.random() * 9;
      p.rotation = Math.random() * Math.PI * 2;
      p.vRot = (Math.random() - 0.5) * 8;
      p.color = CELEBRATION_COLORS[i % CELEBRATION_COLORS.length];
      p.life = 0;
      p.maxLife = 0.65 + Math.random() * 0.55;
      p.shape = shapes[i % shapes.length];
    }
  };

  useEffect(() => {
    burstTriggerRef.current = (x?: number, y?: number, count = 28) => {
      const b = boundsRef.current;
      const bx = x ?? b.boardX + b.boardWidth / 2;
      const by = y ?? b.boardY + b.boardHeight / 2;
      spawnBurst(bx, by, count);
    };
  }, [burstTriggerRef]);

  // Convert client pointer coordinates to logical workspace coordinates
  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const b = boundsRef.current;
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: clientX, y: clientY };
    return {
      x: ((clientX - rect.left) / rect.width) * b.width,
      y: ((clientY - rect.top) / rect.height) * b.height,
    };
  };

  const needsRedrawRef = useRef(true);
  useEffect(() => {
    needsRedrawRef.current = true;
  }, [pieces, bounds, rows, cols, sourceCanvas, showGhostHint, gameState]);

  // Main 60fps Canvas2D render loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let victoryFireworkTimer = 0;

    const renderFrame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      lastTime = now;

      const isStaticOverlay =
        gameStateRef.current === 'title' || gameStateRef.current === 'paused';
      if (isStaticOverlay && !needsRedrawRef.current) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      needsRedrawRef.current = false;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const b = boundsRef.current;
        const { rows: rCount, cols: cCount } = rowsColsRef.current;
        const src = sourceCanvasRef.current;
        const currentPieces = piecesRef.current;

        if (ctx && b.width > 0 && b.height > 0) {
          if (canvas.width !== b.width || canvas.height !== b.height) {
            canvas.width = b.width;
            canvas.height = b.height;
          }

          const pieceW = b.boardWidth / cCount;
          const pieceH = b.boardHeight / rCount;
          const snapThreshold = Math.min(pieceW, pieceH) * 0.48;

          // 1. Draw warm wooden playtable background
          const tableGrad = ctx.createRadialGradient(
            b.width * 0.5,
            b.height * 0.45,
            80,
            b.width * 0.5,
            b.height * 0.5,
            Math.max(b.width, b.height) * 0.78
          );
          tableGrad.addColorStop(0, '#5c3a21');
          tableGrad.addColorStop(0.6, '#432818');
          tableGrad.addColorStop(1, '#2b180e');
          ctx.fillStyle = tableGrad;
          ctx.fillRect(0, 0, b.width, b.height);

          // Subtle wooden plank lines
          ctx.strokeStyle = 'rgba(255, 224, 178, 0.045)';
          ctx.lineWidth = 2;
          const plankStep = Math.max(64, Math.round(b.height / 7));
          for (let py = plankStep; py < b.height; py += plankStep) {
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(b.width, py);
            ctx.stroke();
          }

          // Left & right piece tray mats
          const drawRoundedRectPath = (
            rx: number,
            ry: number,
            rw: number,
            rh: number,
            radius: number
          ) => {
            const r = Math.min(radius, rw / 2, rh / 2);
            ctx.beginPath();
            ctx.moveTo(rx + r, ry);
            ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
            ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
            ctx.arcTo(rx, ry + rh, rx, ry, r);
            ctx.arcTo(rx, ry, rx + rw, ry, r);
            ctx.closePath();
          };

          const trayPad = 14;
          const leftTrayW = Math.max(0, b.boardX - 36);
          if (leftTrayW > 90) {
            ctx.fillStyle = 'rgba(30, 16, 9, 0.32)';
            ctx.strokeStyle = 'rgba(255, 214, 153, 0.12)';
            ctx.lineWidth = 2;
            drawRoundedRectPath(trayPad, 74, leftTrayW, b.height - 92, 20);
            ctx.fill();
            ctx.stroke();

            const rightTrayX = b.boardX + b.boardWidth + 22;
            const rightTrayW = Math.max(0, b.width - rightTrayX - trayPad);
            if (rightTrayW > 90) {
              drawRoundedRectPath(rightTrayX, 74, rightTrayW, b.height - 92, 20);
              ctx.fill();
              ctx.stroke();
            }
          }

          // 2. Draw recessed wooden puzzle board frame in center
          const frameBorder = 14;
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
          ctx.shadowBlur = 24;
          ctx.shadowOffsetY = 8;
          ctx.fillStyle = '#8d5524';
          drawRoundedRectPath(
            b.boardX - frameBorder,
            b.boardY - frameBorder,
            b.boardWidth + frameBorder * 2,
            b.boardHeight + frameBorder * 2,
            22
          );
          ctx.fill();
          ctx.restore();

          // Frame bevel highlight
          ctx.strokeStyle = '#c68b59';
          ctx.lineWidth = 3;
          drawRoundedRectPath(
            b.boardX - frameBorder + 1.5,
            b.boardY - frameBorder + 1.5,
            b.boardWidth + frameBorder * 2 - 3,
            b.boardHeight + frameBorder * 2 - 3,
            20
          );
          ctx.stroke();

          // Inner recessed board surface
          ctx.fillStyle = '#26150b';
          ctx.fillRect(b.boardX, b.boardY, b.boardWidth, b.boardHeight);

          // Optional Ghost Hint Image inside the board
          if (src && showGhostRef.current) {
            ctx.save();
            ctx.globalAlpha = 0.27;
            ctx.drawImage(
              src,
              0,
              0,
              src.width,
              src.height,
              b.boardX,
              b.boardY,
              b.boardWidth,
              b.boardHeight
            );
            ctx.restore();
          }

          // Draw subtle carved jigsaw slot silhouettes on the board
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 228, 181, 0.16)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          for (const piece of currentPieces) {
            traceJigsawPiecePath(
              ctx,
              piece.targetX,
              piece.targetY,
              pieceW,
              pieceH,
              piece.edges
            );
            ctx.stroke();
          }
          ctx.restore();

          const activeGroupId = dragStateRef.current.activeGroupId;

          // If dragging a piece that is within snap range of its target board slot, highlight the target slot!
          if (activeGroupId !== null) {
            const draggedGroup = currentPieces.filter(
              (p) => p.groupId === activeGroupId && !p.isLocked
            );
            const nearBoard = draggedGroup.some(
              (p) => Math.hypot(p.x - p.targetX, p.y - p.targetY) <= snapThreshold
            );
            if (nearBoard) {
              ctx.save();
              ctx.strokeStyle = '#06d6a0';
              ctx.fillStyle = 'rgba(6, 214, 160, 0.18)';
              ctx.lineWidth = 3.5;
              for (const p of draggedGroup) {
                traceJigsawPiecePath(
                  ctx,
                  p.targetX,
                  p.targetY,
                  pieceW,
                  pieceH,
                  p.edges
                );
                ctx.fill();
                ctx.stroke();
              }
              ctx.restore();
            }
          }

          // 3. Draw puzzle pieces sorted by zOrder (locked pieces at bottom, dragged group on top)
          const sortedPieces = [...currentPieces].sort((a, bPiece) => {
            if (a.isLocked !== bPiece.isLocked) return a.isLocked ? -1 : 1;
            const aActive = activeGroupId !== null && a.groupId === activeGroupId;
            const bActive = activeGroupId !== null && bPiece.groupId === activeGroupId;
            if (aActive !== bActive) return aActive ? 1 : -1;
            return a.zOrder - bPiece.zOrder;
          });

          for (const piece of sortedPieces) {
            if (piece.snapPulse > 0) {
              piece.snapPulse = Math.max(0, piece.snapPulse - dt * 2.4);
            }

            const isDragging =
              activeGroupId !== null && piece.groupId === activeGroupId && !piece.isLocked;

            ctx.save();

            if (isDragging) {
              ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
              ctx.shadowBlur = 18;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 10;
            } else if (!piece.isLocked) {
              ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
              ctx.shadowBlur = 8;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 4;
            }

            traceJigsawPiecePath(
              ctx,
              piece.x,
              piece.y,
              pieceW,
              pieceH,
              piece.edges
            );

            ctx.save();
            ctx.clip();

            if (src) {
              const scaleX = b.boardWidth / src.width;
              const scaleY = b.boardHeight / src.height;
              const drawX = piece.x - piece.col * pieceW;
              const drawY = piece.y - piece.row * pieceH;
              ctx.drawImage(
                src,
                0,
                0,
                src.width,
                src.height,
                drawX,
                drawY,
                src.width * scaleX,
                src.height * scaleY
              );
            } else {
              ctx.fillStyle = '#f59e0b';
              ctx.fillRect(
                piece.x - pieceW * 0.3,
                piece.y - pieceH * 0.3,
                pieceW * 1.6,
                pieceH * 1.6
              );
            }

            if (piece.snapPulse > 0) {
              ctx.fillStyle = `rgba(255, 235, 130, ${piece.snapPulse * 0.42})`;
              ctx.fillRect(
                piece.x - pieceW * 0.35,
                piece.y - pieceH * 0.35,
                pieceW * 1.7,
                pieceH * 1.7
              );
            }
            ctx.restore();

            traceJigsawPiecePath(
              ctx,
              piece.x,
              piece.y,
              pieceW,
              pieceH,
              piece.edges
            );
            if (isDragging) {
              ctx.strokeStyle = '#ffda3e';
              ctx.lineWidth = 3;
            } else if (piece.snapPulse > 0) {
              ctx.strokeStyle = `rgba(255, 224, 102, ${0.4 + piece.snapPulse * 0.6})`;
              ctx.lineWidth = 2.5;
            } else if (piece.isLocked) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
              ctx.lineWidth = 1;
            } else {
              ctx.strokeStyle = 'rgba(255, 248, 231, 0.72)';
              ctx.lineWidth = 2;
            }
            ctx.stroke();

            ctx.restore();
          }

          // 4. Periodic celebratory fireworks during Victory state
          if (gameStateRef.current === 'gameover') {
            victoryFireworkTimer += dt;
            if (victoryFireworkTimer >= 0.55) {
              victoryFireworkTimer = 0;
              const fx =
                b.boardX +
                b.boardWidth * (0.2 + Math.random() * 0.6);
              const fy =
                b.boardY +
                b.boardHeight * (0.2 + Math.random() * 0.6);
              spawnBurst(fx, fy, 22);
            }
          }

          // 5. Update and render pooled particles (stars & confetti)
          const pool = particlePoolRef.current;
          for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.active) continue;

            p.life += dt;
            if (p.life >= p.maxLife) {
              p.active = false;
              continue;
            }

            p.vy += 260 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rotation += p.vRot * dt;

            const alpha = Math.max(0, 1 - p.life / p.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;

            if (p.shape === 'star') {
              drawFivePointStar(ctx, 0, 0, p.size, p.size * 0.45);
              ctx.fill();
            } else if (p.shape === 'confetti') {
              ctx.fillRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const finishDragAndSnap = () => {
    const drag = dragStateRef.current;
    if (drag.activeGroupId === null) return;

    const groupId = drag.activeGroupId;
    const didMove = drag.hasMoved;
    drag.activeGroupId = null;
    drag.pointerId = null;
    drag.hasMoved = false;

    const b = boundsRef.current;
    const { rows: rCount, cols: cCount } = rowsColsRef.current;
    const pieceW = b.boardWidth / cCount;
    const pieceH = b.boardHeight / rCount;

    const snapRes = trySnapGroup(piecesRef.current, groupId, pieceW, pieceH);
    piecesRef.current = snapRes.pieces;

    if (snapRes.snapped) {
      snapComboRef.current += 1;
      if (snapRes.isComplete) {
        soundManager.playVictoryFanfare();
        spawnBurst(
          b.boardX + b.boardWidth / 2,
          b.boardY + b.boardHeight / 2,
          48
        );
      } else {
        soundManager.playSnapConnect(
          snapComboRef.current,
          snapRes.snapType === 'board'
        );
        if (snapRes.snapCenter) {
          spawnBurst(snapRes.snapCenter.x, snapRes.snapCenter.y, 20);
        }
      }
    }

    onPiecesChangeRef.current(snapRes.pieces, {
      moved: didMove,
      snapped: snapRes.snapped,
      isComplete: snapRes.isComplete,
    });
  };

  // Pointer hit-testing & dragging handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameStateRef.current !== 'playing') return;
    const { x, y } = clientToWorld(e.clientX, e.clientY);
    const b = boundsRef.current;
    const { rows: rCount, cols: cCount } = rowsColsRef.current;
    const pieceW = b.boardWidth / cCount;
    const pieceH = b.boardHeight / rCount;

    // Search unlocked pieces from highest zOrder to lowest
    const unlocked = [...piecesRef.current]
      .filter((p) => !p.isLocked)
      .sort((a, bPiece) => bPiece.zOrder - a.zOrder);

    const hitPad = Math.min(pieceW, pieceH) * 0.16;
    const hitPiece = unlocked.find(
      (p) =>
        x >= p.x - hitPad &&
        x <= p.x + pieceW + hitPad &&
        y >= p.y - hitPad &&
        y <= p.y + pieceH + hitPad
    );

    if (!hitPiece) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events where pointerId is not active in browser
    }
    soundManager.playPickup();

    const elevated = bringGroupToFront(piecesRef.current, hitPiece.groupId);
    piecesRef.current = elevated;

    dragStateRef.current = {
      activeGroupId: hitPiece.groupId,
      pointerId: e.pointerId,
      lastX: x,
      lastY: y,
      hasMoved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (drag.activeGroupId === null) return;
    if (drag.pointerId !== null && drag.pointerId !== e.pointerId) return;

    const { x, y } = clientToWorld(e.clientX, e.clientY);
    const dx = x - drag.lastX;
    const dy = y - drag.lastY;

    if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return;

    drag.lastX = x;
    drag.lastY = y;
    drag.hasMoved = true;

    const b = boundsRef.current;
    const { rows: rCount, cols: cCount } = rowsColsRef.current;
    const pieceW = b.boardWidth / cCount;
    const pieceH = b.boardHeight / rCount;

    const moved = moveGroup(
      piecesRef.current,
      drag.activeGroupId,
      dx,
      dy,
      b,
      pieceW,
      pieceH
    );
    piecesRef.current = moved;
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (drag.activeGroupId === null) return;
    if (drag.pointerId !== null && drag.pointerId !== e.pointerId) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    finishDragAndSnap();
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="puzzle-canvas"
      aria-label="Игровое поле пазла"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onLostPointerCapture={() => finishDragAndSnap()}
      className="block w-full h-full touch-none cursor-grab active:cursor-grabbing"
    />
  );
};
