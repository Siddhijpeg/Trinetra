import React, { useState } from 'react';
import { Card, RiskBadge, Button, AICard, SparkleIcon, FeatureTag, PrototypeBadge } from '../components/ui';

type NodeType = 'victim' | 'account' | 'mule' | 'upi' | 'atm' | 'cluster';

type NodeData = {
  id: string;
  label: string;
  sub?: string;
  type: NodeType;
  x: number;
  y: number;
  risk?: 'critical' | 'high';
  isPersistent?: boolean;
};

const nodeColors: Record<NodeType, { fill: string; stroke: string; text: string }> = {
  victim: { fill: '#EFF6FF', stroke: '#3B82F6', text: '#1D4ED8' },
  account: { fill: '#F0FDF4', stroke: '#22C55E', text: '#15803D' },
  mule: { fill: '#FFF7ED', stroke: '#F97316', text: '#C2410C' },
  upi: { fill: '#FAF5FF', stroke: '#A855F7', text: '#7E22CE' },
  atm: { fill: '#FFF1F1', stroke: '#E5484D', text: '#B91C1C' },
  cluster: { fill: '#FFF1F1', stroke: '#E5484D', text: '#B91C1C' },
};

// Masked identifiers, demonstrating persistent risk
const nodes: NodeData[] = [
  { id: 'victim', label: 'Victim', sub: 'XXXX1234', type: 'victim', x: 105, y: 220 },
  { id: 'acct_a', label: 'Account A', sub: 'XXXX7821', type: 'account', x: 250, y: 158 },
  { id: 'mule_b', label: 'Mule B', sub: 'XXXX3294', type: 'mule', x: 380, y: 130, risk: 'high', isPersistent: true },
  { id: 'mule_c', label: 'Mule Hub', sub: 'XXXX9234', type: 'mule', x: 500, y: 200, risk: 'critical', isPersistent: true },
  { id: 'atm_gurugram', label: 'Gurugram ATM', sub: 'Sector 29 Cluster', type: 'atm', x: 630, y: 280 },
  { id: 'upi_1', label: 'UPI Node', sub: 'XXXX5432@upi', type: 'upi', x: 370, y: 295 },
  { id: 'cluster_1', label: 'Prior Cases', sub: '7 complaints', type: 'cluster', x: 495, y: 350 },
];

const edges = [
  { from: 'victim', to: 'acct_a', label: '₹1.8L', highlight: true },
  { from: 'acct_a', to: 'mule_b', label: '₹1.4L', highlight: true },
  { from: 'mule_b', to: 'mule_c', label: '₹1.1L', highlight: true },
  { from: 'mule_c', to: 'atm_gurugram', label: 'PREDICTED', highlight: true, dashed: true },
  { from: 'mule_b', to: 'upi_1', label: '', highlight: false },
  { from: 'mule_c', to: 'cluster_1', label: 'Matched', highlight: false, dashed: true },
];

export default function FraudNetwork() {
  const [selectedNode, setSelectedNode] = useState<string>('mule_c');
  const [depth, setDepth] = useState(2);
  const selected = nodes.find(n => n.id === selectedNode);

  return (
    <div className="p-7 flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">Fraud Network Intelligence</h1>
            <FeatureTag type="usp" />
          </div>
          <p className="text-sm text-[#64748B] leading-relaxed">
            Trace relationships across complaints to identify persistent risk entities and mule hubs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">Export Graph</Button>
          <Button variant="primary" size="sm">New Investigation</Button>
        </div>
      </div>

      {/* Controls */}
      <Card className="p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#64748B]">Graph Depth</span>
              {[1, 2, 3].map(d => (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  className={`w-8 h-7 text-xs font-semibold rounded-lg transition-all ${depth === d ? 'bg-[#14B8A6] text-white' : 'border border-[#E2E8F0] text-[#64748B] hover:border-[#14B8A6]/40'}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-[#E2E8F0]"/>
            <PrototypeBadge tooltip="Graph layout is a frontend visualization prototype." />
          </div>
          <div className="flex items-center gap-4 text-xs text-[#64748B]">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-[#14B8A6]"/>
              <span>Observed Flow</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0" style={{ borderTop: '2px dashed #E5484D' }}/>
              <span>Predicted / Inferred</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Graph + Entity Panel */}
      <div className="flex-1 grid grid-cols-4 gap-5 min-h-0">

        {/* Graph */}
        <div className="col-span-3 rounded-2xl overflow-hidden border border-[#1E2A3A] relative graph-canvas bg-[#0B101A]" style={{ minHeight: '420px' }}>
          <svg width="100%" height="100%" viewBox="0 0 740 440" className="absolute inset-0">
            {/* Edges */}
            {edges.map((e, i) => {
              const from = nodes.find(n => n.id === e.from)!;
              const to = nodes.find(n => n.id === e.to)!;
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              return (
                <g key={i}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={e.highlight ? '#14B8A6' : '#2A3548'}
                    strokeWidth={e.highlight ? 2.5 : 1.5}
                    strokeDasharray={e.dashed ? '6 3' : undefined}
                    opacity={e.highlight ? 0.9 : 0.45}
                  />
                  {e.label && (
                    <g>
                      <rect x={midX - 22} y={midY - 9} width={44} height={18} rx={5} fill={e.label === 'PREDICTED' ? '#E5484D' : '#162030'} opacity={0.9}/>
                      <text x={midX} y={midY + 4.5} textAnchor="middle" fill="white" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                        {e.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const colors = nodeColors[node.type];
              const isSelected = selectedNode === node.id;
              const isPath = ['victim', 'acct_a', 'mule_b', 'mule_c', 'atm_gurugram'].includes(node.id);
              return (
                <g key={node.id} className="cursor-pointer transition-all" onClick={() => setSelectedNode(node.id)}>
                  {isSelected && <circle cx={node.x} cy={node.y} r={36} fill={colors.stroke} opacity={0.15}/>}
                  {node.isPersistent && <circle cx={node.x} cy={node.y} r={28} fill="none" stroke="#E5484D" strokeWidth={1} strokeDasharray="4 2" opacity={0.8}/>}
                  <circle
                    cx={node.x} cy={node.y} r={24}
                    fill={colors.fill}
                    stroke={isSelected ? colors.stroke : isPath ? colors.stroke : '#2A3548'}
                    strokeWidth={isSelected ? 2.5 : isPath ? 1.8 : 1}
                    opacity={0.96}
                  />
                  {node.isPersistent && (
                    <circle cx={node.x + 17} cy={node.y - 17} r={7} fill="#E5484D" stroke="#0F1520" strokeWidth={1.5}/>
                  )}
                  <text x={node.x} y={node.y + 1.5} textAnchor="middle" fill={colors.text} fontSize="9.5" fontFamily="Inter, sans-serif" fontWeight="600">
                    {node.label}
                  </text>
                  <text x={node.x} y={node.y + 40} textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="500">
                    {node.sub}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Entity legend */}
          <div className="absolute bottom-4 left-4 bg-[#1A2235]/92 backdrop-blur-sm rounded-xl px-4 py-3 border border-[#2A3548]">
            <div className="text-[10px] text-[#94A3B8] mb-2.5 font-bold uppercase tracking-widest">Entity Types</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {(Object.keys(nodeColors) as NodeType[]).map(type => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full border" style={{ background: nodeColors[type].fill, borderColor: nodeColors[type].stroke }}/>
                  <span className="text-[10px] font-medium text-[#CBD5E1] capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Entity Panel */}
        <div className="space-y-4 overflow-y-auto pr-1">
          <Card className="p-5 border-[#E2E8F0] shadow-sm">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mb-4">Selected Entity</div>
            {selected ? (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0" style={{
                    background: nodeColors[selected.type].fill,
                    color: nodeColors[selected.type].text,
                    border: `1px solid ${nodeColors[selected.type].stroke}40`,
                  }}>
                    {selected.type.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#0F172A] leading-tight">{selected.label}</div>
                    <div className="text-xs font-mono font-medium text-[#64748B] mt-1">{selected.sub}</div>
                  </div>
                </div>

                {selected.isPersistent && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-[#E5484D] pulse-dot"/>
                      <span className="text-xs font-bold text-[#E5484D] uppercase tracking-wide">Persistent Risk Entity</span>
                    </div>
                    <p className="text-[11px] text-red-800 leading-relaxed mt-1">
                      This entity appears across multiple distinct fraud cases in the registry.
                    </p>
                  </div>
                )}

                {selected.id === 'mule_c' && (
                  <div className="space-y-3 text-xs mb-5 border-t border-[#F1F5F9] pt-4">
                    <div className="flex items-center justify-between"><span className="text-[#64748B] font-medium">Risk Registry</span><RiskBadge level="critical"/></div>
                    <div className="flex items-center justify-between"><span className="text-[#64748B] font-medium">Seen in Complaints</span><span className="font-bold text-[#0F172A]">7</span></div>
                    <div className="flex items-center justify-between"><span className="text-[#64748B] font-medium">Total Flow Detected</span><span className="font-bold font-mono text-[#E5484D]">₹31.6L</span></div>
                    <div className="flex items-center justify-between"><span className="text-[#64748B] font-medium">Last Active</span><span className="font-medium text-[#0F172A]">Today, 13:54</span></div>
                  </div>
                )}

                <AICard className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <SparkleIcon size={12}/>
                    <span className="text-[10px] font-bold text-[#7C5CFC] uppercase tracking-wide">AI Insight</span>
                  </div>
                  <p className="text-xs text-[#3D2FA8] leading-relaxed font-medium">
                    "Account XXXX9234 acts as a consolidation hub. Its activity correlates strongly with immediate cash-outs in the Gurugram Sector 29 ATM cluster."
                  </p>
                </AICard>

                <Button variant="secondary" className="w-full justify-center">View Full Dossier</Button>
              </>
            ) : (
              <div className="py-8 text-center">
                <div className="text-xs text-[#94A3B8]">Select a node in the graph to view details.</div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
