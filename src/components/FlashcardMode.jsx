import { useState, useEffect, useCallback } from 'react';
import { createCard, reviewCard, isDue } from '../sm2.js';
import { saveProgress, loadAllProgress } from '../storage.js';
import MapPip from './MapPip.jsx';

const MAX_NEW_PER_DAY = 5;
const NEW_INTRODUCED_KEY = (trackId) => `cornerflash:new_today:${trackId}`;

const TYPE_BADGE = {
  fast: 'bg-red-950 text-red-300 border-red-900',
  medium: 'bg-yellow-950 text-yellow-300 border-yellow-900',
  slow: 'bg-blue-950 text-blue-300 border-blue-900',
};

const RATING_BUTTONS = [
  { rating: 0, label: 'Again', sublabel: '<1d', color: 'bg-red-900 hover:bg-red-800 border-red-800 text-red-200' },
  { rating: 2, label: 'Hard',  sublabel: '~1d',  color: 'bg-orange-900 hover:bg-orange-800 border-orange-800 text-orange-200' },
  { rating: 3, label: 'Good',  sublabel: '~6d',  color: 'bg-yellow-900 hover:bg-yellow-800 border-yellow-800 text-yellow-200' },
  { rating: 5, label: 'Easy',  sublabel: 'long', color: 'bg-green-900 hover:bg-green-800 border-green-800 text-green-200' },
];

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getNewIntroducedToday(trackId) {
  const raw = localStorage.getItem(NEW_INTRODUCED_KEY(trackId));
  if (!raw) return { date: '', count: 0 };
  try { return JSON.parse(raw); } catch { return { date: '', count: 0 }; }
}

function incrementNewToday(trackId) {
  const today = getTodayKey();
  const data = getNewIntroducedToday(trackId);
  const count = data.date === today ? data.count + 1 : 1;
  localStorage.setItem(NEW_INTRODUCED_KEY(trackId), JSON.stringify({ date: today, count }));
}


function CornerImage({ trackId, cornerId, cornerName }) {
  const [imgError, setImgError] = useState(false);
  const src = `/images/corners/${trackId}/${cornerId}.jpg`;

  if (imgError) {
    return (
      <div
        className="w-full rounded-xl flex flex-col items-center justify-center"
        style={{ backgroundColor: '#1a1a1a', minHeight: 200 }}
      >
        <p className="text-white text-2xl font-black text-center px-4 leading-tight">
          {cornerName}
        </p>
        <p className="text-gray-600 text-xs font-mono mt-2">{cornerId}</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={cornerName}
      className="w-full rounded-xl object-cover"
      style={{ minHeight: 200, maxHeight: 280 }}
      onError={() => setImgError(true)}
    />
  );
}

export default function FlashcardMode({ track, corners, onBack }) {
  const [progress, setProgress] = useState({});
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionDone, setSessionDone] = useState(false);
  const [newCountToday, setNewCountToday] = useState(0);

  // Load progress on mount
  useEffect(() => {
    let cancelled = false;
    loadAllProgress(track).then((prog) => {
      if (cancelled) return;
      setProgress(prog);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [track]);

  // Build queue whenever progress loads or changes
  useEffect(() => {
    if (loading) return;

    const today = getTodayKey();
    const newIntroduced = getNewIntroducedToday(track);
    const newUsed = newIntroduced.date === today ? newIntroduced.count : 0;
    setNewCountToday(newUsed);

    const due = [];
    const newCards = [];

    for (const corner of corners) {
      const card = progress[corner.id];
      if (!card) {
        newCards.push(corner.id);
      } else if (isDue(card)) {
        due.push(corner.id);
      }
    }

    // Include new cards up to daily limit
    const newAllowed = Math.max(0, MAX_NEW_PER_DAY - newUsed);
    const newToShow = newCards.slice(0, newAllowed);

    const q = [...due, ...newToShow];

    if (q.length === 0) {
      setSessionDone(true);
    } else {
      setQueue(q);
      setCurrentIndex(0);
      setSessionDone(false);
    }
  }, [progress, loading, corners, track]);

  const handleReveal = useCallback(() => {
    setRevealed(true);
  }, []);

  const handleRate = useCallback(async (rating) => {
    const cornerId = queue[currentIndex];
    const existing = progress[cornerId];
    const card = existing || createCard(cornerId, track);

    // Track new card introduction
    if (!existing) {
      incrementNewToday(track);
      setNewCountToday((n) => n + 1);
    }

    const updated = reviewCard(card, rating);
    await saveProgress(cornerId, track, updated);

    setProgress((prev) => ({ ...prev, [cornerId]: updated }));

    // Advance
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      setSessionDone(true);
    } else {
      setCurrentIndex(nextIndex);
      setRevealed(false);
    }
  }, [queue, currentIndex, progress, track]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Loading progress...</div>
      </div>
    );
  }

  // All done
  if (sessionDone) {
    // Find next due time
    let nextReviewTime = null;
    for (const corner of corners) {
      const card = progress[corner.id];
      if (card) {
        const t = new Date(card.nextReview);
        if (!nextReviewTime || t < nextReviewTime) nextReviewTime = t;
      }
    }

    const formatNext = (date) => {
      if (!date) return 'N/A';
      const diff = date - new Date();
      if (diff < 0) return 'now';
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (hours >= 24) return `${Math.floor(hours / 24)}d`;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    };

    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 text-center max-w-lg mx-auto">
        <div className="text-5xl mb-4">🏁</div>
        <h2 className="text-2xl font-black text-white mb-2">All caught up!</h2>
        <p className="text-gray-400 text-sm mb-1">No cards due right now.</p>
        {nextReviewTime && (
          <p className="text-gray-500 text-xs mb-8">
            Next review in: <span className="text-orange-400 font-semibold">{formatNext(nextReviewTime)}</span>
          </p>
        )}
        <button
          onClick={onBack}
          className="px-8 py-3 bg-gray-900 border border-gray-700 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-semibold"
        >
          ← Back to menu
        </button>
      </div>
    );
  }

  const cornerId = queue[currentIndex];
  const corner = corners.find((c) => c.id === cornerId);

  if (!corner) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-red-400 text-sm">Corner not found: {cornerId}</div>
      </div>
    );
  }

  const typeBadge = TYPE_BADGE[corner.type] || 'bg-gray-800 text-gray-300 border-gray-700';
  const card = progress[corner.id];
  const isNew = !card;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          ‹ Back
        </button>
        <div className="text-xs text-gray-600 uppercase tracking-widest">{track}</div>
        <div className="text-xs text-gray-500 tabular-nums">
          {currentIndex + 1} / {queue.length}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-1 mb-6">
        <div
          className="bg-orange-500 h-1 rounded-full transition-all duration-300"
          style={{ width: `${(currentIndex / queue.length) * 100}%` }}
        />
      </div>

      {/* New badge */}
      {isNew && (
        <div className="mb-3 flex justify-center">
          <span className="text-xs bg-blue-950 border border-blue-900 text-blue-300 px-3 py-1 rounded-full uppercase tracking-wider font-semibold">
            New card
          </span>
        </div>
      )}

      {/* Card area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Image / placeholder */}
        <CornerImage trackId={track} cornerId={corner.id} cornerName={corner.name} />

        {/* Map pip + question prompt */}
        <div className="flex items-center justify-between">
          <div className="text-gray-400 text-sm font-medium">
            {revealed ? 'Corner revealed' : 'What corner is this?'}
          </div>
          <MapPip corners={corners} currentCornerId={corner.id} trackId={track} />
        </div>

        {/* Revealed info */}
        {revealed && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 animate-in fade-in duration-200">
            <div className="text-gray-600 text-xs font-mono uppercase tracking-widest mb-1">
              Corner #{corner.order}
            </div>
            <h2 className="text-2xl font-black text-white leading-tight mb-3">
              {corner.name}
            </h2>
            <span className={`text-xs border px-3 py-1 rounded-full uppercase tracking-wider font-semibold ${typeBadge}`}>
              {corner.type}
            </span>
            {corner.notes && (
              <p className="text-gray-300 text-sm leading-relaxed mt-4 border-t border-gray-800 pt-4">
                {corner.notes}
              </p>
            )}
            {card && (
              <p className="text-gray-700 text-xs mt-3 font-mono">
                Interval: {card.interval}d · EF: {card.easeFactor.toFixed(2)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-6">
        {!revealed ? (
          <button
            onClick={handleReveal}
            className="w-full py-4 bg-orange-500 hover:bg-orange-400 active:scale-95 text-white rounded-xl font-bold text-lg transition-all"
          >
            Reveal Answer
          </button>
        ) : (
          <div className="flex gap-2">
            {RATING_BUTTONS.map(({ rating, label, sublabel, color }) => (
              <button
                key={rating}
                onClick={() => handleRate(rating)}
                className={`flex-1 py-4 border rounded-xl font-semibold text-sm active:scale-95 transition-all flex flex-col items-center gap-0.5 ${color}`}
              >
                <span>{label}</span>
                <span className="text-xs opacity-60">{sublabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
