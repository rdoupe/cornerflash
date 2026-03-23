import { useState, useEffect } from 'react';

const TYPE_BADGE = {
  fast: 'bg-red-950 text-red-300 border-red-900',
  medium: 'bg-yellow-950 text-yellow-300 border-yellow-900',
  slow: 'bg-blue-950 text-blue-300 border-blue-900',
};

function AnimatedImage({ track, cornerId, candidates }) {
  const startIdx = candidates ? Math.floor(candidates.length / 2) : 0;
  const [frameIdx, setFrameIdx] = useState(startIdx);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setFrameIdx(candidates ? Math.floor(candidates.length / 2) : 0);
    setUseFallback(false);
  }, [cornerId, candidates]);

  useEffect(() => {
    if (!candidates || candidates.length <= 1) return;
    const timer = setInterval(() => setFrameIdx((i) => (i + 1) % candidates.length), 900);
    return () => clearInterval(timer);
  }, [candidates]);

  const hasCandidates = candidates && candidates.length > 0 && !useFallback;
  const src = hasCandidates
    ? `/candidates_new/${cornerId}/${candidates[frameIdx].filename}`
    : `/images/corners/${track}/${cornerId}.jpg`;

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-gray-800 mb-6" style={{ minHeight: 180 }}>
      <img
        src={src}
        alt={cornerId}
        className="w-full object-cover"
        style={{ minHeight: 180, maxHeight: 260 }}
        onError={() => setUseFallback(true)}
      />
      {hasCandidates && candidates.length > 1 && (
        <>
          {candidates.length <= 20 && (
            <div className="absolute top-2 left-2 flex gap-0.5">
              {candidates.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === frameIdx ? 'bg-white' : 'bg-white/25'}`} />
              ))}
            </div>
          )}
          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-mono rounded px-1.5 py-0.5">
            {frameIdx + 1}/{candidates.length}
          </div>
        </>
      )}
    </div>
  );
}

export default function StudyMode({ track, corners, onBack }) {
  const [index, setIndex] = useState(0);
  const [candidatesManifest, setCandidatesManifest] = useState({});

  useEffect(() => {
    fetch('/candidates_new/manifest.json').then(r => r.ok ? r.json() : {}).then(setCandidatesManifest).catch(() => {});
  }, []);

  if (!corners || corners.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">
        <p className="text-gray-400">No corners available for this track.</p>
        <button onClick={onBack} className="mt-6 text-orange-400 hover:text-orange-300 text-sm">
          ← Back
        </button>
      </div>
    );
  }

  const corner = corners[index];
  const total = corners.length;
  const typeBadge = TYPE_BADGE[corner.type] || 'bg-gray-800 text-gray-300 border-gray-700';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
        >
          ‹ Back
        </button>
        <div className="text-center">
          <span className="text-xs text-gray-500 uppercase tracking-widest">{track}</span>
        </div>
        <span className="text-gray-500 text-sm tabular-nums">
          {index + 1} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-1 mb-8">
        <div
          className="bg-orange-500 h-1 rounded-full transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* Animated image */}
      <AnimatedImage
        track={track}
        cornerId={corner.id}
        candidates={
          corner.id === 'tiergarten'
            ? null
            : (candidatesManifest[corner.id]?.candidates ?? null)
        }
      />

      {/* Corner card */}
      <div className="flex-1 flex flex-col">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex-1 flex flex-col justify-center">
          {/* Order badge */}
          <div className="text-gray-600 text-xs font-mono uppercase tracking-widest mb-2">
            Corner #{corner.order}
          </div>

          {/* Name */}
          <h2 className="text-3xl font-black text-white leading-tight mb-4">
            {corner.name}
          </h2>

          {/* Type badge */}
          <div className="mb-6">
            <span className={`text-xs border px-3 py-1 rounded-full uppercase tracking-wider font-semibold ${typeBadge}`}>
              {corner.type}
            </span>
          </div>

          {/* Notes */}
          {corner.notes && (
            <p className="text-gray-300 text-base leading-relaxed border-t border-gray-800 pt-5 mt-2">
              {corner.notes}
            </p>
          )}

          {/* GPS indicator */}
          {corner.gps ? (
            <div className="mt-4 text-xs text-gray-600 font-mono">
              GPS: {corner.gps.lat.toFixed(5)}, {corner.gps.lng.toFixed(5)}
            </div>
          ) : (
            <div className="mt-4 text-xs text-gray-700">GPS not yet available</div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex-1 py-4 bg-gray-900 border border-gray-800 text-white rounded-xl font-semibold text-sm disabled:opacity-30 hover:bg-gray-800 transition-colors active:scale-95"
        >
          ← Prev
        </button>
        <button
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={index === total - 1}
          className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-semibold text-sm disabled:opacity-30 transition-colors active:scale-95"
        >
          Next →
        </button>
      </div>

      {/* Done state */}
      {index === total - 1 && (
        <p className="text-center text-green-400 text-sm mt-4">
          You've reviewed all {total} corners!
        </p>
      )}
    </div>
  );
}
