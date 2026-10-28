import { formatPieceCountRu } from './puzzleLogic';

export interface PuzzleRunRecord {
  id: string;
  totalPieces: number;
  gridLabel: string;
  clearTimeSec: number;
  movesCount: number;
  artworkTitle: string;
  imageResolution: string;
  timestamp: number;
}

export interface PieceCountStats {
  totalPieces: number;
  labelRu: string;
  completedCount: number;
  bestTimeSec: number;
  avgTimeSec: number;
  lastTimeSec: number;
  totalTimeSec: number;
  bestMoves: number;
}

export interface PuzzleStatsSummary {
  totalCompleted: number;
  totalTimeSec: number;
  overallBestTimeSec: number | null;
  overallBestPieceCount: number | null;
  overallBestArtwork: string | null;
  overallAvgTimeSec: number | null;
  byPieceCount: Record<number, PieceCountStats>;
  sortedPieceCountStats: PieceCountStats[];
  recentRuns: PuzzleRunRecord[];
}

export interface RecordRunResult {
  summary: PuzzleStatsSummary;
  pieceStats: PieceCountStats;
  isNewBestForPieceCount: boolean;
  isNewOverallBest: boolean;
}

const STATS_STORAGE_KEY = 'chudo_puzzles_stats_v1';

export function loadPuzzleRuns(): PuzzleRunRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) =>
        r &&
        typeof r.totalPieces === 'number' &&
        r.totalPieces > 0 &&
        typeof r.clearTimeSec === 'number' &&
        r.clearTimeSec > 0
    );
  } catch {
    return [];
  }
}

export function savePuzzleRuns(runs: PuzzleRunRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(runs.slice(-500)));
  } catch {
    // Ignore storage quota errors in restricted WebViews
  }
}

export function clearPuzzleStats(): PuzzleStatsSummary {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STATS_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  return computeStatsSummary([]);
}

export function computeStatsSummary(runs: PuzzleRunRecord[]): PuzzleStatsSummary {
  const byPieceCount: Record<number, PieceCountStats> = {};
  let totalCompleted = 0;
  let totalTimeSec = 0;
  let overallBestTimeSec: number | null = null;
  let overallBestPieceCount: number | null = null;
  let overallBestArtwork: string | null = null;

  for (const run of runs) {
    const pieces = Math.max(1, Math.round(run.totalPieces));
    const time = Math.max(1, Math.round(run.clearTimeSec));
    const moves = Math.max(1, Math.round(run.movesCount || 1));

    totalCompleted += 1;
    totalTimeSec += time;

    if (overallBestTimeSec === null || time < overallBestTimeSec) {
      overallBestTimeSec = time;
      overallBestPieceCount = pieces;
      overallBestArtwork = run.artworkTitle;
    }

    const existing = byPieceCount[pieces];
    if (!existing) {
      byPieceCount[pieces] = {
        totalPieces: pieces,
        labelRu: formatPieceCountRu(pieces),
        completedCount: 1,
        bestTimeSec: time,
        avgTimeSec: time,
        lastTimeSec: time,
        totalTimeSec: time,
        bestMoves: moves,
      };
    } else {
      const nextCount = existing.completedCount + 1;
      const nextTotalTime = existing.totalTimeSec + time;
      byPieceCount[pieces] = {
        totalPieces: pieces,
        labelRu: existing.labelRu,
        completedCount: nextCount,
        bestTimeSec: Math.min(existing.bestTimeSec, time),
        avgTimeSec: Math.round(nextTotalTime / nextCount),
        lastTimeSec: time,
        totalTimeSec: nextTotalTime,
        bestMoves: Math.min(existing.bestMoves, moves),
      };
    }
  }

  const sortedPieceCountStats = Object.values(byPieceCount).sort(
    (a, b) => a.totalPieces - b.totalPieces
  );

  return {
    totalCompleted,
    totalTimeSec,
    overallBestTimeSec,
    overallBestPieceCount,
    overallBestArtwork,
    overallAvgTimeSec:
      totalCompleted > 0 ? Math.round(totalTimeSec / totalCompleted) : null,
    byPieceCount,
    sortedPieceCountStats,
    recentRuns: [...runs].reverse().slice(0, 12),
  };
}

export function recordCompletedPuzzleRun(
  existingRuns: PuzzleRunRecord[],
  newRunInput: Omit<PuzzleRunRecord, 'id' | 'timestamp'>
): { runs: PuzzleRunRecord[]; result: RecordRunResult } {
  const prevSummary = computeStatsSummary(existingRuns);
  const pieces = Math.max(1, Math.round(newRunInput.totalPieces));
  const time = Math.max(1, Math.round(newRunInput.clearTimeSec));

  const prevPieceStats = prevSummary.byPieceCount[pieces];
  const isNewBestForPieceCount =
    !prevPieceStats || time < prevPieceStats.bestTimeSec;
  const isNewOverallBest =
    prevSummary.overallBestTimeSec === null ||
    time < prevSummary.overallBestTimeSec;

  const record: PuzzleRunRecord = {
    ...newRunInput,
    totalPieces: pieces,
    clearTimeSec: time,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };

  const updatedRuns = [...existingRuns, record];
  savePuzzleRuns(updatedRuns);
  const summary = computeStatsSummary(updatedRuns);

  return {
    runs: updatedRuns,
    result: {
      summary,
      pieceStats: summary.byPieceCount[pieces],
      isNewBestForPieceCount,
      isNewOverallBest,
    },
  };
}
