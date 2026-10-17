import React from 'react';
import { 
  ShieldAlert, ArrowRight, User, GitBranch, Network, 
  FileText, Wrench, GitPullRequest, RefreshCw 
} from 'lucide-react';

export default function OutputSummary({ 
  result, 
  onSelectNode, 
  highlightedNodes = new Set(),
  onOpenReportTab,
  onSuggestPatch,
  isGeneratingPatch = false,
  onOpenCommitTab
}) {
  if (!result || !result.synthesis) {
    return null;
  }

  const { synthesis, execution_path, patch } = result;
  const nodes = execution_path?.nodes || [];
  const hasPatch = Boolean(patch?.diff && patch.diff.trim());

  // Simple / conceptual query: just display the response directly without triage overhead
  if (synthesis.response_type === "direct_response") {
    return (
      <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-xs font-sans text-zinc-200 animate-in fade-in duration-150">
        <p className="leading-relaxed whitespace-pre-line select-text text-zinc-200">
          {synthesis.message || synthesis.action_plan || synthesis.headline}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
      
      {/* Top Header */}
      <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
        <div className="flex items-center space-x-1.5">
          <ShieldAlert size={16} strokeWidth={1.8} className="text-zinc-200" />
          <span className="text-zinc-100 font-bold tracking-tight">
            {synthesis.response_type === "direct_response"
              ? "Direct Conceptual Response"
              : synthesis.response_type === "codebase_action"
              ? "Remediation & Patch Plan"
              : "Root Cause & Remediation"}
          </span>
        </div>
        {synthesis.governing_adr && 
         synthesis.governing_adr !== "Not found in indexed provenance." && 
         !synthesis.governing_adr.startsWith("N/A") && (
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
              <Network size={14} strokeWidth={1.8} className="text-zinc-200" />
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
                    <ArrowRight size={12} strokeWidth={1.8} className="text-zinc-400 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Owner & Impact Metadata Grid */}
      {synthesis.response_type !== "direct_response" && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5">
            <User size={14} strokeWidth={1.8} className="text-zinc-400" />
            <span className="text-zinc-400">Primary Owner:</span>
            <strong className="text-zinc-200">{synthesis.primary_owner || "Aarav Mehta"}</strong>
          </div>
          <div className="flex items-center space-x-1.5">
            <GitBranch size={14} strokeWidth={1.8} className="text-zinc-400" />
            <span className="text-zinc-400">Callers Impacted:</span>
            <strong className="text-zinc-200">{synthesis.upstream_blast_count || 0} Functions</strong>
          </div>
        </div>
      )}

      {/* Action Plan or Concept Details */}
      {(synthesis.action_plan || synthesis.message) && (
        <div className="text-[11px] text-zinc-300 pt-1.5 border-t border-zinc-800 leading-relaxed flex items-start space-x-1.5">
          <span className="text-blue-400 font-bold shrink-0 font-mono">
            {synthesis.response_type === "direct_response" ? "Concept:" : "Action:"}
          </span>
          <span className="text-zinc-200 whitespace-pre-line">
            {synthesis.response_type === "direct_response" 
              ? (synthesis.message || synthesis.action_plan) 
              : synthesis.action_plan}
          </span>
        </div>
      )}

      {/* Bottom Action Controls */}
      <div className="pt-2 border-t border-zinc-800 flex items-center space-x-2">
        {onOpenReportTab && (
          <button
            onClick={onOpenReportTab}
            className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-sans font-medium transition flex items-center justify-center space-x-1.5 shadow-sm"
          >
            <FileText size={13} strokeWidth={1.8} />
            <span>Evidence Report</span>
          </button>
        )}

        {onSuggestPatch && !hasPatch && (
          <button
            onClick={onSuggestPatch}
            disabled={isGeneratingPatch}
            className="flex-1 py-1.5 px-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-blue-400 hover:text-blue-300 rounded text-[11px] font-sans font-medium transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {isGeneratingPatch ? (
              <RefreshCw size={13} className="animate-spin text-blue-400" />
            ) : (
              <Wrench size={13} strokeWidth={1.8} />
            )}
            <span>{isGeneratingPatch ? "Simulating..." : "Suggest a Patch"}</span>
          </button>
        )}

        {onOpenCommitTab && hasPatch && (
          <button
            onClick={onOpenCommitTab}
            className="flex-1 py-1.5 px-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-emerald-400 hover:text-emerald-300 rounded text-[11px] font-sans font-medium transition flex items-center justify-center space-x-1.5"
          >
            <GitPullRequest size={13} strokeWidth={1.8} />
            <span>Review Patch (Diff)</span>
          </button>
        )}
      </div>

    </div>
  );
}
