// src/components/RightQueryPanel.jsx
import React, { useState } from 'react';
import { 
  X, Plus, History, MoreHorizontal, ChevronRight, ChevronDown, 
  FileText, Terminal, Columns2, Network, CheckSquare, Mic, 
  Square, ArrowUp, Code2, ShieldAlert, Sparkles, Database, 
  GitPullRequest, Sliders, Check
} from 'lucide-react';

const SCENARIOS = [
  {
    id: "timeout-504",
    title: "Multi-Hop Triage & Patch",
    prompt: "Checkout is failing with 504 Gateway Timeouts under flash-sale load. Investigate decrypt_card_token, consult past team findings, and propose an actionable code patch."
  },
  {
    id: "pagerank-audit",
    title: "GraphBLAS PageRank Audit",
    prompt: "Security audit requested: If fetch_signing_key rotates its key format, calculate the complete upstream blast radius and rank systemic risk with FalkorDB PageRank."
  },
  {
    id: "provenance-adr",
    title: "Explainable Policy Trace",
    prompt: "Who authored vault_client.py, what architectural decision tags ([ADR-xxx]) govern its timeouts, and what past findings exist on decrypt_card_token?"
  }
];

const MODELS = [
  "Gemini 3.8 Flash High",
  "Azure Foundry (gpt-5)",
  "FalkorDB Reasoner",
  "OpenAI (gpt-4o)"
];

export default function RightQueryPanel({
  onClose,
  prompt,
  setPrompt,
  onRunInvestigation,
  onStopInvestigation,
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
  onOpenTerminal,
  onOpenFiles,
  onOpenGraph
}) {
  const [selectedModel, setSelectedModel] = useState("Gemini 3.8 Flash High");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showScenarioMenu, setShowScenarioMenu] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Refining ProofStack Architecture Plan");
  const [expandedSections, setExpandedSections] = useState({
    explore1: false,
    explore2: false,
    explore3: true
  });

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && !loading && prompt.trim()) {
        onRunInvestigation();
      }
    }
  };

  const handleResetSession = () => {
    setPrompt("");
    setSessionTitle("New Incident Investigation");
  };

  const hasExecutedSteps = streamingTrace && streamingTrace.length > 0;

  return (
    <aside className="w-[420px] bg-[#121214] border-l border-zinc-800 flex flex-col h-full select-none shrink-0 z-20 font-sans">
      
      {/* ================= 1. COPILOT HEADER ================= */}
      <div className="h-11 px-3.5 border-b border-zinc-800/80 flex items-center justify-between text-xs bg-[#121214] shrink-0">
        <div className="flex items-center space-x-2 truncate pr-2">
          <span className="font-semibold text-zinc-100 text-[13px] tracking-tight truncate">
            {sessionTitle}
          </span>
        </div>

        {/* Right Header Action Icons */}
        <div className="flex items-center space-x-1 shrink-0 text-zinc-400">
          <button
            onClick={handleResetSession}
            className="p-1 rounded hover:bg-zinc-800 hover:text-white transition"
            title="New Investigation Session"
          >
            <Plus size={16} strokeWidth={1.8} />
          </button>
          <button
            onClick={() => setShowScenarioMenu(!showScenarioMenu)}
            className="p-1 rounded hover:bg-zinc-800 hover:text-white transition"
            title="Investigation Scenarios"
          >
            <History size={16} strokeWidth={1.8} />
          </button>
          <button
            onClick={() => setShowModelMenu(!showModelMenu)}
            className="p-1 rounded hover:bg-zinc-800 hover:text-white transition"
            title="Model Options"
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 hover:text-white transition ml-0.5"
            title="Close Copilot"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Scenario Dropdown Menu */}
      {showScenarioMenu && (
        <div className="bg-[#18181b] border-b border-zinc-800 p-2.5 space-y-1.5 animate-in fade-in duration-150 text-xs">
          <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">
            Load Preconfigured Incident Scenario
          </div>
          <div className="flex flex-col space-y-1">
            {SCENARIOS.map(sc => (
              <button
                key={sc.id}
                onClick={() => {
                  setPrompt(sc.prompt);
                  setSessionTitle(`Investigating: ${sc.title}`);
                  setShowScenarioMenu(false);
                }}
                className="text-left px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 hover:text-white text-[11px] font-mono transition truncate"
              >
                {sc.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Model Dropdown Menu */}
      {showModelMenu && (
        <div className="bg-[#18181b] border-b border-zinc-800 p-2.5 space-y-1 animate-in fade-in duration-150 text-xs">
          <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono mb-1">
            Active Reasoning Engine
          </div>
          {MODELS.map(m => (
            <button
              key={m}
              onClick={() => {
                setSelectedModel(m);
                setShowModelMenu(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center justify-between transition ${
                selectedModel === m 
                  ? "bg-zinc-900 text-blue-400 font-bold border border-zinc-800" 
                  : "text-zinc-300 hover:bg-zinc-900/60 hover:text-white"
              }`}
            >
              <span>{m}</span>
              {selectedModel === m && <Check size={14} strokeWidth={1.8} className="text-blue-400" />}
            </button>
          ))}
        </div>
      )}

      {/* ================= 2. CHAT & AGENT TRACE STREAM ================= */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 select-text">
        
        {/* Previous Request Bubble / User Prompt Card */}
        {prompt && (
          <div className="bg-[#1c1c20] border border-zinc-800/80 p-3.5 rounded-xl text-xs text-zinc-100 leading-relaxed shadow-sm font-sans">
            {prompt}
          </div>
        )}

        {/* Dynamic Tool Activity Steps matching the exact screenshot layout */}
        <div className="space-y-2 pt-1 font-sans text-xs">
          
          {/* Step Group 1: Explored 1 file */}
          <div>
            <button
              onClick={() => toggleSection('explore1')}
              className="flex items-center space-x-1.5 text-zinc-400 hover:text-zinc-200 transition text-[12px] font-medium"
            >
              <span>Explored <strong>1 file</strong></span>
              {expandedSections.explore1 ? (
                <ChevronDown size={14} strokeWidth={1.8} className="text-zinc-500" />
              ) : (
                <ChevronRight size={14} strokeWidth={1.8} className="text-zinc-500" />
              )}
            </button>
            {expandedSections.explore1 && (
              <div className="pl-4 pt-1 space-y-0.5 text-[11px] font-mono text-zinc-500">
                <div>Analyzed schema: (:Function)-[:CALLS]-&gt;(:Function)</div>
                <div>Resolved FalkorDB tenancy: repo:sample-fintech</div>
              </div>
            )}
          </div>

          {/* Edited file row with +7 -4 diff stats */}
          <div className="flex items-center space-x-2 text-zinc-300 text-[12px]">
            <span className="text-zinc-500 font-mono">Edited</span>
            <span className="text-blue-400 font-mono text-xs">{`{ }`}</span>
            <span className="font-mono text-zinc-200">index.css</span>
            <span className="text-emerald-400 font-mono font-semibold text-[11px]">+7</span>
            <span className="text-rose-400 font-mono font-semibold text-[11px]">-4</span>
          </div>

          {/* Step Group 2: Explored 1 file */}
          <div>
            <button
              onClick={() => toggleSection('explore2')}
              className="flex items-center space-x-1.5 text-zinc-400 hover:text-zinc-200 transition text-[12px] font-medium"
            >
              <span>Explored <strong>1 file</strong></span>
              {expandedSections.explore2 ? (
                <ChevronDown size={14} strokeWidth={1.8} className="text-zinc-500" />
              ) : (
                <ChevronRight size={14} strokeWidth={1.8} className="text-zinc-500" />
              )}
            </button>
            {expandedSections.explore2 && (
              <div className="pl-4 pt-1 space-y-0.5 text-[11px] font-mono text-zinc-500">
                <div>Read AST symbol definitions: decrypt_card_token</div>
                <div>Loaded episodic finding: mem-001 (timeout fix)</div>
              </div>
            )}
          </div>

          {/* Edited component row with +10 -10 diff stats */}
          <div className="flex items-center space-x-2 text-zinc-300 text-[12px]">
            <span className="text-zinc-500 font-mono">Edited</span>
            <span className="text-blue-400 font-mono text-xs">⚛</span>
            <span className="font-mono text-zinc-200">ActivityBar.jsx</span>
            <span className="text-emerald-400 font-mono font-semibold text-[11px]">+10</span>
            <span className="text-rose-400 font-mono font-semibold text-[11px]">-10</span>
          </div>

          {/* Step Group 3: Exploring files / Live ReAct Execution */}
          <div>
            <button
              onClick={() => toggleSection('explore3')}
              className="flex items-center space-x-1.5 text-zinc-300 hover:text-white transition text-[12px] font-medium"
            >
              <span>{isStreaming ? "Exploring" : "Explored"} <strong>1 file</strong></span>
              {expandedSections.explore3 ? (
                <ChevronDown size={14} strokeWidth={1.8} className="text-zinc-500" />
              ) : (
                <ChevronRight size={14} strokeWidth={1.8} className="text-zinc-500" />
              )}
            </button>

            {expandedSections.explore3 && (
              <div className="pl-4 pt-1.5 space-y-1 text-[11px]">
                {/* Dynamically render analyzed steps */}
                {hasExecutedSteps ? (
                  streamingTrace.map((step) => (
                    <div key={step.step} className="flex items-center space-x-2 text-zinc-400 font-mono">
                      <span className="text-zinc-500">Analyzed</span>
                      <span className="text-blue-400">⚛</span>
                      <span className="text-zinc-300 truncate">{step.tool_name}</span>
                      <span className="text-zinc-600">#L1-145</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-center space-x-2 text-zinc-400 font-mono">
                      <span className="text-zinc-500">Analyzed</span>
                      <span className="text-blue-400">⚛</span>
                      <span className="text-zinc-300">RightQueryPanel.jsx</span>
                      <span className="text-zinc-600">#L1-145</span>
                    </div>
                    <div className="flex items-center space-x-2 text-zinc-400 font-mono">
                      <span className="text-zinc-500">Analyzed</span>
                      <span className="text-blue-400">⚛</span>
                      <span className="text-zinc-300">RightQueryPanel.jsx</span>
                      <span className="text-zinc-600">#L145-241</span>
                    </div>
                  </>
                )}

                {/* Working status indicator */}
                {isStreaming ? (
                  <div className="flex items-center space-x-2 text-zinc-300 pt-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
                    <span className="text-zinc-400">Working.</span>
                    <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">
                      {liveThinkingMessage}
                    </span>
                  </div>
                ) : (
                  <div className="text-zinc-500 pt-0.5 font-mono text-[11px]">
                    Working.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Synthesis Result Card (rendered when complete) */}
        {investigationResult?.synthesis && (
          <div className="p-3.5 bg-[#18181b] border border-zinc-800 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-blue-400 font-mono font-bold text-xs">
              <span className="flex items-center space-x-1.5">
                <Sparkles size={16} strokeWidth={1.8} className="text-blue-400" />
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
                <Database size={13} strokeWidth={1.8} />
                <span>Evidence ({investigationResult.evidence_registry?.length || 0})</span>
              </button>
              <button
                onClick={onOpenCommitTab}
                className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-blue-400 rounded text-[11px] font-mono font-bold transition flex items-center justify-center space-x-1"
              >
                <GitPullRequest size={13} strokeWidth={1.8} />
                <span>Review Patch</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ================= 3. BOTTOM ACTION BAR ================= */}
      <div className="px-3.5 pt-2 pb-1 flex items-center justify-between text-zinc-400 shrink-0 border-t border-zinc-800/60">
        
        {/* Quick View Switching Icons */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={onOpenFiles}
            className="text-zinc-400 hover:text-white transition p-1 rounded hover:bg-zinc-800/60" 
            title="Files"
          >
            <FileText size={16} strokeWidth={1.8} />
          </button>
          <button 
            onClick={onOpenTerminal}
            className="text-zinc-400 hover:text-white transition p-1 rounded hover:bg-zinc-800/60" 
            title="Terminal & Console"
          >
            <Terminal size={16} strokeWidth={1.8} />
          </button>
          <button 
            className="text-zinc-400 hover:text-white transition p-1 rounded hover:bg-zinc-800/60" 
            title="Split Layout"
          >
            <Columns2 size={16} strokeWidth={1.8} />
          </button>
          <button 
            onClick={onOpenGraph}
            className="relative text-zinc-400 hover:text-white transition p-1 rounded hover:bg-zinc-800/60" 
            title="FalkorDB Graph Canvas"
          >
            <Network size={16} strokeWidth={1.8} />
            {/* Glowing blue dot indicator on graph icon as shown in screenshot */}
            <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-blue-400 ring-2 ring-[#121214]"></span>
          </button>
        </div>

        {/* Review Changes Pill Button */}
        <button
          onClick={onOpenCommitTab}
          className="bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 hover:text-white text-[11px] font-sans px-2.5 py-1 rounded-lg flex items-center space-x-1.5 border border-zinc-700/60 transition shadow-sm font-medium"
        >
          <CheckSquare size={13} strokeWidth={1.8} className="text-zinc-400" />
          <span>Review Changes</span>
        </button>
      </div>

      {/* ================= 4. BOTTOM INPUT CONTAINER ================= */}
      <div className="p-3.5 pt-1.5 shrink-0">
        <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-3 space-y-2.5 shadow-lg focus-within:border-zinc-750 transition">
          
          {/* Main Ask Anything Textarea */}
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, @ to mention, / for actions"
            className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none resize-none leading-relaxed font-sans"
          />

          {/* Bottom Row Controls */}
          <div className="flex items-center justify-between pt-1">
            
            {/* Left: Plus icon and Model Pill Dropdown */}
            <div className="flex items-center space-x-2">
              <button 
                type="button"
                onClick={() => setShowScenarioMenu(!showScenarioMenu)}
                className="text-zinc-400 hover:text-white transition p-0.5"
                title="Add Context / Preset"
              >
                <Plus size={16} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="text-[11px] font-sans text-zinc-300 hover:text-white flex items-center space-x-1 cursor-pointer bg-zinc-850 px-2.5 py-0.5 rounded-full border border-zinc-800 hover:border-zinc-700 transition"
              >
                <span>{selectedModel}</span>
                <ChevronDown size={12} strokeWidth={1.8} className="text-zinc-400 ml-0.5" />
              </button>
            </div>

            {/* Right: Mic and Stop / Send Button */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                className="text-zinc-400 hover:text-white transition p-1"
                title="Voice Input"
              >
                <Mic size={16} strokeWidth={1.8} />
              </button>

              {/* Red Square Stop Button (when streaming) / Blue Send Arrow (when idle) */}
              {isStreaming || loading ? (
                <button
                  type="button"
                  onClick={onStopInvestigation}
                  className="w-6 h-6 rounded-md bg-red-600/90 hover:bg-red-500 flex items-center justify-center text-white transition shadow-sm active:scale-95"
                  title="Stop Investigation"
                >
                  <Square size={9} className="fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRunInvestigation}
                  className="w-6 h-6 rounded-md bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white transition shadow-sm active:scale-95"
                  title="Run Investigation"
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
