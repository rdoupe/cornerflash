import { useState, useEffect, useRef } from 'react';

const MAP_VARIANT_KEY = 'cornerflash:map_variant';

// Type badge colors
const TYPE_COLORS = {
  fast: 'text-red-400',
  medium: 'text-yellow-400',
  slow: 'text-blue-400',
};

function VariantA({ corners, currentCornerId }) {
  const current = corners.find((c) => c.id === currentCornerId);

  if (!current) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-xs">
        No corner data
      </div>
    );
  }

  const hasGps = current.gps && current.gps.lat != null && current.gps.lng != null;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 p-2">
      {hasGps ? (
        <svg viewBox="-60 -60 120 120" className="w-full h-full max-w-[120px]">
          {/* Sub-corners if present */}
          {current.corners && current.corners.length > 0
            ? current.corners.map((sub, i) => (
                <g key={i}>
                  <circle cx={0} cy={0} r={8} fill="#f97316" />
                  <text x={0} y={4} textAnchor="middle" fill="white" fontSize="8">
                    {i + 1}
                  </text>
                </g>
              ))
            : (
              <>
                <circle cx={0} cy={0} r={12} fill="#f97316" opacity={0.9} />
                <circle cx={0} cy={0} r={5} fill="white" />
              </>
            )}
        </svg>
      ) : (
        <div className="text-center px-2">
          <div className="text-orange-400 font-bold text-xs leading-tight">{current.name}</div>
          <div className={`text-xs mt-1 ${TYPE_COLORS[current.type] || 'text-gray-400'}`}>
            {current.type}
          </div>
          <div className="text-gray-600 text-xs mt-2">GPS pending</div>
        </div>
      )}
    </div>
  );
}

function VariantB({ corners, currentCornerId }) {
  const canvasRef = useRef(null);

  // Filter corners with GPS data
  const withGps = corners.filter(
    (c) => c.gps && c.gps.lat != null && c.gps.lng != null
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    ctx.clearRect(0, 0, width, height);

    if (withGps.length === 0) return;

    // Compute bounding box
    const lats = withGps.map((c) => c.gps.lat);
    const lngs = withGps.map((c) => c.gps.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;

    const pad = 16;
    const toX = (lng) => pad + ((lng - minLng) / lngRange) * (width - pad * 2);
    const toY = (lat) => height - pad - ((lat - minLat) / latRange) * (height - pad * 2);

    // Draw connecting line
    ctx.beginPath();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    withGps.forEach((c, i) => {
      const x = toX(c.gps.lng);
      const y = toY(c.gps.lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw dots
    withGps.forEach((c) => {
      const x = toX(c.gps.lng);
      const y = toY(c.gps.lat);
      const isCurrent = c.id === currentCornerId;

      ctx.beginPath();
      ctx.arc(x, y, isCurrent ? 6 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? '#f97316' : '#6b7280';
      ctx.fill();

      if (isCurrent) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
  }, [corners, currentCornerId, withGps]);

  if (withGps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center px-2">
        <p className="text-gray-600 text-xs leading-tight">
          Map available after GPS data loaded
        </p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={120}
      className="w-full h-full"
    />
  );
}

export default function MapPip({ corners, currentCornerId, trackId }) {
  const [variant, setVariant] = useState(() => {
    return localStorage.getItem(MAP_VARIANT_KEY) || 'A';
  });

  const toggleVariant = () => {
    const next = variant === 'A' ? 'B' : 'A';
    setVariant(next);
    localStorage.setItem(MAP_VARIANT_KEY, next);
  };

  return (
    <div className="relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden" style={{ width: 160, height: 120 }}>
      {/* Map content */}
      {variant === 'A' ? (
        <VariantA corners={corners} currentCornerId={currentCornerId} />
      ) : (
        <VariantB corners={corners} currentCornerId={currentCornerId} />
      )}

      {/* Toggle button */}
      <button
        onClick={toggleVariant}
        className="absolute bottom-1 right-1 bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs px-1.5 py-0.5 rounded transition-colors"
        title={`Switch to Variant ${variant === 'A' ? 'B' : 'A'}`}
      >
        {variant}
      </button>

      {/* Track label */}
      <div className="absolute top-1 left-1.5 text-gray-600 text-xs font-mono uppercase tracking-wider">
        {trackId}
      </div>
    </div>
  );
}
