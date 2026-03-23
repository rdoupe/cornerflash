import { useState, useEffect, useRef } from 'react';

const ASSIGNMENTS_KEY = 'cornerflash:dev:text-assignments';
const HIDDEN_KEY = 'cornerflash:dev:text-hidden';
const SUGGESTIONS_SEEDED_KEY = 'cornerflash:dev:suggestions-seeded';

function loadAssignments() {
  try { return JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) || '{}'); }
  catch { return {}; }
}
function saveAssignments(a) { localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(a)); }

function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveHidden(s) { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s])); }

function hitKey(hit) { return `${hit.time_s}_${hit.frame_file}`; }

// ── Assign Modal ─────────────────────────────────────────────────────────────

function AssignModal({ hits, allCorners, assignments, onAssign, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = query.trim()
    ? allCorners.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.id.toLowerCase().includes(query.toLowerCase())
      )
    : allCorners;

  const handleSelect = (cornerId) => {
    onAssign(cornerId, hits);
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].id);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* Preview strip */}
        <div className="flex gap-2 p-3 overflow-x-auto border-b border-gray-800 shrink-0">
          {hits.slice(0, 6).map((hit, i) => (
            <img
              key={i}
              src={`/text_candidates/frames/${hit.frame_file}`}
              alt=""
              className="h-16 aspect-video object-cover rounded shrink-0"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ))}
          {hits.length > 6 && (
            <div className="h-16 aspect-video rounded bg-gray-800 flex items-center justify-center text-gray-500 text-xs shrink-0">
              +{hits.length - 6}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-800 shrink-0">
          <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-2">
            Assign {hits.length} frame{hits.length > 1 ? 's' : ''} to corner
          </p>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type corner name…"
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-600"
          />
        </div>

        {/* Corner list */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-6">No corners match</p>
          )}
          {filtered.map(({ id, name }) => {
            const existing = assignments[id];
            return (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors flex items-center justify-between gap-3"
              >
                <span className="text-white text-sm font-medium">{name}</span>
                {existing && (
                  <span className="text-[10px] text-green-400 bg-green-900/40 rounded px-2 py-0.5 shrink-0">
                    {existing.time_s}s assigned
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-gray-800 shrink-0">
          <button onClick={onClose} className="w-full text-gray-500 hover:text-white text-sm py-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hit Card ─────────────────────────────────────────────────────────────────

function HitCard({ hit, isSelected, isHidden, assignedTo, onToggleSelect, onOpen, onToggleHide, multiSelectMode }) {
  return (
    <div className="relative group">
      <button
        onClick={() => multiSelectMode ? onToggleSelect() : onOpen([hit])}
        className={`w-full rounded-lg overflow-hidden border-2 text-left transition-all focus:outline-none ${
          assignedTo
            ? 'border-green-600'
            : isSelected
            ? 'border-orange-400 ring-2 ring-orange-400/30'
            : isHidden
            ? 'border-gray-800 opacity-30'
            : 'border-gray-700 hover:border-gray-500'
        }`}
      >
        <img
          src={`/text_candidates/frames/${hit.frame_file}`}
          alt={hit.lines[0]}
          className="w-full aspect-video object-cover block"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="bg-gray-900 px-2 py-1.5">
          {hit.lines.map((line, i) => (
            <p key={i} className="text-white text-xs font-semibold truncate">{line}</p>
          ))}
          <p className="text-gray-500 text-[10px] font-mono mt-0.5">
            t={hit.time_s}s
            {assignedTo && <span className="text-green-400 ml-1">→ {assignedTo}</span>}
          </p>
        </div>
      </button>

      {/* Checkbox (top-left, hover) */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          isSelected
            ? 'bg-orange-500 border-orange-400 opacity-100'
            : 'bg-black/60 border-gray-500 opacity-0 group-hover:opacity-100'
        }`}
      >
        {isSelected && <span className="text-white text-[10px] font-black">✓</span>}
      </button>

      {/* Hide button (top-right, hover) */}
      {!assignedTo && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-red-900 text-white text-[10px] font-bold rounded px-1.5 py-0.5"
          title={isHidden ? 'Unhide' : 'Hide'}
        >
          {isHidden ? '👁' : '✕'}
        </button>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DevTextMatcher({ onBack }) {
  const [manifest, setManifest] = useState(null);
  const [allCorners, setAllCorners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [assignments, setAssignments] = useState(() => loadAssignments());
  const [hidden, setHidden] = useState(() => loadHidden());
  const [selected, setSelected] = useState(new Set()); // Set of hitKey strings
  const [showHidden, setShowHidden] = useState(false);
  const [modalHits, setModalHits] = useState(null); // non-null = modal open
  const [filterCornerId, setFilterCornerId] = useState(null); // left panel filter
  const [hideMatchedCorners, setHideMatchedCorners] = useState(false);
  const [newMatches, setNewMatches] = useState(new Set()); // corner IDs matched in new-match

  useEffect(() => {
    Promise.all([
      fetch('/candidates_new/manifest.json').then((r) => r.ok ? r.json() : {}).then((d) => {
        setNewMatches(new Set(Object.keys(d)));
      }).catch(() => {}),
      fetch('/text_candidates/manifest.json').then((r) => {
        if (!r.ok) throw new Error(
          `HTTP ${r.status} — run 'python scripts/extract_corners.py new-scan-text' first`
        );
        return r.json();
      }),
      fetch('/data/nordschleife.json').then((r) => r.json()),
    ])
      .then(([, mf, corners]) => {
        setManifest(mf);
        setAllCorners(corners.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)));

        // Seed assignments from OCR suggestions if not yet done for this manifest
        const alreadySeeded = localStorage.getItem(SUGGESTIONS_SEEDED_KEY) === 'true';
        if (!alreadySeeded && mf?.hits?.length) {
          const existing = loadAssignments();
          const seeded = { ...existing };

          for (const hit of mf.hits) {
            if (!hit.suggested_corner_id) continue;
            const cid = hit.suggested_corner_id;
            const prev = seeded[cid];
            const prevKeys = new Set(prev?.hitKeys ?? []);
            const k = hitKey(hit);
            if (prevKeys.has(k)) continue;
            const merged = [...(prev?.hits ?? []), hit];
            const times = merged.map((h) => h.time_s);
            seeded[cid] = {
              hits: merged,
              hitKeys: merged.map(hitKey),
              suggested: true,   // flag so UI can style differently
              time_s: Math.min(...times),
              start_s: Math.min(...times),
              end_s: Math.max(...times),
              count: merged.length,
            };
          }
          saveAssignments(seeded);
          setAssignments(seeded);
          localStorage.setItem(SUGGESTIONS_SEEDED_KEY, 'true');
        }

        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const doAssign = (cornerId, newHits) => {
    const existing = assignments[cornerId];
    const existingKeys = new Set(existing?.hitKeys ?? []);
    const existingHits = existing?.hits ?? [];
    // Additive: only add hits not already assigned to this corner
    const added = newHits.filter((h) => !existingKeys.has(hitKey(h)));
    const merged = [...existingHits, ...added];
    if (merged.length === 0) return;
    const allKeys = merged.map(hitKey);
    const times = merged.map((h) => h.time_s);
    const next = {
      ...assignments,
      [cornerId]: {
        hits: merged,
        hitKeys: allKeys,
        suggested: false,  // manually confirmed
        time_s: Math.min(...times),
        start_s: Math.min(...times),
        end_s: Math.max(...times),
        count: merged.length,
      },
    };
    saveAssignments(next);
    setAssignments(next);
    setSelected(new Set());
  };

  const removeFromAssignment = (cornerId, key) => {
    const existing = assignments[cornerId];
    if (!existing) return;
    const remaining = (existing.hits ?? []).filter((h) => hitKey(h) !== key);
    if (remaining.length === 0) {
      const next = { ...assignments };
      delete next[cornerId];
      saveAssignments(next);
      setAssignments(next);
      return;
    }
    const allKeys = remaining.map(hitKey);
    const times = remaining.map((h) => h.time_s);
    const next = {
      ...assignments,
      [cornerId]: {
        hits: remaining,
        hitKeys: allKeys,
        time_s: Math.min(...times),
        start_s: Math.min(...times),
        end_s: Math.max(...times),
        count: remaining.length,
      },
    };
    saveAssignments(next);
    setAssignments(next);
  };

  const unassign = (cornerId) => {
    const next = { ...assignments };
    delete next[cornerId];
    saveAssignments(next);
    setAssignments(next);
  };

  const toggleHide = (hit) => {
    const k = hitKey(hit);
    const nextHidden = new Set(hidden);
    if (nextHidden.has(k)) nextHidden.delete(k); else nextHidden.add(k);
    saveHidden(nextHidden);
    setHidden(nextHidden);
    // Drop from selection if hiding
    if (!hidden.has(k)) {
      const nextSel = new Set(selected);
      nextSel.delete(k);
      setSelected(nextSel);
    }
  };

  const unhideAll = () => { saveHidden(new Set()); setHidden(new Set()); };

  const resetAll = () => {
    saveHidden(new Set());
    setHidden(new Set());
    saveAssignments({});
    setAssignments({});
    setSelected(new Set());
    localStorage.removeItem(SUGGESTIONS_SEEDED_KEY);
  };

  const toggleSelect = (hit) => {
    const k = hitKey(hit);
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSelected(next);
  };

  const saveToDisk = () => {
    fetch('/api/save-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignments, null, 2),
    }).then(() => alert('Saved to scripts/text_assignments.json'));
  };

  const exportCommands = () => {
    const lines = Object.entries(assignments).map(([cid, hit]) => {
      const pad = 5;
      const start = Math.max(0, (hit.start_s ?? hit.time_s) - pad);
      const end = (hit.end_s ?? hit.time_s) + pad;
      return `python scripts/extract_corners.py new-manual ${cid} ${start} ${end}`;
    });
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
    alert('Copied to clipboard:\n\n' + lines.join('\n'));
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-gray-500 text-sm animate-pulse">Loading...</div>
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 text-center gap-4">
      <p className="text-red-400 text-sm">{error}</p>
      <button onClick={onBack} className="text-orange-400 text-sm">Back</button>
    </div>
  );

  const { hits } = manifest;
  const hiddenCount = hidden.size;
  const assignedCount = allCorners.filter((c) => assignments[c.id] && !assignments[c.id].suggested).length;
  const suggestedCount = allCorners.filter((c) => assignments[c.id]?.suggested).length;

  // Build set of all hitKeys that are already assigned (across all multi-selections)
  const assignedHitKeys = new Set(
    Object.values(assignments).flatMap((a) => a.hitKeys ?? [hitKey(a)])
  );

  // Filter hits for right panel — exclude assigned, optionally exclude hidden
  let visibleHits = hits.filter((h) =>
    !assignedHitKeys.has(hitKey(h)) &&
    (showHidden || !hidden.has(hitKey(h)))
  );
  if (filterCornerId) {
    const gap = manifest.gap_windows?.find(
      (g) => g.after_corner === filterCornerId || g.before_corner === filterCornerId
    );
    if (gap) {
      visibleHits = visibleHits.filter(
        (h) => h.time_s >= gap.start_ms / 1000 && h.time_s <= gap.end_ms / 1000
      );
    }
  }

  // visibleKeys: single source of truth — selection is only valid for visible hits
  const visibleKeys = new Set(visibleHits.map(hitKey));
  // selectedHits derived purely from what's visible, so count/assign are always in sync
  const selectedHits = visibleHits.filter((h) => selected.has(hitKey(h)));

  // Cluster by 10s proximity
  const clusters = [];
  let cur = null;
  for (const hit of [...visibleHits].sort((a, b) => a.time_s - b.time_s)) {
    if (!cur || hit.time_s - cur.end_s > 10) {
      cur = { start_s: hit.time_s, end_s: hit.time_s, hits: [hit] };
      clusters.push(cur);
    } else {
      cur.end_s = hit.time_s;
      cur.hits.push(hit);
    }
  }

  return (
    <>
      {modalHits && (
        <AssignModal
          hits={modalHits}
          allCorners={allCorners}
          assignments={assignments}
          onAssign={doAssign}
          onClose={() => setModalHits(null)}
        />
      )}

      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">Back</button>
            <div>
              <h1 className="text-base font-black">Dev: Text Matcher</h1>
              <p className="text-gray-500 text-xs">
                {assignedCount} confirmed · <span className="text-yellow-600">{suggestedCount} suggested</span> / {allCorners.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedHits.length > 0 && (
              <>
                <button
                  onClick={() => setModalHits(selectedHits)}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold"
                >
                  Assign {selectedHits.length}
                </button>
                <button
                  onClick={() => {
                    const next = new Set(hidden);
                    selectedHits.forEach((h) => next.add(hitKey(h)));
                    saveHidden(next);
                    setHidden(next);
                    setSelected(new Set());
                  }}
                  className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-semibold"
                >
                  Hide {selectedHits.length}
                </button>
              </>
            )}
            {hiddenCount > 0 && (
              <>
                <button
                  onClick={() => setShowHidden((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    showHidden ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {showHidden ? `Hide ${hiddenCount} hidden` : `Show ${hiddenCount} hidden`}
                </button>
                {showHidden && (
                  <button onClick={unhideAll} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-xs font-semibold">
                    Unhide all
                  </button>
                )}
              </>
            )}
            <button
              onClick={resetAll}
              className="px-3 py-1.5 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-white rounded-lg text-xs font-semibold"
              title="Clear all hidden and assigned state"
            >
              Reset all
            </button>
            <button
              onClick={saveToDisk}
              className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold"
            >
              Save to disk
            </button>
            <button
              onClick={exportCommands}
              disabled={assignedCount === 0 && suggestedCount === 0}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-30 text-white rounded-lg text-xs font-semibold"
            >
              Copy commands
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: corner status */}
          <div className="w-52 shrink-0 border-r border-gray-800 overflow-y-auto py-2">
            <div className="px-3 py-1 flex items-center justify-between">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Corners</p>
              <button
                onClick={() => setHideMatchedCorners((v) => !v)}
                className={`text-[9px] rounded px-1.5 py-0.5 transition-colors ${
                  hideMatchedCorners ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
                title="Hide corners already matched in video"
              >
                hide matched
              </button>
            </div>
            <button
              onClick={() => setFilterCornerId(null)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                !filterCornerId ? 'text-orange-400 font-semibold' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Show all
            </button>
            {allCorners.filter((c) => !hideMatchedCorners || !newMatches.has(c.id)).map(({ id, name }) => {
              const assigned = assignments[id];
              const isFilter = filterCornerId === id;
              return (
                <button
                  key={id}
                  onClick={() => setFilterCornerId(isFilter ? null : id)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between gap-1 ${
                    isFilter
                      ? 'bg-gray-800 text-white'
                      : assigned && !assigned.suggested
                      ? 'text-green-400 hover:bg-gray-900'
                      : assigned && assigned.suggested
                      ? 'text-yellow-400 hover:bg-gray-900'
                      : 'text-gray-400 hover:bg-gray-900'
                  }`}
                >
                  <span className="truncate">{name}</span>
                  {assigned ? (
                    <span
                      className={`text-[9px] rounded px-1 shrink-0 cursor-pointer hover:bg-red-900 hover:text-red-300 ${
                        assigned.suggested
                          ? 'bg-yellow-900 text-yellow-300'
                          : 'bg-green-900 text-green-300'
                      }`}
                      title={assigned.suggested ? 'Auto-suggested — click to remove' : 'Remove all'}
                      onClick={(e) => { e.stopPropagation(); unassign(id); }}
                    >
                      {assigned.suggested ? '~' : ''}{assigned.count ?? 1}f ×
                    </span>
                  ) : (
                    <span className="text-[9px] text-gray-700 shrink-0">—</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: hit grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Assigned frames for the filtered corner */}
            {filterCornerId && assignments[filterCornerId]?.hits?.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] text-green-600 uppercase tracking-widest mb-2">
                  Assigned to {allCorners.find((c) => c.id === filterCornerId)?.name} — click to remove
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {assignments[filterCornerId].hits.map((hit, i) => (
                    <div key={i} className="relative group">
                      <button
                        onClick={() => removeFromAssignment(filterCornerId, hitKey(hit))}
                        className="w-full rounded-lg overflow-hidden border-2 border-green-700 hover:border-red-500 text-left transition-all focus:outline-none"
                      >
                        <img
                          src={`/text_candidates/frames/${hit.frame_file}`}
                          alt={hit.lines?.[0]}
                          className="w-full aspect-video object-cover block"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div className="bg-gray-900 px-2 py-1">
                          {(hit.lines ?? []).map((line, li) => (
                            <p key={li} className="text-green-300 text-xs truncate">{line}</p>
                          ))}
                          <p className="text-gray-500 text-[10px] font-mono">t={hit.time_s}s</p>
                        </div>
                      </button>
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-red-700 text-white text-[10px] font-bold rounded px-1.5 py-0.5 pointer-events-none">
                        remove
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clusters.length === 0 && !(filterCornerId && assignments[filterCornerId]) && (
              <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
                No text hits found{filterCornerId ? ' for this window' : ''}.
              </div>
            )}
            {clusters.map((cluster, ci) => (
              <div key={ci} className="mb-6">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
                  {cluster.start_s === cluster.end_s
                    ? `t = ${cluster.start_s}s`
                    : `t = ${cluster.start_s}s – ${cluster.end_s}s`}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {cluster.hits.map((hit, hi) => (
                    <HitCard
                      key={hi}
                      hit={hit}
                      isSelected={selected.has(hitKey(hit))}
                      isHidden={hidden.has(hitKey(hit))}
                      assignedTo={null}
                      onToggleSelect={() => toggleSelect(hit)}
                      onOpen={(h) => setModalHits(h)}
                      multiSelectMode={selectedHits.length > 0}
                      onToggleHide={() => toggleHide(hit)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: command preview */}
        {assignedCount > 0 && (
          <div className="border-t border-gray-800 px-4 py-2 bg-gray-900 shrink-0">
            <div className="font-mono text-xs space-y-0.5 max-h-20 overflow-y-auto">
              {Object.entries(assignments).map(([cid, hit]) => {
                const pad = 5;
                const start = Math.max(0, (hit.start_s ?? hit.time_s) - pad);
                const end = (hit.end_s ?? hit.time_s) + pad;
                return (
                  <div key={cid} className="text-gray-500">
                    new-manual <span className="text-orange-400">{cid}</span>{' '}
                    <span className="text-green-400">{start} {end}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
