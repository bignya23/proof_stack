// src/components/CentralWorkspace.jsx
import React, { useRef, useState, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { 
  Network, FileCode, Database, X, ChevronUp, 
  ChevronDown, Terminal, RefreshCw, CircleCheck, GitPullRequest 
} from 'lucide-react';

import GraphCanvas from './GraphCanvas';
import EvidenceRegistry from './EvidenceRegistry';
import LiveReActStream from './LiveReActStream';

const API_BASE = "http://localhost:8000";

export default function CentralWorkspace({
  activeTenant,
  graphData,
  highlightedNodes,
  executionPath,
  selectedNode,
  setSelectedNode,
  openTabs = [],
  activeTabId,
  setActiveTabId,
  onCloseTab,
  // Evidence
  evidenceList = [],
  onSelectNodeByName,
  // Live ReAct Stream State
  isStreaming,
  streamingTrace = [],
  liveThinkingMessage = "",
  liveTurn = 1,
  // Console Drawer
  isConsoleOpen,
  setIsConsoleOpen,
  // Patch
  activePatch = null
}) {
  const [fileContent, setFileContent] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [highlightLine, setHighlightLine] = useState(null);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  // Active tab object
  const activeTab = openTabs.find(t => t.id === activeTabId) || openTabs[0];

  // Fetch file content when active tab is a file
  useEffect(() => {
    if (activeTab && activeTab.type === 'file') {
      fetchFileContent(activeTab.path);
      if (activeTab.targetLine) {
        setHighlightLine(activeTab.targetLine);
      }
    }
  }, [activeTabId]);

  const fetchFileContent = async (filePath) => {
    setFileLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/repositories/${activeTenant}/files?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setFileContent(data);
    } catch (e) {
      console.error("Failed to fetch file content:", e);
    } finally {
      setFileLoading(false);
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (highlightLine) {
      scrollToLine(highlightLine);
    }
  };

  const scrollToLine = (lineNum) => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    editor.revealLineInCenter(lineNum);
    editor.setPosition({ lineNumber: lineNum, column: 1 });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(lineNum, 1, lineNum, 1),
        options: {
          isWholeLine: true,
          className: 'bg-blue-500/20 border-l-4 border-blue-400',
          glyphMarginClassName: 'bg-blue-400'
        }
      }
    ]);
  };

  useEffect(() => {
    if (highlightLine && editorRef.current) {
      scrollToLine(highlightLine);
    }
  }, [highlightLine, fileContent]);

  return (
    <main className="flex-1 flex flex-col h-full bg-[#000000] relative overflow-hidden min-w-0 font-sans">
      
      {/* ================= 1. VS CODE EDITOR TAB BAR ================= */}
      <div className="h-9 bg-[#09090b] border-b border-zinc-800 flex items-center overflow-x-auto select-none shrink-0 z-10 px-1 font-sans">
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`h-full flex items-center space-x-2 px-3 border-r border-zinc-800 text-xs font-sans font-medium cursor-pointer transition shrink-0 ${
                isActive 
                  ? "bg-[#000000] text-zinc-100 border-t-2 border-t-blue-500 font-semibold" 
                  : "bg-[#09090b] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              {tab.type === 'graph' && <Network size={16} strokeWidth={1.8} className="text-zinc-200" />}
              {tab.type === 'file' && <FileCode size={16} strokeWidth={1.8} className="text-zinc-200" />}
              {tab.type === 'evidence' && <Database size={16} strokeWidth={1.8} className="text-zinc-200" />}
              {tab.type === 'diff' && <GitPullRequest size={16} strokeWidth={1.8} className="text-amber-400" />}
              
              <span className="truncate max-w-[140px]">{tab.title}</span>

              {tab.closable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ================= 2. MAIN VIEWER CONTENT ================= */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* GRAPH CANVAS VIEW (Kept mounted to preserve zoom, pan, camera, and physics simulation layout) */}
        <div 
          className={`h-full w-full ${activeTab?.type === 'graph' ? 'block' : 'hidden'}`}
          style={{ display: activeTab?.type === 'graph' ? 'block' : 'none' }}
        >
          <GraphCanvas 
            graphData={graphData}
            activeTenant={activeTenant}
            highlightedNodes={highlightedNodes}
            executionPath={executionPath}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
          />
        </div>

        {/* MONACO CODE EDITOR VIEW */}
        {activeTab?.type === 'file' && (
          <div className="flex-1 h-full flex flex-col bg-[#000000]">
            
            {/* Quick Symbol Jump Bar (Buttons with text strictly in blue) */}
            {fileContent?.symbols && fileContent.symbols.length > 0 && (
              <div className="px-3 py-1 bg-[#09090b] border-b border-zinc-800 flex items-center space-x-2 text-xs font-sans overflow-x-auto shrink-0">
                <span className="text-zinc-400 shrink-0 font-sans text-xs">Symbols:</span>
                {fileContent.symbols.map(s => (
                  <button
                    key={s.name}
                    onClick={() => {
                      setHighlightLine(s.lineno);
                      scrollToLine(s.lineno);
                      if (onSelectNodeByName) onSelectNodeByName(s.name);
                    }}
                    className={`px-2 py-0.5 rounded border transition shrink-0 flex items-center space-x-1 text-blue-400 text-xs ${
                      highlightLine === s.lineno
                        ? "bg-zinc-900 border-blue-500 font-semibold"
                        : "bg-zinc-900 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-850 font-medium"
                    }`}
                  >
                    <span className="font-bold text-blue-400 font-mono">fn</span>
                    <span className="font-mono">{s.name}</span>
                    <span className="text-zinc-500 font-mono">:{s.lineno}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Monaco Container */}
            <div className="flex-1 relative overflow-hidden">
              {fileLoading ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400 space-x-2">
                  <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-zinc-300" />
                  <span>Loading source file...</span>
                </div>
              ) : fileContent ? (
                <Editor
                  height="100%"
                  language={fileContent.language || "python"}
                  theme="vs-dark"
                  value={fileContent.content}
                  onMount={handleEditorMount}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    renderLineHighlight: "all",
                    folding: true,
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                  Select a file from the explorer on the left.
                </div>
              )}
            </div>

          </div>
        )}

        {/* EVIDENCE REGISTRY VIEW */}
        {activeTab?.type === 'evidence' && (
          <div className="flex-1 h-full overflow-y-auto p-4 bg-[#000000]">
            <EvidenceRegistry 
              evidence={evidenceList}
              onSelectNode={onSelectNodeByName}
              highlightedNodes={highlightedNodes}
            />
          </div>
        )}

        {/* DIFF VIEWER (Unified Diff / Working Tree Changes) */}
        {activeTab?.type === 'diff' && (
          <div className="flex-1 h-full flex flex-col bg-[#000000]">
            {/* Diff Header Bar */}
            <div className="px-4 py-2 bg-[#09090b] border-b border-zinc-800 flex items-center justify-between text-xs font-sans shrink-0">
              <div className="flex items-center space-x-2.5 truncate">
                <span className="font-semibold text-zinc-200 font-mono">
                  {activeTab.filePath || activePatch?.file_path || 'Patch Diff'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                  MODIFIED (M)
                </span>
                {(activeTab.commitMessage || activePatch?.commit_message) && (
                  <span className="text-zinc-500 truncate max-w-md hidden md:inline text-[11px] font-sans">
                    {activeTab.commitMessage || activePatch?.commit_message}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {(activeTab.explanation || activePatch?.explanation) && (
                  <span className="text-zinc-400 text-[11px] truncate max-w-sm hidden lg:inline" title={activeTab.explanation || activePatch?.explanation}>
                    {activeTab.explanation || activePatch?.explanation}
                  </span>
                )}
              </div>
            </div>

            {/* Monaco Diff Code Viewer */}
            <div className="flex-1 relative overflow-hidden">
              <Editor
                height="100%"
                language="diff"
                theme="vs-dark"
                value={activeTab.diff || activePatch?.diff || "# No diff generated."}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "all",
                  folding: true,
                }}
              />
            </div>
          </div>
        )}

      </div>

      {/* ================= 3. BOTTOM TERMINAL & REACT AGENT CONSOLE DRAWER ================= */}
      <div className={`border-t border-zinc-800 bg-[#09090b] transition-all duration-200 flex flex-col shrink-0 z-10 ${
        isConsoleOpen ? "h-64" : "h-7"
      }`}>
        
        {/* Console Header Bar */}
        <div 
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className="h-7 px-3 flex items-center justify-between text-xs font-sans text-zinc-400 cursor-pointer hover:bg-zinc-900/50 select-none shrink-0"
        >
          <div className="flex items-center space-x-2">
            <Terminal size={16} strokeWidth={1.8} className="text-zinc-200" />
            <span className="font-semibold text-zinc-200">Terminal & Console</span>
            {isStreaming && (
              <span className="flex items-center space-x-1 text-zinc-300">
                <RefreshCw size={14} strokeWidth={1.8} className="animate-spin text-zinc-200" />
                <span className="text-[11px] font-sans">Turn {liveTurn} Deliberating</span>
              </span>
            )}
            {!isStreaming && streamingTrace.length > 0 && (
              <span className="text-[11px] font-sans text-zinc-400 flex items-center space-x-1">
                <CircleCheck size={14} strokeWidth={1.8} className="text-zinc-200" />
                <span>{streamingTrace.length} Steps Executed</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-sans text-zinc-500 truncate max-w-sm">
              {liveThinkingMessage || "Ready"}
            </span>
            {isConsoleOpen ? (
              <ChevronDown size={16} strokeWidth={1.8} className="text-zinc-400" />
            ) : (
              <ChevronUp size={16} strokeWidth={1.8} className="text-zinc-400" />
            )}
          </div>
        </div>

        {/* Console Drawer Body */}
        {isConsoleOpen && (
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs bg-[#000000] space-y-2 border-t border-zinc-800">
            {streamingTrace.length === 0 ? (
              <div className="text-zinc-500 text-xs italic">
                Trace console idle.
              </div>
            ) : (
              <div className="space-y-1.5">
                {streamingTrace.map((step) => (
                  <div key={step.step} className="flex items-start space-x-2 text-[11px] leading-relaxed">
                    <span className="text-zinc-600 font-bold">[{String(step.step).padStart(2, '0')}]</span>
                    <span className="text-zinc-200 font-bold">{step.tool_name}</span>
                    <span className="text-zinc-400 truncate">{step.purpose}</span>
                    <span className="ml-auto text-blue-400 shrink-0">Done</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

    </main>
  );
}
