export default function TrackSelector({ onSelect }) {
  const tracks = [
    {
      id: 'spa',
      name: 'Spa-Francorchamps',
      country: 'Belgium',
      description: 'Home of Eau Rouge, Raidillon, and Pouhon. One of the most challenging circuits in the world.',
      length: '7.004 km',
      corners: '20 corners',
      emoji: '🇧🇪',
    },
    {
      id: 'nordschleife',
      name: 'Nürburgring Nordschleife',
      country: 'Germany',
      description: 'The Green Hell. 73 corners over 20+ km of challenging mountain road.',
      length: '20.832 km',
      corners: '73 corners',
      emoji: '🇩🇪',
    },
  ];

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
        </div>

        {/* Track cards */}
        <div className="flex flex-col gap-4">
          {tracks.map((track) => (
            <button
              key={track.id}
              onClick={() => onSelect(track.id)}
              className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-orange-500 hover:bg-gray-800 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">{track.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-bold text-white leading-tight">
                      {track.name}
                    </h2>
                  </div>
                  <p className="text-gray-400 text-sm mb-3 leading-relaxed">
                    {track.description}
                  </p>
                  <div className="flex gap-3">
                    <span className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-1 rounded-full">
                      {track.length}
                    </span>
                    <span className="text-xs bg-orange-950 border border-orange-900 text-orange-300 px-2 py-1 rounded-full">
                      {track.corners}
                    </span>
                  </div>
                </div>
                <span className="text-gray-600 text-xl mt-1">›</span>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-gray-700 text-xs mt-8">
          Powered by SM-2 spaced repetition
        </p>
      </div>
    </div>
  );
}
