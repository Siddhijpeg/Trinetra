import React, { useState } from 'react';

// --- Types ---
interface NodeData {
  id: string;
  label: string;
  sub: string;
  type: 'victim' | 'account' | 'mule' | 'atm' | 'upi' | 'cluster';
  x: number;
  y: number;
  depth: number;
  risk?: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  isPersistent?: boolean;
  flow?: string;
  complaints?: number;
}

interface EdgeData {
  from: string;
  to: string;
  label: string;
  highlight?: boolean;
  dashed?: boolean;
}

// --- Dynamic Node Coordinates ---
const DEFAULT_NODES: NodeData[] = [
  { id: 'victim', label: 'Victim', sub: 'XXXX1234', type: 'victim', x: 100, y: 220, depth: 1, flow: '₹1.8L', complaints: 1 },
  { id: 'acct_a', label: 'Account A', sub: 'XXXX7821', type: 'account', x: 230, y: 160, depth: 1, flow: '₹1.8L', complaints: 2 },
  { id: 'mule_b', label: 'Mule B', sub: 'XXXX3294', type: 'mule', x: 370, y: 120, depth: 2, risk: 'HIGH', isPersistent: true, flow: '₹1.4L', complaints: 4 },
  { id: 'mule_c', label: 'Mule Hub', sub: 'XXXX9234', type: 'mule', x: 490, y: 210, depth: 2, risk: 'CRITICAL', isPersistent: true, flow: '₹31.6L', complaints: 7 },
  { id: 'atm_gurugram', label: 'Gurugram ATM', sub: 'Sector 29 Cluster', type: 'atm', x: 620, y: 260, depth: 3, risk: 'HIGH', flow: '₹1.1L', complaints: 5 },
  { id: 'upi_1', label: 'UPI Node', sub: 'XXXX5432@upi', type: 'upi', x: 370, y: 310, depth: 3, flow: '₹0.3L', complaints: 2 },
  { id: 'cluster_1', label: 'Prior Cases', sub: '7 complaints', type: 'cluster', x: 480, y: 360, depth: 3, flow: '₹5.0L', complaints: 7 },
];

const DEFAULT_EDGES: EdgeData[] = [
  { from: 'victim', to: 'acct_a', label: '₹1.8L', highlight: true },
  { from: 'acct_a', to: 'mule_b', label: '₹1.4L', highlight: true },
  { from: 'mule_b', to: 'mule_c', label: '₹1.1L', highlight: true },
  { from: 'mule_c', to: 'atm_gurugram', label: 'PREDICTED', highlight: true, dashed: true },
  { from: 'mule_b', to: 'upi_1', label: '', highlight: false },
  { from: 'mule_c', to: 'cluster_1', label: 'Matched', highlight: false, dashed: true },
];

export default function FraudNetwork() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('mule_c');
  const [hoveredNode, setHoveredNode] = useState<{ node: NodeData; x: number; y: number } | null>(null);
  const [depth, setDepth] = useState<number>(3);
  const [nodes] = useState<NodeData[]>(DEFAULT_NODES);
  const [edges] = useState<EdgeData[]>(DEFAULT_EDGES);
  const [showDossierModal, setShowDossierModal] = useState<boolean>(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[3];

  return (
    <div className="p-6 flex flex-col gap-4 h-full bg-[#F8FAFC]">
      {/* Keyframe animation for blue flow lines */}
      <style>{`
        @keyframes flowAnimation {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .animate-line-flow {
          stroke-dasharray: 6, 6;
          animation: flowAnimation 1s linear infinite;
        }
      `}</style>

      {/* Top Header */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-[22px] font-bold text-[#1E293B] tracking-tight">Fraud Network Intelligence</h1>
            <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide">
              TRINETRA+
            </span>
          </div>
          <p className="text-xs text-[#64748B]">
            Trace relationships across complaints to identify persistent risk entities and mule hubs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-xs font-semibold text-[#475569] bg-white border border-[#E2E8F0] rounded-lg shadow-xs hover:bg-slate-50 transition-colors cursor-pointer">
            Export Graph
          </button>
          <button className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-500 rounded-lg shadow-xs hover:bg-sky-600 transition-colors cursor-pointer">
            New Investigation
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#64748B]">Graph Depth</span>
          <div className="flex items-center bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0]">
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className={`px-3 py-0.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer ${
                  depth === d ? 'bg-white text-[#0F172A] shadow-xs font-semibold' : 'text-[#64748B] hover:text-black'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 px-1.5 py-0.5 rounded-md uppercase">
            SIM
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-[#64748B]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-sky-400 rounded-full" />
            <span>Observed Flow</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-rose-400 border-b border-dashed" />
            <span>Predicted / Inferred</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* Pitch Black Canvas */}
        <div className="col-span-8 bg-[#000000] rounded-2xl p-4 relative h-[480px] shadow-2xl overflow-hidden border border-neutral-800">
          <svg className="w-full h-full" viewBox="0 0 720 440" preserveAspectRatio="xMidYMid meet">
            {/* Edges with Animated Flow */}
            {edges.map((e, idx) => {
              const source = nodes.find((n) => n.id === e.from);
              const target = nodes.find((n) => n.id === e.to);
              if (!source || !target) return null;

              const isVisible = source.depth <= depth && target.depth <= depth;

              return (
                <g
                  key={idx}
                  className="transition-all duration-500 ease-in-out"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    visibility: isVisible ? 'visible' : 'hidden',
                  }}
                >
                  {/* Underglow Line */}
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={e.dashed ? '#EF4444' : '#38BDF8'}
                    strokeWidth={e.dashed ? 1.5 : 3}
                    strokeOpacity={0.25}
                  />

                  {/* Connecting Line with Flow Effect */}
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={e.dashed ? '#F87171' : '#38BDF8'}
                    strokeWidth={2}
                    strokeDasharray={e.dashed ? '4,4' : undefined}
                    className={!e.dashed ? 'animate-line-flow' : ''}
                  />

                  {e.label && (
                    <g className="transition-all duration-500">
                      {e.label === 'PREDICTED' && (
                        <rect
                          x={(source.x + target.x) / 2 - 28}
                          y={(source.y + target.y) / 2 - 10}
                          width={56}
                          height={16}
                          rx={8}
                          fill="#EF4444"
                          opacity={0.9}
                        />
                      )}
                      <text
                        x={(source.x + target.x) / 2}
                        y={(source.y + target.y) / 2 - (e.label === 'PREDICTED' ? -2 : 6)}
                        fill={e.label === 'PREDICTED' ? '#FFFFFF' : '#A1A1AA'}
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
                      >
                        {e.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Clean Circles without Background Glow */}
            {nodes.map((n) => {
              const isSelected = n.id === selectedNodeId;
              const isVisible = n.depth <= depth;

              const getNodeColor = () => {
                switch (n.type) {
                  case 'victim': return '#3B82F6';
                  case 'account': return '#10B981';
                  case 'mule': return '#F97316';
                  case 'atm': return '#EF4444';
                  case 'upi': return '#8B5CF6';
                  case 'cluster': return '#F43F5E';
                  default: return '#3B82F6';
                }
              };

              const nodeColor = getNodeColor();

              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  onClick={() => isVisible && setSelectedNodeId(n.id)}
                  onMouseEnter={() => isVisible && setHoveredNode({ node: n, x: n.x, y: n.y })}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="cursor-pointer group transition-all duration-500 ease-in-out"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: `translate(${n.x}px, ${n.y}px) scale(${isVisible ? 1 : 0.4})`,
                    transformOrigin: 'center',
                    pointerEvents: isVisible ? 'auto' : 'none',
                  }}
                >
                  {/* Selected Node Ring Highlight */}
                  {isSelected && (
                    <circle
                      r={31}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      opacity={0.9}
                    />
                  )}

                  {/* Persistent Risk Dashed Outer Ring */}
                  {n.isPersistent && (
                    <circle
                      r={33}
                      fill="none"
                      stroke="#FB923C"
                      strokeWidth={1.5}
                      strokeDasharray="3,3"
                      opacity={0.8}
                    />
                  )}
                  {n.isPersistent && (
                    <circle cx={21} cy={-21} r={4.5} fill="#EF4444" stroke="#000000" strokeWidth={1.5} />
                  )}

                  {/* Solid Clean Node Circle */}
                  <circle
                    r={26}
                    fill={nodeColor}
                    stroke="#000000"
                    strokeWidth={1.5}
                    className="transition-transform duration-200 group-hover:scale-105"
                  />

                  {/* White Node Text - San Francisco Font */}
                  <text
                    y={4}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10.5"
                    fontWeight="600"
                    style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", sans-serif' }}
                    className="pointer-events-none select-none"
                  >
                    {n.label}
                  </text>

                  {/* Subtitle */}
                  <text
                    y={42}
                    textAnchor="middle"
                    fill="#A1A1AA"
                    fontSize="10"
                    fontWeight="400"
                    style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
                    className="pointer-events-none select-none"
                  >
                    {n.sub}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover Card */}
          {hoveredNode && hoveredNode.node.depth <= depth && (
            <div
              style={{
                left: `${(hoveredNode.x / 720) * 100}%`,
                top: `${(hoveredNode.y / 440) * 100 - 15}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-30 transition-all duration-200 ease-out"
            >
              <div className="bg-[#18181B]/95 border border-neutral-700 backdrop-blur-md px-3 py-2 rounded-xl shadow-2xl text-white text-xs flex flex-col gap-1 min-w-[140px] animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-1">
                  <span className="font-semibold text-sky-400" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
                    {hoveredNode.node.label}
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 bg-neutral-800 rounded font-mono text-zinc-300">
                    {hoveredNode.node.type}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-300 flex justify-between">
                  <span>Flow Volume:</span>
                  <span className="font-semibold text-emerald-400">{hoveredNode.node.flow}</span>
                </div>
                <div className="text-[10px] text-zinc-300 flex justify-between">
                  <span>Risk Level:</span>
                  <span className="font-semibold text-rose-400">{hoveredNode.node.risk || 'NORMAL'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-[#09090B]/80 backdrop-blur-md p-2.5 rounded-xl border border-neutral-800 text-[9.5px] text-zinc-400">
            <span className="font-semibold text-zinc-200 uppercase tracking-wider block mb-1.5">Entity Types</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Victim</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Account</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> Mule</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /> UPI</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> ATM</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Cluster</div>
            </div>
          </div>
        </div>

        {/* Sidebar Inspector */}
        <div className="col-span-4 bg-white rounded-2xl p-4 border border-[#E2E8F0] shadow-xs flex flex-col gap-3">
          <span className="text-[10px] font-semibold text-[#94A3B8] tracking-wider uppercase">Selected Entity</span>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/50 font-bold flex items-center justify-center text-xs">
              {selectedNode.label.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-[#0F172A] text-sm leading-tight">{selectedNode.label}</h3>
              <p className="text-xs text-[#64748B] font-mono">{selectedNode.sub}</p>
            </div>
          </div>

          {selectedNode.isPersistent && (
            <div className="bg-rose-50/60 border border-rose-200/60 p-2.5 rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                PERSISTENT RISK ENTITY
              </div>
              <p className="text-[10.5px] text-rose-900/80 mt-0.5 leading-snug">
                This entity appears across multiple distinct fraud cases in the registry.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-xs border-t border-[#F1F5F9] pt-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[#64748B]">Risk Registry</span>
              <span className="font-semibold text-rose-600">{selectedNode.risk || 'HIGH'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#64748B]">Seen in Complaints</span>
              <span className="font-semibold text-[#0F172A]">{selectedNode.complaints || 1}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#64748B]">Total Flow Detected</span>
              <span className="font-semibold text-[#0F172A]">{selectedNode.flow || '₹1.8L'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#64748B]">Last Active</span>
              <span className="font-medium text-[#334155]">Today, 13:54</span>
            </div>
          </div>

          <div className="bg-sky-50/50 border border-sky-100 p-3 rounded-xl">
            <div className="flex items-center gap-1 text-[10.5px] font-semibold text-sky-700 mb-1">
              <span>✦ AI INSIGHT</span>
            </div>
            <p className="text-[10.5px] text-sky-900/80 italic leading-relaxed">
              "{selectedNode.label} ({selectedNode.sub}) acts as an active point in the transaction chain. Activity correlates with withdrawal hotspots."
            </p>
          </div>

          <button
            onClick={() => setShowDossierModal(true)}
            className="w-full py-2 text-xs font-semibold text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            View Full Dossier
          </button>
        </div>
      </div>

      {/* Full Dossier Modal */}
      {showDossierModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Entity Dossier: {selectedNode.label}</h2>
              <button
                onClick={() => setShowDossierModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-slate-700">
              <p><strong>System ID:</strong> {selectedNode.id}</p>
              <p><strong>Identifier:</strong> {selectedNode.sub}</p>
              <p><strong>EntityType:</strong> {selectedNode.type.toUpperCase()}</p>
              <p><strong>Total Fraud Volume:</strong> {selectedNode.flow}</p>
              <p><strong>Associated Complaints:</strong> {selectedNode.complaints} NCRP Cases</p>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowDossierModal(false)}
                className="px-4 py-2 bg-slate-900 text-white font-medium text-xs rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}