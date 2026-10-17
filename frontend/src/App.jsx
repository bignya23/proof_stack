// src/App.jsx
import React, { useState, useEffect } from 'react';
import { 
  Network, Database, GitCommit, GitPullRequest, 
  RefreshCw, CheckCircle2, Zap, Sparkles, Terminal, 
  FolderGit2, ChevronDown, ChevronRight, Layers, Cpu, Eye
} from 'lucide-react';

import EvidenceRegistry from './components/EvidenceRegistry';
import ApplyCommitPanel from './components/ApplyCommitPanel';
import GitUrlPanel from './components/GitUrlPanel';
import OutputSummary from './components/OutputSummary';
import GraphCanvas from './components/GraphCanvas';
import LiveReActStream from './components/LiveReActStream';

const API_BASE = "http://localhost:8000";

const SCENARIOS = [
  {
    id: "timeout-504",
    title: "504 Timeout Incident",
    prompt: "Checkout is failing with 504 Gateway Timeouts under flash-sale load. Investigate decrypt_card_token, consult past team findings, and propose an actionable code patch.",
    targetFn: "decrypt_card_token",
    entryFn: "post_checkout_endpoint",
    icon: "⚡"
  },
  {
    id: "blast-radius",
    title: "Blast Radius & Callers",
    prompt: "Security audit requested: If fetch_signing_key rotates its key format, calculate the complete upstream blast radius and rank systemic risk with FalkorDB PageRank.",
    targetFn: "fetch_signing_key",
    entryFn: "post_checkout_endpoint",
    icon: "🔍"
  },
  {
    id: "company-brain",
    title: "Company Brain & ADRs",
    prompt: "Who authored vault_client.py, what architectural decision tags ([ADR-xxx]) govern its timeouts, and what past findings exist on decrypt_card_token?",
    targetFn: "decrypt_card_token",
    entryFn: "post_checkout_endpoint",
    icon: "🧠"
  }
];

export default function App() {
  const [tenants, setTenants] = useState(["sample-fintech"]);
  const [activeTenant, setActiveTenant] = useState("sample-fintech");
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  
  // Investigation inputs
  const [prompt, setPrompt] = useState(SCENARIOS[0].prompt);
  const [targetFn, setTargetFn] = useState(SCENARIOS[0].targetFn);
  const [entryFn, setEntryFn] = useState(SCENARIOS[0].entryFn);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Agent State & Results
  const [investigationResult, setInvestigationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  
  // Live SSE Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingTrace, setStreamingTrace] = useState([]);
  const [liveThinkingMessage, setLiveThinkingMessage] = useState("");
  const [liveTurn, setLiveTurn] = useState(1);
  const [showLiveTrace, setShowLiveTrace] = useState(true);

  // 3 Primary Tabs: "evidence" | "commit" | "git_url"
  const [activeTab, setActiveTab] = useState("evidence"); 
  const [llmStatus, setLlmStatus] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  // 1-Click Patch Application State
  const [patchApplying, setPatchApplying] = useState(false);
  const [patchAppliedInfo, setPatchAppliedInfo] = useState(null);

  // Ingestion State
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState("");

  // Load initial graph & status
  useEffect(() => {
    fetchTenants();
    fetchLlmStatus();
    fetchGraph(activeTenant);
  }, [activeTenant]);

  const fetchTenants = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tenants`);
      const data = await res.json();
      if (data.tenants) setTenants(data.tenants);
    } catch (e) {
      console.warn("Could not fetch tenants:", e);
    }
  };

  const fetchLlmStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/llm/status`);
      const data = await res.json();
      setLlmStatus(data);
    } catch (e) {
      console.warn("Could not fetch LLM status:", e);
    }
  };

  const fetchGraph = async (tenant) => {
    try {
      const res = await fetch(`${API_BASE}/api/graph/${tenant}`);
      const data = await res.json();
      setGraphData({
        nodes: data.nodes || [],
        links: data.links || []
      });
    } catch (e) {
      console.error("Failed to fetch graph topology:", e);
    }
  };

  const handleSelectScenario = (sc) => {
    setPrompt(sc.prompt);
    setTargetFn(sc.targetFn);
    setEntryFn(sc.entryFn);
  };

  // =========================================================================
  // STREAMING AGENT INVESTIGATION VIA SSE
  // =========================================================================
  const runInvestigation = async () => {
    setLoading(true);
    setIsStreaming(true);
    setStreamingTrace([]);
    setLiveThinkingMessage("Initiating live ReAct agent stream...");
    setInvestigationResult(null);
    setPatchAppliedInfo(null);
    setShowLiveTrace(true);

    try {
      const response = await fetch(`${API_BASE}/api/investigate/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          function_name: targetFn,
          entrypoint_fn: entryFn,
          tenant_id: activeTenant,
          persist_new_memory: true
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream connection failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const event = JSON.parse(trimmed.slice(6));
              handleStreamEvent(event);
            } catch (err) {
              console.warn("Failed to parse SSE line:", trimmed, err);
            }
          }
        }
      }
    } catch (err) {
      console.error("Streaming investigation failed, falling back to standard endpoint:", err);
      // Fallback to standard investigate endpoint
      try {
        const fallbackRes = await fetch(`${API_BASE}/api/investigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt,
            function_name: targetFn,
            entrypoint_fn: entryFn,
            tenant_id: activeTenant,
            persist_new_memory: true
          })
        });
        const data = await fallbackRes.json();
        setInvestigationResult(data);
        setHighlightedNodes(new Set(data.all_highlighted_nodes || []));
      } catch (fallbackErr) {
        alert("Investigation failed. Please ensure FastAPI backend is running on port 8000.");
      }
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  const handleStreamEvent = (event) => {
    if (!event) return;

    if (event.type === "init") {
      setLiveThinkingMessage(event.message || "Connected to ReAct loop...");
    } else if (event.type === "turn_thinking") {
      setLiveTurn(event.turn || 1);
      setLiveThinkingMessage(event.message);
    } else if (event.type === "tool_start") {
      setLiveThinkingMessage(event.purpose || `Executing ${event.tool_name}...`);
      setStreamingTrace(prev => {
        const existingIdx = prev.findIndex(s => s.step === event.step);
        const item = {
          step: event.step,
          turn: event.turn || liveTurn,
          tool_name: event.tool_name,
          agent_name: event.agent_name,
          track_badge: event.track_badge,
          purpose: event.purpose,
          status: "running"
        };
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = item;
          return updated;
        }
        return [...prev, item];
      });
    } else if (event.type === "tool_complete") {
      setStreamingTrace(prev => prev.map(s => s.step === event.step ? {
        ...s,
        status: "done",
        result: event.result
      } : s));

      // Real-time canvas lighting: highlight nodes on graph as each tool executes!
      if (event.highlighted_nodes) {
        setHighlightedNodes(new Set(event.highlighted_nodes));
      }

      // Real-time evidence registry growth: add evidence item live!
      if (event.evidence_item) {
        setInvestigationResult(prev => {
          const currentEv = (prev && prev.evidence_registry) || [];
          const exists = currentEv.some(e => e.evidence_id === event.evidence_item.evidence_id);
          if (exists) return prev;
          return {
            ...(prev || {}),
            evidence_registry: [...currentEv, event.evidence_item]
          };
        });
      }

      // Real-time execution route preview
      if (event.execution_path) {
        setInvestigationResult(prev => ({
          ...(prev || {}),
          execution_path: event.execution_path
        }));
      }
    } else if (event.type === "synthesizing") {
      setLiveThinkingMessage(event.message || "Synthesizing findings...");
    } else if (event.type === "complete") {
      if (event.final_result) {
        setInvestigationResult(event.final_result);
        if (event.final_result.all_highlighted_nodes) {
          setHighlightedNodes(new Set(event.final_result.all_highlighted_nodes));
        }
      }
      setLiveThinkingMessage("Investigation complete!");
      setActiveTab("evidence");
    } else if (event.type === "error") {
      setLiveThinkingMessage(`Notice: ${event.message}`);
    }
  };

  const handleApplyPatch = async (commitMessage) => {
    if (!investigationResult?.patch) return;
    setPatchApplying(true);
    try {
      const res = await fetch(`${API_BASE}/api/patch/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant,
          file_path: investigationResult.patch.file_path,
          patch_diff: investigationResult.patch.diff,
          commit_message: commitMessage || investigationResult.patch.commit_message
        })
      });
      const data = await res.json();
      setPatchAppliedInfo(data);
      // Re-fetch graph topology to show newly committed node & finding
      fetchGraph(activeTenant);
    } catch (e) {
      alert("Failed to apply patch to repository.");
    } finally {
      setPatchApplying(false);
    }
  };

  const handleIngest = async (repoPathOrUrl, tenantId) => {
    setIsIngesting(true);
    setIngestStatus("Cloning/Parsing AST & Git commits into FalkorDB...");
    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_path_or_url: repoPathOrUrl,
          tenant_id: tenantId || activeTenant
        })
      });
      const data = await res.json();
      if (data.status === "ingested") {
        setIngestStatus("Success! Repository ingested into FalkorDB.");
        setActiveTenant(tenantId || activeTenant);
        fetchGraph(tenantId || activeTenant);
        fetchTenants();
      } else {
        setIngestStatus("Ingestion error occurred.");
      }
    } catch (err) {
      setIngestStatus("Connection failed to backend API.");
    } finally {
      setIsIngesting(false);
    }
  };

  const handleSelectNodeByName = (nodeName) => {
    if (!nodeName) return;
    setHighlightedNodes(prev => new Set([...prev, nodeName]));
    const found = graphData.nodes.find(n => 
      n.display_name === nodeName || 
      n.name === nodeName || 
      n.id === nodeName ||
      (n.file && n.file.includes(nodeName))
    );
    if (found) {
      setSelectedNode(found);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* ================= LEFT PANEL: INPUT BOX, OUTPUT & TABS ================= */}
      <div className="w-[560px] flex flex-col border-r border-slate-800 bg-slate-900/90 backdrop-blur-md z-10 shrink-0">
        
        {/* Top Header & Brand */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-br from-red-600/30 to-amber-600/20 border border-red-500/40 rounded-xl text-red-400 shadow-lg shadow-red-950/50">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-base tracking-tight text-white">ProofStack AI</h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-700/50 font-semibold">
                  FalkorDB
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Autonomous Graph Intelligence & Traceable Remediation</p>
            </div>
          </div>
          
          {/* Tenant Switcher */}
          <select 
            value={activeTenant} 
            onChange={(e) => setActiveTenant(e.target.value)}
            className="bg-slate-800/90 border border-slate-700 text-xs rounded-lg px-2.5 py-1 text-slate-200 outline-none focus:border-red-500 font-mono"
          >
            {tenants.map(t => <option key={t} value={t}>tenant: {t}</option>)}
          </select>
        </div>

        {/* Engine Status Banner */}
        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Engine:</span>
            {llmStatus?.engine_type === "azure_openai" ? (
              <span className="flex items-center space-x-1.5 text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Azure Foundry ({llmStatus.model})</span>
              </span>
            ) : llmStatus?.engine_type === "openai" ? (
              <span className="flex items-center space-x-1.5 text-blue-400 font-semibold bg-blue-950/40 px-2 py-0.5 rounded border border-blue-800/50">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                <span>OpenAI ({llmStatus.model})</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1.5 text-purple-400 font-semibold bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/50">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                <span>FalkorDB Autonomous Reasoner</span>
              </span>
            )}
          </div>
          <span className="text-slate-400 font-mono text-[10px] flex items-center space-x-1">
            <Database className="w-3 h-3 text-emerald-400" />
            <span>FalkorDB Connected</span>
          </span>
        </div>

        {/* Scrollable Container for Input Box, Output Panel, and Tabs */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          
          {/* ================= 1. BOX FOR THE INPUT ================= */}
          <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-900/40">
            
            {/* Quick Demo Scenarios */}
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Demo Incident Scenarios</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {SCENARIOS.map(sc => (
                  <button
                    key={sc.id}
                    onClick={() => handleSelectScenario(sc)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition text-left flex items-center space-x-1.5 ${
                      prompt === sc.prompt
                        ? "bg-red-950/50 border-red-500/70 text-red-200 shadow-sm"
                        : "bg-slate-800/70 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span>{sc.icon}</span>
                    <span className="font-medium">{sc.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Natural Language Prompt Area */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Incident Report / Agent Goal
                </label>
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)} 
                  className="text-[10px] text-red-400 hover:underline capitalize"
                >
                  {showAdvanced ? "Hide Symbol Inputs" : "Show Symbol Inputs"}
                </button>
              </div>
              <textarea 
                rows={2}
                value={prompt} 
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what to investigate or remediate in the codebase..."
                className="w-full mt-1.5 bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-red-500 outline-none leading-relaxed resize-none shadow-inner"
              />
            </div>

            {/* Advanced Target Inputs (Collapsible) */}
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-400">Target Function</label>
                  <input 
                    type="text" 
                    value={targetFn} 
                    onChange={(e) => setTargetFn(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:border-red-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-400">Entrypoint Function</label>
                  <input 
                    type="text" 
                    value={entryFn} 
                    onChange={(e) => setEntryFn(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:border-red-500 outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Run Investigation Action Button */}
            <button 
              onClick={runInvestigation}
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 active:scale-[0.99] transition text-white text-xs font-bold rounded-lg shadow-lg shadow-red-950/50 flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Streaming Agent Thinking & FalkorDB Cypher...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current text-amber-200" />
                  <span>Run Autonomous Graph Investigation (Live Stream)</span>
                </>
              )}
            </button>
          </div>

          {/* ================= LIVE REACT LOOP STREAM HUD ================= */}
          {(isStreaming || streamingTrace.length > 0) && (
            <div className="p-4 border-b border-slate-800 bg-slate-950/40">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center space-x-1.5">
                  <Terminal className="w-3 h-3 text-sky-400" />
                  <span>Agent ReAct Trace ({streamingTrace.length} Steps)</span>
                </span>
                <button
                  onClick={() => setShowLiveTrace(!showLiveTrace)}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  {showLiveTrace ? "Hide Stream HUD" : "Show Stream HUD"}
                </button>
              </div>

              {showLiveTrace && (
                <LiveReActStream 
                  streamingTrace={streamingTrace}
                  liveMessage={liveThinkingMessage}
                  liveTurn={liveTurn}
                  isComplete={!loading && investigationResult !== null}
                />
              )}
            </div>
          )}

          {/* ================= 2. OUTPUT PANEL (SYNTHESIS & PROVENANCE) ================= */}
          {investigationResult?.synthesis && (
            <div className="p-4 border-b border-slate-800 bg-slate-950/50">
              <OutputSummary 
                result={investigationResult}
                onSelectNode={handleSelectNodeByName}
                highlightedNodes={highlightedNodes}
              />
            </div>
          )}

          {/* ================= 3. NAVIGATION TABS (EVIDENCE | COMMIT | GIT URL) ================= */}
          <div className="flex border-b border-slate-800 bg-slate-950/80 text-xs font-medium sticky top-0 z-10 backdrop-blur">
            
            {/* Tab 1: Evidence Registry */}
            <button 
              onClick={() => setActiveTab("evidence")}
              className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1.5 ${
                activeTab === "evidence" 
                  ? "border-sky-500 text-sky-400 bg-slate-900/60 font-semibold" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Evidence Registry</span>
              {investigationResult?.evidence_registry && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-950 text-sky-300 border border-sky-800/40">
                  {investigationResult.evidence_registry.length}
                </span>
              )}
            </button>
            
            {/* Tab 2: Apply Commit */}
            <button 
              onClick={() => setActiveTab("commit")}
              className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1.5 ${
                activeTab === "commit" 
                  ? "border-emerald-500 text-emerald-400 bg-slate-900/60 font-semibold" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Apply Commit</span>
              {investigationResult?.patch && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              )}
            </button>

            {/* Tab 3: Git URL */}
            <button 
              onClick={() => setActiveTab("git_url")}
              className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1.5 ${
                activeTab === "git_url" 
                  ? "border-purple-500 text-purple-400 bg-slate-900/60 font-semibold" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Git URL</span>
            </button>
          </div>

          {/* ================= TAB CONTENTS ================= */}
          <div className="flex-1 p-4">
            
            {/* EVIDENCE REGISTRY TAB */}
            {activeTab === "evidence" && (
              <EvidenceRegistry 
                evidence={investigationResult?.evidence_registry || []}
                onSelectNode={handleSelectNodeByName}
                highlightedNodes={highlightedNodes}
              />
            )}

            {/* APPLY COMMIT TAB */}
            {activeTab === "commit" && (
              <ApplyCommitPanel 
                patch={investigationResult?.patch}
                onApplyPatch={handleApplyPatch}
                isApplying={patchApplying}
                appliedInfo={patchAppliedInfo}
              />
            )}

            {/* GIT URL TAB */}
            {activeTab === "git_url" && (
              <GitUrlPanel 
                onIngest={handleIngest}
                activeTenant={activeTenant}
                setActiveTenant={setActiveTenant}
                isIngesting={isIngesting}
                ingestStatus={ingestStatus}
              />
            )}

          </div>

        </div>

      </div>

      {/* ================= RIGHT PANEL: INTERACTIVE GRAPH CANVAS ================= */}
      <GraphCanvas 
        graphData={graphData}
        activeTenant={activeTenant}
        highlightedNodes={highlightedNodes}
        selectedNode={selectedNode}
        setSelectedNode={setSelectedNode}
      />

    </div>
  );
}
