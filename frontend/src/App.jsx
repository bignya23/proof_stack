// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { 
  Network, Play, Database, ShieldAlert, Cpu, GitCommit, 
  Terminal, Layers, RefreshCw, CheckCircle2, ChevronRight, Zap, 
  BookOpen, GitPullRequest, Code, FileText, Sparkles, Check, 
  ArrowRight, UserCheck, AlertTriangle, ExternalLink
} from 'lucide-react';

const API_BASE = "http://localhost:8000";

const SCENARIOS = [
  {
    id: "timeout-504",
    title: "504 Timeout Triage & Patch",
    prompt: "Checkout is failing with 504 Gateway Timeouts under flash-sale load. Investigate decrypt_card_token, consult past team findings, and propose an actionable code patch.",
    targetFn: "decrypt_card_token",
    entryFn: "post_checkout_endpoint",
    icon: "⚡"
  },
  {
    id: "blast-radius",
    title: "Blast Radius & PageRank Audit",
    prompt: "Security audit requested: If fetch_signing_key rotates its key format, calculate the complete upstream blast radius and rank systemic risk with FalkorDB PageRank.",
    targetFn: "fetch_signing_key",
    entryFn: "post_checkout_endpoint",
    icon: "🔍"
  },
  {
    id: "company-brain",
    title: "Company Brain & ADR Provenance",
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
  const [targetFn, setTargetFn] = useState("decrypt_card_token");
  const [entryFn, setEntryFn] = useState("post_checkout_endpoint");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Agent State & Results
  const [investigationResult, setInvestigationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [activeTab, setActiveTab] = useState("trace"); // "trace" | "patch" | "cypher" | "ingest"
  const [llmStatus, setLlmStatus] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  // 1-Click Patch Application State
  const [patchApplying, setPatchApplying] = useState(false);
  const [patchAppliedInfo, setPatchAppliedInfo] = useState(null);

  // Ingestion State
  const [ingestInput, setIngestInput] = useState("./sample_fintech_repo");
  const [ingestStatus, setIngestStatus] = useState("");

  const fgRef = useRef();

  // Load initial data
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
      console.error("Failed to fetch tenants:", e);
    }
  };

  const fetchLlmStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/llm/status`);
      const data = await res.json();
      setLlmStatus(data);
    } catch (e) {
      console.error("Failed to fetch LLM status:", e);
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

  const runInvestigation = async () => {
    setLoading(true);
    setInvestigationResult(null);
    setPatchAppliedInfo(null);
    try {
      const res = await fetch(`${API_BASE}/api/agent/investigate`, {
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
      const data = await res.json();
      setInvestigationResult(data);
      
      // Update highlighted nodes on graph canvas
      const highlights = new Set(data.all_highlighted_nodes || []);
      setHighlightedNodes(highlights);

      // If patch generated, switch or make patch tab prominent
      if (data.patch) {
        // Auto-switch to trace or patch depending on user interest
      }
    } catch (e) {
      alert("Investigation failed. Ensure FastAPI backend is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPatch = async () => {
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
          commit_message: investigationResult.patch.commit_message
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

  const handleIngest = async (e) => {
    e.preventDefault();
    setIngestStatus("Cloning/Parsing AST & Git commits into FalkorDB...");
    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_path_or_url: ingestInput,
          tenant_id: activeTenant
        })
      });
      const data = await res.json();
      if (data.status === "ingested") {
        setIngestStatus("Success! Graph updated.");
        fetchGraph(activeTenant);
      } else {
        setIngestStatus("Ingestion error occurred.");
      }
    } catch (err) {
      setIngestStatus("Connection failed.");
    }
  };

  // Custom node rendering on Force Graph Canvas
  const paintNode = (node, ctx, globalScale) => {
    const isHighlighted = highlightedNodes.has(node.display_name) || highlightedNodes.has(node.name) || highlightedNodes.has(node.id);
    const radius = isHighlighted ? 8 : 5;

    let color = "#3b82f6"; // default blue
    if (node.label === "Function") color = isHighlighted ? "#ef4444" : "#60a5fa";
    if (node.label === "Module") color = "#10b981";
    if (node.label === "Engineer") color = "#f59e0b";
    if (node.label === "Commit") color = "#8b5cf6";
    if (node.label === "Finding") color = "#ec4899";
    if (node.label === "Session") color = "#64748b";

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();

    // Traversed path halo
    if (isHighlighted) {
      ctx.lineWidth = 2.5 / globalScale;
      ctx.strokeStyle = "#fbbf24"; // Neon gold halo ring
      ctx.stroke();

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI, false);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
    }

    // Label text
    const label = node.display_name || node.name || node.id;
    const fontSize = 11 / globalScale;
    ctx.font = `${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = isHighlighted ? "#f8fafc" : "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(label, node.x, node.y + radius + fontSize + 2);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* ================= LEFT SIDEBAR: AGENT HUD & CONTROLS ================= */}
      <div className="w-[520px] flex flex-col border-r border-slate-800 bg-slate-900/90 backdrop-blur-md z-10">
        
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-br from-red-600/30 to-amber-600/20 border border-red-500/40 rounded-xl text-red-400 shadow-lg shadow-red-950/50">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-base tracking-tight text-white">NexusGraph AI</h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-800/40 font-semibold">
                  Track 1
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Autonomous Connected-Data Agent & Company Brain</p>
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
        <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Active Engine:</span>
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
          <span className="text-slate-500 font-mono text-[10px]">FastMCP: 7 Tools</span>
        </div>

        {/* Incident Prompt & Preset Chips */}
        <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-900/40">
          
          {/* Quick Scenario Chips */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Demo Incident Scenarios</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {SCENARIOS.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => handleSelectScenario(sc)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition text-left flex items-center space-x-1.5 ${
                    prompt === sc.prompt
                      ? "bg-red-950/40 border-red-500/60 text-red-200 shadow-sm"
                      : "bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white"
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
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center justify-between">
              <span>Agent Prompt / Incident Goal</span>
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)} 
                className="text-[10px] text-red-400 hover:underline capitalize"
              >
                {showAdvanced ? "Hide Symbol Inputs" : "Show Symbol Inputs"}
              </button>
            </label>
            <textarea 
              rows={2}
              value={prompt} 
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what to investigate or fix..."
              className="w-full mt-1.5 bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-red-500 outline-none leading-relaxed resize-none"
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
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current text-amber-200" />}
            <span>{loading ? "Agent Reasoner Executing Dynamic MCP Tools..." : "Run Multi-Agent Investigation"}</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 text-xs font-medium">
          <button 
            onClick={() => setActiveTab("trace")}
            className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1.5 ${
              activeTab === "trace" 
                ? "border-red-500 text-red-400 bg-slate-900/60" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Agent Trace</span>
            {investigationResult?.agent_trace && (
              <span className="text-[10px] font-mono px-1 rounded-full bg-slate-800 text-slate-300">
                {investigationResult.agent_trace.length}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => setActiveTab("patch")}
            className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1.5 ${
              activeTab === "patch" 
                ? "border-red-500 text-red-400 bg-slate-900/60" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>Code Patch</span>
            {investigationResult?.patch && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab("cypher")}
            className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1.5 ${
              activeTab === "cypher" 
                ? "border-red-500 text-red-400 bg-slate-900/60" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Cypher Inspector</span>
          </button>

          <button 
            onClick={() => setActiveTab("ingest")}
            className={`flex-1 py-2.5 text-center border-b-2 transition flex items-center justify-center space-x-1.5 ${
              activeTab === "ingest" 
                ? "border-red-500 text-red-400 bg-slate-900/60" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Ingest</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* ================= TAB 1: AGENT TRACE ================= */}
          {activeTab === "trace" && (
            <div>
              {!investigationResult ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
                  <div className="p-3 bg-slate-800/40 rounded-full border border-slate-700/50">
                    <Sparkles className="w-6 h-6 text-slate-500" />
                  </div>
                  <p className="text-xs max-w-xs">
                    Click <strong className="text-slate-300">Run Multi-Agent Investigation</strong> above. The agent will dynamically invoke FastMCP tools on FalkorDB and synthesize a solution.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Synthesis Headline Banner */}
                  <div className="p-3.5 bg-gradient-to-r from-red-950/40 to-slate-900/80 border border-red-500/40 rounded-xl space-y-2 shadow-lg">
                    <div className="flex items-center justify-between text-xs font-semibold text-red-400">
                      <div className="flex items-center space-x-1.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>Synthesized Root Cause & Action Plan</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950/80 text-amber-300 border border-red-700/50">
                        {investigationResult.synthesis?.governing_adr || "ADR-042"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-100 leading-relaxed font-medium">
                      {investigationResult.synthesis?.headline}
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-red-500/20 text-[11px]">
                      <div>
                        <span className="text-slate-400">Primary Owner: </span>
                        <strong className="text-slate-200">{investigationResult.synthesis?.primary_owner || "Aarav Mehta"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Callers Impacted: </span>
                        <strong className="text-amber-400">{investigationResult.synthesis?.upstream_blast_count || 5} Functions</strong>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 pt-1.5 border-t border-red-500/20 leading-relaxed">
                      💡 <strong className="text-amber-200">Action:</strong> {investigationResult.synthesis?.action_plan}
                    </p>
                  </div>

                  {/* Dynamic Tool Trace List */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Dynamic MCP Tool Execution Trace ({investigationResult.agent_trace?.length || 0} Steps)
                      </h3>
                      <span className="text-[10px] text-slate-500 font-mono">{investigationResult.engine_label}</span>
                    </div>

                    {investigationResult.agent_trace?.map((step) => (
                      <div key={step.step} className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2 hover:border-slate-700 transition">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-amber-400 border border-slate-800 font-semibold">
                            {step.track_badge}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Step 0{step.step}</span>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-slate-100 flex items-center space-x-1.5">
                            <span className="text-emerald-400 font-mono">tool:</span>
                            <span className="font-mono text-white">{step.tool_name || step.agent_name}</span>
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">{step.purpose}</p>
                        </div>

                        {/* Result highlights summary */}
                        {step.result && (
                          <div className="pt-1 text-[10px] font-mono text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-800/80 space-y-0.5">
                            {step.result.memories_found !== undefined && (
                              <div>Recalled {step.result.memories_found} memory findings in FalkorDB</div>
                            )}
                            {step.result.total_impacted_functions !== undefined && (
                              <div>Impacted Callers: {step.result.total_impacted_functions} upstream nodes</div>
                            )}
                            {step.result.commits_traced !== undefined && (
                              <div>Commits Traced: {step.result.commits_traced} Git revisions with ADR rationale</div>
                            )}
                            {step.result.hop_distance !== undefined && (
                              <div>Shortest Execution Route: {step.result.hop_distance} hops</div>
                            )}
                            {step.result.top_hotspots && (
                              <div>Top Centrality Hotspot: {step.result.top_hotspots[0]?.function_name} (Risk: {step.result.top_hotspots[0]?.systemic_risk_score})</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: CODE PATCH & 1-CLICK ACTION ================= */}
          {activeTab === "patch" && (
            <div className="space-y-4">
              {!investigationResult?.patch ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
                  <GitPullRequest className="w-8 h-8 text-slate-600" />
                  <p className="text-xs">
                    Run an investigation to have the agent inspect code and generate an actionable unified git diff.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  
                  {/* Patch Header */}
                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Code className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white font-mono">
                          {investigationResult.patch.file_path}
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 font-semibold font-mono">
                        Ready to Apply
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {investigationResult.patch.explanation}
                    </p>
                    <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 font-mono">
                      Commit msg: <span className="text-slate-200">{investigationResult.patch.commit_message}</span>
                    </div>
                  </div>

                  {/* ProofStack Diff Str Checker Badge */}
                  {investigationResult.patch.validation && (
                    <div className={`p-3 rounded-xl border text-xs font-mono space-y-2 shadow-sm ${
                      investigationResult.patch.validation.syntax_valid
                        ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                        : "bg-amber-950/30 border-amber-500/40 text-amber-200"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Diff Str Checker: {investigationResult.patch.validation.status}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 font-bold">
                            +{investigationResult.patch.validation.lines_added}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700/50 font-bold">
                            -{investigationResult.patch.validation.lines_deleted}
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1 border-t border-slate-800">
                        <span>AST Proof: {investigationResult.patch.validation.message}</span>
                        <span className="text-slate-400 font-sans text-[10px]">Target: {investigationResult.patch.validation.target_file}</span>
                      </div>
                    </div>
                  )}

                  {/* Unified Diff Preview */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unified Git Diff</label>
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] overflow-x-auto leading-relaxed">
                      {investigationResult.patch.diff.split('\n').map((line, idx) => {
                        let lineStyle = "text-slate-400";
                        if (line.startsWith("+")) lineStyle = "text-emerald-400 bg-emerald-950/40 px-1 py-0.5 rounded block";
                        else if (line.startsWith("-")) lineStyle = "text-rose-400 bg-rose-950/40 px-1 py-0.5 rounded block line-through";
                        else if (line.startsWith("@")) lineStyle = "text-blue-400 font-bold block";
                        return (
                          <div key={idx} className={lineStyle}>
                            {line || " "}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 1-Click Apply Patch & Commit Action Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleApplyPatch}
                      disabled={patchApplying || patchAppliedInfo !== null}
                      className={`w-full py-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition shadow-lg ${
                        patchAppliedInfo
                          ? "bg-emerald-600 text-white cursor-default"
                          : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white active:scale-[0.99] shadow-emerald-950/50"
                      }`}
                    >
                      {patchApplying ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Applying Patch & Creating Git Commit...</span>
                        </>
                      ) : patchAppliedInfo ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>Committed to Main (SHA: {patchAppliedInfo.commit_sha})</span>
                        </>
                      ) : (
                        <>
                          <GitCommit className="w-4 h-4" />
                          <span>Apply Patch & Commit to Git Repository</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Commit Confirmation Card */}
                  {patchAppliedInfo && (
                    <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-1.5 animate-fadeIn">
                      <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-bold">
                        <Check className="w-4 h-4" />
                        <span>Action Successfully Applied & Recorded in Graph</span>
                      </div>
                      <p className="text-xs text-slate-200">
                        File <code className="text-emerald-300 font-mono">{patchAppliedInfo.file_path}</code> was updated, committed to branch <code className="text-emerald-300 font-mono">main</code> with SHA <strong className="text-white font-mono">{patchAppliedInfo.commit_sha}</strong>, and attached to resolved finding <code className="text-pink-400 font-mono">{patchAppliedInfo.finding_id}</code> in FalkorDB!
                      </p>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: CYPHER INSPECTOR ================= */}
          {activeTab === "cypher" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                FalkorDB executes these parameterized Cypher traversals and native GraphBLAS algorithms directly during dynamic agent tool invocations:
              </p>
              {!investigationResult ? (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-500">
                  // Run an investigation to inspect live executed Cypher queries...
                </div>
              ) : (
                investigationResult.agent_trace?.map((step, idx) => (
                  <div key={idx} className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold">{step.tool_name || step.agent_name} Cypher:</span>
                    <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                      {step.result?.cypher_executed || step.result?.pagerank?.cypher_executed || step.result?.shortest_path?.cypher_executed || "// Handled via graph storage"}
                    </pre>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================= TAB 4: INGEST REPO ================= */}
          {activeTab === "ingest" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-200">Live Codebase Ingestion</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ingest any local folder path or public GitHub URL. FalkorDB parses AST function call graphs and Git commits with [ADR-xxx] tags.
                </p>
              </div>
              <form onSubmit={handleIngest} className="space-y-3">
                <input 
                  type="text" 
                  value={ingestInput}
                  onChange={(e) => setIngestInput(e.target.value)}
                  placeholder="./sample_fintech_repo or https://github.com/..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-red-500 outline-none font-mono"
                />
                <button 
                  type="submit"
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition"
                >
                  Ingest Repository into FalkorDB
                </button>
              </form>
              {ingestStatus && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 font-mono">
                  {ingestStatus}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ================= RIGHT MAIN AREA: INTERACTIVE GRAPH CANVAS ================= */}
      <div className="flex-1 relative bg-slate-950 flex flex-col">
        
        {/* Top Floating Badge */}
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-3 bg-slate-900/90 backdrop-blur border border-slate-800 px-3.5 py-2 rounded-xl shadow-2xl">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-mono text-slate-300">
            FalkorDB Namespace: <strong className="text-white">repo:{activeTenant}</strong>
          </span>
          <span className="text-xs text-slate-600">|</span>
          <span className="text-xs text-slate-400 font-mono">
            {graphData.nodes.length} Nodes, {graphData.links.length} Edges
          </span>
        </div>

        {/* Selected Node Tooltip Card */}
        {selectedNode && (
          <div className="absolute top-4 right-4 z-10 bg-slate-900/95 backdrop-blur border border-slate-700 p-3.5 rounded-xl shadow-2xl max-w-xs space-y-1.5 text-xs">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <span className="font-mono text-red-400 font-bold">{selectedNode.label}</span>
              <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="font-bold text-white text-sm font-mono">{selectedNode.display_name}</div>
            {selectedNode.file && <div className="text-[11px] text-slate-400 font-mono">File: {selectedNode.file}</div>}
            {selectedNode.message && <div className="text-[11px] text-slate-300">{selectedNode.message}</div>}
            {selectedNode.decision_tag && <div className="text-[11px] text-amber-300 font-mono font-semibold">{selectedNode.decision_tag}</div>}
            {selectedNode.summary && <div className="text-[11px] text-pink-300">{selectedNode.summary}</div>}
          </div>
        )}

        {/* Schema Legend */}
        <div className="absolute bottom-4 right-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-800 p-3.5 rounded-xl shadow-2xl space-y-1.5 text-[11px]">
          <div className="font-bold text-slate-300 pb-1 border-b border-slate-800 flex items-center justify-between">
            <span>Graph Schema Legend</span>
            <span className="text-[10px] text-slate-500 font-mono">FalkorDB</span>
          </div>
          <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span><span className="text-slate-300">Function (AST Code)</span></div>
          <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span className="text-slate-300">Module (Python File)</span></div>
          <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span className="text-slate-300">Engineer (Owner)</span></div>
          <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span><span className="text-slate-300">Git Commit (ADR/INC)</span></div>
          <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span><span className="text-slate-300">Finding (Episodic Memory)</span></div>
          <div className="flex items-center space-x-2 pt-1 border-t border-slate-800"><span className="w-2.5 h-2.5 rounded-full border border-amber-400 bg-red-500"></span><span className="text-amber-300 font-semibold">Traversed Path Hop</span></div>
        </div>

        {/* Force Directed Graph Canvas */}
        <div className="flex-1 cursor-grab active:cursor-grabbing">
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeId="id"
            nodeLabel={node => `${node.label}: ${node.display_name}`}
            nodeCanvasObject={paintNode}
            onNodeClick={(node) => setSelectedNode(node)}
            linkColor={() => "rgba(100, 116, 139, 0.25)"}
            linkWidth={1.5}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.008}
          />
        </div>

      </div>

    </div>
  );
}
