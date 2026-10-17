// src/components/CentralWorkspace.jsx
import React, { useRef, useState, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { 
  Network, FileCode, ShieldCheck, X, ChevronUp, 
  ChevronDown, Terminal, RefreshCw, CheckCircle2, 
  GitCommit, ArrowRight, ExternalLink
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
          className: 'bg-amber-500/25 border-l-4 border-amber-400',
          glyphMarginClassName: 'bg-amber-400'
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
    <main className="flex-1 flex flex-col h-full bg-[#000000] relative overflow-hidden min-w-0">
      
      {/* ================= 1. VS CODE EDITOR TAB BAR ================= */}
      <div className="h-9 bg-[#09090b] border-b border-zinc-800 flex items-center overflow-x-auto select-none shrink-0 z-10 px-1">
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`h-full flex items-center space-x-2 px-3 border-r border-zinc-800 text-xs font-mono cursor-pointer transition shrink-0 ${
                isActive 
                  ? "bg-[#000000] text-zinc-100 border-t-2 border-t-blue-500 font-semibold" 
                  : "bg-[#09090b] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
              }`}
            >
              {tab.type === 'graph' && <Network className="w-3.5 h-3.5 text-blue-400" />}
              {tab.type === 'file' && <FileCode className="w-3.5 h-3.5 text-blue-400" />}
              {tab.type === 'evidence' && <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />}
              
              <span className="truncate max-w-[140px]">{tab.title}</span>

              {tab.closable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-blue-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ================= 2. MAIN VIEWER CONTENT ================= */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* GRAPH CANVAS VIEW */}
        {activeTab?.type === 'graph' && (
          <GraphCanvas 
            graphData={graphData}
            activeTenant={activeTenant}
            highlightedNodes={highlightedNodes}
            executionPath={executionPath}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
          />
        )}

        {/* MONACO CODE EDITOR VIEW */}
        {activeTab?.type === 'file' && (
          <div className="flex-1 h-full flex flex-col bg-[#000000]">
            
            {/* Quick Symbol Jump Bar (Buttons with text strictly in blue) */}
            {fileContent?.symbols && fileContent.symbols.length > 0 && (
              <div className="px-3 py-1 bg-[#09090b] border-b border-zinc-800 flex items-center space-x-2 text-[10px] font-mono overflow-x-auto shrink-0">
                <span className="text-zinc-500 shrink-0">Symbols:</span>
                {fileContent.symbols.map(s => (
                  <button
                    key={s.name}
                    onClick={() => {
                      setHighlightLine(s.lineno);
                      scrollToLine(s.lineno);
                      if (onSelectNodeByName) onSelectNodeByName(s.name);
                    }}
                    className={`px-2 py-0.5 rounded border transition shrink-0 flex items-center space-x-1 text-blue-400 ${
                      highlightLine === s.lineno
                        ? "bg-zinc-900 border-blue-500 font-semibold"
                        : "bg-zinc-900 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-850"
                    }`}
                  >
                    <span className="font-bold text-blue-400">fn</span>
                    <span>{s.name}</span>
                    <span className="text-zinc-500">:{s.lineno}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Monaco Container */}
            <div className="flex-1 relative overflow-hidden">
              {fileLoading ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400 space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
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

      </div>

      {/* ================= 3. BOTTOM TERMINAL & REACT AGENT CONSOLE DRAWER ================= */}
      <div className={`border-t border-zinc-800 bg-[#09090b] transition-all duration-200 flex flex-col shrink-0 z-10 ${
        isConsoleOpen ? "h-64" : "h-7"
      }`}>
        
        {/* Console Header Bar */}
        <div 
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className="h-7 px-3 flex items-center justify-between text-xs font-mono text-zinc-400 cursor-pointer hover:bg-zinc-900/50 select-none shrink-0"
        >
          <div className="flex items-center space-x-2">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-bold text-zinc-200">Terminal & Console</span>
            {isStreaming && (
              <span className="flex items-center space-x-1 text-blue-400">
                <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                <span className="text-[10px]">Turn {liveTurn} Deliberating</span>
              </span>
            )}
            {!isStreaming && streamingTrace.length > 0 && (
              <span className="text-[10px] text-zinc-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-blue-400" />
                <span>{streamingTrace.length} Steps Executed</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-zinc-500 truncate max-w-sm">
              {liveThinkingMessage || "Ready"}
            </span>
            {isConsoleOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
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
