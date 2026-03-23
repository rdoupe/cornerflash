import { useState, useEffect } from 'react';

function msFromFilename(f) {
  const m = f.match(/(\d+)ms\.jpg$/);
  return m ? parseInt(m[1], 10) : 0;
}

export default function DevImagePruner({ onBack }) {
  const [manifest, setManifest] = useState(null); // { corner_id: [filenames] }
  const [selected, setSelected] = useState(null); // corner_id
  const [marked, setMarked] = useState({}); // { corner_id: Set<filename> }
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    fetch('/candidates_new/manifest.json')
      .then(r => r.json())
      .then(data => {
        setManifest(data);
        const first = Object.keys(data)[0];
        if (first) setSelected(first);
      });
  }, []);

  function toggleFrame(cornerId, filename) {
    setMarked(prev => {
      const set = new Set(prev[cornerId] || []);
      if (set.has(filename)) {
        set.delete(filename);
      } else {
        set.add(filename);
      }
      return { ...prev, [cornerId]: set };
    });
  }

  function totalMarked() {
    return Object.values(marked).reduce((sum, s) => sum + s.size, 0);
  }

  function markedForCorner(id) {
    return (marked[id] || new Set()).size;
  }

  async function saveManifest() {
    setSaving(true);
    setSavedMsg('');
    // Build pruned manifest — remove marked frames from each corner
    const pruned = {};
    for (const [id, frames] of Object.entries(manifest)) {
      const remove = marked[id] || new Set();
      const kept = frames.filter(f => !remove.has(f));
      if (kept.length > 0) pruned[id] = kept;
    }
    try {
      const res = await fetch('/api/save-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pruned, null, 2),
      });
      const json = await res.json();
      if (json.ok) {
        setManifest(pruned);
        setMarked({});
        setSavedMsg(`Saved — ${totalMarked()} frame(s) removed`);
      } else {
        setSavedMsg('Save failed');
      }
    } catch (e) {
      setSavedMsg(`Error: ${e.message}`);
    }
    setSaving(false);
  }

  if (!manifest) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">Loading manifest…</div>
      </div>
    );
  }

  const corners = Object.keys(manifest).sort();
  const frames = selected
    ? [...(manifest[selected] || [])].sort((a, b) => msFromFilename(a) - msFromFilename(b))
    : [];
  const markedSet = selected ? (marked[selected] || new Set()) : new Set();
  const total = totalMarked();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" style={{ maxHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
          ‹ Back
        </button>
        <div className="text-xs text-gray-500 uppercase tracking-widest">Image Pruner</div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <span className="text-xs text-red-400 font-mono">{total} marked</span>
          )}
          <button
            onClick={saveManifest}
            disabled={saving || total === 0}
            className="text-xs bg-red-800 hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
          >
            {saving ? 'Saving…' : 'Remove marked'}
          </button>
        </div>
      </div>
      {savedMsg && (
        <div className="px-4 py-2 bg-gray-900 text-green-400 text-xs border-b border-gray-800 flex-shrink-0">
          {savedMsg}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: corner list */}
        <div className="w-44 flex-shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-900">
          {corners.map(id => {
            const mCount = markedForCorner(id);
            const fCount = (manifest[id] || []).length;
            const isSelected = id === selected;
            return (
              <button
                key={id}
                onClick={() => setSelected(id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-gray-800 flex items-center justify-between gap-1 ${
                  isSelected
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="truncate">{id}</span>
                <span className={`flex-shrink-0 font-mono ${mCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                  {mCount > 0 ? `${fCount - mCount}/${fCount}` : fCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: frame grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {selected && (
            <>
              <div className="text-xs text-gray-500 mb-3 flex items-center gap-2">
                <span className="font-semibold text-gray-300">{selected}</span>
                <span>{frames.length} frames</span>
                {markedSet.size > 0 && (
                  <span className="text-red-400">{markedSet.size} marked</span>
                )}
                <span className="text-gray-600">· click to mark for removal</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {frames.map(filename => {
                  const isMarked = markedSet.has(filename);
                  return (
                    <button
                      key={filename}
                      onClick={() => toggleFrame(selected, filename)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all focus:outline-none ${
                        isMarked
                          ? 'border-red-500 opacity-50'
                          : 'border-transparent hover:border-gray-600'
                      }`}
                    >
                      <img
                        src={`/candidates_new/${selected}/${filename}`}
                        alt={filename}
                        className="w-full block"
                        style={{ aspectRatio: '16/5', objectFit: 'cover' }}
                      />
                      {isMarked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-900/40">
                          <span className="text-white text-2xl font-black drop-shadow">✕</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
