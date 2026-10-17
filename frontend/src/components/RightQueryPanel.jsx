// src/components/RightQueryPanel.jsx
import React, { useState } from 'react';
import { 
  X, Plus, Square, ArrowUp, Sparkles, Database, 
  GitPullRequest, Check, RefreshCw, ArrowUpRight
} from 'lucide-react';

const SAMPLE_QUERIES = [
  {
    title: "Multi-Hop Triage & Patch",
    prompt: "Checkout is failing with 504 Gateway Timeouts under flash-sale load. Investigate decrypt_card_token, consult past team findings, and propose an actionable code patch."
  },
  {
    title: "GraphBLAS PageRank Audit",
    prompt: "Security audit requested: If fetch_signing_key rotates its key format, calculate the complete upstream blast radius and rank systemic risk with FalkorDB PageRank."
  },
  {
    title: "Explainable Policy & Blame Trace",
    prompt: "Who authored vault_client.py, what architectural decision tags ([ADR-xxx]) govern its timeouts, and what past findings exist on decrypt_card_token?"
  }
];

export default function RightQueryPanel({
  onClose,
  prompt,
  setPrompt,
  onRunInvestigation,
  onStopInvestigation,
  onResetSession,
  isStreaming,
  loading,
  liveThinkingMessage,
  liveTurn,
  streamingTrace = [],
  investigationResult,
  activePatch,
  llmStatus,
  onOpenEvidenceTab,
  onOpenCommitTab,
  width = 420,
  onResizeStart,
  isResizing = false
}) {
  const [inputText, setInputText] = useState("");
  const [activeQuery, setActiveQuery] = useState(() => {
    return (investigationResult || (streamingTrace && streamingTrace.length > 0)) ? prompt : null;
  });

  const handleSubmit = () => {
    const q = inputText.trim();
    if (!q || isStreaming || loading) return;
    setActiveQuery(q);
    setInputText(""); // Make textbox blank immediately
    if (setPrompt) setPrompt(q);
    if (onRunInvestigation) onRunInvestigation(q);
  };

  const handleSelectSampleQuery = (samplePrompt) => {
    setActiveQuery(samplePrompt);
    setInputText("");
    if (setPrompt) setPrompt(samplePrompt);
    if (onRunInvestigation) onRunInvestigation(samplePrompt);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleResetSession = () => {
    setActiveQuery(null);
    setInputText("");
    if (onResetSession) {
      onResetSession();
    }
  };

  const isEmpty = !activeQuery && (!streamingTrace || streamingTrace.length === 0) && !investigationResult && !isStreaming;

  return (
    <aside 
      style={{ width: `${width}px` }}
      className="bg-[#121214] border-l border-zinc-800 flex flex-col h-full select-none shrink-0 z-20 font-sans relative group"
    >
      {/* Left Edge Resize Handle */}
      <div 
        onMouseDown={onResizeStart}
        className={`absolute top-0 left-0 bottom-0 w-1 cursor-col-resize z-40 transition-colors ${
          isResizing 
            ? 'bg-blue-500 w-1' 
            : 'bg-transparent hover:bg-blue-500/70'
        }`}
        title="Drag to resize panel"
      />
      
      {/* ================= 1. HEADER (NO NAME, CLEAN MINIMAL) ================= */}
      <div className="h-11 px-3.5 border-b border-zinc-800/80 flex items-center justify-between text-xs bg-[#121214] shrink-0">
        {/* Intentionally blank left area */}
        <div className="flex-1" />

        {/* Action Icons: Plus (New Session) and Close */}
        <div className="flex items-center space-x-1 shrink-0 text-zinc-300">
          <button
            onClick={handleResetSession}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
            title="New Session"
          >
            <Plus size={16} strokeWidth={1.8} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition ml-0.5"
            title="Close"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* ================= 2. CHAT & REAL AGENT TRACE STREAM ================= */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 select-text">
        
        {/* Empty State: Name and Sample Queries */}
        {isEmpty && (
          <div className="h-full flex flex-col justify-center space-y-5 py-4 animate-in fade-in duration-200">
            {/* Name / Branding Header */}
            <div className="space-y-1.5 text-center">
              <div className="inline-flex p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-sm mb-1">
                <Sparkles size={20} strokeWidth={1.8} className="text-zinc-200" />
              </div>
              <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
                ProofStack AI
              </h2>
              <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Autonomous code intelligence and graph-driven incident investigation.
              </p>
            </div>

            {/* Sample Queries */}
            <div className="space-y-2 pt-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono px-0.5">
                Sample Queries
              </div>
              <div className="space-y-2">
                {SAMPLE_QUERIES.map((sq, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectSampleQuery(sq.prompt)}
                    className="w-full text-left p-3 rounded-xl bg-[#18181b] hover:bg-[#1f1f23] border border-zinc-800 hover:border-zinc-700 transition cursor-pointer group shadow-sm"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-zinc-200 group-hover:text-blue-400 transition">
                      <span>{sq.title}</span>
                      <ArrowUpRight size={13} strokeWidth={1.8} className="text-zinc-300 group-hover:text-blue-400 transition" />
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed mt-1 font-sans">
                      {sq.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* User Query Card at Top */}
        {activeQuery && (
          <div className="bg-[#1c1c20] border border-zinc-800/80 p-3.5 rounded-xl text-xs text-zinc-100 leading-relaxed shadow-sm font-sans animate-in fade-in duration-150">
            {activeQuery}
          </div>
        )}

        {/* Real Agent Tool Calls & Reasoning (No dummy placeholders) */}
        {streamingTrace && streamingTrace.length > 0 && (
          <div className="space-y-2 pt-1 font-sans text-xs">
            {streamingTrace.map((step) => (
              <div 
                key={step.step}
                className="p-3 bg-[#18181b] border border-zinc-800/80 rounded-xl space-y-1.5 transition animate-in fade-in duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {step.status === 'running' ? (
                      <RefreshCw size={13} strokeWidth={1.8} className="text-zinc-200 animate-spin shrink-0" />
                    ) : (
                      <Check size={13} strokeWidth={1.8} className="text-zinc-200 shrink-0" />
                    )}
                    <span className="font-mono font-semibold text-zinc-200 text-xs">
                      {step.tool_name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Step {step.step}
                  </span>
                </div>

                {/* Agent Reasoning / Purpose */}
                {step.purpose && (
                  <div className="text-zinc-400 text-[11px] leading-relaxed pl-5 font-sans">
                    {step.purpose}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Live ReAct Thinking Status (when streaming) */}
        {isStreaming && (
          <div className="flex items-center space-x-2 text-zinc-300 p-2.5 bg-[#18181b]/60 border border-zinc-800/60 rounded-xl font-mono text-xs animate-in fade-in duration-150">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping shrink-0"></span>
            <span className="text-zinc-400 text-[11px] truncate">
              {liveThinkingMessage || "Reasoning..."}
            </span>
          </div>
        )}

        {/* Synthesis Result Card (rendered when complete) */}
        {investigationResult?.synthesis && (
          <div className="p-3.5 bg-[#18181b] border border-zinc-800 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-blue-400 font-mono font-bold text-xs">
              <span className="flex items-center space-x-1.5">
                <Sparkles size={16} strokeWidth={1.8} className="text-zinc-200" />
                <span>Investigation Complete</span>
              </span>
              {investigationResult.synthesis.governing_adr && (
                <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 text-[10px]">
                  {investigationResult.synthesis.governing_adr}
                </span>
              )}
            </div>

            <div className="text-zinc-100 font-medium text-xs leading-relaxed font-sans">
              {investigationResult.synthesis.headline}
            </div>

            {investigationResult.synthesis.action_plan && (
              <div className="p-2.5 bg-[#121214] rounded-lg border border-zinc-850 text-[11px] text-zinc-300 leading-relaxed font-sans">
                {investigationResult.synthesis.action_plan}
              </div>
            )}

            <div className="pt-1 flex items-center space-x-2">
              <button
                onClick={onOpenEvidenceTab}
                className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-blue-400 rounded text-[11px] font-mono font-medium transition flex items-center justify-center space-x-1"
              >
                <Database size={13} strokeWidth={1.8} className="text-zinc-200" />
                <span>Evidence ({investigationResult.evidence_registry?.length || 0})</span>
              </button>
              <button
                onClick={onOpenCommitTab}
                className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-blue-400 rounded text-[11px] font-mono font-bold transition flex items-center justify-center space-x-1"
              >
                <GitPullRequest size={13} strokeWidth={1.8} className="text-zinc-200" />
                <span>Review Patch</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ================= 3. BOTTOM INPUT CONTAINER ================= */}
      <div className="p-3.5 pt-1.5 shrink-0">
        <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-3 space-y-2.5 shadow-lg focus-within:border-zinc-750 transition">
          
          {/* Main Ask Textarea */}
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, @ to mention, / for actions"
            className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none resize-none leading-relaxed font-sans"
          />

          {/* Bottom Row Controls */}
          <div className="flex items-center justify-between pt-1">
            
            {/* Left: Model Pill (GPT-5 only, no switching ability, no plus button) */}
            <div className="flex items-center">
              <span className="text-[11px] font-mono text-zinc-300 bg-zinc-850 px-2.5 py-0.5 rounded-full border border-zinc-800 select-none">
                GPT-5
              </span>
            </div>

            {/* Right: Stop (when streaming) / Send Arrow (when idle) */}
            <div className="flex items-center space-x-2">
              {isStreaming || loading ? (
                <button
                  type="button"
                  onClick={onStopInvestigation}
                  className="w-6 h-6 rounded-md bg-red-600/90 hover:bg-red-500 flex items-center justify-center text-white transition shadow-sm active:scale-95"
                  title="Stop"
                >
                  <Square size={9} className="fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!inputText.trim()}
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-white transition shadow-sm ${
                    inputText.trim() 
                      ? 'bg-blue-600 hover:bg-blue-500 active:scale-95 cursor-pointer' 
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
                  }`}
                  title="Send"
                >
                  <ArrowUp size={13} strokeWidth={2.2} />
                </button>
              )}
            </div>

          </div>

        </div>
      </div>

    </aside>
  );
}
