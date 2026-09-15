// ─── Fraud Network Intelligence ──────────────────────────────────────────────
// Fetches live graph data from GET /api/v1/network-graph?depth={d}
// Falls back to a rich built-in graph when the backend is unreachable.
// Graph rendered in SVG with pointer-based zoom + pan (no extra library).

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = 'victim' | 'account' | 'mule' | 'atm' | 'upi' | 'cluster';
type RiskLevel  = 'CRITICAL' | 'HIGH' | 'MEDIUM' | null;

interface NodeData {
  id:          string;
  label:       string;
  sub:         string;
  type:        EntityType;
  x:           number;
  y:           number;
  depth:       number;
  risk?:       RiskLevel;
  isPersistent?: boolean;
  flow?:       string;
  complaints?: number;
  lastActive?: string;
  institution?: string;
  aiInsight?:  string;
}

interface EdgeData {
  from:       string;
  to:         string;
  label?:     string;
  highlight?: boolean;
  dashed?:    boolean;
  predicted?: boolean;
  inferred?:  boolean;
}

interface GraphData {
  nodes: NodeData[];
  edges: EdgeData[];
  meta?: Record<string, unknown>;
}

// ─── Node colour palette ──────────────────────────────────────────────────────

const NODE_COLORS: Record<EntityType, string> = {
  victim:  '#3B82F6',   // blue
  account: '#10B981',   // green
  mule:    '#F97316',   // orange
  atm:     '#EF4444',   // bright red
  upi:     '#8B5CF6',   // purple
  cluster: '#E11D48',   // crimson
};

// ─── Fallback / seed graph (shown when backend unreachable) ───────────────────
// Identical topology that the backend endpoint returns at depth=3 so the
// offline experience matches a live backend response exactly.

function makeFallbackGraph(depth: number): GraphData {
  const n = (id: string, label: string, sub: string, type: EntityType,
             x: number, y: number, d: number,
             risk: RiskLevel = null, persistent = false,
             flow = '', complaints = 1, lastActive = 'Today, 13:54', institution = '',
             aiInsight = ''): NodeData => ({
    id, label, sub, type, x, y, depth: d, risk, isPersistent: persistent,
    flow, complaints, lastActive, institution,
    aiInsight: aiInsight ||
      `${label} (${sub}) shows ${risk === 'CRITICAL' || risk === 'HIGH' ? 'elevated' : 'normal'} ` +
      `activity across ${complaints} complaint${complaints !== 1 ? 's' : ''}. ` +
      (persistent ? 'Registry-flagged entity with cross-case correlation.' : 'Transaction flow matches typology pattern.'),
  });

  const e = (from: string, to: string, label = '', highlight = false,
             dashed = false, predicted = false, inferred = false): EdgeData =>
    ({ from, to, label, highlight, dashed, predicted, inferred });

  const nodes: NodeData[] = [
    n('v1',    'Victim 1',   'XXXX1234',          'victim',  130, 200, 1, null,       false, '₹4.8L',  1, 'Today, 10:05', 'SBI'),
    n('v2',    'Victim 2',   'XXXX9871',          'victim',  130, 320, 1, null,       false, '₹2.2L',  1, 'Today, 09:45', 'PNB'),
    n('acct_a','Account A',  'XXXX7821 / HDFC',   'account', 280, 255, 1, null,       false, '₹6.8L',  3, 'Today, 11:07', 'HDFC'),
  ];
  const edges: EdgeData[] = [
    e('v1', 'acct_a', '₹4.8L', true),
    e('v2', 'acct_a', '₹2.2L', true),
  ];

  if (depth >= 2) {
    nodes.push(
      n('acct_b', 'Account B', 'XXXX3294 / Paytm', 'account', 420, 155, 2, null,       false, '₹5.1L', 2,  'Today, 11:11', 'Paytm'),
      n('mule_b', 'Mule B',    'XXXX5511',         'mule',    420, 360, 2, 'HIGH',      true,  '₹3.8L', 5,  'Today, 11:14', 'Axis Bank'),
      n('mule_c', 'Mule Hub',  'XXXX9234 / SBI',   'mule',    560, 255, 2, 'CRITICAL',  true,  '₹8.9L', 9,  'Today, 11:18', 'SBI'),
    );
    edges.push(
      e('acct_a', 'acct_b', '₹5.1L', true),
      e('acct_a', 'mule_b', '₹1.7L', true),
      e('acct_b', 'mule_c', '₹4.9L', true),
      e('mule_b', 'mule_c', '₹3.2L', true),
    );
  }

  if (depth >= 3) {
    nodes.push(
      n('atm_gurgaon', 'Gurugram ATM',  'Sector 29',           'atm',     700, 120, 3, 'HIGH',    false, '₹3.2L',  6,  'Today, 11:23', 'Axis'),
      n('atm_delhi',   'Delhi ATM',     'CP Cluster',          'atm',     700, 255, 3, 'CRITICAL',false, '₹5.7L',  11, 'Today, 11:25', 'Axis'),
      n('upi_1',       'UPI Handle 1',  'XXXX5432@upi',        'upi',     700, 380, 3, null,      false, '₹0.8L',  2,  'Today, 10:58'),
      n('cluster_1',   'Prior Cluster', '7 matched complaints', 'cluster', 560, 395, 3, null,      false, '₹12.4L', 7,  '2 days ago'),
    );
    edges.push(
      e('mule_c', 'atm_gurgaon', 'PREDICTED', true,  true, true,  false),
      e('mule_c', 'atm_delhi',   'PREDICTED', true,  true, true,  false),
      e('mule_b', 'upi_1',        '₹0.8L',   false, false, false, false),
      e('mule_c', 'cluster_1',    'Matched',  false, true,  false, true),
    );
  }

  if (depth >= 4) {
    nodes.push(
      n('v3',         'Victim 3',     'XXXX4422',           'victim',  130,  90, 1, null,  false, '₹1.1L', 1, 'Yesterday, 22:31', 'Kotak'),
      n('acct_c',     'Account C',    'XXXX6612 / ICICI',   'account', 280, 105, 2, null,  false, '₹1.1L', 2, 'Yesterday, 22:48', 'ICICI'),
      n('upi_2',      'UPI Handle 2', 'XXXX9087@upi',       'upi',     420,  60, 2, null,  false, '₹0.9L', 1, 'Yesterday, 22:50'),
      n('atm_jaipur', 'Jaipur ATM',   'Malviya Nagar',      'atm',     700,  30, 3, 'HIGH',false, '₹2.0L', 4, 'Yesterday, 23:15', 'SBI'),
      n('cluster_2',  'OOD Cluster',  'Cross-state pattern', 'cluster', 560, 440, 4, null, false, '₹3.5L', 3, '3 days ago'),
    );
    edges.push(
      e('v3',      'acct_c',    '₹1.1L',   false),
      e('acct_c',  'upi_2',     '₹0.9L',   false),
      e('upi_2',   'atm_jaipur','INFERRED', false, true, false, true),
      e('acct_c',  'mule_c',    '₹0.2L',   false, true, false, true),
      e('cluster_1','cluster_2','Linked',   false, true, false, true),
    );
  }

  return { nodes, edges, meta: { depth, total_nodes: nodes.length, total_edges: edges.length } };
}

// ─── Mini spinner ─────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FraudNetwork() {
  const [depth,          setDepth]          = useState<number>(3);
  const [graphData,      setGraphData]      = useState<GraphData>(() => makeFallbackGraph(3));
  const [loading,        setLoading]        = useState<boolean>(false);
  const [error,          setError]          = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('mule_c');
  const [hoveredNode,    setHoveredNode]    = useState<NodeData | null>(null);
  const [hoverPos,       setHoverPos]       = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showDossier,    setShowDossier]    = useState<boolean>(false);

  // SVG pan / zoom state
  const svgRef       = useRef<SVGSVGElement>(null);
  const isPanning    = useRef(false);
  const panStart     = useRef<{ x: number; y: number; tx: number; ty: number }>({ x: 0, y: 0, tx: 0, ty: 0 });
  const [tx, setTx]  = useState(0);
  const [ty, setTy]  = useState(0);
  const [scale, setScale] = useState(1);

  // ── Fetch from backend ──────────────────────────────────────────────────────
  const fetchGraph = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/network-graph?depth=${d}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GraphData = await res.json();
      setGraphData(data);
    } catch (err: any) {
      // Graceful fallback — never leave the user with a blank canvas
      setError('Backend unreachable — showing demo graph');
      setGraphData(makeFallbackGraph(d));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGraph(depth); }, [depth, fetchGraph]);

  // Auto-select first critical node when graph changes
  useEffect(() => {
    const critical = graphData.nodes.find(n => n.risk === 'CRITICAL');
    if (critical) setSelectedNodeId(critical.id);
    else if (graphData.nodes.length > 0) setSelectedNodeId(graphData.nodes[0].id);
  }, [graphData]);

  const { nodes, edges } = graphData;
  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  // ── SVG viewBox dimensions ──────────────────────────────────────────────────
  const VW = 820;
  const VH = 460;

  // ── Zoom handlers ───────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.min(3, Math.max(0.4, s * delta)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      isPanning.current = true;
      panStart.current  = { x: e.clientX, y: e.clientY, tx, ty };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [tx, ty]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setTx(panStart.current.tx + (e.clientX - panStart.current.x));
    setTy(panStart.current.ty + (e.clientY - panStart.current.y));
  }, []);

  const handlePointerUp = useCallback(() => { isPanning.current = false; }, []);

  const fitToScreen = () => { setTx(0); setTy(0); setScale(1); };

  // ── Node hover position (screen coords) ─────────────────────────────────────
  const handleNodeHover = useCallback((n: NodeData, svgX: number, svgY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = rect.left + ((svgX * scale + tx) / VW) * rect.width;
    const py = rect.top  + ((svgY * scale + ty) / VH) * rect.height;
    setHoveredNode(n);
    setHoverPos({ x: px, y: py });
  }, [scale, tx, ty]);

  return (
    <div className="p-6 flex flex-col gap-4 h-full" style={{ backgroundColor: 'var(--app-bg)' }}>

      <style>{`
        @keyframes flowAnim { to { stroke-dashoffset: -24; } }
        .flow-line { animation: flowAnim 1.1s linear infinite; }
        @keyframes pulseRing { 0%,100% { r: 32; opacity:.6; } 50% { r: 37; opacity:.2; } }
        .pulse-ring { animation: pulseRing 1.8s ease-in-out infinite; }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Fraud Network Intelligence
            </h1>
            <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide">
              TRINETRA+
            </span>
            {loading && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Spinner /> Fetching graph…
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Trace relationships across complaints to identify persistent risk entities and mule hubs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            Export Graph
          </button>
          <button className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-500 rounded-lg hover:bg-sky-600 transition-colors">
            New Investigation
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Graph Depth</span>
          <div className="flex items-center p-1 rounded-lg border"
            style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' }}>
            {[1, 2, 3].map(d => (
              <button key={d} onClick={() => setDepth(d)}
                className="px-3 py-0.5 text-xs font-medium rounded-md transition-all cursor-pointer"
                style={depth === d
                  ? { backgroundColor: 'var(--surface)', color: 'var(--text-primary)', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }
                  : { backgroundColor: 'transparent', color: 'var(--text-secondary)' }}>
                {d}
              </button>
            ))}
            <button onClick={() => setDepth(4)}
              className="px-2.5 py-0.5 text-[10px] font-semibold rounded-md transition-all cursor-pointer ml-1"
              style={depth === 4
                ? { backgroundColor: '#F59E0B', color: 'white' }
                : { backgroundColor: 'transparent', color: '#D97706' }}>
              SIM
            </button>
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 ml-3">
            <button onClick={() => setScale(s => Math.min(3, s * 1.2))}
              className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              +
            </button>
            <button onClick={() => setScale(s => Math.max(0.4, s / 1.2))}
              className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              −
            </button>
            <button onClick={fitToScreen}
              className="px-2 h-6 rounded text-[10px] font-semibold transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Fit
            </button>
          </div>
          {error && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.25)' }}>
              DEMO MODE
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#38BDF8" strokeWidth="2" /></svg>
            Observed Flow
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#F87171" strokeWidth="2" strokeDasharray="3,3" /></svg>
            Predicted / Inferred
          </div>
          <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {nodes.length} nodes · {edges.length} edges
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">

        {/* ── Graph Canvas ── */}
        <div className="col-span-8 bg-[#050a14] rounded-2xl relative overflow-hidden border border-neutral-800 shadow-2xl"
          style={{ minHeight: 460 }}>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(5,10,20,0.7)', backdropFilter: 'blur(2px)' }}>
              <div className="flex flex-col items-center gap-3">
                <Spinner />
                <span className="text-xs text-sky-400 font-mono">Fetching live graph…</span>
              </div>
            </div>
          )}

          <svg
            ref={svgRef}
            className="w-full h-full select-none"
            style={{ cursor: isPanning.current ? 'grabbing' : 'grab', minHeight: 460 }}
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="xMidYMid meet"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Subtle grid backdrop */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e2d45" strokeWidth="0.5" />
              </pattern>
              <radialGradient id="glow_red" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#EF4444" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="glow_orange" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#F97316" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={VW} height={VH} fill="url(#grid)" />

            <g transform={`translate(${tx}, ${ty}) scale(${scale})`}
              style={{ transformOrigin: `${VW / 2}px ${VH / 2}px` }}>

              {/* ── Edges ── */}
              {edges.map((ed, idx) => {
                const src = nodes.find(n => n.id === ed.from);
                const tgt = nodes.find(n => n.id === ed.to);
                if (!src || !tgt) return null;
                if (src.depth > depth || tgt.depth > depth) return null;

                const mx = (src.x + tgt.x) / 2;
                const my = (src.y + tgt.y) / 2;
                const lineColor  = (ed.dashed || ed.predicted || ed.inferred) ? '#F87171' : '#38BDF8';
                const lineWidth  = ed.highlight ? 2.5 : 1.5;

                return (
                  <g key={idx}>
                    {/* Underglow */}
                    <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={lineColor} strokeWidth={lineWidth + 4} strokeOpacity={0.12} />
                    {/* Main line */}
                    <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={lineColor} strokeWidth={lineWidth}
                      strokeDasharray={ed.dashed || ed.predicted || ed.inferred ? '6 5' : undefined}
                      className={(ed.dashed || ed.predicted || ed.inferred) ? '' : 'flow-line'}
                      strokeLinecap="round"
                    />
                    {/* Label */}
                    {ed.label && (
                      <g>
                        {(ed.label === 'PREDICTED' || ed.label === 'INFERRED') ? (
                          <>
                            <rect x={mx - 30} y={my - 9} width={60} height={16} rx={8}
                              fill={ed.label === 'PREDICTED' ? '#EF4444' : '#9333EA'} opacity={0.9} />
                            <text x={mx} y={my + 3} fill="white" fontSize="9" fontWeight="700"
                              textAnchor="middle" style={{ fontFamily: 'monospace' }}>
                              {ed.label}
                            </text>
                          </>
                        ) : (
                          <>
                            <rect x={mx - 16} y={my - 9} width={32} height={14} rx={4}
                              fill="#0f1f35" opacity={0.85} />
                            <text x={mx} y={my + 2} fill="#94A3B8" fontSize="9" fontWeight="600"
                              textAnchor="middle" style={{ fontFamily: 'monospace' }}>
                              {ed.label}
                            </text>
                          </>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}

              {/* ── Nodes ── */}
              {nodes.map(n => {
                if (n.depth > depth) return null;
                const color     = NODE_COLORS[n.type];
                const isSelected = n.id === selectedNodeId;
                const R = 24;

                return (
                  <g key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    onClick={() => setSelectedNodeId(n.id)}
                    onMouseEnter={() => handleNodeHover(n, n.x, n.y)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{ cursor: 'pointer' }}>

                    {/* Glow backdrop for critical nodes */}
                    {n.risk === 'CRITICAL' && (
                      <circle r={R + 20} fill={`url(#glow_red)`} opacity={0.6} />
                    )}
                    {n.risk === 'HIGH' && (
                      <circle r={R + 14} fill={`url(#glow_orange)`} opacity={0.5} />
                    )}

                    {/* Pulse ring on selected */}
                    {isSelected && (
                      <circle r={R + 8} fill="none" stroke="white" strokeWidth={1.5}
                        strokeOpacity={0.6} className="pulse-ring" />
                    )}

                    {/* Persistent risk dashed ring */}
                    {n.isPersistent && (
                      <circle r={R + 6} fill="none" stroke="#FB923C"
                        strokeWidth={1.5} strokeDasharray="3 3" strokeOpacity={0.9} />
                    )}

                    {/* Node body */}
                    <circle r={R} fill={color}
                      stroke={isSelected ? 'white' : 'rgba(0,0,0,0.5)'}
                      strokeWidth={isSelected ? 2.5 : 1.5} />

                    {/* Persistent risk badge */}
                    {n.isPersistent && (
                      <circle cx={R - 3} cy={-(R - 3)} r={5}
                        fill="#EF4444" stroke="#050a14" strokeWidth={1.5} />
                    )}

                    {/* Icon / label inside node */}
                    <text y={4} textAnchor="middle" fill="white" fontSize="10" fontWeight="700"
                      style={{ fontFamily: 'system-ui, sans-serif', pointerEvents: 'none', userSelect: 'none' }}>
                      {n.label.length > 8 ? n.label.split(' ')[0] : n.label}
                    </text>

                    {/* Sub-label below */}
                    <text y={R + 14} textAnchor="middle" fill="#94A3B8" fontSize="9.5"
                      style={{ fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none' }}>
                      {n.sub.length > 14 ? n.sub.slice(0, 14) + '…' : n.sub}
                    </text>

                    {/* Risk badge above node */}
                    {n.risk && (
                      <text y={-(R + 7)} textAnchor="middle" fontSize="8" fontWeight="700"
                        fill={n.risk === 'CRITICAL' ? '#EF4444' : '#FB923C'}
                        style={{ fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none' }}>
                        {n.risk}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Entity type legend */}
          <div className="absolute bottom-3 left-3 bg-[#09090B]/85 backdrop-blur-md p-2.5 rounded-xl border border-neutral-800 text-[9.5px] text-zinc-400 pointer-events-none">
            <span className="font-semibold text-zinc-200 uppercase tracking-wider block mb-1.5">Entity Types</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(Object.entries(NODE_COLORS) as [EntityType, string][]).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 capitalize">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  {type === 'upi' ? 'UPI' : type === 'atm' ? 'ATM' : type.charAt(0).toUpperCase() + type.slice(1)}
                </div>
              ))}
            </div>
          </div>

          {/* Zoom hint */}
          <div className="absolute bottom-3 right-3 text-[9px] text-neutral-600 pointer-events-none">
            Scroll to zoom · Drag to pan
          </div>

          {/* Hover tooltip — portal-like, positioned with fixed */}
        </div>

        {/* ── Sidebar Inspector ── */}
        <div className="col-span-4 rounded-2xl p-4 border flex flex-col gap-3"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
              Selected Entity
            </span>
            {selectedNode && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {selectedNode.type.toUpperCase()}
              </span>
            )}
          </div>

          {selectedNode ? (
            <>
              {/* Entity identity row */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl font-bold flex items-center justify-center text-sm flex-shrink-0"
                  style={{ backgroundColor: `${NODE_COLORS[selectedNode.type]}20`, color: NODE_COLORS[selectedNode.type], border: `1px solid ${NODE_COLORS[selectedNode.type]}40` }}>
                  {selectedNode.label.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                    {selectedNode.label}
                  </h3>
                  <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                    {selectedNode.sub}
                  </p>
                </div>
              </div>

              {/* Persistent risk banner */}
              {selectedNode.isPersistent && (
                <div className="p-2.5 rounded-xl"
                  style={{ backgroundColor: 'var(--risk-critical-bg)', border: '1px solid var(--risk-critical-border)' }}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--risk-critical-text)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E5484D] animate-pulse" />
                    PERSISTENT RISK ENTITY
                  </div>
                  <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--risk-critical-text)', opacity: 0.8 }}>
                    Appears across multiple distinct fraud cases in registry.
                  </p>
                </div>
              )}

              {/* Stats */}
              <div className="flex flex-col gap-2 text-xs border-t pt-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
                {[
                  ['Entity Type',         selectedNode.type.toUpperCase()],
                  ['Risk Registry',       selectedNode.risk || 'NORMAL'],
                  ['Institution',         selectedNode.institution || '—'],
                  ['Seen in Complaints',  String(selectedNode.complaints ?? 1)],
                  ['Total Flow Detected', selectedNode.flow || '—'],
                  ['Last Active',         selectedNode.lastActive || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span className="font-semibold font-mono text-right"
                      style={{
                        color: label === 'Risk Registry' && (value === 'CRITICAL' || value === 'HIGH')
                          ? (value === 'CRITICAL' ? '#EF4444' : '#FB923C')
                          : 'var(--text-primary)',
                      }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* AI Insight */}
              <div className="p-3 rounded-xl border"
                style={{ backgroundColor: 'rgba(56,189,248,0.05)', borderColor: 'rgba(56,189,248,0.2)' }}>
                <div className="flex items-center gap-1 text-[10px] font-semibold text-sky-500 mb-1.5">
                  ✦ AI INSIGHT
                </div>
                <p className="text-[10.5px] italic leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  "{selectedNode.aiInsight}"
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-auto">
                <button onClick={() => setShowDossier(true)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors"
                  style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  View Full Dossier
                </button>
                <button className="px-3 py-2 text-xs font-semibold text-white rounded-xl transition-colors"
                  style={{ backgroundColor: '#E11D48' }}>
                  Flag Entity
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs"
              style={{ color: 'var(--text-muted)' }}>
              Click any node to inspect
            </div>
          )}
        </div>
      </div>

      {/* ── Hover tooltip (positioned absolutely relative to viewport) ── */}
      {hoveredNode && (
        <div className="fixed z-50 pointer-events-none"
          style={{ left: hoverPos.x, top: hoverPos.y, transform: 'translate(-50%, calc(-100% - 12px))' }}>
          <div className="bg-[#18181B]/95 border border-neutral-700 backdrop-blur-md px-3 py-2 rounded-xl shadow-2xl text-white text-xs min-w-[150px]">
            <div className="flex items-center justify-between border-b border-neutral-700 pb-1 mb-1.5 gap-3">
              <span className="font-semibold text-sky-400">{hoveredNode.label}</span>
              <span className="text-[9px] uppercase px-1.5 py-0.5 bg-neutral-800 rounded font-mono text-zinc-400">
                {hoveredNode.type}
              </span>
            </div>
            <div className="space-y-0.5 text-[10px] text-zinc-300">
              <div className="flex justify-between gap-3">
                <span>Flow:</span>
                <span className="font-semibold text-emerald-400">{hoveredNode.flow || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Risk:</span>
                <span className="font-semibold" style={{ color: hoveredNode.risk ? (hoveredNode.risk === 'CRITICAL' ? '#EF4444' : '#FB923C') : '#6EE7B7' }}>
                  {hoveredNode.risk || 'NORMAL'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Cases:</span>
                <span className="font-semibold text-sky-400">{hoveredNode.complaints}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Dossier Modal ── */}
      {showDossier && selectedNode && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={() => setShowDossier(false)}>
          <div className="rounded-2xl max-w-md w-full p-6 shadow-2xl border"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            onClick={e => e.stopPropagation()}>

            <div className="flex justify-between items-start pb-3 border-b mb-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Entity Dossier
                </h2>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  ID: {selectedNode.id}
                </p>
              </div>
              <button onClick={() => setShowDossier(false)}
                className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div className="space-y-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {[
                ['Identifier',           selectedNode.sub],
                ['Entity Type',          selectedNode.type.toUpperCase()],
                ['Institution',          selectedNode.institution || '—'],
                ['Risk Level',           selectedNode.risk || 'NORMAL'],
                ['Persistent Risk',      selectedNode.isPersistent ? 'YES — Cross-case match' : 'No'],
                ['Total Fraud Volume',   selectedNode.flow || '—'],
                ['Associated Complaints',`${selectedNode.complaints} NCRP Cases`],
                ['Last Active',          selectedNode.lastActive || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-4">
                  <span style={{ color: 'var(--text-muted)' }} className="flex-shrink-0">{k}</span>
                  <span className="font-semibold text-right"
                    style={{ color: k === 'Persistent Risk' && v !== 'No' ? '#EF4444' : 'var(--text-primary)' }}>
                    {v}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="text-[10px] font-semibold text-sky-500 mb-1">✦ AI INSIGHT</div>
                <p className="italic leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {selectedNode.aiInsight}
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <button onClick={() => setShowDossier(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border transition-colors"
                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                Close
              </button>
              <button className="px-4 py-2 text-xs font-semibold text-white rounded-xl"
                style={{ backgroundColor: '#E11D48' }}>
                Flag &amp; Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
