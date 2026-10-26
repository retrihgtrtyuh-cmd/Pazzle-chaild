import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  PuzzlePiece,
  WorkspaceBounds,
  calculateWorkspaceBounds,
  createPuzzlePieces,
  autoSnapOnePiece,
  countConnectedOrthogonalPairs,
  getAdaptiveDifficulties,
} from './game/puzzleLogic';
import {
  PRESET_ARTWORKS,
  renderPresetToCanvas,
  renderImageToCanvas,
} from './game/presetArt';
import { soundManager } from './game/soundEffects';
import { PuzzleCanvas } from './components/PuzzleCanvas';

type GameState = 'title' | 'playing' | 'paused' | 'gameover';

interface RunSnapshot {
  totalPieces: number;
  clearTimeSec: number;
  movesCount: number;
  artworkTitle: string;
  previewDataUrl: string;
  aspectRatio: number;
  gridLabel: string;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });

  const [difficultyIdx, setDifficultyIdx] = useState<number>(0);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PRESET_ARTWORKS[0].id
  );
  const [customImageTitle, setCustomImageTitle] = useState<string | null>(null);
  const [imageResolution, setImageResolution] = useState<{
    width: number;
    height: number;
  }>({
    width: PRESET_ARTWORKS[0].defaultWidth,
    height: PRESET_ARTWORKS[0].defaultHeight,
  });

  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(
    null
  );
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const imageAspect =
    imageResolution.width / Math.max(1, imageResolution.height);

  // Compute the 4 adaptive difficulty levels (Малыш, Дружок, Мастер, Эксперт) for the current image aspect ratio
  const adaptiveDifficulties = useMemo(
    () => getAdaptiveDifficulties(imageAspect),
    [imageAspect]
  );

  const currentDiff =
    adaptiveDifficulties[difficultyIdx] || adaptiveDifficulties[0];

  const [bounds, setBounds] = useState<WorkspaceBounds>(() =>
    calculateWorkspaceBounds(
      typeof window !== 'undefined' ? window.innerWidth : 1440,
      typeof window !== 'undefined' ? window.innerHeight : 900,
      PRESET_ARTWORKS[0].defaultWidth / PRESET_ARTWORKS[0].defaultHeight
    )
  );

  const [pieces, setPieces] = useState<PuzzlePiece[]>([]);
  const [showGhostHint, setShowGhostHint] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [seedCounter, setSeedCounter] = useState<number>(2026);
  const [victorySnapshot, setVictorySnapshot] = useState<RunSnapshot | null>(
    null
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const burstTriggerRef = useRef<
    ((x?: number, y?: number, count?: number) => void) | null
  >(null);

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  // Initialize or update preset artwork when selectedPresetId changes (unless custom image is active)
  useEffect(() => {
    if (customImageTitle) return;
    const preset =
      PRESET_ARTWORKS.find((p) => p.id === selectedPresetId) ||
      PRESET_ARTWORKS[0];
    const offscreen = renderPresetToCanvas(
      preset.id,
      preset.defaultWidth,
      preset.defaultHeight
    );
    setImageResolution({
      width: offscreen.width,
      height: offscreen.height,
    });
    setSourceCanvas(offscreen);
    setPreviewDataUrl(offscreen.toDataURL('image/jpeg', 0.9));
  }, [selectedPresetId, customImageTitle]);

  // Recalculate workspace board bounds whenever imageAspect or viewport dimensions change
  useEffect(() => {
    const nextBounds = calculateWorkspaceBounds(
      typeof window !== 'undefined' ? window.innerWidth : 1440,
      typeof window !== 'undefined' ? window.innerHeight : 900,
      imageAspect
    );
    setBounds(nextBounds);
  }, [imageAspect]);

  // Rebuild puzzle pieces whenever bounds, adaptive grid (rows/cols), or seed changes
  const initBoard = useCallback(
    (
      rows: number,
      cols: number,
      currentBounds: WorkspaceBounds,
      seed: number
    ) => {
      const nextPieces = createPuzzlePieces(rows, cols, currentBounds, seed);
      setPieces(nextPieces);
      setMovesCount(0);
      setElapsedSec(0);
    },
    []
  );

  useEffect(() => {
    initBoard(currentDiff.rows, currentDiff.cols, bounds, seedCounter);
  }, [
    currentDiff.rows,
    currentDiff.cols,
    bounds.boardWidth,
    bounds.boardHeight,
    seedCounter,
    initBoard,
  ]);

  // Responsive window resize and orientationchange handling
  useEffect(() => {
    const handleResize = () => {
      const nextBounds = calculateWorkspaceBounds(
        window.innerWidth,
        window.innerHeight,
        imageAspect
      );
      setBounds((prevBounds) => {
        if (
          prevBounds.width === nextBounds.width &&
          prevBounds.height === nextBounds.height &&
          prevBounds.boardWidth === nextBounds.boardWidth &&
          prevBounds.boardHeight === nextBounds.boardHeight
        ) {
          return prevBounds;
        }
        setPieces((prevPieces) => {
          if (prevPieces.length === 0) return prevPieces;
          const pieceW = nextBounds.boardWidth / currentDiff.cols;
          const pieceH = nextBounds.boardHeight / currentDiff.rows;
          const scaleX = nextBounds.width / Math.max(1, prevBounds.width);
          const scaleY = nextBounds.height / Math.max(1, prevBounds.height);

          return prevPieces.map((p) => {
            const targetX = nextBounds.boardX + p.col * pieceW;
            const targetY = nextBounds.boardY + p.row * pieceH;
            return {
              ...p,
              targetX,
              targetY,
              x: p.isLocked ? targetX : Math.round(p.x * scaleX),
              y: p.isLocked ? targetY : Math.round(p.y * scaleY),
            };
          });
        });
        return nextBounds;
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    const t1 = window.setTimeout(handleResize, 80);
    const t2 = window.setTimeout(handleResize, 350);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [currentDiff.cols, currentDiff.rows, imageAspect]);

  // Timer tick during active gameplay
  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  // Start or restart game handler
  const startNewGame = useCallback(
    (newSeed?: number) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const nextSeed = newSeed ?? Date.now();
      setSeedCounter(nextSeed);
      initBoard(currentDiff.rows, currentDiff.cols, bounds, nextSeed);
      setVictorySnapshot(null);
      document.body.dataset.state = 'playing';
      setGameState('playing');
      soundManager.playPickup();
    },
    [bounds, currentDiff.cols, currentDiff.rows, initBoard]
  );

  // Trigger victory transition with immutable snapshot
  const triggerVictory = useCallback(
    (finalPieces: PuzzlePiece[], finalMoves: number) => {
      const presetObj = PRESET_ARTWORKS.find((p) => p.id === selectedPresetId);
      const artTitle =
        customImageTitle || (presetObj ? presetObj.title : 'Сказочная Картинка');

      setVictorySnapshot({
        totalPieces: finalPieces.length,
        clearTimeSec: Math.max(1, elapsedSec),
        movesCount: Math.max(1, finalMoves),
        artworkTitle: artTitle,
        previewDataUrl,
        aspectRatio: imageAspect,
        gridLabel: currentDiff.shortGridLabel,
      });
      document.body.dataset.state = 'gameover';
      setGameState('gameover');
    },
    [
      currentDiff.shortGridLabel,
      customImageTitle,
      elapsedSec,
      imageAspect,
      previewDataUrl,
      selectedPresetId,
    ]
  );

  // Handle updates from PuzzleCanvas
  const handlePiecesChange = useCallback(
    (
      nextPieces: PuzzlePiece[],
      eventInfo?: { moved?: boolean; snapped?: boolean; isComplete?: boolean }
    ) => {
      setPieces(nextPieces);
      let updatedMoves = movesCount;
      if (eventInfo?.moved) {
        updatedMoves = movesCount + 1;
        setMovesCount(updatedMoves);
      }
      if (eventInfo?.isComplete) {
        triggerVictory(nextPieces, updatedMoves);
      }
    },
    [movesCount, triggerVictory]
  );

  // Child-friendly "Магнит-подсказка" action: snaps one piece/group into place
  const handleMagicSnapOne = useCallback(() => {
    if (gameState !== 'playing') return;
    const pieceW = bounds.boardWidth / currentDiff.cols;
    const pieceH = bounds.boardHeight / currentDiff.rows;
    const res = autoSnapOnePiece(pieces, pieceW, pieceH);
    setPieces(res.pieces);
    const nextMoves = movesCount + 1;
    setMovesCount(nextMoves);

    if (res.snapped) {
      if (res.isComplete) {
        soundManager.playVictoryFanfare();
        burstTriggerRef.current?.(
          bounds.boardX + bounds.boardWidth / 2,
          bounds.boardY + bounds.boardHeight / 2,
          52
        );
        triggerVictory(res.pieces, nextMoves);
      } else {
        soundManager.playMagicHint();
        soundManager.playSnapConnect(res.lockedCount, true);
        if (res.snapCenter) {
          burstTriggerRef.current?.(res.snapCenter.x, res.snapCenter.y, 24);
        }
      }
    }
  }, [
    bounds,
    currentDiff.cols,
    currentDiff.rows,
    gameState,
    movesCount,
    pieces,
    triggerVictory,
  ]);

  // Handle custom image upload from Android tablet / desktop file picker (uncropped, adaptive resolution)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Пожалуйста, выбери файл с картинкой (JPG, PNG, WEBP).');
      return;
    }
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const origW = Math.max(1, img.naturalWidth || img.width || 1024);
        const origH = Math.max(1, img.naturalHeight || img.height || 768);
        const offscreen = renderImageToCanvas(img, 1500);
        const cleanName =
          file.name.replace(/\.[^/.]+$/, '').slice(0, 28) || 'Моя Картинка';

        const newAspect = origW / origH;
        const newDiffs = getAdaptiveDifficulties(newAspect);
        const activeDiff = newDiffs[difficultyIdx] || newDiffs[0];
        const nextBounds = calculateWorkspaceBounds(
          window.innerWidth,
          window.innerHeight,
          newAspect
        );

        setCustomImageTitle(cleanName);
        setImageResolution({ width: origW, height: origH });
        setSourceCanvas(offscreen);
        setPreviewDataUrl(offscreen.toDataURL('image/jpeg', 0.92));
        setBounds(nextBounds);

        const nextSeed = Date.now();
        setSeedCounter(nextSeed);
        initBoard(activeDiff.rows, activeDiff.cols, nextBounds, nextSeed);
        soundManager.playMagicHint();
      };
      img.onerror = () => {
        setUploadError('Не удалось открыть эту картинку. Попробуй другую!');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startNewGame();
        }
        return;
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        setGameState((prev) => {
          if (prev === 'playing') return 'paused';
          if (prev === 'paused') return 'playing';
          return prev;
        });
      } else if (e.code === 'KeyR' && gameState === 'playing') {
        e.preventDefault();
        startNewGame();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted((prev) => {
          const next = !prev;
          soundManager.setMuted(next);
          return next;
        });
      } else if (e.code === 'Space' && gameState === 'playing') {
        e.preventDefault();
        handleMagicSnapOne();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, handleMagicSnapOne, startNewGame]);

  // Compute progress metrics for HUD
  const totalPieces = pieces.length || currentDiff.rows * currentDiff.cols;
  const lockedCount = pieces.filter((p) => p.isLocked).length;
  const connectedPairs = countConnectedOrthogonalPairs(pieces);
  const assembledPiecesCount = Math.max(
    lockedCount,
    Math.min(totalPieces, lockedCount + connectedPairs)
  );

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#2c1b12] select-none">
      {/* Hidden file input for uploading any picture from the Android tablet */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
        aria-label="Загрузить свою картинку для пазла"
      />

      {/* Isolated Canvas2D Layer */}
      <div className="absolute inset-0">
        <PuzzleCanvas
          sourceCanvas={sourceCanvas}
          rows={currentDiff.rows}
          cols={currentDiff.cols}
          pieces={pieces}
          bounds={bounds}
          showGhostHint={showGhostHint}
          gameState={gameState}
          onPiecesChange={handlePiecesChange}
          burstTriggerRef={burstTriggerRef}
        />
      </div>

      {/* PLAYING HUD: Single unified top wooden perimeter bar */}
      {gameState !== 'title' && (
        <div className="fixed inset-x-0 top-0 z-20 pointer-events-none px-4 pt-2.5">
          <div className="mx-auto max-w-7xl flex items-center justify-between gap-3 pointer-events-auto bg-[#3b2213]/95 border-2 border-[#c68b59] rounded-2xl px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
            {/* Left Cluster: World-Matched Progress, Timer & 4 Adaptive Grid Tiers */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <svg
                  viewBox="0 0 24 24"
                  className="w-7 h-7 shrink-0"
                  aria-hidden="true"
                >
                  <path
                    d="M9 3c1.1 0 2 .9 2 2v1h3a2 2 0 0 1 2 2v3h1a2 2 0 1 1 0 4h-1v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3h1a2 2 0 1 0 0-4H4V8a2 2 0 0 1 2-2h3V5c0-1.1.9-2 2-2z"
                    fill="#ffbe0b"
                    stroke="#26150b"
                    strokeWidth="1.8"
                  />
                </svg>
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-[#f3c677] uppercase leading-none">
                    ДЕТАЛИ
                  </div>
                  <div
                    data-testid="hud-progress"
                    className="font-display text-xl font-extrabold text-white tabular-nums leading-tight"
                  >
                    {assembledPiecesCount} / {totalPieces}
                  </div>
                </div>
              </div>

              <div className="h-7 w-[1px] bg-[#c68b59]/30" />

              <div>
                <div className="text-[10px] font-bold tracking-wider text-[#f3c677] uppercase leading-none">
                  ВРЕМЯ
                </div>
                <div className="font-display text-xl font-extrabold text-[#fff3b8] tabular-nums leading-tight">
                  {formatTime(elapsedSec)}
                </div>
              </div>

              <div className="hidden md:block h-7 w-[1px] bg-[#c68b59]/30" />

              <div className="hidden md:block">
                <div className="text-[10px] font-bold tracking-wider text-[#f3c677] uppercase leading-none">
                  СЕТКА ({imageResolution.width}×{imageResolution.height})
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {adaptiveDifficulties.map((diff, idx) => (
                    <button
                      key={diff.id}
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        setDifficultyIdx(idx);
                        const nextSeed = Date.now();
                        setSeedCounter(nextSeed);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-transform active:scale-95 ${
                        difficultyIdx === idx
                          ? 'bg-[#ffbe0b] text-[#26150b] shadow-sm'
                          : 'bg-[#26150b]/70 text-[#f3c677] hover:text-white'
                      }`}
                    >
                      {diff.shortGridLabel} ({diff.totalPieces})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Center/Right Kid Action Dock */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  fileInputRef.current?.click();
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#2ec4b6] hover:bg-[#25a99d] text-[#142423] font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Своя картинка</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowGhostHint((prev) => !prev);
                  soundManager.playPickup();
                }}
                aria-pressed={showGhostHint}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0 ${
                  showGhostHint
                    ? 'bg-[#ff9f1c] text-[#26150b]'
                    : 'bg-[#26150b] text-[#f3c677] border border-[#c68b59]/50'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Фон-подсказка</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleMagicSnapOne();
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#ffbe0b] hover:bg-[#ffd166] text-[#26150b] font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                >
                  <path d="M12 2l2.4 5.2L20 8l-4 4 .9 5.6L12 15l-4.9 2.6L8 12 4 8l5.6-.8L12 2z" />
                </svg>
                <span>Собрать деталь</span>
              </button>
            </div>

            {/* Right Utility Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                tabIndex={-1}
                aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setIsMuted((prev) => {
                    const next = !prev;
                    soundManager.setMuted(next);
                    return next;
                  });
                }}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#26150b] border border-[#c68b59]/60 text-[#fff3b8] flex items-center justify-center hover:bg-[#4e2d18] active:scale-95 transition-transform"
              >
                {isMuted ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Перемешать детали заново"
                onClick={(e) => {
                  e.currentTarget.blur();
                  startNewGame();
                }}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#26150b] border border-[#c68b59]/60 text-[#fff3b8] flex items-center justify-center hover:bg-[#4e2d18] active:scale-95 transition-transform"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Пауза и выбор картинки"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setGameState('paused');
                }}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#26150b] border border-[#c68b59]/60 text-[#fff3b8] flex items-center justify-center hover:bg-[#4e2d18] active:scale-95 transition-transform"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TITLE SCREEN OVERLAY */}
      {gameState === 'title' && (
        <div className="fixed inset-0 z-30 flex flex-col justify-between p-6 bg-[#24140b]/90">
          <div className="my-auto mx-auto w-full max-w-5xl bg-[#3b2213] border-4 border-[#c68b59] rounded-3xl p-6 sm:p-8 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left 7 Columns: Title Lockup, Preset/Upload Picker & 4 Adaptive Difficulty Tiers */}
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-4">
                  <svg
                    viewBox="0 0 72 72"
                    className="w-16 h-16 shrink-0"
                    aria-hidden="true"
                  >
                    <rect
                      x="4"
                      y="4"
                      width="64"
                      height="64"
                      rx="18"
                      fill="#ff9f1c"
                      stroke="#fff3b8"
                      strokeWidth="3"
                    />
                    <path
                      d="M28 14c3.5 0 6 2.5 6 6v3h9c3.3 0 6 2.7 6 6v9h3c3.5 0 6 2.5 6 6s-2.5 6-6 6h-3v8c0 3.3-2.7 6-6 6H20c-3.3 0-6-2.7-6-6v-8h3c3.5 0 6-2.5 6-6s-2.5-6-6-6h-3v-9c0-3.3 2.7-6 6-6h8v-3c0-3.5 2.5-6 6-6z"
                      fill="#ffbe0b"
                      stroke="#26150b"
                      strokeWidth="3.5"
                    />
                    <circle cx="32" cy="36" r="3.5" fill="#26150b" />
                    <circle cx="44" cy="36" r="3.5" fill="#26150b" />
                    <path
                      d="M32 45q6 5 12 0"
                      fill="none"
                      stroke="#26150b"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div>
                    <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#fff8ed] text-balance">
                      Чудо-Пазлы для Планшета
                    </h1>
                    <p className="text-sm sm:text-base text-[#f3c677] font-semibold mt-0.5">
                      Адаптивная рамка и умная нарезка кусочков под размер любой картинки!
                    </p>
                  </div>
                </div>

                {/* Step 1: Choose Picture or Upload From Tablet */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#f3c677]">
                      1. Выбери сюжет или загрузи фото без обрезки:
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2ec4b6] hover:bg-[#25a99d] text-[#142423] font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>Загрузить картинку</span>
                    </button>
                  </div>

                  {uploadError && (
                    <div
                      role="alert"
                      className="text-xs font-bold text-[#ffccd5] bg-[#9b2226] px-3 py-2 rounded-xl"
                    >
                      {uploadError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    {PRESET_ARTWORKS.map((art) => {
                      const isSelected =
                        !customImageTitle && selectedPresetId === art.id;
                      return (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() => {
                            setCustomImageTitle(null);
                            setSelectedPresetId(art.id);
                            soundManager.playPickup();
                          }}
                          className={`min-h-[58px] px-3.5 py-2.5 rounded-2xl text-left border-2 transition-transform active:scale-95 ${
                            isSelected
                              ? 'bg-[#5c3a21] border-[#ffbe0b] shadow-md'
                              : 'bg-[#26150b]/80 border-[#c68b59]/30 hover:border-[#c68b59]'
                          }`}
                        >
                          <div className="font-display font-bold text-sm sm:text-base text-white truncate">
                            {art.title}
                          </div>
                          <div className="text-xs text-[#f3c677] truncate mt-0.5">
                            {art.subtitle}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: 4 Adaptive Difficulty Tiers (up to 48 pieces) */}
                <div className="space-y-2">
                  <span className="block text-xs font-extrabold uppercase tracking-wider text-[#f3c677]">
                    2. Адаптивная разбивка под пропорции ({imageResolution.width}×
                    {imageResolution.height} px):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {adaptiveDifficulties.map((diff, idx) => {
                      const active = difficultyIdx === idx;
                      return (
                        <button
                          key={diff.id}
                          type="button"
                          onClick={() => {
                            setDifficultyIdx(idx);
                            soundManager.playPickup();
                          }}
                          className={`min-h-[58px] px-2.5 py-2 rounded-2xl border-2 text-center transition-transform active:scale-95 ${
                            active
                              ? 'bg-[#ffbe0b] text-[#26150b] border-white font-extrabold shadow-md'
                              : 'bg-[#26150b] text-[#fff8ed] border-[#c68b59]/40 hover:border-[#c68b59]'
                          }`}
                        >
                          <div className="font-display text-sm font-extrabold whitespace-nowrap">
                            {diff.label.split(' (')[0]}
                          </div>
                          <div
                            className={`text-xs font-bold mt-0.5 whitespace-nowrap ${
                              active ? 'text-[#3b2213]' : 'text-[#f3c677]'
                            }`}
                          >
                            {diff.badge} · {diff.shortGridLabel}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary Start CTA */}
                <div className="pt-1">
                  <button
                    type="button"
                    data-start="true"
                    onClick={() => startNewGame()}
                    className="w-full min-h-[58px] py-3.5 px-6 rounded-2xl bg-[#06d6a0] hover:bg-[#05c090] text-[#102a24] font-display text-xl font-extrabold tracking-wide shadow-[0_8px_20px_rgba(6,214,160,0.35)] active:scale-[0.98] transition-transform flex items-center justify-center gap-3 whitespace-nowrap"
                  >
                    <span>Начать собирать пазл</span>
                    <svg
                      viewBox="0 0 24 24"
                      className="w-6 h-6"
                      fill="currentColor"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Right 5 Columns: Live Adaptive Aspect-Ratio Framed Picture Showcase */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <div className="w-full h-[310px] flex items-center justify-center">
                  <div
                    className="relative max-w-full max-h-full rounded-3xl border-4 border-[#c68b59] bg-[#26150b] overflow-hidden shadow-xl"
                    style={{
                      aspectRatio: `${imageResolution.width} / ${imageResolution.height}`,
                      height: imageAspect < 1 ? '100%' : 'auto',
                      width: imageAspect >= 1 ? '100%' : 'auto',
                    }}
                  >
                    {previewDataUrl ? (
                      <img
                        src={previewDataUrl}
                        alt="Выбранная картинка для пазла"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain block"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#f3c677] font-bold px-6">
                        Загрузка картинки...
                      </div>
                    )}

                    {/* Dynamic Jigsaw Cut Grid Preview matching exact cols x rows */}
                    <div
                      className="absolute inset-0 pointer-events-none grid"
                      style={{
                        gridTemplateColumns: `repeat(${currentDiff.cols}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${currentDiff.rows}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from({
                        length: currentDiff.rows * currentDiff.cols,
                      }).map((_, idx) => (
                        <div
                          key={idx}
                          className="border border-white/45 shadow-[inset_0_0_6px_rgba(0,0,0,0.25)]"
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-center text-xs sm:text-sm font-bold text-[#f3c677]">
                  {customImageTitle
                    ? `Своя картинка: ${customImageTitle}`
                    : `Сюжет: ${
                        PRESET_ARTWORKS.find((p) => p.id === selectedPresetId)
                          ?.title
                      }`}{' '}
                  · {imageResolution.width}×{imageResolution.height} ·{' '}
                  {currentDiff.label}
                </div>
              </div>
            </div>
          </div>

          <div className="text-center text-xs sm:text-sm font-semibold text-[#f3c677]/90 py-1">
            Перетаскивай кусочки пальцем или мышкой · Соединяй соседние детали между собой · Пробел Собрать деталь · P Пауза
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {gameState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-[#1e1008]/80"
        >
          <div className="w-full max-w-md bg-[#3b2213] border-4 border-[#c68b59] rounded-3xl p-6 text-center shadow-2xl space-y-5">
            <h2
              id="pause-modal-title"
              className="font-display text-3xl font-extrabold text-[#fff8ed]"
            >
              Игра на паузе
            </h2>

            <div className="grid grid-cols-2 gap-3 bg-[#26150b] p-4 rounded-2xl border border-[#c68b59]/40">
              <div>
                <div className="text-xs font-bold uppercase text-[#f3c677]">
                  СОБРАНО ДЕТАЛЕЙ
                </div>
                <div className="font-display text-2xl font-extrabold text-white tabular-nums mt-0.5">
                  {assembledPiecesCount} / {totalPieces}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-[#f3c677]">
                  ВРЕМЯ
                </div>
                <div className="font-display text-2xl font-extrabold text-[#ffbe0b] tabular-nums mt-0.5">
                  {formatTime(elapsedSec)}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setGameState('playing')}
                className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#06d6a0] hover:bg-[#05c090] text-[#102a24] font-display text-lg font-extrabold active:scale-95 transition-transform whitespace-nowrap"
              >
                Продолжить игру
              </button>
              <button
                type="button"
                onClick={() => startNewGame()}
                className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#ffbe0b] hover:bg-[#ffd166] text-[#26150b] font-display text-lg font-extrabold active:scale-95 transition-transform whitespace-nowrap"
              >
                Перемешать заново
              </button>
              <button
                type="button"
                onClick={() => setGameState('title')}
                className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#26150b] hover:bg-[#4e2d18] text-[#f3c677] border border-[#c68b59]/50 font-display text-base font-bold active:scale-95 transition-transform whitespace-nowrap"
              >
                Выбрать другую картинку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY MODAL ('gameover') */}
      {gameState === 'gameover' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="victory-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#1e1008]/75"
        >
          <div className="w-full max-w-lg bg-[#3b2213] border-4 border-[#ffbe0b] rounded-3xl p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.75)] space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#ffbe0b] text-[#26150b] shadow-lg mx-auto">
              <svg
                viewBox="0 0 24 24"
                className="w-10 h-10"
                fill="currentColor"
              >
                <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
              </svg>
            </div>

            <div>
              <h2
                id="victory-modal-title"
                className="font-display text-3xl sm:text-4xl font-extrabold text-[#fff8ed] text-balance"
              >
                Ура! Картинка собрана!
              </h2>
              <p className="text-sm sm:text-base font-bold text-[#f3c677] mt-1">
                Все кусочки пазла соединились в цельную картину «
                {victorySnapshot?.artworkTitle || 'Чудо-Пазл'}»!
              </p>
            </div>

            {(victorySnapshot?.previewDataUrl || previewDataUrl) && (
              <div className="mx-auto h-40 flex items-center justify-center">
                <div
                  className="max-h-full rounded-2xl border-4 border-[#ffbe0b] overflow-hidden shadow-lg"
                  style={{
                    aspectRatio: `${victorySnapshot?.aspectRatio || imageAspect}`,
                    height: '100%',
                  }}
                >
                  <img
                    src={victorySnapshot?.previewDataUrl || previewDataUrl}
                    alt="Собранная картинка"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain block"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5 bg-[#26150b] p-3.5 rounded-2xl border border-[#c68b59]/40">
              <div>
                <div className="text-[11px] font-bold uppercase text-[#f3c677]">
                  ДЕТАЛИ ({victorySnapshot?.gridLabel || currentDiff.shortGridLabel})
                </div>
                <div className="font-display text-2xl font-extrabold text-[#06d6a0] tabular-nums mt-0.5">
                  {victorySnapshot?.totalPieces ?? totalPieces} /{' '}
                  {victorySnapshot?.totalPieces ?? totalPieces}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase text-[#f3c677]">
                  ВРЕМЯ
                </div>
                <div className="font-display text-2xl font-extrabold text-[#ffbe0b] tabular-nums mt-0.5">
                  {formatTime(victorySnapshot?.clearTimeSec ?? elapsedSec)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase text-[#f3c677]">
                  ХОДЫ
                </div>
                <div className="font-display text-2xl font-extrabold text-white tabular-nums mt-0.5">
                  {victorySnapshot?.movesCount ?? Math.max(1, movesCount)}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={() => startNewGame()}
                className="flex-1 min-h-[52px] py-3 px-5 rounded-2xl bg-[#06d6a0] hover:bg-[#05c090] text-[#102a24] font-display text-lg font-extrabold shadow-lg active:scale-95 transition-transform whitespace-nowrap"
              >
                Играть снова
              </button>
              <button
                type="button"
                onClick={() => {
                  setGameState('title');
                }}
                className="flex-1 min-h-[52px] py-3 px-5 rounded-2xl bg-[#ffbe0b] hover:bg-[#ffd166] text-[#26150b] font-display text-lg font-extrabold shadow-lg active:scale-95 transition-transform whitespace-nowrap"
              >
                Выбрать картинку
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
