import { useState, useEffect } from 'react';
import TrackSelector from './components/TrackSelector.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import DevTextMatcher from './components/DevTextMatcher.jsx';
import DevImagePruner from './components/DevImagePruner.jsx';
import StudyMode from './components/StudyMode.jsx';
import FlashcardMode from './components/FlashcardMode.jsx';
import ProgressView from './components/ProgressView.jsx';

const TRACK_LABELS = {
  spa: 'Spa-Francorchamps',
  nordschleife: 'Nürburgring Nordschleife',
};

const MODES = [
  {
    id: 'dev-text-matcher',
    label: 'Dev: Text Matcher',
    description: 'Manually assign corners to labeled frames. Run new-scan-all first.',
    icon: 'DEV',
    accent: 'border-yellow-800 hover:border-yellow-500',
    devOnly: true,
  },
  {
    id: 'dev-image-pruner',
    label: 'Dev: Image Pruner',
    description: 'Remove individual frames with obvious corner name hints.',
    icon: 'DEV',
    accent: 'border-yellow-800 hover:border-yellow-500',
    devOnly: true,
  },
  {
    id: 'flashcard',
    label: 'Flashcard',
    description: 'SM-2 spaced repetition. Rate each corner to schedule reviews.',
    icon: '🃏',
    accent: 'border-orange-800 hover:border-orange-500',
  },
  {
    id: 'study',
    label: 'Study',
    description: 'Browse all corners in order. No tracking — just learn the names.',
    icon: '📖',
    accent: 'border-blue-800 hover:border-blue-500',
  },
  {
    id: 'progress',
    label: 'Progress',
    description: 'View your stats, review intervals, and reset if needed.',
    icon: '📊',
    accent: 'border-green-800 hover:border-green-500',
  },
];

function ModeSelector({ track, onSelectMode, onBack }) {
  const label = TRACK_LABELS[track] || track;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          ‹ Back
        </button>
        <div>
          <h2 className="text-xl font-black text-white leading-tight">{label}</h2>
          <p className="text-gray-500 text-xs uppercase tracking-widest">Select a mode</p>
        </div>
      </div>

      {/* Mode cards */}
      <div className="flex flex-col gap-4">
        {MODES.filter(m => !m.devOnly).map((mode) => (
          <button
            key={mode.id}
            onClick={() => onSelectMode(mode.id)}
            className={`w-full text-left bg-gray-900 border rounded-2xl p-6 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-orange-500 ${mode.accent}`}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{mode.icon}</span>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white mb-1">{mode.label}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{mode.description}</p>
              </div>
              <span className="text-gray-600 text-xl">›</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadingScreen({ track }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-3">
      <div className="text-gray-600 text-sm animate-pulse">Loading {TRACK_LABELS[track] || track}...</div>
    </div>
  );
}

function ErrorScreen({ track, error, onBack }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 text-center gap-4">
      <p className="text-red-400 text-sm">Failed to load corner data for {track}.</p>
      <p className="text-gray-600 text-xs font-mono">{error}</p>
      <button
        onClick={onBack}
        className="mt-2 text-orange-400 hover:text-orange-300 text-sm"
      >
        ← Back
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem('cornerflash:user') || null);

  const handleLogout = () => {
    localStorage.removeItem('cornerflash:user');
    setUser(null);
  };

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return <AppShell user={user} onLogout={handleLogout} />;
}

function AppShell({ user, onLogout }) {
  // screen: 'track-select' | 'mode-select' | 'study' | 'flashcard' | 'progress'
  const [screen, setScreen] = useState('track-select');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [corners, setCorners] = useState([]);
  const [loadingCorners, setLoadingCorners] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Load corners whenever a track is selected
  useEffect(() => {
    if (!selectedTrack) return;

    let cancelled = false;
    setLoadingCorners(true);
    setLoadError(null);
    setCorners([]);

    fetch(`/data/${selectedTrack}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setCorners(data);
        setLoadingCorners(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message);
        setLoadingCorners(false);
      });

    return () => { cancelled = true; };
  }, [selectedTrack]);

  const handleSelectTrack = (trackId) => {
    setSelectedTrack(trackId);
    setScreen('mode-select');
  };

  const handleSelectMode = (mode) => {
    setScreen(mode);
  };

  const handleBackToModes = () => {
    setScreen('mode-select');
  };

  const handleBackToTracks = () => {
    setScreen('track-select');
    setSelectedTrack(null);
    setCorners([]);
  };

  // Track select screen
  if (screen === 'track-select') {
    return <TrackSelector onSelect={handleSelectTrack} user={user} onLogout={onLogout} />;
  }

  // Loading corners
  if (loadingCorners) {
    return <LoadingScreen track={selectedTrack} />;
  }

  // Load error
  if (loadError) {
    return <ErrorScreen track={selectedTrack} error={loadError} onBack={handleBackToTracks} />;
  }

  // Mode select
  if (screen === 'mode-select') {
    return (
      <ModeSelector
        track={selectedTrack}
        onSelectMode={handleSelectMode}
        onBack={handleBackToTracks}
      />
    );
  }

  // Study mode
  if (screen === 'study') {
    return (
      <StudyMode
        track={selectedTrack}
        corners={corners}
        onBack={handleBackToModes}
      />
    );
  }

  // Flashcard mode
  if (screen === 'flashcard') {
    return (
      <FlashcardMode
        track={selectedTrack}
        corners={corners}
        username={user}
        onBack={handleBackToModes}
      />
    );
  }

  // Progress view
  if (screen === 'progress') {
    return (
      <ProgressView
        track={selectedTrack}
        corners={corners}
        username={user}
        onBack={handleBackToModes}
      />
    );
  }

  if (screen === 'dev-text-matcher' && import.meta.env.DEV) {
    return <DevTextMatcher onBack={handleBackToModes} />;
  }

  if (screen === 'dev-image-pruner' && import.meta.env.DEV) {
    return <DevImagePruner onBack={handleBackToModes} />;
  }

  // Fallback
  return <TrackSelector onSelect={handleSelectTrack} />;
}
