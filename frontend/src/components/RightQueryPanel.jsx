// src/components/RightQueryPanel.jsx
import React from 'react';
import { 
  X, Zap, Sliders, ShieldAlert, RefreshCw, 
  CheckCircle2, Sparkles, Terminal, ArrowRight, 
  GitPullRequest, Shield, Layers, Compass
} from 'lucide-react';

const SCENARIOS = [
  {
    id: "timeout-504",
    title: "Multi-Hop Triage & Patch",
    prompt: "Checkout is failing with 504 Gateway Timeouts under flash-sale load. Investigate decrypt_card_token, consult past team findings, and propose an actionable code patch.",
    icon: Zap
  },
  {
    id: "pagerank-audit",
    title: "GraphBLAS PageRank Audit",
    prompt: "Security audit requested: If fetch_signing_key rotates its key format, calculate the complete upstream blast radius and rank systemic risk with FalkorDB PageRank.",
    icon: Sliders
  },
  {
    id: "provenance-adr",
    title: "Explainable Policy Trace",
    prompt: "Who authored vault_client.py, what architectural decision tags ([ADR-xxx]) govern its timeouts, and what past findings exist on decrypt_card_token?",
    icon: ShieldAlert
  }
];

export default function RightQueryPanel({
  onClose,
  prompt,
  setPrompt,
  onRunInvestigation,
  isStreaming,
  loading,
  liveThinkingMessage,
  liveTurn,
  streamingTrace = [],
  investigationResult,
  onOpenEvidenceTab,
  onOpenCommitTab
}) {
  return (
    <aside className="w-96 bg-[#09090b] border-l border-zinc-800 flex flex-col h-full select-none shrink-0 z-20">
      
      {/* Top Header with Close Button */}
      <div className="h-10 px-3 border-b border-zinc-800 flex items-center justify-between text-xs font-mono bg-[#09090b]">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-bold text-zinc-100">Incident Copilot</span>
        </div>

        <div className="flex items-center space-x-2">
          {isStreaming && (
            <span className="text-[10px] text-blue-400 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
              <span>Thinking...</span>
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-blue-400 hover:bg-zinc-900 transition"
            title="Close Copilot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: Scrollable Input, Trace, and Synthesis */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        
        {/* Quick Demo Scenarios (Buttons with text in blue) */}
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">
            Scenarios
          </span>
          <div className="flex flex-col space-y-1">
            {SCENARIOS.map((sc) => {
              const Icon = sc.icon;
              const isSelected = prompt === sc.prompt;

              return (
                <button
                  key={sc.id}
                  onClick={() => setPrompt(sc.prompt)}
                  className={`text-left p-2 rounded-lg border transition text-xs font-mono flex items-center space-x-2 text-blue-400 ${
                    isSelected
                      ? "bg-zinc-900 border-blue-500/80 font-semibold"
                      : "bg-[#000000] border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                  <span className="truncate">{sc.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Incident Goal / Prompt Input Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">
              Investigation Goal
            </label>
            <span className="text-[10px] text-zinc-400 font-mono flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              <span>FalkorDB</span>
            </span>
          </div>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to investigate or remediate in the codebase..."
            className="w-full bg-[#000000] border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:border-blue-500 outline-none leading-relaxed resize-none font-mono shadow-inner"
          />
        </div>

        {/* Primary Action Button (No neon gradient, black shades background, text strictly in blue) */}
        <button
          onClick={onRunInvestigation}
          disabled={loading || isStreaming}
          className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500 text-blue-400 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading || isStreaming ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span>Investigating...</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              <span>Run Investigation</span>
            </>
          )}
        </button>

        {/* Live ReAct Thinking HUD */}
        {(isStreaming || liveThinkingMessage) && (
          <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1 text-xs font-mono">
            <div className="flex items-center justify-between text-blue-400 font-bold text-[11px]">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                <span>Turn {liveTurn} Deliberation</span>
              </span>
            </div>
            <div className="text-zinc-300 text-[11px] font-sans leading-relaxed">
              {liveThinkingMessage}
            </div>
          </div>
        )}

        {/* Executed Steps Timeline */}
        {streamingTrace.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-500 font-mono">
              <span>Trace ({streamingTrace.length} Steps)</span>
            </div>
            <div className="space-y-1">
              {streamingTrace.map((step) => (
                <div
                  key={step.step}
                  className="flex items-center justify-between p-1.5 bg-[#000000] border border-zinc-800/80 rounded text-[11px] font-mono"
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <span className="text-zinc-500 font-bold">{String(step.step).padStart(2, '0')}</span>
                    <span className="text-zinc-200 font-medium truncate">{step.tool_name}</span>
                  </div>
                  <span className="text-[10px] text-blue-400 font-semibold shrink-0">Done</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Synthesis Result Card */}
        {investigationResult?.synthesis && (
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between text-blue-400 font-mono font-bold text-xs">
              <span className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Investigation Complete</span>
              </span>
            </div>

            <div className="text-zinc-100 font-medium text-[11px] leading-relaxed">
              {investigationResult.synthesis.headline}
            </div>

            {investigationResult.synthesis.action_plan && (
              <div className="p-2 bg-[#000000] rounded border border-zinc-800 text-[11px] text-zinc-300 leading-relaxed font-sans">
                {investigationResult.synthesis.action_plan}
              </div>
            )}

            {/* Metadata Badges */}
            <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
              {investigationResult.synthesis.governing_adr && (
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold">
                  {investigationResult.synthesis.governing_adr}
                </span>
              )}
              {investigationResult.synthesis.primary_owner && (
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  Owner: {investigationResult.synthesis.primary_owner}
                </span>
              )}
              {investigationResult.synthesis.upstream_blast_count > 0 && (
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                  Blast: {investigationResult.synthesis.upstream_blast_count} callers
                </span>
              )}
            </div>

            {/* Navigation Buttons (Button text strictly in blue) */}
            <div className="pt-2 flex items-center space-x-2">
              <button
                onClick={onOpenEvidenceTab}
                className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500/50 text-blue-400 rounded text-[11px] font-mono font-medium transition flex items-center justify-center space-x-1"
              >
                <span>View Evidence</span>
              </button>
              <button
                onClick={onOpenCommitTab}
                className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500/50 text-blue-400 rounded text-[11px] font-mono font-bold transition flex items-center justify-center space-x-1"
              >
                <span>Review Patch</span>
              </button>
            </div>
          </div>
        )}

      </div>

    </aside>
  );
}
