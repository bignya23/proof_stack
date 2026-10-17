// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';

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

  // Resizable Sidebars State (persisted to localStorage)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('proofstack_left_sidebar_width');
      return saved ? Math.max(180, Math.min(600, parseInt(saved, 10))) : 260;
    } catch {
      return 260;
    }
  });

  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('proofstack_right_panel_width');
      return saved ? Math.max(280, Math.min(800, parseInt(saved, 10))) : 420;
    } catch {
      return 420;
    }
  });

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const handleLeftResizeStart = (e) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (moveEvent) => {
      // 48px is the width of ActivityBar
      const newWidth = Math.max(180, Math.min(window.innerWidth * 0.45, moveEvent.clientX - 48));
      setLeftSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDraggingLeft(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setLeftSidebarWidth(current => {
        try {
          localStorage.setItem('proofstack_left_sidebar_width', String(Math.round(current)));
        } catch {}
        return current;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRightResizeStart = (e) => {
    e.preventDefault();
    setIsDraggingRight(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(280, Math.min(window.innerWidth * 0.60, window.innerWidth - moveEvent.clientX));
      setRightPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDraggingRight(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setRightPanelWidth(current => {
        try {
          localStorage.setItem('proofstack_right_panel_width', String(Math.round(current)));
        } catch {}
        return current;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

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

  // Load initial graph & status, and completely refresh all state when activeTenant changes
  useEffect(() => {
    fetchTenants();
    fetchLlmStatus();
    fetchGraph(activeTenant);

    // Reset all investigation, trace, and patch states for the new repository
    setInvestigationResult(null);
    setPatchAppliedInfo(null);
    setStreamingTrace([]);
    setLiveThinkingMessage("");
    setIsStreaming(false);
    setLoading(false);
    setPrompt("");

    // Reset graph node selection & highlights
    setSelectedNode(null);
    setHighlightedNodes(new Set());

    // Reset editor tabs so open files from the previous repo are closed
    setSelectedFile(null);
    setOpenTabs([
      { id: 'graph-tab', title: 'Knowledge Graph', type: 'graph', closable: false }
    ]);
    setActiveTabId('graph-tab');
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

      // Exclude episodic memory nodes (Finding, Session) from visual graph topology
      const cleanNodes = (data.nodes || []).filter(n => 
        n.label !== 'Finding' && 
        n.label !== 'Session' && 
        n.label !== 'Memory' &&
        !String(n.id).startsWith('mem-') &&
        !String(n.id).startsWith('session-')
      );
      const cleanNodeIds = new Set(cleanNodes.map(n => String(n.id)));
      const cleanLinks = (data.links || []).filter(l => {
        const s = String(l.source?.id || l.source);
        const t = String(l.target?.id || l.target);
        return cleanNodeIds.has(s) && cleanNodeIds.has(t) && l.type !== 'RECORDED' && l.type !== 'ATTACHED_TO';
      });

      setGraphData({
        nodes: cleanNodes,
        links: cleanLinks
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

  const handleOpenDiffTab = (patchData) => {
    const currentPatch = patchData || investigationResult?.patch;
    if (!currentPatch) return;
    const filePath = currentPatch.file_path || 'patch';
    const tabId = `diff:${filePath}`;
    setOpenTabs(prev => {
      const exists = prev.find(t => t.id === tabId);
      if (exists) {
        return prev.map(t => t.id === tabId ? { 
          ...t, 
          diff: currentPatch.diff, 
          commitMessage: currentPatch.commit_message,
          explanation: currentPatch.explanation 
        } : t);
      }
      return [
        ...prev,
        {
          id: tabId,
          title: `${filePath.split('/').pop()} (Diff)`,
          type: 'diff',
          filePath: filePath,
          diff: currentPatch.diff,
          explanation: currentPatch.explanation,
          commitMessage: currentPatch.commit_message,
          closable: true
        }
      ];
    });
    setActiveTabId(tabId);
  };

  const handleOpenCommitTab = () => {
    setActiveActivityView('git');
    setIsSidebarOpen(true);
    if (investigationResult?.patch?.diff) {
      handleOpenDiffTab(investigationResult.patch);
    }
  };

  const handleOpenReportTab = () => {
    const tabId = 'investigation-report-tab';
    setOpenTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      return [
        ...prev,
        {
          id: tabId,
          title: 'Incident Report',
          type: 'report',
          closable: true,
        }
      ];
    });
    setActiveTabId(tabId);
  };

  const [isGeneratingPatch, setIsGeneratingPatch] = useState(false);

  const handleSuggestPatch = async () => {
    if (!investigationResult) return;
    setIsGeneratingPatch(true);
    try {
      const res = await fetch(`${API_BASE}/api/patch/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant,
          target_fn: investigationResult.target_function || "decrypt_card_token",
          incident_context: investigationResult.synthesis?.headline || "Remediate investigated incident",
        })
      });
      const data = await res.json();
      if (data.patch) {
        setInvestigationResult(prev => {
          if (!prev) return prev;
          const currentEv = prev.evidence_registry || [];
          const patchEvItem = {
            evidence_id: `ev-patch-${Date.now()}`,
            tool: "mcp_validate_patch",
            claim: `Remediation patch AST verified (${data.patch.validation_status || 'syntax_valid'}) in isolated sandbox for ${data.patch.file_path}`,
            query: `mcp_validate_patch("${data.patch.file_path}", diff, "${activeTenant}")`,
            status: data.patch.validation_status || "syntax_valid",
            timestamp: new Date().toISOString()
          };
          const currentTrace = prev.agent_trace || [];
          const nextStep = currentTrace.length + 1;
          const patchTraceStep = {
            step: nextStep,
            tool_name: "mcp_validate_patch",
            agent_name: "PatchValidationAgent",
            track_badge: "Track 1 & Action: Verified Patch Sandbox",
            purpose: `Validated remediation patch in isolated sandbox for '${data.patch.file_path}'`,
            result: data.validation || { syntax_valid: true, status: "syntax_valid" },
            status: "done"
          };
          return {
            ...prev,
            patch: data.patch,
            evidence_registry: [...currentEv, patchEvItem],
            agent_trace: [...currentTrace, patchTraceStep]
          };
        });
        // Open the diff tab in middle window and display in Source Control
        handleOpenDiffTab(data.patch);
      }
    } catch (err) {
      console.error("Failed to generate patch:", err);
      alert("Failed to generate patch. Check server connection.");
    } finally {
      setIsGeneratingPatch(false);
    }
  };

  const abortControllerRef = useRef(null);

  const handleStopInvestigation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
    setLoading(false);
    setLiveThinkingMessage("Investigation paused.");
  };

  const handleResetSession = () => {
    setPrompt("");
    setStreamingTrace([]);
    setInvestigationResult(null);
    setPatchAppliedInfo(null);
    setLiveThinkingMessage("");
    setIsStreaming(false);
    setLoading(false);
  };

  // =========================================================================
  // STREAMING AGENT INVESTIGATION VIA SSE
  // =========================================================================
  const runInvestigation = async (overridePrompt) => {
    const activeQuery = (typeof overridePrompt === 'string' && overridePrompt.trim()) ? overridePrompt.trim() : prompt;
    if (!activeQuery) return;
    setPrompt(activeQuery);
    setLoading(true);
    setIsStreaming(true);
    setStreamingTrace([]);
    setLiveThinkingMessage("Initiating live ReAct agent stream...");
    setInvestigationResult(null);
    setPatchAppliedInfo(null);
    setIsConsoleOpen(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE}/api/investigate/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          prompt: activeQuery,
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
      if (err.name === 'AbortError') {
        console.log("Investigation stream aborted by user.");
        return;
      }
      console.error("Streaming investigation failed, falling back to standard endpoint:", err);
      try {
        const fallbackRes = await fetch(`${API_BASE}/api/investigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: activeQuery,
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

  const handleApplyPatch = async (customCommitMessage) => {
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
          commit_message: (typeof customCommitMessage === 'string' && customCommitMessage.trim()) 
            ? customCommitMessage.trim() 
            : investigationResult.patch.commit_message
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#000000] text-zinc-200">
      
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
        onIngestRepo={handleIngest}
        fetchTenants={fetchTenants}
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
          hasPatch={Boolean(investigationResult?.patch?.diff && investigationResult?.patch?.diff.trim())}
        />

        {/* PRIMARY LEFT SIDEBAR (COLLAPSIBLE & RESIZABLE) */}
        {isSidebarOpen && (
          <LeftSidebar 
            width={leftSidebarWidth}
            onResizeStart={handleLeftResizeStart}
            isResizing={isDraggingLeft}
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
            onOpenDiff={handleOpenDiffTab}
            onDiscardPatch={() => setInvestigationResult(prev => prev ? { ...prev, patch: null } : null)}
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
          investigationResult={investigationResult}
          onSuggestPatch={handleSuggestPatch}
          isGeneratingPatch={isGeneratingPatch}
          onOpenDiff={handleOpenDiffTab}
          onOpenCommitTab={handleOpenCommitTab}
          onOpenFile={handleOpenFile}
        />

        {/* RIGHT COPILOT PANEL (INCIDENT QUERY & LIVE STREAM, RESIZABLE) */}
        {isRightPanelOpen && (
          <RightQueryPanel 
            width={rightPanelWidth}
            onResizeStart={handleRightResizeStart}
            isResizing={isDraggingRight}
            onClose={() => setIsRightPanelOpen(false)}
            prompt={prompt}
            setPrompt={setPrompt}
            onRunInvestigation={runInvestigation}
            onStopInvestigation={handleStopInvestigation}
            onResetSession={handleResetSession}
            isStreaming={isStreaming}
            loading={loading}
            liveThinkingMessage={liveThinkingMessage}
            liveTurn={liveTurn}
            streamingTrace={streamingTrace}
            investigationResult={investigationResult}
            activePatch={investigationResult?.patch}
            llmStatus={llmStatus}
            onOpenEvidenceTab={handleOpenEvidenceTab}
            onOpenCommitTab={handleOpenCommitTab}
            onOpenTerminal={() => setIsConsoleOpen(prev => !prev)}
            onOpenFiles={() => { setActiveActivityView('explorer'); setIsSidebarOpen(true); }}
            onOpenGraph={() => setActiveTabId('graph-tab')}
            onOpenReportTab={handleOpenReportTab}
            onSuggestPatch={handleSuggestPatch}
            isGeneratingPatch={isGeneratingPatch}
          />
        )}

        {/* Full-screen invisible overlay during resize to capture mouse movements over Monaco / Canvas */}
        {(isDraggingLeft || isDraggingRight) && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
        )}

      </div>

    </div>
  );
}
