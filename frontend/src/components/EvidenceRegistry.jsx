// src/components/EvidenceRegistry.jsx
import React, { useState } from 'react';
import { 
  Database, ShieldCheck, Code, AlertCircle, Sparkles, 
  ChevronDown, ChevronRight, CircleCheck, Eye, Filter, ArrowUpRight
} from 'lucide-react';
import CypherHighlighter from './CypherHighlighter';

const STATUS_CONFIG = {
  graph_observed: {
    label: "Graph",
    color: "bg-zinc-900 text-zinc-300 border-zinc-800",
    dot: "bg-blue-400",
    icon: Database,
    description: "Verified via FalkorDB traversal"
  },
  code_observed: {
    label: "Code",
    color: "bg-zinc-900 text-zinc-300 border-zinc-800",
    dot: "bg-zinc-400",
    icon: Code,
    description: "Inspected from repository AST"
  },
  verified: {
    label: "Verified",
    color: "bg-zinc-900 text-zinc-300 border-zinc-800",
    dot: "bg-blue-300",
    icon: CircleCheck,
    description: "Validated against syntax and invariants"
  },
  hypothesis: {
    label: "Hypothesis",
    color: "bg-zinc-900 text-zinc-300 border-zinc-800",
    dot: "bg-zinc-500",
    icon: Sparkles,
    description: "Derived hypothesis"
  },
  log_observed: {
    label: "Observed",
    color: "bg-zinc-900 text-zinc-300 border-zinc-800",
    dot: "bg-zinc-400",
    icon: AlertCircle,
    description: "Observed in telemetry"
  }
};

export default function EvidenceRegistry({ 
  evidence = [], 
  onSelectNode,
  highlightedNodes = new Set() 
}) {
  const [filter, setFilter] = useState("all");
  const [expandedCypher, setExpandedCypher] = useState({});

  if (!evidence || evidence.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3 bg-[#000000] rounded-xl border border-zinc-800">
        <div className="p-3 bg-zinc-900 rounded-full border border-zinc-800 text-blue-400">
          <Database size={24} strokeWidth={1.8} />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-zinc-300">Evidence Registry</h4>
          <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
            Claims recorded during graph investigation will appear here.
          </p>
        </div>
      </div>
    );
  }

  // Count stats
  const totalCount = evidence.length;
  const graphObservedCount = evidence.filter(e => e.status === 'graph_observed').length;
  const codeObservedCount = evidence.filter(e => e.status === 'code_observed').length;
  const verifiedCount = evidence.filter(e => e.status === 'verified').length;

  const filteredEvidence = filter === "all" 
    ? evidence 
    : evidence.filter(e => e.status === filter);

  const toggleCypher = (id) => {
    setExpandedCypher(prev => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id]
    }));
  };

  const isExpanded = (id) => {
    return expandedCypher[id] !== false;
  };

  return (
    <div className="space-y-4">
      
      {/* Evidence Stats Bar */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Claims</div>
          <div className="text-base font-bold font-mono text-zinc-100 mt-0.5">{totalCount}</div>
        </div>
        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Graph</div>
          <div className="text-base font-bold font-mono text-zinc-100 mt-0.5">{graphObservedCount}</div>
        </div>
        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Code</div>
          <div className="text-base font-bold font-mono text-zinc-100 mt-0.5">{codeObservedCount}</div>
        </div>
        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Verified</div>
          <div className="text-base font-bold font-mono text-zinc-100 mt-0.5">{verifiedCount}</div>
        </div>
      </div>

      {/* Filter Chips (Button text strictly in blue) */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
        <span className="text-zinc-500 flex items-center space-x-1 mr-1">
          <Filter size={14} strokeWidth={1.8} className="text-zinc-500" />
          <span>Filter:</span>
        </span>
        <button
          onClick={() => setFilter("all")}
          className={`px-2.5 py-1 rounded transition text-blue-400 ${
            filter === "all"
              ? "bg-zinc-900 border border-blue-500 font-bold"
              : "bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 font-medium"
          }`}
        >
          All ({totalCount})
        </button>
        <button
          onClick={() => setFilter("graph_observed")}
          className={`px-2.5 py-1 rounded transition text-blue-400 flex items-center space-x-1 ${
            filter === "graph_observed"
              ? "bg-zinc-900 border border-blue-500 font-bold"
              : "bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 font-medium"
          }`}
        >
          <span>Graph ({graphObservedCount})</span>
        </button>
        <button
          onClick={() => setFilter("code_observed")}
          className={`px-2.5 py-1 rounded transition text-blue-400 flex items-center space-x-1 ${
            filter === "code_observed"
              ? "bg-zinc-900 border border-blue-500 font-bold"
              : "bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 font-medium"
          }`}
        >
          <span>Code ({codeObservedCount})</span>
        </button>
        <button
          onClick={() => setFilter("verified")}
          className={`px-2.5 py-1 rounded transition text-blue-400 flex items-center space-x-1 ${
            filter === "verified"
              ? "bg-zinc-900 border border-blue-500 font-bold"
              : "bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 font-medium"
          }`}
        >
          <span>Verified ({verifiedCount})</span>
        </button>
      </div>

      {/* Evidence Cards List */}
      <div className="space-y-3">
        {filteredEvidence.map((item, index) => {
          const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.graph_observed;
          const cypherExpanded = isExpanded(item.evidence_id || index);

          return (
            <div 
              key={item.evidence_id || index}
              className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5 hover:border-zinc-700 transition shadow-sm"
            >
              {/* Card Header: Evidence ID, Status Badge, Tool Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-zinc-900 text-blue-400 border border-zinc-800 shadow-sm">
                    {item.evidence_id || `E${String(index + 1).padStart(2, '0')}`}
                  </span>
                  
                  {/* Status Badge */}
                  <span 
                    title={cfg.description}
                    className={`flex items-center space-x-1.5 text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${cfg.color}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>
                    <span>{cfg.label}</span>
                  </span>
                </div>

                {/* Source Tool */}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#000000] text-zinc-400 border border-zinc-800">
                  {item.source_tool}
                </span>
              </div>

              {/* Claim Text */}
              <div className="text-xs text-zinc-100 font-medium leading-relaxed pl-0.5">
                {item.claim}
              </div>

              {/* Source Nodes (Buttons with text strictly in blue) */}
              {item.source_nodes && item.source_nodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800">
                  <span className="text-[10px] text-zinc-500 font-mono">Source Nodes:</span>
                  {item.source_nodes.map((node, nIdx) => {
                    const isNodeHighlighted = highlightedNodes.has(node);
                    return (
                      <button
                        key={nIdx}
                        onClick={() => onSelectNode && onSelectNode(node)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center space-x-1 transition border text-blue-400 ${
                          isNodeHighlighted
                            ? "bg-zinc-900 border-blue-500 font-bold"
                            : "bg-zinc-900/80 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-850 font-medium"
                        }`}
                        title="Highlight node on graph"
                      >
                        <span>{node}</span>
                        <ArrowUpRight size={12} strokeWidth={1.8} className="opacity-60 text-blue-400" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Cypher Used Section */}
              <div className="pt-1.5 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => toggleCypher(item.evidence_id || index)}
                    className="flex items-center space-x-1.5 text-[10px] font-mono text-blue-400 hover:text-blue-300 transition"
                  >
                    {cypherExpanded ? (
                      <ChevronDown size={14} strokeWidth={1.8} className="text-blue-400" />
                    ) : (
                      <ChevronRight size={14} strokeWidth={1.8} className="text-blue-400" />
                    )}
                    <span className="font-semibold text-blue-400">
                      cypher_used
                    </span>
                  </button>

                  <span className="text-[9px] font-mono text-zinc-500">
                    {cypherExpanded ? "Visible" : "Collapsed"}
                  </span>
                </div>

                {cypherExpanded && (
                  <div className="mt-1">
                    <CypherHighlighter 
                      cypher={item.cypher_used} 
                      title={`${item.evidence_id || 'Claim'} Query`}
                    />
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
