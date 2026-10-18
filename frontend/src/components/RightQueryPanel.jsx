// src/components/RightQueryPanel.jsx
import React, { useState } from 'react';
import { 
  X, Plus, Square, ArrowUp, Sparkles, Database, 
  GitPullRequest, Check, RefreshCw, ArrowUpRight,
  FileText, Wrench, Copy, Code2
} from 'lucide-react';

const TOKEN_REGEX = /(`[^`]+`|\*\*[^*]+\*\*|[a-zA-Z0-9_\-.]+\/[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+(?:::[a-zA-Z0-9_]+)?|\bmcp_[a-zA-Z0-9_]+)/g;

const renderFormattedText = (text) => {
  if (!text) return null;
  const parts = text.split(TOKEN_REGEX);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-blue-300 font-mono text-[10.5px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('mcp_')) {
      return (
        <span key={i} className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800/60 text-amber-300 font-mono text-[10.5px]">
          {part}
        </span>
      );
    }
    if (/^[a-zA-Z0-9_\-.]+\/[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+(?:::[a-zA-Z0-9_]+)?$/.test(part)) {
      return (
        <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-750 text-blue-300 font-mono text-[10.5px] inline-block my-0.5">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

const parseActionSteps = (plan) => {
  if (!plan) return [];
  const lines = plan.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const steps = [];
  lines.forEach((line) => {
    const numMatch = line.match(/^(\d+)[\.\)]\s*(.*)$/);
    if (numMatch) {
      steps.push({ num: numMatch[1], text: numMatch[2] });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      steps.push({ num: '•', text: line.slice(2).trim() });
    } else {
      if (steps.length > 0 && steps[steps.length - 1].num !== '•') {
        steps[steps.length - 1].text += ' ' + line;
      } else {
        steps.push({ num: String(steps.length + 1), text: line });
      }
    }
  });
  return steps;
};

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
  onOpenReportTab,
  onSuggestPatch,
  isGeneratingPatch,
  width = 420,
  onResizeStart,
  isResizing = false
}) {
  const [inputText, setInputText] = useState("");
  const [copied, setCopied] = useState(false);
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

        {/* Synthesis / Response Rendering */}
        {investigationResult?.synthesis && (() => {
          const isDirect = investigationResult.synthesis.response_type === "direct_response";
          const hasEvidence = Boolean(investigationResult.evidence_registry?.length);
          const hasHops = Boolean(investigationResult.execution_path?.nodes?.length);
          const hasPatchDiff = Boolean(activePatch?.diff && activePatch.diff.trim());
          const isSimple = isDirect || (!hasEvidence && !hasHops && !hasPatchDiff);

          const headline = investigationResult.synthesis.headline || "Analysis Complete";
          const message = investigationResult.synthesis.message;
          const actionPlan = investigationResult.synthesis.action_plan;
          const targetFn = investigationResult.target_function;
          const targetFilePath = investigationResult.patch?.file_path || activePatch?.file_path || "";
          const actionSteps = parseActionSteps(actionPlan);

          const responseText = message || actionPlan || headline || "No response generated.";

          const copyFullSummary = () => {
            let md = `### ${headline}\n\n`;
            if (targetFn) md += `**Target Symbol**: \`${targetFn}\`\n\n`;
            if (message && message !== headline) md += `**Root Cause Diagnosis**:\n${message}\n\n`;
            if (actionPlan) md += `**Action Plan**:\n${actionPlan}\n\n`;
            navigator.clipboard.writeText(md);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          };

          if (isSimple) {
            return (
              <div className="p-4 bg-[#18181b] border border-zinc-800 rounded-2xl space-y-2.5 text-xs animate-in fade-in duration-200 shadow-sm">
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/60">
                  <span className="flex items-center space-x-1.5 text-blue-400 font-medium text-xs font-sans">
                    <Sparkles size={13} className="text-blue-400" />
                    <span className="text-zinc-200 font-semibold">Response</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(responseText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="hover:text-zinc-200 transition flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 text-[11px]"
                    title="Copy response"
                  >
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="text-zinc-200 text-xs leading-relaxed font-sans whitespace-pre-line select-text">
                  {renderFormattedText(responseText)}
                </div>
              </div>
            );
          }

          return (
            <div className="p-4 bg-[#151518] border border-zinc-800/90 rounded-2xl shadow-xl space-y-3.5 text-xs animate-in fade-in duration-200">
              {/* 1. Header with Status Badge & Copy Button */}
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-mono font-bold text-[11px] uppercase tracking-wider text-emerald-400">
                    {hasPatchDiff ? "Remediation Staged" : "Root Cause Identified"}
                  </span>
                </div>

                <button
                  onClick={copyFullSummary}
                  className="px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition flex items-center space-x-1 text-[11px]"
                  title="Copy incident diagnosis to clipboard"
                >
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>

              {/* 2. Target Defect Symbol Card */}
              {targetFn && (
                <div className="p-2.5 bg-[#0e0e11] border border-zinc-800/80 rounded-xl flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-blue-950/80 border border-blue-800/60 flex items-center justify-center shrink-0">
                      <Code2 size={13} className="text-blue-400" />
                    </div>
                    <div className="truncate">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Target Defect Symbol</div>
                      <div className="font-mono font-semibold text-xs text-blue-300 truncate">{targetFn}</div>
                    </div>
                  </div>
                  {targetFilePath && (
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 shrink-0 max-w-[150px] truncate" title={targetFilePath}>
                      {targetFilePath.split('/').pop()}
                    </span>
                  )}
                </div>
              )}

              {/* 3. Executive Diagnosis (Headline & Detail) */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white tracking-tight leading-snug">
                  {headline}
                </div>

                {message && message !== headline && (
                  <div className="p-3 bg-[#0f0f12] border-l-2 border-blue-500 rounded-r-xl text-zinc-300 text-xs leading-relaxed font-sans select-text">
                    {renderFormattedText(message)}
                  </div>
                )}
              </div>

              {/* 5. Metrics Footer Strip */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="p-2 bg-[#0e0e11] border border-zinc-850 rounded-lg text-center">
                  <span className="text-[10px] font-mono text-zinc-500 block uppercase">Evidence</span>
                  <span className="text-xs font-mono font-bold text-zinc-200">
                    {investigationResult.evidence_registry?.length || 0} Items
                  </span>
                </div>
                <div className="p-2 bg-[#0e0e11] border border-zinc-850 rounded-lg text-center">
                  <span className="text-[10px] font-mono text-zinc-500 block uppercase">Blast Radius</span>
                  <span className="text-xs font-mono font-bold text-zinc-200">
                    {investigationResult.synthesis?.upstream_blast_count ?? 0} Callers
                  </span>
                </div>
                <div className="p-2 bg-[#0e0e11] border border-zinc-850 rounded-lg text-center truncate">
                  <span className="text-[10px] font-mono text-zinc-500 block uppercase">VCS Commit</span>
                  <span className="text-xs font-mono font-bold text-emerald-400 truncate">
                    HEAD
                  </span>
                </div>
              </div>

              {/* 6. Primary Action Buttons */}
              <div className="pt-1.5 flex flex-col gap-2">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={onOpenReportTab}
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-sans font-semibold transition flex items-center justify-center space-x-1.5 shadow-md active:scale-98"
                    title="Open interactive Evidence Audit Report tab in middle window"
                  >
                    <FileText size={14} strokeWidth={1.8} />
                    <span>Evidence Report</span>
                  </button>

                  {!hasPatchDiff ? (
                    <button
                      onClick={onSuggestPatch}
                      disabled={isGeneratingPatch}
                      className="flex-1 py-2 px-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-700/80 text-blue-400 hover:text-blue-300 rounded-lg text-xs font-sans font-semibold transition flex items-center justify-center space-x-1.5 shadow-sm disabled:opacity-50 active:scale-98"
                      title="Generate AST-verified remediation patch diff"
                    >
                      {isGeneratingPatch ? (
                        <RefreshCw size={14} className="animate-spin text-blue-400" />
                      ) : (
                        <Wrench size={14} strokeWidth={1.8} />
                      )}
                      <span>{isGeneratingPatch ? "Synthesizing..." : "Suggest a Patch"}</span>
                    </button>
                  ) : (
                    <button
                      onClick={onOpenCommitTab}
                      className="flex-1 py-2 px-3 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/60 text-emerald-300 rounded-lg text-xs font-sans font-semibold transition flex items-center justify-center space-x-1.5 shadow-sm active:scale-98"
                      title="Review unified patch diff in editor and Source Control"
                    >
                      <GitPullRequest size={14} strokeWidth={1.8} />
                      <span>Review Patch (Diff)</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={onOpenEvidenceTab}
                    className="flex-1 py-1.5 bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg text-[11px] font-sans font-medium transition flex items-center justify-center space-x-1.5"
                  >
                    <Database size={13} strokeWidth={1.8} />
                    <span>Evidence Registry ({investigationResult.evidence_registry?.length || 0})</span>
                  </button>
                  {hasPatchDiff && (
                    <button
                      onClick={onOpenCommitTab}
                      className="flex-1 py-1.5 bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 text-amber-400 hover:text-amber-300 rounded-lg text-[11px] font-sans font-medium transition flex items-center justify-center space-x-1.5 font-mono"
                    >
                      <span className="font-bold text-[11px]">M</span>
                      <span>Source Control (1)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

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
