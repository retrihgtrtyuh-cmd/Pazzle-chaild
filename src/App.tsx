import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  PuzzlePiece,
  WorkspaceBounds,
  calculateWorkspaceBounds,
  createPuzzlePieces,
  autoSnapOnePiece,
  countConnectedOrthogonalPairs,
  getAdaptiveDifficulties,
  formatPieceCountRu,
} from './game/puzzleLogic';
import {
  PRESET_ARTWORKS,
  renderPresetToCanvas,
} from './game/presetArt';
import {
  QueuedImageItem,
  loadFilesOrArchiveToQueue,
  extractImagesFromZipBuffer,
  createSampleStoriesZipBytes,
} from './game/archiveLoader';
import {
  PuzzleRunRecord,
  loadPuzzleRuns,
  computeStatsSummary,
  recordCompletedPuzzleRun,
  clearPuzzleStats,
} from './game/statsManager';
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
  resolutionLabel: string;
  bestTimeForPiecesSec: number;
  avgTimeForPiecesSec: number;
  isNewBestForPieceCount: boolean;
  isNewOverallBest: boolean;
  nextQueueItemTitle: string | null;
  archiveProgressLabel: string | null;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });

  // 0: Малыш, 1: Дружок, 2: Мастер, 3: Эксперт, 4: От разрешения (Авто)
  const [difficultyIdx, setDifficultyIdx] = useState<number>(4);
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

  // Archive / Multi-Image Queue State
  const [imageQueue, setImageQueue] = useState<QueuedImageItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
  const [archiveSourceLabel, setArchiveSourceLabel] = useState<string>('');
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState<boolean>(true);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(
    null
  );
  const [isLoadingArchive, setIsLoadingArchive] = useState<boolean>(false);

  // Statistics State
  const [puzzleRuns, setPuzzleRuns] = useState<PuzzleRunRecord[]>(() =>
    loadPuzzleRuns()
  );
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);

  const statsSummary = useMemo(
    () => computeStatsSummary(puzzleRuns),
    [puzzleRuns]
  );

  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(
    null
  );
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const imageAspect =
    imageResolution.width / Math.max(1, imageResolution.height);

  // Compute adaptive difficulty levels (including 'От разрешения') for the current image resolution & aspect ratio
  const adaptiveDifficulties = useMemo(
    () =>
      getAdaptiveDifficulties(
        imageAspect,
        imageResolution.width,
        imageResolution.height
      ),
    [imageAspect, imageResolution.width, imageResolution.height]
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

  // Initialize or update preset artwork when selectedPresetId changes (unless custom image/archive is active)
  useEffect(() => {
    if (customImageTitle || imageQueue.length > 0) return;
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
  }, [selectedPresetId, customImageTitle, imageQueue.length]);

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

  // Activate a specific item from the loaded archive/queue
  const activateQueueItem = useCallback(
    (
      queue: QueuedImageItem[],
      index: number,
      shouldStartPlaying: boolean
    ) => {
      if (queue.length === 0) return;
      const safeIndex = ((index % queue.length) + queue.length) % queue.length;
      const item = queue[safeIndex];
      const itemAspect = item.width / Math.max(1, item.height);
      const nextDiffs = getAdaptiveDifficulties(
        itemAspect,
        item.width,
        item.height
      );
      const activeDiff = nextDiffs[difficultyIdx] || nextDiffs[0];
      const nextBounds = calculateWorkspaceBounds(
        window.innerWidth,
        window.innerHeight,
        itemAspect
      );

      setCurrentQueueIndex(safeIndex);
      setCustomImageTitle(item.title);
      setImageResolution({ width: item.width, height: item.height });
      setSourceCanvas(item.canvas);
      setPreviewDataUrl(item.previewDataUrl);
      setBounds(nextBounds);

      const nextSeed = Date.now() + safeIndex;
      setSeedCounter(nextSeed);
      initBoard(activeDiff.rows, activeDiff.cols, nextBounds, nextSeed);
      setAutoNextCountdown(null);

      if (shouldStartPlaying) {
        setVictorySnapshot(null);
        document.body.dataset.state = 'playing';
        setGameState('playing');
        soundManager.playPickup();
      }
    },
    [difficultyIdx, initBoard]
  );

  // Advance to the next image (in archive queue if loaded, or next built-in preset)
  const advanceToNextPicture = useCallback(
    (startImmediately = true) => {
      setAutoNextCountdown(null);
      if (imageQueue.length > 0) {
        const nextIdx = (currentQueueIndex + 1) % imageQueue.length;
        activateQueueItem(imageQueue, nextIdx, startImmediately);
      } else {
        const currPresetIdx = PRESET_ARTWORKS.findIndex(
          (p) => p.id === selectedPresetId
        );
        const nextPreset =
          PRESET_ARTWORKS[(currPresetIdx + 1) % PRESET_ARTWORKS.length];
        setCustomImageTitle(null);
        setSelectedPresetId(nextPreset.id);

        const offscreen = renderPresetToCanvas(
          nextPreset.id,
          nextPreset.defaultWidth,
          nextPreset.defaultHeight
        );
        const nextAspect = offscreen.width / Math.max(1, offscreen.height);
        const nextDiffs = getAdaptiveDifficulties(
          nextAspect,
          offscreen.width,
          offscreen.height
        );
        const activeDiff = nextDiffs[difficultyIdx] || nextDiffs[0];
        const nextBounds = calculateWorkspaceBounds(
          window.innerWidth,
          window.innerHeight,
          nextAspect
        );

        setImageResolution({
          width: offscreen.width,
          height: offscreen.height,
        });
        setSourceCanvas(offscreen);
        setPreviewDataUrl(offscreen.toDataURL('image/jpeg', 0.9));
        setBounds(nextBounds);

        const nextSeed = Date.now();
        setSeedCounter(nextSeed);
        initBoard(activeDiff.rows, activeDiff.cols, nextBounds, nextSeed);

        if (startImmediately) {
          setVictorySnapshot(null);
          document.body.dataset.state = 'playing';
          setGameState('playing');
          soundManager.playPickup();
        }
      }
    },
    [
      activateQueueItem,
      currentQueueIndex,
      difficultyIdx,
      imageQueue,
      initBoard,
      selectedPresetId,
    ]
  );

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
    if (gameState !== 'playing' || showStatsModal) return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState, showStatsModal]);

  // Auto-advance countdown timer when a puzzle is solved
  useEffect(() => {
    if (
      gameState !== 'gameover' ||
      !autoAdvanceEnabled ||
      autoNextCountdown === null ||
      showStatsModal
    ) {
      return;
    }
    if (autoNextCountdown <= 0) {
      advanceToNextPicture(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [
    advanceToNextPicture,
    autoAdvanceEnabled,
    autoNextCountdown,
    gameState,
    showStatsModal,
  ]);

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
      setAutoNextCountdown(null);
      document.body.dataset.state = 'playing';
      setGameState('playing');
      soundManager.playPickup();
    },
    [bounds, currentDiff.cols, currentDiff.rows, initBoard]
  );

  // Trigger victory transition, record statistics, and schedule archive auto-switch
  const triggerVictory = useCallback(
    (finalPieces: PuzzlePiece[], finalMoves: number) => {
      const presetObj = PRESET_ARTWORKS.find((p) => p.id === selectedPresetId);
      const artTitle =
        customImageTitle || (presetObj ? presetObj.title : 'Сказочная Картинка');
      const clearSec = Math.max(1, elapsedSec);
      const moves = Math.max(1, finalMoves);
      const resLabel = `${imageResolution.width}×${imageResolution.height}`;

      // Record statistics for this piece count and overall
      const { runs: updatedRuns, result: statResult } =
        recordCompletedPuzzleRun(puzzleRuns, {
          totalPieces: finalPieces.length,
          gridLabel: currentDiff.shortGridLabel,
          clearTimeSec: clearSec,
          movesCount: moves,
          artworkTitle: artTitle,
          imageResolution: resLabel,
        });
      setPuzzleRuns(updatedRuns);

      // Mark current archive item as completed if in queue
      let nextTitle: string | null = null;
      let archiveProgress: string | null = null;

      if (imageQueue.length > 0) {
        const updatedQueue = imageQueue.map((item, idx) =>
          idx === currentQueueIndex ? { ...item, completed: true } : item
        );
        setImageQueue(updatedQueue);
        const solvedCount = updatedQueue.filter((i) => i.completed).length;
        archiveProgress = `Архив: собрано ${solvedCount} из ${updatedQueue.length}`;
        if (updatedQueue.length > 1) {
          const nextItem =
            updatedQueue[(currentQueueIndex + 1) % updatedQueue.length];
          nextTitle = `${nextItem.title} (${nextItem.width}×${nextItem.height})`;
        }
      } else {
        const currPresetIdx = PRESET_ARTWORKS.findIndex(
          (p) => p.id === selectedPresetId
        );
        const nextPreset =
          PRESET_ARTWORKS[(currPresetIdx + 1) % PRESET_ARTWORKS.length];
        nextTitle = nextPreset.title;
      }

      setVictorySnapshot({
        totalPieces: finalPieces.length,
        clearTimeSec: clearSec,
        movesCount: moves,
        artworkTitle: artTitle,
        previewDataUrl,
        aspectRatio: imageAspect,
        gridLabel: currentDiff.shortGridLabel,
        resolutionLabel: resLabel,
        bestTimeForPiecesSec: statResult.pieceStats.bestTimeSec,
        avgTimeForPiecesSec: statResult.pieceStats.avgTimeSec,
        isNewBestForPieceCount: statResult.isNewBestForPieceCount,
        isNewOverallBest: statResult.isNewOverallBest,
        nextQueueItemTitle: nextTitle,
        archiveProgressLabel: archiveProgress,
      });

      // Start 3-second auto-advance countdown if autoAdvanceEnabled is on
      if (autoAdvanceEnabled && (imageQueue.length > 1 || imageQueue.length === 0)) {
        setAutoNextCountdown(3);
      } else {
        setAutoNextCountdown(null);
      }

      document.body.dataset.state = 'gameover';
      setGameState('gameover');
    },
    [
      autoAdvanceEnabled,
      currentDiff.shortGridLabel,
      currentQueueIndex,
      customImageTitle,
      elapsedSec,
      imageAspect,
      imageQueue,
      imageResolution.height,
      imageResolution.width,
      previewDataUrl,
      puzzleRuns,
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

  // Handle custom image or .ZIP archive upload from Android tablet / desktop file picker
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
    setIsLoadingArchive(true);

    try {
      const { items, sourceLabel, isArchive } =
        await loadFilesOrArchiveToQueue(files);

      if (items.length === 0) {
        setUploadError(
          'В выбранном файле или архиве не найдено подходящих картинок (JPG, PNG, WEBP, GIF, BMP, SVG).'
        );
        setIsLoadingArchive(false);
        e.target.value = '';
        return;
      }

      setImageQueue(items);
      setArchiveSourceLabel(sourceLabel);
      if (isArchive) {
        setAutoAdvanceEnabled(true);
      }

      // Activate the first picture in the uploaded archive / file selection
      const first = items[0];
      const firstAspect = first.width / Math.max(1, first.height);
      const nextDiffs = getAdaptiveDifficulties(
        firstAspect,
        first.width,
        first.height
      );
      const activeDiff = nextDiffs[difficultyIdx] || nextDiffs[0];
      const nextBounds = calculateWorkspaceBounds(
        window.innerWidth,
        window.innerHeight,
        firstAspect
      );

      setCurrentQueueIndex(0);
      setCustomImageTitle(first.title);
      setImageResolution({ width: first.width, height: first.height });
      setSourceCanvas(first.canvas);
      setPreviewDataUrl(first.previewDataUrl);
      setBounds(nextBounds);

      const nextSeed = Date.now();
      setSeedCounter(nextSeed);
      initBoard(activeDiff.rows, activeDiff.cols, nextBounds, nextSeed);
      soundManager.playMagicHint();
    } catch {
      setUploadError(
        'Не удалось прочитать архив или картинку. Проверь, что это ZIP-архив или изображение.'
      );
    } finally {
      setIsLoadingArchive(false);
      e.target.value = '';
    }
  };

  // Load built-in 4-image demo .ZIP archive so users can immediately test archive auto-switching
  const handleLoadDemoZipArchive = async () => {
    setUploadError(null);
    setIsLoadingArchive(true);
    try {
      const zipBytes = createSampleStoriesZipBytes();
      const items = await extractImagesFromZipBuffer(zipBytes);
      if (items.length > 0) {
        setImageQueue(items);
        setArchiveSourceLabel(`Демо-архив «Сказки.zip» (${items.length} шт.)`);
        setAutoAdvanceEnabled(true);
        activateQueueItem(items, 0, false);
        soundManager.playMagicHint();
      }
    } catch {
      setUploadError('Ошибка при распаковке демо-архива.');
    } finally {
      setIsLoadingArchive(false);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (showStatsModal) {
        if (e.code === 'Escape') {
          e.preventDefault();
          setShowStatsModal(false);
        }
        return;
      }

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
      } else if (e.code === 'KeyN' && gameState === 'playing') {
        e.preventDefault();
        advanceToNextPicture(true);
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
  }, [
    advanceToNextPicture,
    gameState,
    handleMagicSnapOne,
    showStatsModal,
    startNewGame,
  ]);

  // Compute progress metrics for HUD
  const totalPieces = pieces.length || currentDiff.rows * currentDiff.cols;
  const lockedCount = pieces.filter((p) => p.isLocked).length;
  const connectedPairs = countConnectedOrthogonalPairs(pieces);
  const assembledPiecesCount = Math.max(
    lockedCount,
    Math.min(totalPieces, lockedCount + connectedPairs)
  );

  // Statistics for the currently active piece count
  const currentPieceCountStats = statsSummary.byPieceCount[totalPieces] || null;

  const formatTime = (sec: number | null | undefined) => {
    if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
    const rounded = Math.max(1, Math.round(sec));
    const m = Math.floor(rounded / 60);
    const s = rounded % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#2c1b12] select-none">
      {/* Hidden file input supporting single image, multiple images, or .ZIP archives */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.zip,application/zip,application/x-zip-compressed"
        onChange={handleFileUpload}
        className="hidden"
        aria-label="Загрузить картинку или ZIP-архив с картинками"
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
        <div className="fixed inset-x-0 top-0 z-20 pointer-events-none px-3 pt-2">
          <div className="mx-auto max-w-7xl flex items-center justify-between gap-2 pointer-events-auto bg-[#3b2213]/95 border-2 border-[#c68b59] rounded-2xl px-3 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
            {/* Left Cluster: Progress, Timer, Best Record & Compact Adaptive Grid Selector */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-2 shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="w-6 h-6 shrink-0"
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
                    className="font-display text-lg font-extrabold text-white tabular-nums leading-tight"
                  >
                    {assembledPiecesCount} / {totalPieces}
                  </div>
                </div>
              </div>

              <div className="h-7 w-[1px] bg-[#c68b59]/30 shrink-0" />

              <div className="shrink-0">
                <div className="text-[10px] font-bold tracking-wider text-[#f3c677] uppercase leading-none">
                  ВРЕМЯ
                </div>
                <div className="font-display text-lg font-extrabold text-[#fff3b8] tabular-nums leading-tight">
                  {formatTime(elapsedSec)}
                </div>
              </div>

              <div className="hidden lg:block h-7 w-[1px] bg-[#c68b59]/30 shrink-0" />

              <div className="hidden lg:block shrink-0">
                <div className="text-[10px] font-bold tracking-wider text-[#f3c677] uppercase leading-none">
                  КАРТИНКА {imageResolution.width}×{imageResolution.height} PX · ДЕТАЛЬ {currentDiff.piecePixelWidth}×{currentDiff.piecePixelHeight}
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
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-transform active:scale-95 ${
                        difficultyIdx === idx
                          ? 'bg-[#ffbe0b] text-[#26150b] shadow-sm'
                          : 'bg-[#26150b]/70 text-[#f3c677] hover:text-white'
                      }`}
                    >
                      {diff.id === 'auto-res'
                        ? `Авто ${diff.shortGridLabel}`
                        : `${diff.shortGridLabel} (${diff.totalPieces})`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Center/Right Kid Action Dock */}
            <div className="flex items-center gap-1.5 shrink-0">
              {imageQueue.length > 1 && (
                <button
                  type="button"
                  data-testid="hud-next-archive-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    advanceToNextPicture(true);
                  }}
                  title="Переключить на следующую картинку из архива"
                  className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#5c3a21] hover:bg-[#6e4527] border border-[#ffbe0b]/60 text-[#fff8ed] font-extrabold text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
                >
                  <span>
                    Архив {currentQueueIndex + 1}/{imageQueue.length}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5 text-[#ffbe0b]"
                    fill="currentColor"
                  >
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line
                      x1="19"
                      y1="5"
                      x2="19"
                      y2="19"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                  </svg>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  fileInputRef.current?.click();
                }}
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#2ec4b6] hover:bg-[#25a99d] text-[#142423] font-extrabold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Фото / ZIP</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowGhostHint((prev) => !prev);
                  soundManager.playPickup();
                }}
                aria-pressed={showGhostHint}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0 ${
                  showGhostHint
                    ? 'bg-[#ff9f1c] text-[#26150b]'
                    : 'bg-[#26150b] text-[#f3c677] border border-[#c68b59]/50'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="hidden xl:inline">Подсказка</span>
              </button>

              <button
                type="button"
                data-testid="magic-snap-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleMagicSnapOne();
                }}
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#ffbe0b] hover:bg-[#ffd166] text-[#26150b] font-extrabold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                >
                  <path d="M12 2l2.4 5.2L20 8l-4 4 .9 5.6L12 15l-4.9 2.6L8 12 4 8l5.6-.8L12 2z" />
                </svg>
                <span>Собрать деталь</span>
              </button>
            </div>

            {/* Right Utility Controls (Stats, Sound, Shuffle, Pause) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="open-stats-hud"
                aria-label="Статистика и рекорды"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowStatsModal(true);
                }}
                className="min-h-[42px] px-3 rounded-xl bg-[#26150b] border border-[#c68b59]/60 text-[#ffbe0b] font-bold text-xs flex items-center gap-1.5 hover:bg-[#4e2d18] active:scale-95 transition-transform whitespace-nowrap"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span className="hidden md:inline">Статистика</span>
              </button>

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
                className="min-w-[42px] min-h-[42px] rounded-xl bg-[#26150b] border border-[#c68b59]/60 text-[#fff3b8] flex items-center justify-center hover:bg-[#4e2d18] active:scale-95 transition-transform"
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
                className="min-w-[42px] min-h-[42px] rounded-xl bg-[#26150b] border border-[#c68b59]/60 text-[#fff3b8] flex items-center justify-center hover:bg-[#4e2d18] active:scale-95 transition-transform"
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
                className="min-w-[42px] min-h-[42px] rounded-xl bg-[#26150b] border border-[#c68b59]/60 text-[#fff3b8] flex items-center justify-center hover:bg-[#4e2d18] active:scale-95 transition-transform"
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
        <div className="fixed inset-0 z-30 flex flex-col justify-between p-4 sm:p-6 bg-[#24140b]/92 overflow-y-auto">
          <div className="my-auto mx-auto w-full max-w-6xl bg-[#3b2213] border-4 border-[#c68b59] rounded-3xl p-5 sm:p-7 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left 7 Columns: Title Lockup, Archive/Image Upload, Presets & Adaptive Resolution Breakdown */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    <svg
                      viewBox="0 0 72 72"
                      className="w-14 h-14 shrink-0"
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
                      <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#fff8ed]">
                        Чудо-Пазлы для Планшета
                      </h1>
                      <p className="text-xs sm:text-sm text-[#f3c677] font-semibold mt-0.5">
                        Загрузка картинок и ZIP-архивов с автопереходом · Статистика и адаптация под любое разрешение
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="open-stats-title"
                    onClick={() => setShowStatsModal(true)}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#26150b] hover:bg-[#4e2d18] border-2 border-[#ffbe0b]/70 text-[#ffbe0b] font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.3"
                    >
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    <span>
                      Статистика ({statsSummary.totalCompleted})
                    </span>
                  </button>
                </div>

                {/* Step 1: Choose Picture, Multi-Images, or Upload .ZIP Archive */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#f3c677]">
                      1. Загрузи картинку или ZIP-архив с автопереключением:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="load-demo-zip-btn"
                        onClick={handleLoadDemoZipArchive}
                        disabled={isLoadingArchive}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#5c3a21] hover:bg-[#704628] border border-[#ffbe0b]/60 text-[#fff8ed] font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
                      >
                        <span>Демо-архив .ZIP (4 шт.)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoadingArchive}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#2ec4b6] hover:bg-[#25a99d] text-[#142423] font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform whitespace-nowrap shrink-0"
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
                        <span>
                          {isLoadingArchive
                            ? 'Распаковка...'
                            : 'Загрузить фото / .ZIP'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {uploadError && (
                    <div
                      role="alert"
                      className="text-xs font-bold text-[#ffccd5] bg-[#9b2226] px-3 py-2 rounded-xl"
                    >
                      {uploadError}
                    </div>
                  )}

                  {/* Active Archive Queue Strip (shown when .ZIP or multiple images are loaded) */}
                  {imageQueue.length > 0 && (
                    <div className="bg-[#26150b] border border-[#ffbe0b]/50 rounded-2xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-extrabold text-[#ffbe0b] truncate">
                          {archiveSourceLabel} · Картинка {currentQueueIndex + 1} из{' '}
                          {imageQueue.length}
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[#fff8ed] font-bold shrink-0">
                          <input
                            type="checkbox"
                            checked={autoAdvanceEnabled}
                            onChange={(e) =>
                              setAutoAdvanceEnabled(e.target.checked)
                            }
                            className="accent-[#06d6a0] w-4 h-4 rounded"
                          />
                          <span>Автопереход после сборки</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {imageQueue.map((item, idx) => {
                          const isCurrent = idx === currentQueueIndex;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                activateQueueItem(imageQueue, idx, false)
                              }
                              className={`px-2.5 py-1.5 rounded-xl border text-left shrink-0 transition-transform active:scale-95 flex items-center gap-2 ${
                                isCurrent
                                  ? 'bg-[#5c3a21] border-[#ffbe0b] text-white'
                                  : 'bg-[#3b2213]/80 border-[#c68b59]/30 text-[#f3c677]'
                              }`}
                            >
                              <img
                                src={item.previewDataUrl}
                                alt={item.title}
                                className="w-8 h-8 rounded object-cover bg-[#1a0e07] shrink-0"
                              />
                              <div className="text-xs">
                                <div className="font-bold truncate max-w-[110px]">
                                  {idx + 1}. {item.title}
                                </div>
                                <div className="text-[10px] text-[#f3c677]">
                                  {item.width}×{item.height} px{' '}
                                  {item.completed ? '· Собрано' : ''}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Built-in Storybook Presets */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PRESET_ARTWORKS.map((art) => {
                      const isSelected =
                        !customImageTitle &&
                        imageQueue.length === 0 &&
                        selectedPresetId === art.id;
                      return (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() => {
                            setImageQueue([]);
                            setArchiveSourceLabel('');
                            setCustomImageTitle(null);
                            setSelectedPresetId(art.id);
                            soundManager.playPickup();
                          }}
                          className={`min-h-[52px] px-3 py-2 rounded-2xl text-left border-2 transition-transform active:scale-95 ${
                            isSelected
                              ? 'bg-[#5c3a21] border-[#ffbe0b] shadow-md'
                              : 'bg-[#26150b]/80 border-[#c68b59]/30 hover:border-[#c68b59]'
                          }`}
                        >
                          <div className="font-display font-bold text-xs sm:text-sm text-white truncate">
                            {art.title}
                          </div>
                          <div className="text-[11px] text-[#f3c677] truncate mt-0.5">
                            {art.defaultWidth}×{art.defaultHeight} px
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: 5 Adaptive Difficulty Tiers (4 standard + 1 Auto From Resolution) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#f3c677]">
                      2. Адаптация пазла под разрешение ({imageResolution.width}×
                      {imageResolution.height} px, деталь {currentDiff.piecePixelWidth}×
                      {currentDiff.piecePixelHeight} px):
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {adaptiveDifficulties.map((diff, idx) => {
                      const active = difficultyIdx === idx;
                      const pieceStat =
                        statsSummary.byPieceCount[diff.totalPieces];
                      return (
                        <button
                          key={diff.id}
                          type="button"
                          onClick={() => {
                            setDifficultyIdx(idx);
                            soundManager.playPickup();
                          }}
                          className={`min-h-[58px] px-2 py-2 rounded-2xl border-2 text-center transition-transform active:scale-95 ${
                            active
                              ? 'bg-[#ffbe0b] text-[#26150b] border-white font-extrabold shadow-md'
                              : 'bg-[#26150b] text-[#fff8ed] border-[#c68b59]/40 hover:border-[#c68b59]'
                          }`}
                        >
                          <div className="font-display text-xs sm:text-sm font-extrabold whitespace-nowrap">
                            {diff.label.split(' (')[0]}
                          </div>
                          <div
                            className={`text-[11px] font-bold mt-0.5 whitespace-nowrap ${
                              active ? 'text-[#3b2213]' : 'text-[#f3c677]'
                            }`}
                          >
                            {diff.badge} · {diff.shortGridLabel}
                          </div>
                          {pieceStat && (
                            <div
                              className={`text-[10px] font-semibold mt-0.5 whitespace-nowrap ${
                                active ? 'text-[#26150b]' : 'text-[#06d6a0]'
                              }`}
                            >
                              Рекорд: {formatTime(pieceStat.bestTimeSec)}
                            </div>
                          )}
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
                    className="w-full min-h-[54px] py-3 px-6 rounded-2xl bg-[#06d6a0] hover:bg-[#05c090] text-[#102a24] font-display text-lg sm:text-xl font-extrabold tracking-wide shadow-[0_8px_20px_rgba(6,214,160,0.35)] active:scale-[0.98] transition-transform flex items-center justify-center gap-3 whitespace-nowrap"
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

              {/* Right 5 Columns: Live Adaptive Aspect-Ratio Framed Picture Showcase + Quick Stats */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-3">
                <div className="w-full h-[270px] flex items-center justify-center">
                  <div
                    className="relative rounded-3xl border-4 border-[#c68b59] bg-[#26150b] overflow-hidden shadow-xl"
                    style={{
                      aspectRatio: `${imageResolution.width} / ${imageResolution.height}`,
                      height: imageAspect <= 1.35 ? '265px' : 'auto',
                      width: imageAspect > 1.35 ? '100%' : 'auto',
                      maxHeight: '265px',
                      maxWidth: '100%',
                    }}
                  >
                    {previewDataUrl ? (
                      <img
                        src={previewDataUrl}
                        alt="Выбранная картинка для пазла"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover block"
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

                <div className="text-center text-xs sm:text-sm font-bold text-[#f3c677]">
                  {customImageTitle
                    ? `Картинка: ${customImageTitle}`
                    : `Сюжет: ${
                        PRESET_ARTWORKS.find((p) => p.id === selectedPresetId)
                          ?.title
                      }`}{' '}
                  · {imageResolution.width}×{imageResolution.height} px ·{' '}
                  {currentDiff.label}
                </div>

                {/* Live Best & Average Time for the currently selected piece count */}
                <div className="w-full bg-[#26150b]/90 border border-[#c68b59]/40 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-[#f3c677]">
                  <span>
                    Статистика для{' '}
                    <strong className="text-white">
                      {formatPieceCountRu(currentDiff.totalPieces)}
                    </strong>
                    :
                  </span>
                  <span>
                    Лучшее:{' '}
                    <strong className="text-[#06d6a0]">
                      {formatTime(currentPieceCountStats?.bestTimeSec)}
                    </strong>{' '}
                    · Среднее:{' '}
                    <strong className="text-[#ffbe0b]">
                      {formatTime(currentPieceCountStats?.avgTimeSec)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center text-xs sm:text-sm font-semibold text-[#f3c677]/90 py-1">
            Перетаскивай кусочки пальцем или мышкой · При сборке пазла из архива включается следующая картинка · Пробел Собрать деталь
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
              {imageQueue.length > 1 && (
                <button
                  type="button"
                  onClick={() => advanceToNextPicture(true)}
                  className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#2ec4b6] hover:bg-[#25a99d] text-[#142423] font-display text-lg font-extrabold active:scale-95 transition-transform whitespace-nowrap"
                >
                  Следующая картинка из архива ({currentQueueIndex + 1}/
                  {imageQueue.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => startNewGame()}
                className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#ffbe0b] hover:bg-[#ffd166] text-[#26150b] font-display text-lg font-extrabold active:scale-95 transition-transform whitespace-nowrap"
              >
                Перемешать заново
              </button>
              <button
                type="button"
                onClick={() => setShowStatsModal(true)}
                className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#26150b] hover:bg-[#4e2d18] text-[#ffbe0b] border border-[#ffbe0b]/50 font-display text-base font-bold active:scale-95 transition-transform whitespace-nowrap"
              >
                Открыть статистику и рекорды
              </button>
              <button
                type="button"
                onClick={() => setGameState('title')}
                className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-[#26150b] hover:bg-[#4e2d18] text-[#f3c677] border border-[#c68b59]/50 font-display text-base font-bold active:scale-95 transition-transform whitespace-nowrap"
              >
                Выбрать другую картинку / архив
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY MODAL ('gameover') WITH STATS & AUTO-SWITCH TO NEXT ARCHIVE IMAGE */}
      {gameState === 'gameover' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="victory-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#1e1008]/75 overflow-y-auto"
        >
          <div className="w-full max-w-xl bg-[#3b2213] border-4 border-[#ffbe0b] rounded-3xl p-5 sm:p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.75)] space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ffbe0b] text-[#26150b] shadow-lg shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="w-9 h-9"
                  fill="currentColor"
                >
                  <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
                </svg>
              </div>
              <div className="text-left">
                <h2
                  id="victory-modal-title"
                  className="font-display text-2xl sm:text-3xl font-extrabold text-[#fff8ed]"
                >
                  Ура! Картинка собрана!
                </h2>
                <p className="text-xs sm:text-sm font-bold text-[#f3c677]">
                  «{victorySnapshot?.artworkTitle || 'Чудо-Пазл'}» ·{' '}
                  {victorySnapshot?.resolutionLabel ||
                    `${imageResolution.width}×${imageResolution.height}`}{' '}
                  px
                  {victorySnapshot?.archiveProgressLabel
                    ? ` · ${victorySnapshot.archiveProgressLabel}`
                    : ''}
                </p>
              </div>
            </div>

            {(victorySnapshot?.previewDataUrl || previewDataUrl) && (
              <div className="mx-auto h-36 flex items-center justify-center">
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

            {/* Run Metrics + Best & Average Time for this Piece Count */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#26150b] p-3 rounded-2xl border border-[#c68b59]/40">
              <div>
                <div className="text-[10px] font-bold uppercase text-[#f3c677]">
                  ДЕТАЛИ ({victorySnapshot?.gridLabel || currentDiff.shortGridLabel})
                </div>
                <div className="font-display text-xl font-extrabold text-[#06d6a0] tabular-nums mt-0.5">
                  {victorySnapshot?.totalPieces ?? totalPieces} шт.
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#f3c677]">
                  ВРЕМЯ СБОРКИ
                </div>
                <div className="font-display text-xl font-extrabold text-[#ffbe0b] tabular-nums mt-0.5">
                  {formatTime(victorySnapshot?.clearTimeSec ?? elapsedSec)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#f3c677]">
                  ЛУЧШЕЕ ({victorySnapshot?.totalPieces ?? totalPieces} ДЕТ.)
                </div>
                <div className="font-display text-xl font-extrabold text-[#06d6a0] tabular-nums mt-0.5">
                  {formatTime(victorySnapshot?.bestTimeForPiecesSec)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#f3c677]">
                  СРЕДНЕЕ ({victorySnapshot?.totalPieces ?? totalPieces} ДЕТ.)
                </div>
                <div className="font-display text-xl font-extrabold text-white tabular-nums mt-0.5">
                  {formatTime(victorySnapshot?.avgTimeForPiecesSec)}
                </div>
              </div>
            </div>

            {/* Auto-advance banner for Archive / Next Picture */}
            {autoAdvanceEnabled && autoNextCountdown !== null && (
              <div
                data-testid="auto-advance-banner"
                className="bg-[#1b3a32] border-2 border-[#06d6a0] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="text-xs sm:text-sm font-bold text-[#fff8ed]">
                  Автопереход к следующей картинке{' '}
                  {victorySnapshot?.nextQueueItemTitle
                    ? `«${victorySnapshot.nextQueueItemTitle}» `
                    : ''}
                  через{' '}
                  <span className="text-[#ffbe0b] font-extrabold text-base tabular-nums">
                    {autoNextCountdown} сек.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoNextCountdown(null)}
                  className="px-3 py-1.5 rounded-xl bg-[#26150b] text-[#f3c677] hover:text-white text-xs font-bold shrink-0"
                >
                  Остановить
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                data-testid="next-picture-btn"
                onClick={() => advanceToNextPicture(true)}
                className="flex-1 min-h-[50px] py-2.5 px-4 rounded-2xl bg-[#06d6a0] hover:bg-[#05c090] text-[#102a24] font-display text-base sm:text-lg font-extrabold shadow-lg active:scale-95 transition-transform whitespace-nowrap"
              >
                Следующая картинка ▶
              </button>
              <button
                type="button"
                data-start="true"
                onClick={() => startNewGame()}
                className="min-h-[50px] py-2.5 px-4 rounded-2xl bg-[#ffbe0b] hover:bg-[#ffd166] text-[#26150b] font-display text-base sm:text-lg font-extrabold shadow-lg active:scale-95 transition-transform whitespace-nowrap"
              >
                Ещё раз эту
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoNextCountdown(null);
                  setShowStatsModal(true);
                }}
                className="min-h-[50px] py-2.5 px-4 rounded-2xl bg-[#26150b] hover:bg-[#4e2d18] text-[#f3c677] border border-[#c68b59]/50 font-display text-sm sm:text-base font-bold active:scale-95 transition-transform whitespace-nowrap"
              >
                Статистика
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATISTICS & RECORDS MODAL */}
      {showStatsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stats-modal-title"
          className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[#140a05]/85 overflow-y-auto"
        >
          <div className="w-full max-w-3xl bg-[#3b2213] border-4 border-[#c68b59] rounded-3xl p-5 sm:p-7 shadow-[0_24px_70px_rgba(0,0,0,0.85)] space-y-5 my-auto">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2
                  id="stats-modal-title"
                  className="font-display text-2xl sm:text-3xl font-extrabold text-[#fff8ed]"
                >
                  Статистика и Рекорды Сборки
                </h2>
                <p className="text-xs sm:text-sm font-semibold text-[#f3c677] mt-0.5">
                  Лучшее и среднее время сборки пазлов по каждому количеству деталей
                </p>
              </div>
              <button
                type="button"
                data-testid="close-stats-modal"
                onClick={() => setShowStatsModal(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#26150b] hover:bg-[#4e2d18] border border-[#c68b59]/60 text-[#fff8ed] font-bold text-sm active:scale-95 transition-transform"
              >
                Закрыть ✕
              </button>
            </div>

            {/* Overall Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#26150b] p-4 rounded-2xl border border-[#c68b59]/40">
              <div>
                <div className="text-xs font-bold uppercase text-[#f3c677]">
                  ВСЕГО СОБРАНО ПАЗЛОВ
                </div>
                <div
                  data-testid="stats-total-completed"
                  className="font-display text-2xl font-extrabold text-white tabular-nums mt-0.5"
                >
                  {statsSummary.totalCompleted}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-[#f3c677]">
                  ЛУЧШЕЕ ВРЕМЯ СБОРКИ
                </div>
                <div
                  data-testid="stats-overall-best"
                  className="font-display text-2xl font-extrabold text-[#06d6a0] tabular-nums mt-0.5"
                >
                  {formatTime(statsSummary.overallBestTimeSec)}
                  {statsSummary.overallBestPieceCount
                    ? ` (${statsSummary.overallBestPieceCount} дет.)`
                    : ''}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-[#f3c677]">
                  СРЕДНЕЕ ВРЕМЯ (ВСЕ ПАЗЛЫ)
                </div>
                <div
                  data-testid="stats-overall-avg"
                  className="font-display text-2xl font-extrabold text-[#ffbe0b] tabular-nums mt-0.5"
                >
                  {formatTime(statsSummary.overallAvgTimeSec)}
                </div>
              </div>
            </div>

            {/* Breakdown Table by Number of Puzzle Pieces */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#f3c677]">
                Время сборки в зависимости от числа деталей пазла:
              </div>

              {statsSummary.sortedPieceCountStats.length === 0 ? (
                <div className="bg-[#26150b]/80 border border-[#c68b59]/30 rounded-2xl p-6 text-center text-sm font-semibold text-[#f3c677]">
                  Пока нет собранных пазлов. Собери хотя бы одну картинку, и здесь появится лучшее и среднее время для каждого количества деталей!
                </div>
              ) : (
                <div className="bg-[#26150b] border border-[#c68b59]/40 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-5 gap-2 px-4 py-2.5 bg-[#1e1008] text-[11px] font-extrabold uppercase text-[#f3c677] border-b border-[#c68b59]/30">
                    <div>Число пазлов</div>
                    <div>Собрано раз</div>
                    <div>Лучшее время</div>
                    <div>Среднее время</div>
                    <div>Лучшие ходы</div>
                  </div>
                  <div className="divide-y divide-[#c68b59]/20 max-h-56 overflow-y-auto">
                    {statsSummary.sortedPieceCountStats.map((row) => (
                      <div
                        key={row.totalPieces}
                        data-testid={`stats-row-${row.totalPieces}`}
                        className="grid grid-cols-5 gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-[#fff8ed] items-center"
                      >
                        <div className="font-display text-[#ffbe0b]">
                          {row.labelRu}
                        </div>
                        <div className="tabular-nums">{row.completedCount}</div>
                        <div className="text-[#06d6a0] tabular-nums font-extrabold">
                          {formatTime(row.bestTimeSec)}
                        </div>
                        <div className="text-[#fff3b8] tabular-nums font-extrabold">
                          {formatTime(row.avgTimeSec)}
                        </div>
                        <div className="text-[#f3c677] tabular-nums">
                          {row.bestMoves}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Completed Runs */}
            {statsSummary.recentRuns.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#f3c677]">
                  Последние собранные картинки:
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {statsSummary.recentRuns.slice(0, 5).map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between text-xs bg-[#26150b]/70 px-3 py-1.5 rounded-xl text-[#f3c677]"
                    >
                      <span className="font-bold text-white truncate max-w-[240px]">
                        «{run.artworkTitle}» ({run.imageResolution} px)
                      </span>
                      <span className="tabular-nums">
                        {formatPieceCountRu(run.totalPieces)} ({run.gridLabel}) · Время:{' '}
                        <strong className="text-[#ffbe0b]">
                          {formatTime(run.clearTimeSec)}
                        </strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              {statsSummary.totalCompleted > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    clearPuzzleStats();
                    setPuzzleRuns([]);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#26150b] hover:bg-[#9b2226] text-[#f3c677] hover:text-white text-xs font-bold transition-colors"
                >
                  Сбросить статистику
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setShowStatsModal(false)}
                className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-[#06d6a0] hover:bg-[#05c090] text-[#102a24] font-display text-base font-extrabold active:scale-95 transition-transform"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
