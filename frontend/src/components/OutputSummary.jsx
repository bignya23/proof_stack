// src/components/OutputSummary.jsx
import React from 'react';
import { ShieldAlert, ArrowRight, User, GitBranch, Network } from 'lucide-react';

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
    <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
      
      {/* Top Header */}
      <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
        <div className="flex items-center space-x-1.5">
          <ShieldAlert size={16} strokeWidth={1.8} className="text-blue-400" />
          <span className="text-zinc-100 font-bold tracking-tight">Root Cause & Remediation</span>
        </div>
        {synthesis.governing_adr && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold">
            {synthesis.governing_adr}
          </span>
        )}
      </div>

      {/* Synthesis Headline */}
      <p className="text-xs text-zinc-200 leading-relaxed font-medium">
        {synthesis.headline}
      </p>

      {/* Provenance Execution Path */}
      {nodes.length > 0 && (
        <div className="p-2.5 bg-[#000000] rounded-lg border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
            <span className="flex items-center space-x-1 text-zinc-300 font-semibold">
              <Network size={14} strokeWidth={1.8} className="text-blue-400" />
              <span>Route ({nodes.length} Hops)</span>
            </span>
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
                    className={`text-[10px] font-mono px-2 py-1 rounded flex items-center space-x-1 border transition text-blue-400 ${
                      isHighlighted
                        ? "bg-zinc-900 border-blue-500 font-semibold"
                        : "bg-zinc-900/80 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-850"
                    }`}
                    title="View node in graph"
                  >
                    <span>{nodeName}</span>
                    {nodeFile && <span className="text-zinc-500 text-[9px]">({nodeFile})</span>}
                  </button>
                  {idx < nodes.length - 1 && (
                    <ArrowRight size={12} strokeWidth={1.8} className="text-zinc-600 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Owner & Impact Metadata Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800 text-[11px] font-mono">
        <div className="flex items-center space-x-1.5">
          <User size={14} strokeWidth={1.8} className="text-zinc-500" />
          <span className="text-zinc-400">Primary Owner:</span>
          <strong className="text-zinc-200">{synthesis.primary_owner || "Aarav Mehta"}</strong>
        </div>
        <div className="flex items-center space-x-1.5">
          <GitBranch size={14} strokeWidth={1.8} className="text-zinc-500" />
          <span className="text-zinc-400">Callers Impacted:</span>
          <strong className="text-zinc-200">{synthesis.upstream_blast_count || 5} Functions</strong>
        </div>
      </div>

      {/* Action Plan */}
      <div className="text-[11px] text-zinc-300 pt-1.5 border-t border-zinc-800 leading-relaxed flex items-start space-x-1.5">
        <span className="text-blue-400 font-bold shrink-0 font-mono">Action:</span>
        <span className="text-zinc-200">{synthesis.action_plan}</span>
      </div>

    </div>
  );
}
