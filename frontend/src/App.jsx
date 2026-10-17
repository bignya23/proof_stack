// src/App.jsx
import React, { useState, useEffect } from 'react';

import TopNavbar from './components/TopNavbar';
import ActivityBar from './components/ActivityBar';
import LeftSidebar from './components/LeftSidebar';
import CentralWorkspace from './components/CentralWorkspace';
import RightQueryPanel from './components/RightQueryPanel';

const API_BASE = "http://localhost:8000";

const DEFAULT_PROMPT = "Checkout is failing with 504 Gateway Timeouts under flash-sale load. Investigate decrypt_card_token, consult past team findings, and propose an actionable code patch.";

export default function App() {
  const [tenants, setTenants] = useState(["sample-fintech"]);
  const [activeTenant, setActiveTenant] = useState("sample-fintech");
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [llmStatus, setLlmStatus] = useState(null);

  // VS Code Navigation & Layout States
  const [activeActivityView, setActiveActivityView] = useState('explorer'); // 'explorer' | 'git' | 'graph' | 'evidence' | 'ingest'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Central Workspace Editor Tabs
  const [openTabs, setOpenTabs] = useState([
    { id: 'graph-tab', title: 'Graph Canvas', type: 'graph', closable: false }
  ]);
  const [activeTabId, setActiveTabId] = useState('graph-tab');
  const [selectedFile, setSelectedFile] = useState(null);

  // Agent State & Results
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [investigationResult, setInvestigationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);

  // Live SSE Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingTrace, setStreamingTrace] = useState([]);
  const [liveThinkingMessage, setLiveThinkingMessage] = useState("");
  const [liveTurn, setLiveTurn] = useState(1);

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

  // =========================================================================
  // VS CODE TAB & FILE SELECTION LOGIC
  // =========================================================================
  const handleOpenFile = (fileNode, targetLine = null, symbolName = null) => {
    if (!fileNode || fileNode.type === 'directory') return;
    setSelectedFile(fileNode);

    const tabId = `file:${fileNode.path}`;
    setOpenTabs(prev => {
      const exists = prev.find(t => t.id === tabId);
      if (exists) {
        return prev.map(t => t.id === tabId ? { ...t, targetLine } : t);
      }
      return [
        ...prev,
        {
          id: tabId,
          title: fileNode.name,
          type: 'file',
          path: fileNode.path,
          targetLine,
          closable: true
        }
      ];
    });
    setActiveTabId(tabId);

    // If a symbol was clicked, highlight it on the graph as well
    if (symbolName) {
      handleSelectNodeByName(symbolName);
    }
  };

  const handleCloseTab = (tabId) => {
    setOpenTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        const last = filtered[filtered.length - 1];
        setActiveTabId(last ? last.id : 'graph-tab');
      }
      return filtered;
    });
  };

  const handleSelectGraphNode = (node) => {
    if (!node) return;
    setActiveTabId('graph-tab');
    setSelectedNode(node);
    setHighlightedNodes(prev => new Set([...prev, node.name || node.display_name || node.id]));
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

  const handleOpenEvidenceTab = () => {
    const tabId = 'evidence-tab';
    setOpenTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      return [
        ...prev,
        { id: tabId, title: 'Evidence Registry', type: 'evidence', closable: true }
      ];
    });
    setActiveTabId(tabId);
  };

  const handleOpenCommitTab = () => {
    setActiveActivityView('git');
    setIsSidebarOpen(true);
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
    setIsConsoleOpen(true); // Automatically open bottom console to show live turns

    try {
      const response = await fetch(`${API_BASE}/api/investigate/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
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
      try {
        const fallbackRes = await fetch(`${API_BASE}/api/investigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt,
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

      // Real-time canvas lighting: highlight nodes on graph as each tool executes
      if (event.highlighted_nodes) {
        setHighlightedNodes(new Set(event.highlighted_nodes));
      }

      // Real-time evidence registry growth
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
    } else if (event.type === "error") {
      setLiveThinkingMessage(`Notice: ${event.message}`);
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
      // Re-fetch graph topology to reflect newly committed finding
      fetchGraph(activeTenant);
    } catch (e) {
      alert("Failed to apply patch to repository.");
    } finally {
      setPatchApplying(false);
    }
  };

  const handleIngest = async (repoPathOrUrl, tenantId) => {
    setIsIngesting(true);
    setIngestStatus("Parsing AST & Git commits into FalkorDB...");
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
      }
    } catch (e) {
      setIngestStatus("Ingestion error. Check repository path or URL.");
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#060911] text-slate-200">
      
      {/* 1. TOP GLOBAL NAVBAR */}
      <TopNavbar 
        activeTenant={activeTenant}
        tenants={tenants}
        setActiveTenant={setActiveTenant}
        llmStatus={llmStatus}
        graphData={graphData}
        isRightPanelOpen={isRightPanelOpen}
        setIsRightPanelOpen={setIsRightPanelOpen}
        isStreaming={isStreaming}
      />

      {/* 2. MAIN APPLICATION WORKBENCH */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* SLIM 48px ACTIVITY BAR */}
        <ActivityBar 
          activeView={activeActivityView}
          setActiveView={setActiveActivityView}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          isConsoleOpen={isConsoleOpen}
          setIsConsoleOpen={setIsConsoleOpen}
          evidenceCount={investigationResult?.evidence_registry?.length || 0}
          hasPatch={Boolean(investigationResult?.patch)}
        />

        {/* PRIMARY LEFT SIDEBAR (COLLAPSIBLE) */}
        {isSidebarOpen && (
          <LeftSidebar 
            activeView={activeActivityView}
            activeTenant={activeTenant}
            onOpenFile={handleOpenFile}
            selectedFile={selectedFile}
            onSelectGraphNode={handleSelectGraphNode}
            graphData={graphData}
            highlightedNodes={highlightedNodes}
            evidenceList={investigationResult?.evidence_registry || []}
            onSelectEvidence={handleSelectNodeByName}
            patch={investigationResult?.patch}
            onApplyPatch={handleApplyPatch}
            isApplyingPatch={patchApplying}
            appliedInfo={patchAppliedInfo}
            onIngest={handleIngest}
            isIngesting={isIngesting}
            ingestStatus={ingestStatus}
          />
        )}

        {/* CENTRAL SCREEN (MONACO EDITOR + GRAPH CANVAS + BOTTOM TERMINAL DRAWER) */}
        <CentralWorkspace 
          activeTenant={activeTenant}
          graphData={graphData}
          highlightedNodes={highlightedNodes}
          executionPath={investigationResult?.execution_path}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          openTabs={openTabs}
          activeTabId={activeTabId}
          setActiveTabId={setActiveTabId}
          onCloseTab={handleCloseTab}
          evidenceList={investigationResult?.evidence_registry || []}
          onSelectNodeByName={handleSelectNodeByName}
          isStreaming={isStreaming}
          streamingTrace={streamingTrace}
          liveThinkingMessage={liveThinkingMessage}
          liveTurn={liveTurn}
          isConsoleOpen={isConsoleOpen}
          setIsConsoleOpen={setIsConsoleOpen}
          activePatch={investigationResult?.patch}
        />

        {/* RIGHT COPILOT PANEL (INCIDENT QUERY & LIVE STREAM) */}
        {isRightPanelOpen && (
          <RightQueryPanel 
            onClose={() => setIsRightPanelOpen(false)}
            prompt={prompt}
            setPrompt={setPrompt}
            onRunInvestigation={runInvestigation}
            isStreaming={isStreaming}
            loading={loading}
            liveThinkingMessage={liveThinkingMessage}
            liveTurn={liveTurn}
            streamingTrace={streamingTrace}
            investigationResult={investigationResult}
            onOpenEvidenceTab={handleOpenEvidenceTab}
            onOpenCommitTab={handleOpenCommitTab}
          />
        )}

      </div>

    </div>
  );
}
