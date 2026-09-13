import React, { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, Button, FeatureTag } from '../components/ui';
import { ACTIVE_RISK_ZONES } from '../data/mockZones';

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

  const toggleLayer = (id: string) =>
    setActiveLayers(prev => ({ ...prev, [id]: !prev[id] }));

  const selectedZoneData = ACTIVE_RISK_ZONES.find(z => z.zoneId === selectedZone);

  // Radius based on risk score
  const getRadius = (riskScore: number) => 8 + riskScore * 0.22;

  return (
    <div className="p-7 flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[24px] font-bold text-[#0F172A] leading-tight">Geo Intelligence</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm text-[#64748B]">
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
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mb-3">Horizon</div>
            <div className="space-y-1">
              {HORIZONS.map(h => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    horizon === h ? 'bg-[#14B8A6] text-white' : 'text-[#64748B] hover:bg-[#F7F8FA]'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </Card>

          {/* Layer Controls */}
          <Card className="p-4">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mb-3">Layers</div>
            <div className="space-y-2.5">
              {LAYERS.map(layer => (
                <label key={layer.id} className="flex items-center gap-2.5 cursor-pointer">
                  <button
                    onClick={() => toggleLayer(layer.id)}
                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${
                      activeLayers[layer.id] ? 'bg-[#14B8A6] border-[#14B8A6]' : 'border-[#CBD5E1] bg-white'
                    }`}
                  >
                    {activeLayers[layer.id] && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <span className={`text-xs transition-colors ${activeLayers[layer.id] ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`}>
                    {layer.label}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        </div>

        {/* Map */}
        <div className="col-span-3 rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-sm relative">
          {/* Map attribution override + horizon badge */}
          <div className="absolute top-3 left-3 z-[500] bg-white/95 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-[#E2E8F0] shadow-sm">
            <div className="text-[10px] text-[#94A3B8]">Prediction Horizon</div>
            <div className="text-sm font-bold text-[#14B8A6]">{horizon}</div>
          </div>

          <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%', background: '#E8F0F8' }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />

            {ACTIVE_RISK_ZONES.map(zone => (
              <CircleMarker
                key={zone.zoneId}
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
                    <div className="font-bold text-[#0F172A] mb-0.5">{zone.district}</div>
                    <div className="text-[#64748B] mb-1">{zone.state}</div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#94A3B8]">Risk</span>
                      <span className="font-bold font-mono" style={{ color: RISK_COLORS[zone.riskLevel] }}>{zone.riskScore}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#94A3B8]">Cases</span>
                      <span className="font-semibold">{zone.cases}</span>
                    </div>
                    {zone.recoverabilityMinutes && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[#94A3B8]">Window</span>
                        <span className="font-semibold">{zone.recoverabilityMinutes} min</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[500] bg-white/95 rounded-xl px-3 py-2.5 border border-[#E2E8F0] shadow-sm">
            <div className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wide mb-1.5">Risk Level</div>
            {[
              { label: 'Critical 80%+', color: '#E5484D' },
              { label: 'High 60–80%',   color: '#F97316' },
              { label: 'Moderate 40–60%', color: '#F59E0B' },
              { label: 'Low < 40%',     color: '#14B8A6' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }}/>
                <span className="text-[10px] text-[#475569]">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right detail panel */}
        <div className="col-span-1 space-y-4 overflow-y-auto">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold text-[#0F172A]">Top Predicted Zones</div>
              <FeatureTag type="sih" />
            </div>
            <div className="space-y-3">
              {ACTIVE_RISK_ZONES.map((zone, i) => (
                <div key={zone.zoneId}>
                  <div
                    onClick={() => setSelectedZone(zone.zoneId)}
                    className="cursor-pointer p-3 rounded-xl border transition-all hover:border-[#14B8A6]/30"
                    style={{
                      borderColor: selectedZone === zone.zoneId ? RISK_COLORS[zone.riskLevel] + '40' : '#E8ECF0',
                      background: selectedZone === zone.zoneId ? RISK_COLORS[zone.riskLevel] + '06' : 'white',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-[#94A3B8] bg-[#F7F8FA] border border-[#E2E8F0] flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#0F172A] leading-tight truncate">{zone.district}</div>
                        <div className="text-[10px] text-[#94A3B8] mt-0.5">{zone.state} · {zone.cases} cases</div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <div className="flex-1 h-1 bg-[#F1F5F9] rounded-full overflow-hidden">
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
                    className="mt-1 ml-7 text-[10px] text-[#14B8A6] hover:underline"
                  >
                    {expandedWhy === zone.zoneId ? '▲ Less' : '▼ Why?'}
                  </button>
                  {expandedWhy === zone.zoneId && (
                    <div className="mt-1 ml-7 p-2.5 bg-[#F7F8FA] rounded-xl text-xs text-[#64748B] fade-in leading-relaxed">
                      High convergence of mule account activity, ATM clustering, and historical withdrawal patterns in this sub-district.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Selected zone detail */}
          {selectedZoneData && (
            <Card className="p-4 fade-in">
              <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Zone Detail</div>
              <div className="text-sm font-bold text-[#0F172A] mb-0.5">{selectedZoneData.district}</div>
              <div className="text-[10px] text-[#94A3B8] mb-3">{selectedZoneData.state}</div>
              <div className="space-y-2">
                {[
                  { k: 'Risk Score',   v: `${selectedZoneData.riskScore}%`, color: RISK_COLORS[selectedZoneData.riskLevel] },
                  { k: 'Active Cases', v: String(selectedZoneData.cases) },
                  { k: 'ATMs in Cluster', v: String(selectedZoneData.atmCount ?? '—') },
                  { k: 'Recovery Window', v: `${selectedZoneData.recoverabilityMinutes ?? '—'} min` },
                ].map(r => (
                  <div key={r.k} className="flex items-center justify-between text-xs">
                    <span className="text-[#94A3B8]">{r.k}</span>
                    <span className="font-semibold font-mono" style={{ color: r.color }}>{r.v}</span>
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
