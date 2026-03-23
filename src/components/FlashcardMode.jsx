import { useState, useEffect, useRef, useCallback } from 'react';
import { createCard, reviewCard, isDue } from '../sm2.js';
import { saveProgress, loadAllProgress } from '../storage.js';
import MapPip from './MapPip.jsx';

const MAX_NEW_PER_DAY = Infinity; // No limit — user controls their pace
const NUM_CHOICES = 4;
const NEW_INTRODUCED_KEY = (trackId) => `cornerflash:new_today:${trackId}`;
const CORRECT_FLASH_MS = 1200;
const FRAME_INTERVAL_MS = 200; // ~5 fps

const TYPE_BADGE = {
  fast: 'bg-red-950 text-red-300 border-red-900',
  medium: 'bg-yellow-950 text-yellow-300 border-yellow-900',
  slow: 'bg-blue-950 text-blue-300 border-blue-900',
};

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

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(correctCorner, allCorners, count) {
  // Prefer same type for harder distractors, fall back to any
  const sameType = allCorners.filter(c => c.id !== correctCorner.id && c.type === correctCorner.type);
  const others = allCorners.filter(c => c.id !== correctCorner.id && c.type !== correctCorner.type);
  const pool = [...shuffleArray(sameType), ...shuffleArray(others)];
  return pool.slice(0, count);
}

function CornerImage({ trackId, cornerId, frames, answered, correctFlash }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const intervalRef = useRef(null);

  // Reset frame + error when corner changes
  useEffect(() => {
    setFrameIndex(0);
    setImgError(false);
  }, [cornerId]);

  // Animate through frames
  useEffect(() => {
    if (!frames || frames.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [frames]);

  if (imgError && (!frames || frames.length === 0)) {
    return (
      <div className="w-full rounded-xl flex items-center justify-center bg-gray-900" style={{ minHeight: 200 }}>
        <p className="text-gray-700 text-xs font-mono">{cornerId}</p>
      </div>
    );
  }

  const src = frames && frames.length > 0
    ? `/candidates_new/${cornerId}/${frames[frameIndex]}`
    : `/images/corners/${trackId}/${cornerId}.jpg`;

  return (
    <div className="relative">
      <img
        src={src}
        alt="Which corner is this?"
        className="w-full rounded-xl object-cover"
        style={{ minHeight: 200, maxHeight: 280 }}
        onError={() => setImgError(true)}
      />
      {/* Black bar — hides corner name label until answered */}
      {!answered && (
        <div
          className="absolute top-0 left-0 w-full rounded-t-xl pointer-events-none"
          style={{ height: '20%', background: '#000' }}
        />
      )}
      {/* Correct flash overlay */}
      {correctFlash && (
        <div className="absolute inset-0 rounded-xl bg-green-500/40 flex items-center justify-center pointer-events-none">
          <span className="text-white text-6xl font-black drop-shadow-lg">✓</span>
        </div>
      )}
    </div>
  );
}

export default function FlashcardMode({ track, corners, onBack }) {
  const [progress, setProgress] = useState({});
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [confirmedCorrect, setConfirmedCorrect] = useState(false);
  const [correctFlash, setCorrectFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionDone, setSessionDone] = useState(false);
  const [newCountToday, setNewCountToday] = useState(0);
  const [choices, setChoices] = useState([]);
  const [candidatesManifest, setCandidatesManifest] = useState({});

  // Keep a ref to progress so the queue-build effect doesn't depend on it
  const progressRef = useRef({});
  useEffect(() => { progressRef.current = progress; }, [progress]);

  // Load candidates manifest for animation frames
  useEffect(() => {
    fetch('/candidates_new/manifest.json')
      .then((r) => r.ok ? r.json() : {})
      .then((data) => setCandidatesManifest(data))
      .catch(() => {});
  }, []);

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

  // Build queue once on load — NOT dependent on progress to avoid mid-session resets
  useEffect(() => {
    if (loading) return;

    const today = getTodayKey();
    const newIntroduced = getNewIntroducedToday(track);
    const newUsed = newIntroduced.date === today ? newIntroduced.count : 0;
    setNewCountToday(newUsed);

    const prog = progressRef.current;
    const due = [];
    const newCards = [];

    for (const corner of corners) {
      const card = prog[corner.id];
      if (!card) {
        newCards.push(corner.id);
      } else if (isDue(card)) {
        due.push(corner.id);
      }
    }

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
  }, [loading, corners, track]); // ← progress intentionally excluded

  // Generate choices whenever current card changes
  useEffect(() => {
    if (queue.length === 0 || currentIndex >= queue.length) return;

    const cornerId = queue[currentIndex];
    const corner = corners.find(c => c.id === cornerId);
    if (!corner) return;

    const distractors = pickDistractors(corner, corners, NUM_CHOICES - 1);
    const allChoices = shuffleArray([corner, ...distractors]);
    setChoices(allChoices);
    setSelectedAnswer(null);
    setConfirmedCorrect(false);
    setCorrectFlash(false);
  }, [queue, currentIndex, corners]);

  const handleNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      setSessionDone(true);
    } else {
      setCurrentIndex(nextIndex);
    }
  }, [currentIndex, queue]);

  const handleAnswer = useCallback(async (chosenId) => {
    const cornerId = queue[currentIndex];

    // Phase 2: user got it wrong and is now tapping the correct answer to confirm
    if (selectedAnswer !== null && selectedAnswer !== cornerId && chosenId === cornerId) {
      setConfirmedCorrect(true);
      return;
    }

    if (selectedAnswer !== null) return; // Already answered, ignore taps

    const isCorrect = chosenId === cornerId;
    setSelectedAnswer(chosenId);

    if (isCorrect) {
      setConfirmedCorrect(true);
      // Flash green, then auto-advance
      setCorrectFlash(true);
      setTimeout(() => {
        setCorrectFlash(false);
        handleNext();
      }, CORRECT_FLASH_MS);
    }

    const existing = progress[cornerId];
    const card = existing || createCard(cornerId, track);

    if (!existing) {
      incrementNewToday(track);
      setNewCountToday((n) => n + 1);
    }

    const rating = isCorrect ? 4 : 1;
    const updated = reviewCard(card, rating);
    await saveProgress(cornerId, track, updated);

    setProgress((prev) => ({ ...prev, [cornerId]: updated }));
  }, [queue, currentIndex, progress, track, selectedAnswer, handleNext]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Loading progress...</div>
      </div>
    );
  }

  if (sessionDone) {
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
          Back to menu
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

  const answered = selectedAnswer !== null;
  const wasCorrect = selectedAnswer === cornerId;
  const wasWrong = answered && !wasCorrect;
  const needsConfirmation = wasWrong && !confirmedCorrect;
  const canProceed = answered && confirmedCorrect;

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
          Back
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
        {/* Image with black bar + flash overlay */}
        <CornerImage
          trackId={track}
          cornerId={corner.id}
          frames={candidatesManifest[corner.id] || null}
          answered={answered}
          correctFlash={correctFlash}
        />

        {/* Map pip + prompt */}
        <div className="flex items-center justify-between">
          <div className={`text-sm font-medium ${wasCorrect ? 'text-green-400' : wasWrong ? 'text-red-400' : 'text-gray-400'}`}>
            {!answered && 'What corner is this?'}
            {wasCorrect && !correctFlash && 'Correct!'}
            {correctFlash && 'Correct!'}
            {needsConfirmation && `Wrong — tap ${corner.name} to continue`}
            {wasWrong && confirmedCorrect && corner.name}
          </div>
          <MapPip corners={corners} currentCornerId={corner.id} trackId={track} />
        </div>

        {/* Multiple choice buttons */}
        <div className="flex flex-col gap-2">
          {choices.map((choice) => {
            let btnClass = 'bg-gray-900 border-gray-700 text-white hover:bg-gray-800';
            let clickable = true;

            if (answered) {
              if (choice.id === cornerId) {
                btnClass = needsConfirmation
                  ? 'bg-green-900 border-green-500 text-green-200 animate-pulse'
                  : 'bg-green-900 border-green-700 text-green-200';
              } else if (choice.id === selectedAnswer) {
                btnClass = 'bg-red-900 border-red-700 text-red-200';
                clickable = false;
              } else {
                btnClass = 'bg-gray-900 border-gray-800 text-gray-600';
                clickable = false;
              }
              if (confirmedCorrect) clickable = false;
            }

            return (
              <button
                key={choice.id}
                onClick={() => handleAnswer(choice.id)}
                disabled={!clickable}
                className={`w-full py-3 px-4 border rounded-xl font-semibold text-sm transition-all text-left ${btnClass} ${clickable ? 'active:scale-[0.98]' : ''}`}
              >
                {choice.name}
              </button>
            );
          })}
        </div>

        {/* Post-answer info — wrong answers only (correct auto-advances) */}
        {wasWrong && canProceed && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-white font-bold text-lg mb-3">{corner.name}</p>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs border px-3 py-1 rounded-full uppercase tracking-wider font-semibold ${TYPE_BADGE[corner.type] || 'bg-gray-800 text-gray-300 border-gray-700'}`}>
                {corner.type}
              </span>
              <span className="text-gray-600 text-xs font-mono">#{corner.order}</span>
            </div>
            {corner.notes && (
              <p className="text-gray-300 text-sm leading-relaxed">
                {corner.notes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Next button — wrong path only (correct auto-advances) */}
      {wasWrong && canProceed && (
        <div className="mt-6">
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-95 bg-orange-500 hover:bg-orange-400 text-white"
          >
            {currentIndex + 1 >= queue.length ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}
