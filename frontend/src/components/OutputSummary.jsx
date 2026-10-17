// src/components/OutputSummary.jsx
import React from 'react';
import { Zap, ArrowRight, ShieldCheck, User, GitBranch, MapPin, Sparkles } from 'lucide-react';

export default function OutputSummary({ 
  result, 
  onSelectNode,
  highlightedNodes = new Set() 
}) {
  if (!result || !result.synthesis) {
    return null;
  }

  const { synthesis, execution_path } = result;
  const nodes = execution_path?.nodes || [];

  return (
    <div className="p-3.5 bg-gradient-to-br from-red-950/40 via-slate-900/90 to-slate-950 border border-red-500/40 rounded-xl space-y-3 shadow-xl shadow-red-950/20">
      
      {/* Top Header */}
      <div className="flex items-center justify-between text-xs font-semibold text-red-400">
        <div className="flex items-center space-x-1.5">
          <Zap className="w-4 h-4 text-amber-400 fill-current" />
          <span className="text-white font-bold tracking-tight">Root Cause & Remediation Synthesis</span>
        </div>
        {synthesis.governing_adr && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 font-bold">
            {synthesis.governing_adr}
          </span>
        )}
      </div>

      {/* Synthesis Headline */}
      <p className="text-xs text-slate-100 leading-relaxed font-medium">
        {synthesis.headline}
      </p>

      {/* FalkorDB Provenance Execution Path */}
      {nodes.length > 0 && (
        <div className="p-2.5 bg-slate-950/90 rounded-lg border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span className="flex items-center space-x-1 text-sky-400 font-semibold">
              <MapPin className="w-3 h-3" />
              <span>FalkorDB Provenance Execution Route ({nodes.length} Hops)</span>
            </span>
            <span className="text-slate-500">Derived via shortestPath</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {nodes.map((node, idx) => {
              const nodeName = typeof node === 'string' ? node : (node.name || node.display_name || '?');
              const nodeFile = typeof node === 'object' && node.file ? `${node.file}:${node.line || '?'}` : null;
              const isHighlighted = highlightedNodes.has(nodeName);

              return (
                <React.Fragment key={idx}>
                  <button
                    onClick={() => onSelectNode && onSelectNode(nodeName)}
                    className={`text-[10px] font-mono px-2 py-1 rounded flex items-center space-x-1 border transition ${
                      isHighlighted
                        ? "bg-amber-950/80 text-amber-300 border-amber-500 font-semibold shadow-sm"
                        : "bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white"
                    }`}
                    title="Click to view and highlight node in FalkorDB graph"
                  >
                    <span>{nodeName}</span>
                    {nodeFile && <span className="text-slate-500 text-[9px]">({nodeFile})</span>}
                  </button>
                  {idx < nodes.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-red-400/80 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Owner & Impact Metadata Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-red-500/20 text-[11px]">
        <div className="flex items-center space-x-1.5">
          <User className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Primary Owner:</span>
          <strong className="text-slate-200">{synthesis.primary_owner || "Aarav Mehta"}</strong>
        </div>
        <div className="flex items-center space-x-1.5">
          <GitBranch className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">Callers Impacted:</span>
          <strong className="text-amber-300">{synthesis.upstream_blast_count || 5} Functions</strong>
        </div>
      </div>

      {/* Action Plan */}
      <div className="text-[11px] text-slate-300 pt-1.5 border-t border-red-500/20 leading-relaxed flex items-start space-x-1.5">
        <span className="text-amber-400 font-bold shrink-0">Action:</span>
        <span className="text-slate-200">{synthesis.action_plan}</span>
      </div>

    </div>
  );
}
