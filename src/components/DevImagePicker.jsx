import { useState, useEffect, useCallback } from 'react';

const SELECTIONS_KEY_PREFIX = 'cornerflash:dev:selections';

function loadSelections(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch { return {}; }
}

function saveSelections(key, selections) {
  localStorage.setItem(key, JSON.stringify(selections));
}

function AnimatedCornerCard({ cornerId, cornerName, candidates, selected, onSelect, basePath }) {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    if (candidates.length <= 1) return;
    const timer = setInterval(() => {
      setFrameIdx((i) => (i + 1) % candidates.length);
    }, 1000);
    return () => clearInterval(timer);
  }, [candidates.length]);

  const currentFrame = candidates[frameIdx] ?? candidates[0];
  if (!currentFrame) return null;

  const isSelected = selected === currentFrame.filename;
  const tsLabel = `${Math.round(currentFrame.timestamp_ms / 1000)}s`;

  return (
    <button
      onClick={() => onSelect(cornerId, currentFrame.filename)}
      className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] focus:outline-none ${
        selected
          ? isSelected
            ? 'border-green-400 ring-2 ring-green-400/40'
            : 'border-green-800'
          : 'border-gray-700 hover:border-gray-500'
      }`}
    >
      <img
        src={`${basePath}/${cornerId}/${currentFrame.filename}`}
        alt={cornerName}
        className="w-full aspect-video object-cover block"
      />

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-2 py-1.5 flex items-center justify-between gap-2">
        <span className="text-white text-xs font-bold truncate">{cornerName}</span>
        <span className="text-gray-400 text-[10px] font-mono shrink-0">
          {frameIdx + 1}/{candidates.length} · {tsLabel}
        </span>
      </div>

      {/* Selected badge */}
      {selected && (
        <div className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          isSelected ? 'bg-green-500 text-white' : 'bg-green-900 text-green-300'
        }`}>
          {isSelected ? 'THIS' : 'OK'}
        </div>
      )}

      {/* Frame dots */}
      {candidates.length > 1 && candidates.length <= 20 && (
        <div className="absolute top-2 left-2 flex gap-0.5">
          {candidates.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === frameIdx ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      )}
    </button>
  );
}

export default function DevImagePicker({ onBack, candidatesPath = '/candidates' }) {
  const selectionsKey = `${SELECTIONS_KEY_PREFIX}:${candidatesPath}`;
  const [manifest, setManifest] = useState(null);
  const [selections, setSelections] = useState(() => loadSelections(selectionsKey));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch(`${candidatesPath}/manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(
          `HTTP ${res.status} — run 'python scripts/extract_corners.py ${candidatesPath.includes('new') ? 'new-candidates' : 'candidates'}' first`
        );
        return res.json();
      })
      .then((data) => { setManifest(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [candidatesPath]);

  const handleSelect = useCallback((cornerId, filename) => {
    setSelections((prev) => {
      const next = { ...prev, [cornerId]: filename };
      saveSelections(selectionsKey, next);
      return next;
    });
  }, [selectionsKey]);

  const handleExport = useCallback(() => {
    if (!manifest) return;
    const updated = { ...manifest };
    for (const [cornerId, filename] of Object.entries(selections)) {
      if (updated[cornerId]) updated[cornerId].selected = filename;
    }
    const blob = new Blob([JSON.stringify(updated, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manifest.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [manifest, selections]);

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-gray-500 text-sm animate-pulse">Loading candidates...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 text-center gap-4">
      <p className="text-red-400 text-sm">Failed to load candidates</p>
      <p className="text-gray-600 text-xs font-mono max-w-md">{error}</p>
      <button onClick={onBack} className="mt-2 text-orange-400 hover:text-orange-300 text-sm">Back</button>
    </div>
  );

  const cornerIds = Object.keys(manifest).sort((a, b) => {
    const tsA = manifest[a].candidates?.[0]?.timestamp_ms ?? 0;
    const tsB = manifest[b].candidates?.[0]?.timestamp_ms ?? 0;
    return tsA - tsB;
  });

  const totalCorners = cornerIds.length;
  const selectedCount = cornerIds.filter((id) => selections[id]).length;

  const filteredIds = cornerIds.filter((id) => {
    if (filter === 'unselected') return !selections[id];
    if (filter === 'selected') return !!selections[id];
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">Back</button>
          <div>
            <h1 className="text-lg font-black">Dev Image Picker</h1>
            <p className="text-gray-500 text-xs">{selectedCount}/{totalCorners} selected · click a frame to select it</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'unselected', 'selected'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filter === f ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
          <button
            onClick={handleExport}
            className="px-4 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs font-semibold ml-2"
          >
            Export manifest.json
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-3">
        {filteredIds.map((cornerId) => {
          const data = manifest[cornerId];
          return (
            <AnimatedCornerCard
              key={cornerId}
              cornerId={cornerId}
              cornerName={data.corner_name}
              candidates={data.candidates || []}
              selected={selections[cornerId]}
              onSelect={handleSelect}
              basePath={candidatesPath}
            />
          );
        })}
      </div>

      {filteredIds.length === 0 && (
        <div className="text-center text-gray-500 py-12">No corners match this filter.</div>
      )}
    </div>
  );
}
