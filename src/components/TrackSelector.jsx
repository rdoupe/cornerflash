import { useState, useEffect } from 'react';
import { isDue } from '../sm2.js';
import { loadAllProgress } from '../storage.js';

const tracks = [
  {
    id: 'spa',
    name: 'Spa-Francorchamps',
    country: 'Belgium',
    description: 'Home of Eau Rouge, Raidillon, and Pouhon. One of the most challenging circuits in the world.',
    length: '7.004 km',
    total: 20,
    emoji: '🇧🇪',
  },
  {
    id: 'nordschleife',
    name: 'Nürburgring Nordschleife',
    country: 'Germany',
    description: 'The Green Hell. 73 corners over 20+ km of challenging mountain road.',
    length: '20.832 km',
    total: 73,
    emoji: '🇩🇪',
  },
];

function computeStats(progress, total) {
  const cards = Object.values(progress);
  const seen = cards.length;
  const due = cards.filter(isDue).length;
  const mastered = cards.filter(c => c.interval >= 21).length;
  return { seen, due, mastered, total, pct: Math.round((seen / total) * 100) };
}

export default function TrackSelector({ onSelect, user, onLogout }) {
  const [stats, setStats] = useState({});

  useEffect(() => {
    if (!user) return;
    Promise.all(
      tracks.map(t => loadAllProgress(t.id, user).then(prog => ({ id: t.id, stats: computeStats(prog, t.total) })))
    ).then(results => {
      const s = {};
      results.forEach(r => { s[r.id] = r.stats; });
      setStats(s);
    });
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black tracking-tight text-orange-400 mb-2">
            CornerFlash
          </h1>
          <p className="text-gray-400 text-sm uppercase tracking-widest">
            Learn every corner. Master every track.
          </p>
          {user && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-gray-500 text-xs">{user}</span>
              <button
                onClick={onLogout}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                · logout
              </button>
            </div>
          )}
        </div>

        {/* Track cards */}
        <div className="flex flex-col gap-4">
          {tracks.map((track) => {
            const s = stats[track.id];
            const started = s && s.seen > 0;
            return (
              <button
                key={track.id}
                onClick={() => onSelect(track.id)}
                className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-orange-500 hover:bg-gray-800 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{track.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-white leading-tight mb-1">
                      {track.name}
                    </h2>
                    <p className="text-gray-400 text-sm mb-3 leading-relaxed">
                      {track.description}
                    </p>

                    {/* Progress bar + stats (if started) */}
                    {started ? (
                      <div className="flex flex-col gap-2">
                        {/* Split bar: mastered | learning | unseen */}
                        <div className="w-full bg-gray-800 rounded-full h-2 flex overflow-hidden">
                          <div
                            className="bg-green-500 h-full transition-all duration-500"
                            style={{ width: `${(s.mastered / track.total) * 100}%` }}
                          />
                          <div
                            className="bg-yellow-400 h-full transition-all duration-500"
                            style={{ width: `${((s.seen - s.mastered) / track.total) * 100}%` }}
                          />
                        </div>
                        {/* Totals row */}
                        <div className="flex gap-4 flex-wrap">
                          <span className="text-xs text-gray-500">Learning <span className="text-yellow-400 font-semibold">{s.seen - s.mastered}</span></span>
                          <span className="text-xs text-gray-500">Mastered <span className="text-green-400 font-semibold">{s.mastered}</span></span>
                          <span className="text-xs text-gray-500">Seen <span className="text-gray-500 font-semibold">{s.seen}</span></span>
                          <span className="text-xs text-gray-500">Total <span className="text-gray-500 font-semibold">{track.total}</span></span>
                          {s.due > 0 && (
                            <span className="text-xs text-orange-400 font-semibold">{s.due} due</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <span className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-1 rounded-full">
                          {track.length}
                        </span>
                        <span className="text-xs bg-orange-950 border border-orange-900 text-orange-300 px-2 py-1 rounded-full">
                          {track.total} corners
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-gray-600 text-xl mt-1">›</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
