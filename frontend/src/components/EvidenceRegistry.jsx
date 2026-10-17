// src/components/EvidenceRegistry.jsx
import React, { useState } from 'react';
import { 
  Database, ShieldCheck, Code, AlertCircle, Sparkles, 
  ChevronDown, ChevronRight, CheckCircle2, Eye, Filter, ArrowUpRight
} from 'lucide-react';
import CypherHighlighter from './CypherHighlighter';

const STATUS_CONFIG = {
  graph_observed: {
    label: "Graph Observed",
    color: "bg-cyan-950/70 text-cyan-300 border-cyan-700/60",
    dot: "bg-cyan-400",
    icon: Database,
    description: "Relationship & path verified via FalkorDB traversal"
  },
  code_observed: {
    label: "Code Observed",
    color: "bg-emerald-950/70 text-emerald-300 border-emerald-700/60",
    dot: "bg-emerald-400",
    icon: Code,
    description: "Source code inspected directly from repository AST"
  },
  verified: {
    label: "AST Verified",
    color: "bg-teal-950/70 text-teal-300 border-teal-700/60",
    dot: "bg-teal-400",
    icon: ShieldCheck,
    description: "Validated against Python syntax & safe invariants"
  },
  hypothesis: {
    label: "Hypothesis",
    color: "bg-purple-950/70 text-purple-300 border-purple-700/60",
    dot: "bg-purple-400",
    icon: Sparkles,
    description: "Derived hypothesis pending multi-hop proof"
  },
  log_observed: {
    label: "Log Observed",
    color: "bg-amber-950/70 text-amber-300 border-amber-700/60",
    dot: "bg-amber-400",
    icon: AlertCircle,
    description: "Observed in incident telemetry or stack trace"
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
      <div className="h-64 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3 bg-slate-950/30 rounded-xl border border-slate-800/80">
        <div className="p-3 bg-slate-900 rounded-full border border-slate-800 text-sky-400">
          <Database className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-300">Evidence Registry Awaiting Run</h4>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            Every claim made during investigation is registered here with its underlying <strong className="text-sky-400 font-mono">cypher_used</strong> query and FalkorDB source nodes.
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
    // Default to true (expanded) so cypher is immediately visible per user request
    return expandedCypher[id] !== false;
  };

  return (
    <div className="space-y-4">
      
      {/* Evidence Stats Bar */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Claims</div>
          <div className="text-base font-bold font-mono text-white mt-0.5">{totalCount}</div>
        </div>
        <div className="p-2.5 bg-cyan-950/30 border border-cyan-800/40 rounded-lg">
          <div className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider">Graph</div>
          <div className="text-base font-bold font-mono text-cyan-300 mt-0.5">{graphObservedCount}</div>
        </div>
        <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg">
          <div className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider">Code</div>
          <div className="text-base font-bold font-mono text-emerald-300 mt-0.5">{codeObservedCount}</div>
        </div>
        <div className="p-2.5 bg-teal-950/30 border border-teal-800/40 rounded-lg">
          <div className="text-[10px] text-teal-400 uppercase font-bold tracking-wider">Verified</div>
          <div className="text-base font-bold font-mono text-teal-300 mt-0.5">{verifiedCount}</div>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px]">
        <span className="text-slate-500 flex items-center space-x-1 mr-1">
          <Filter className="w-3 h-3" />
          <span>Filter:</span>
        </span>
        <button
          onClick={() => setFilter("all")}
          className={`px-2.5 py-1 rounded-md transition font-medium ${
            filter === "all"
              ? "bg-slate-700 text-white font-semibold"
              : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          All ({totalCount})
        </button>
        <button
          onClick={() => setFilter("graph_observed")}
          className={`px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1 ${
            filter === "graph_observed"
              ? "bg-cyan-900/60 text-cyan-200 border border-cyan-700 font-semibold"
              : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          <span>Graph ({graphObservedCount})</span>
        </button>
        <button
          onClick={() => setFilter("code_observed")}
          className={`px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1 ${
            filter === "code_observed"
              ? "bg-emerald-900/60 text-emerald-200 border border-emerald-700 font-semibold"
              : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>Code ({codeObservedCount})</span>
        </button>
        <button
          onClick={() => setFilter("verified")}
          className={`px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1 ${
            filter === "verified"
              ? "bg-teal-900/60 text-teal-200 border border-teal-700 font-semibold"
              : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
          <span>Verified ({verifiedCount})</span>
        </button>
      </div>

      {/* Evidence Cards List */}
      <div className="space-y-3">
        {filteredEvidence.map((item, index) => {
          const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.graph_observed;
          const StatusIcon = cfg.icon;
          const hasCypher = item.cypher_used && item.cypher_used.trim().length > 0;
          const cypherExpanded = isExpanded(item.evidence_id || index);

          return (
            <div 
              key={item.evidence_id || index}
              className="p-3.5 bg-slate-950/70 border border-slate-800/90 rounded-xl space-y-2.5 hover:border-slate-700 transition shadow-sm"
            >
              {/* Card Header: Evidence ID, Status Badge, Tool Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-sky-400 border border-slate-700 shadow-sm">
                    {item.evidence_id || `E${String(index + 1).padStart(2, '0')}`}
                  </span>
                  
                  {/* Status Badge */}
                  <span 
                    title={cfg.description}
                    className={`flex items-center space-x-1.5 text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${cfg.color}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`}></span>
                    <span>{cfg.label}</span>
                  </span>
                </div>

                {/* Source Tool */}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                  {item.source_tool}
                </span>
              </div>

              {/* Claim Text */}
              <div className="text-xs text-slate-100 font-medium leading-relaxed pl-0.5">
                {item.claim}
              </div>

              {/* Source Nodes (Clickable to center and highlight on graph!) */}
              {item.source_nodes && item.source_nodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                  <span className="text-[10px] text-slate-500 font-mono">Source Nodes:</span>
                  {item.source_nodes.map((node, nIdx) => {
                    const isNodeHighlighted = highlightedNodes.has(node);
                    return (
                      <button
                        key={nIdx}
                        onClick={() => onSelectNode && onSelectNode(node)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center space-x-1 transition border ${
                          isNodeHighlighted
                            ? "bg-amber-950/80 text-amber-300 border-amber-600/70 shadow-sm"
                            : "bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
                        }`}
                        title="Click to highlight and locate node on the graph canvas"
                      >
                        <span>{node}</span>
                        <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Cypher Used Section */}
              <div className="pt-1.5 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => toggleCypher(item.evidence_id || index)}
                    className="flex items-center space-x-1.5 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition"
                  >
                    {cypherExpanded ? (
                      <ChevronDown className="w-3 h-3 text-sky-400" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-slate-500" />
                    )}
                    <span className="font-semibold text-slate-300">
                      cypher_used
                    </span>
                    <span className="text-slate-500 text-[9px]">
                      ({hasCypher ? "Parameterized Cypher" : "FalkorDB Traversal"})
                    </span>
                  </button>

                  <span className="text-[9px] font-mono text-slate-500">
                    {cypherExpanded ? "Visible" : "Collapsed"}
                  </span>
                </div>

                {cypherExpanded && (
                  <div className="mt-1">
                    <CypherHighlighter 
                      cypher={item.cypher_used} 
                      title={`${item.evidence_id || 'Claim'} Cypher Query`}
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
