import { useState } from 'react';

const TRACKS = [
  { name: 'Spa-Francorchamps', country: 'Belgium', length: '7.004 km', corners: '20 corners', emoji: '🇧🇪' },
  { name: 'Nürburgring Nordschleife', country: 'Germany', length: '20.832 km', corners: '73 corners', emoji: '🇩🇪' },
];

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('cornerflash:user', trimmed);
    onLogin(trimmed);
  };

  return (
    <div
      className="relative min-h-screen text-white flex flex-col items-center justify-center px-4 py-12 bg-cover bg-center"
      style={{ backgroundImage: 'url(/images/login-bg.jpg)' }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gray-950/80" />
      <div className="relative z-10 w-full max-w-lg flex flex-col gap-10">

        {/* Branding */}
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-orange-400 mb-2">CornerFlash</h1>
          <p className="text-gray-400 text-sm uppercase tracking-widest">Learn every corner. Master every track.</p>
        </div>

        {/* How it works */}
        <div className="flex gap-6">
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-orange-400 text-2xl">⟳</span>
            <p className="text-base font-bold text-white">Spaced Repetition</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              Corners you struggle with come back sooner. Ones you nail get spaced out over days and weeks.
            </p>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-orange-400 text-2xl">◎</span>
            <p className="text-base font-bold text-white">Active Recall</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              You're shown the corner, not the name — forcing your brain to retrieve it. 3× better retention.
            </p>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <span className="text-orange-400 text-2xl">◈</span>
            <p className="text-base font-bold text-white">SM-2 Algorithm</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              Struggled? Back tomorrow. Nailed it three times? See you next month.
            </p>
          </div>
        </div>

        {/* Available tracks */}
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Available now</p>
          {TRACKS.map((track) => (
            <div key={track.name} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
              <span className="text-2xl">{track.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{track.name}</p>
                <p className="text-xs text-gray-500">{track.country}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-1 rounded-full">{track.length}</span>
                <span className="text-xs bg-orange-950 border border-orange-900 text-orange-300 px-2 py-1 rounded-full">{track.corners}</span>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-600 text-center">More tracks coming soon</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What's your name?"
            autoFocus
            className="w-full bg-gray-900 border border-gray-700 text-white placeholder-gray-600 rounded-xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-4 rounded-xl font-bold text-base transition-all bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
          >
            Let's go →
          </button>
        </form>

      </div>
    </div>
  );
}

