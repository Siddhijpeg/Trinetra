import React, { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, Button, FeatureTag } from '../components/ui';
import { ACTIVE_RISK_ZONES } from '../data/mockZones';
import { useTheme } from '../context/ThemeContext';

// Fix for leaflet default icon in Vite
import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const RISK_COLORS: Record<string, string> = {
  critical: '#E5484D',
  high:     '#F97316',
  medium:   '#F59E0B',
  low:      '#14B8A6',
};

const HORIZONS = ['Now', '30 min', '1 hr', '2 hr', '6 hr'];

const LAYERS = [
  { id: 'hotspots', label: 'Predicted Hotspots',  defaultOn: true },
  { id: 'cases',    label: 'Active Cases',         defaultOn: true },
  { id: 'mules',    label: 'Mule Locations',       defaultOn: true },
  { id: 'osint',    label: 'OSINT Signals',        defaultOn: false },
];

export default function GeoIntelligence() {
  const [horizon, setHorizon] = useState('1 hr');
  const [selectedZone, setSelectedZone] = useState<string | null>('Z001');
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYERS.map(l => [l.id, l.defaultOn]))
  );
  const [expandedWhy, setExpandedWhy] = useState<string | null>(null);
  const { theme } = useTheme();

  const toggleLayer = (id: string) =>
    setActiveLayers(prev => ({ ...prev, [id]: !prev[id] }));

  const selectedZoneData = ACTIVE_RISK_ZONES.find(z => z.zoneId === selectedZone);
  const getRadius = (riskScore: number) => 8 + riskScore * 0.22;

  // Theme-appropriate tile layer
  const mapTileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const mapAttribution = theme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div className="p-7 flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[24px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Geo Intelligence</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Predictive cash-out risk map · Real Indian district coordinates
          </p>
        </div>
        <Button variant="secondary" size="sm">Export Map</Button>
      </div>

      {/* Main layout */}
      <div className="flex-1 grid grid-cols-5 gap-5 min-h-0">

        {/* Left controls */}
        <div className="col-span-1 space-y-4 overflow-y-auto">
          {/* Prediction Horizon */}
          <Card className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Horizon</div>
            <div className="space-y-1">
              {HORIZONS.map(h => (
                <button key={h} onClick={() => setHorizon(h)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={horizon === h
                    ? { backgroundColor: '#14B8A6', color: '#FFFFFF' }
                    : { backgroundColor: 'transparent', color: 'var(--text-secondary)' }
                  }>
                  {h}
                </button>
              ))}
            </div>
          </Card>

          {/* Layer Controls */}
          <Card className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Layers</div>
            <div className="space-y-2.5">
              {LAYERS.map(layer => (
                <label key={layer.id} className="flex items-center gap-2.5 cursor-pointer">
                  <button
                    onClick={() => toggleLayer(layer.id)}
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all"
                    style={activeLayers[layer.id]
                      ? { backgroundColor: '#14B8A6', borderColor: '#14B8A6' }
                      : { backgroundColor: 'var(--surface)', borderColor: 'var(--border-strong)' }
                    }
                  >
                    {activeLayers[layer.id] && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <span className="text-xs transition-colors"
                    style={{ color: activeLayers[layer.id] ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {layer.label}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        </div>

        {/* Map */}
        <div className="col-span-3 rounded-2xl overflow-hidden border shadow-sm relative" style={{ borderColor: 'var(--border)' }}>
          {/* Horizon badge */}
          <div className="absolute top-3 left-3 z-[500] rounded-xl px-3 py-1.5 border shadow-sm"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Prediction Horizon</div>
            <div className="text-sm font-bold text-[#14B8A6]">{horizon}</div>
          </div>

          <MapContainer center={[20.5937, 78.9629]} zoom={5} scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }} zoomControl={true}>
            <TileLayer url={mapTileUrl} attribution={mapAttribution} />

            {ACTIVE_RISK_ZONES.map(zone => (
              <CircleMarker key={zone.zoneId}
                center={[zone.lat, zone.lng]}
                radius={getRadius(zone.riskScore)}
                pathOptions={{
                  fillColor: RISK_COLORS[zone.riskLevel],
                  fillOpacity: selectedZone === zone.zoneId ? 0.85 : 0.65,
                  color: selectedZone === zone.zoneId ? 'white' : RISK_COLORS[zone.riskLevel],
                  weight: selectedZone === zone.zoneId ? 2 : 1,
                  opacity: 0.9,
                }}
                eventHandlers={{ click: () => setSelectedZone(zone.zoneId) }}
              >
                <Popup>
                  <div className="text-xs font-sans">
                    <div className="font-bold mb-0.5" style={{ color: '#0F172A' }}>{zone.district}</div>
                    <div className="mb-1" style={{ color: '#64748B' }}>{zone.state}</div>
                    <div className="flex items-center justify-between gap-4">
                      <span style={{ color: '#94A3B8' }}>Risk</span>
                      <span className="font-bold font-mono" style={{ color: RISK_COLORS[zone.riskLevel] }}>{zone.riskScore}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span style={{ color: '#94A3B8' }}>Cases</span>
                      <span className="font-semibold">{zone.cases}</span>
                    </div>
                    {zone.recoverabilityMinutes && (
                      <div className="flex items-center justify-between gap-4">
                        <span style={{ color: '#94A3B8' }}>Window</span>
                        <span className="font-semibold">{zone.recoverabilityMinutes} min</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[500] rounded-xl px-3 py-2.5 border shadow-sm"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>Risk Level</div>
            {[
              { label: 'Critical 80%+',    color: '#E5484D' },
              { label: 'High 60–80%',      color: '#F97316' },
              { label: 'Moderate 40–60%',  color: '#F59E0B' },
              { label: 'Low < 40%',        color: '#14B8A6' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }}/>
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right detail panel */}
        <div className="col-span-1 space-y-4 overflow-y-auto">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Top Predicted Zones</div>
              <FeatureTag type="sih" />
            </div>
            <div className="space-y-3">
              {ACTIVE_RISK_ZONES.map((zone, i) => (
                <div key={zone.zoneId}>
                  <div
                    onClick={() => setSelectedZone(zone.zoneId)}
                    className="cursor-pointer p-3 rounded-xl border transition-all"
                    style={{
                      borderColor: selectedZone === zone.zoneId ? `${RISK_COLORS[zone.riskLevel]}40` : 'var(--border)',
                      backgroundColor: selectedZone === zone.zoneId ? `${RISK_COLORS[zone.riskLevel]}08` : 'transparent',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0 border"
                        style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{zone.district}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{zone.state} · {zone.cases} cases</div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                            <div className="h-full rounded-full" style={{ width: `${zone.riskScore}%`, background: RISK_COLORS[zone.riskLevel] }}/>
                          </div>
                          <span className="text-[10px] font-mono font-bold" style={{ color: RISK_COLORS[zone.riskLevel] }}>
                            {zone.riskScore}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedWhy(expandedWhy === zone.zoneId ? null : zone.zoneId)}
                    className="mt-1 ml-7 text-[10px] text-[#14B8A6] hover:underline">
                    {expandedWhy === zone.zoneId ? '▲ Less' : '▼ Why?'}
                  </button>
                  {expandedWhy === zone.zoneId && (
                    <div className="mt-1 ml-7 p-2.5 rounded-xl text-xs leading-relaxed fade-in"
                      style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                      High convergence of mule account activity, ATM clustering, and historical withdrawal patterns in this sub-district.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {selectedZoneData && (
            <Card className="p-4 fade-in">
              <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Zone Detail</div>
              <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>{selectedZoneData.district}</div>
              <div className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>{selectedZoneData.state}</div>
              <div className="space-y-2">
                {[
                  { k: 'Risk Score',     v: `${selectedZoneData.riskScore}%`, color: RISK_COLORS[selectedZoneData.riskLevel] },
                  { k: 'Active Cases',   v: String(selectedZoneData.cases) },
                  { k: 'ATMs in Cluster', v: String(selectedZoneData.atmCount ?? '—') },
                  { k: 'Recovery Window', v: `${selectedZoneData.recoverabilityMinutes ?? '—'} min` },
                ].map(r => (
                  <div key={r.k} className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>{r.k}</span>
                    <span className="font-semibold font-mono" style={{ color: r.color || 'var(--text-primary)' }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
