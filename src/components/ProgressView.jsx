import { useState, useEffect } from 'react';
import { isDue } from '../sm2.js';
import { loadAllProgress, resetProgress } from '../storage.js';

function StatCard({ label, value, accent }) {
  const accentClass = accent || 'text-white';
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col items-center">
      <span className={`text-2xl font-black tabular-nums ${accentClass}`}>{value}</span>
      <span className="text-gray-500 text-xs mt-1 uppercase tracking-wider text-center">{label}</span>
    </div>
  );
}

export default function ProgressView({ track, corners, onBack }) {
  const [progress, setProgress] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAllProgress(track).then((prog) => {
      if (!cancelled) setProgress(prog);
    });
    return () => { cancelled = true; };
  }, [track]);

  const handleReset = async () => {
    await resetProgress(track);
    setProgress({});
    setConfirmReset(false);
  };

  if (progress === null) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Loading stats...</div>
      </div>
    );
  }

  // Compute stats
  const total = corners.length;
  let dueToday = 0;
  let mastered = 0;
  let learning = 0;
  let newCount = 0;

  for (const corner of corners) {
    const card = progress[corner.id];
    if (!card) {
      newCount++;
    } else {
      if (isDue(card)) dueToday++;
      if (card.interval >= 21) mastered++;
      else if (card.interval >= 1) learning++;
    }
  }

  // Build per-corner list
  const cornerRows = corners.map((corner) => {
    const card = progress[corner.id];
    let status, statusColor;
    if (!card) {
      status = 'New';
      statusColor = 'text-blue-400';
    } else if (card.interval >= 21) {
      status = 'Mastered';
      statusColor = 'text-green-400';
    } else if (isDue(card)) {
      status = 'Due';
      statusColor = 'text-orange-400';
    } else {
      status = 'Learning';
      statusColor = 'text-yellow-400';
    }

    const nextReview = card
      ? new Date(card.nextReview).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '—';

    return { corner, card, status, statusColor, nextReview };
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          ‹ Back
        </button>
        <span className="text-xs text-gray-500 uppercase tracking-widest">{track} — Progress</span>
        <div className="w-10" />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Due Today" value={dueToday} accent="text-orange-400" />
        <StatCard label="Total Cards" value={total} />
        <StatCard label="Mastered (21d+)" value={mastered} accent="text-green-400" />
        <StatCard label="Learning" value={learning} accent="text-yellow-400" />
        <StatCard label="New" value={newCount} accent="text-blue-400" />
        <StatCard label="Seen" value={total - newCount} />
      </div>

      {/* Per-corner breakdown */}
      <h3 className="text-gray-500 text-xs uppercase tracking-widest mb-3">Corner breakdown</h3>
      <div className="flex flex-col gap-1 mb-8">
        {cornerRows.map(({ corner, card, status, statusColor, nextReview }) => (
          <div
            key={corner.id}
            className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <span className="text-white text-sm font-semibold truncate block">{corner.name}</span>
              <span className="text-gray-600 text-xs">
                {card ? `Int: ${card.interval}d · EF: ${card.easeFactor.toFixed(1)}` : 'Not started'}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 ml-3 shrink-0">
              <span className={`text-xs font-semibold ${statusColor}`}>{status}</span>
              <span className="text-gray-600 text-xs tabular-nums">{nextReview}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Reset button */}
      <div className="border-t border-gray-800 pt-6">
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="w-full py-3 bg-gray-900 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-900 rounded-xl text-sm font-semibold transition-colors"
          >
            Reset Progress for {track}
          </button>
        ) : (
          <div className="bg-red-950 border border-red-900 rounded-xl p-4">
            <p className="text-red-200 text-sm text-center mb-4">
              Reset all progress for <strong>{track}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-3 bg-gray-900 border border-gray-700 text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-red-700 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
