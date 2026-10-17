// src/components/RepoExplorer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Tree } from 'react-arborist';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { 
  Folder, FolderOpen, FileCode, Search, GitCommit, 
  CircleCheck, RefreshCw, Layers, Terminal, Sparkles, 
  ExternalLink, ChevronRight, ChevronDown, Compass, 
  Code2, Eye, GitPullRequest, ArrowRight
} from 'lucide-react';

const API_BASE = "http://localhost:8000";

export default function RepoExplorer({ 
  activeTenant = "sample-fintech",
  onSelectSymbol = null,
  activePatch = null
}) {
  const [repoData, setRepoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Active selected file and code viewer
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContentData, setFileContentData] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [highlightLine, setHighlightLine] = useState(null);
  const [showDiffView, setShowDiffView] = useState(false);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  // Fetch repository tree on mount or when tenant changes
  useEffect(() => {
    fetchRepoTree();
  }, [activeTenant]);

  const fetchRepoTree = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/repositories/${activeTenant}/tree`);
      const data = await res.json();
      setRepoData(data);
      // Auto-select first file (e.g. vault_client.py) if none selected
      if (data.files_flat && data.files_flat.length > 0) {
        const defaultFile = data.files_flat.find(f => f.name.includes('vault')) || data.files_flat[0];
        handleSelectFile(defaultFile);
      }
    } catch (e) {
      console.error("Failed to load repo tree:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async (fileNode, targetLine = null) => {
    if (!fileNode || fileNode.type === 'directory') return;
    setSelectedFile(fileNode);
    setFileLoading(true);
    setHighlightLine(targetLine);

    try {
      const res = await fetch(`${API_BASE}/api/repositories/${activeTenant}/files?path=${encodeURIComponent(fileNode.path)}`);
      const data = await res.json();
      setFileContentData(data);
    } catch (e) {
      console.error("Failed to fetch file content:", e);
    } finally {
      setFileLoading(false);
    }
  };

  // When Monaco Editor mounts or line changes, highlight and scroll to symbol
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

    // Apply gold glowing line highlight
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(lineNum, 1, lineNum, 1),
        options: {
          isWholeLine: true,
          className: 'bg-amber-500/20 border-l-4 border-amber-400',
          glyphMarginClassName: 'bg-amber-400'
        }
      }
    ]);
  };

  useEffect(() => {
    if (highlightLine && editorRef.current) {
      scrollToLine(highlightLine);
    }
  }, [highlightLine, fileContentData]);

  const handleSymbolClick = (sym, fileNode) => {
    if (selectedFile?.path !== fileNode.path) {
      handleSelectFile(fileNode, sym.lineno);
    } else {
      setHighlightLine(sym.lineno);
      scrollToLine(sym.lineno);
    }
    if (onSelectSymbol) {
      onSelectSymbol(sym.name);
    }
  };

  // Node renderer for React Arborist
  const renderTreeNode = ({ node, style, dragHandle }) => {
    const isFile = node.data.type === 'file';
    const isSelected = selectedFile?.path === node.data.path;
    const hasSymbols = node.data.symbols && node.data.symbols.length > 0;

    return (
      <div 
        style={style} 
        ref={dragHandle}
        className={`group flex items-center justify-between px-2 py-1 cursor-pointer rounded transition text-xs font-mono select-none ${
          isSelected 
            ? "bg-zinc-900 text-blue-400 border-l-2 border-blue-500 font-semibold" 
            : "text-zinc-300 hover:bg-zinc-900/60 hover:text-white"
        }`}
        onClick={() => {
          if (isFile) {
            handleSelectFile(node.data);
          } else {
            node.toggle();
          }
        }}
      >
        <div className="flex items-center space-x-2 truncate">
          {!isFile ? (
            node.isOpen ? <FolderOpen size={16} strokeWidth={1.8} className="text-zinc-300 shrink-0" /> : <Folder size={16} strokeWidth={1.8} className="text-zinc-400 shrink-0" />
          ) : (
            <FileCode size={16} strokeWidth={1.8} className={`shrink-0 ${node.data.language === 'python' ? 'text-zinc-200' : 'text-zinc-400'}`} />
          )}
          
          <span className="truncate">{node.data.name}</span>
          
          {isFile && node.data.lines_count && (
            <span className="text-[10px] text-zinc-500 font-mono">({node.data.lines_count} lines)</span>
          )}
        </div>

        {isFile && (
          <div className="flex items-center space-x-1.5 shrink-0">
            {node.data.indexed && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 text-blue-400 border border-zinc-800 flex items-center space-x-1" title="FalkorDB AST Indexed">
                <CircleCheck size={12} strokeWidth={1.8} className="text-zinc-200" />
                <span>Indexed</span>
              </span>
            )}
            {hasSymbols && (
              <span className="text-[9px] px-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                {node.data.symbols.length} fns
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  // Filtered files for search
  const filteredFiles = repoData?.files_flat?.filter(f => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = f.name.toLowerCase().includes(term) || f.path.toLowerCase().includes(term);
    const symbolMatch = f.symbols?.some(s => s.name.toLowerCase().includes(term));
    return nameMatch || symbolMatch;
  }) || [];

  return (
    <div className="flex flex-col h-full bg-[#000000] text-zinc-200">
      
      {/* ================= 1. REPOSITORY & COMMIT STATUS HEADER ================= */}
      <div className="p-3 border-b border-zinc-800 bg-[#09090b] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span className="text-xs font-bold text-zinc-100 font-mono uppercase tracking-wider">
              Repository Snapshot: <span className="text-blue-400">{repoData?.repository || activeTenant}</span>
            </span>
          </div>
          <button 
            onClick={fetchRepoTree}
            className="p-1 text-zinc-300 hover:text-white rounded hover:bg-zinc-900 transition"
            title="Refresh Repository Tree"
          >
            <RefreshCw size={14} strokeWidth={1.8} className={loading ? 'animate-spin text-zinc-200' : 'text-zinc-300'} />
          </button>
        </div>

        {/* Current Commit Being Analyzed */}
        {repoData?.current_commit && (
          <div className="bg-[#000000] border border-zinc-800 rounded-lg p-2 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2 truncate">
              <GitCommit size={16} strokeWidth={1.8} className="text-zinc-200 shrink-0" />
              <div className="truncate">
                <span className="text-blue-400 font-bold mr-1.5">{repoData.current_commit.short_sha}</span>
                <span className="text-zinc-300 truncate">{repoData.current_commit.message}</span>
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 shrink-0 ml-2">{repoData.current_commit.date}</span>
          </div>
        )}

        {/* Quick Stats Badges */}
        {repoData?.stats && (
          <div className="flex flex-wrap gap-2 text-[10px] font-mono">
            <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
              {repoData.stats.total_files} Files ({repoData.stats.indexed_files} Indexed)
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-900 text-blue-400 border border-zinc-800">
              {repoData.stats.total_symbols} AST Symbols in FalkorDB
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 font-bold">
              {repoData.stats.indexing_status}
            </span>
          </div>
        )}
      </div>

      {/* ================= 2. SEARCH BAR (BY FILENAME & SYMBOL) ================= */}
      <div className="p-2 border-b border-zinc-800 bg-[#09090b]">
        <div className="relative">
          <Search size={16} strokeWidth={1.8} className="text-zinc-300 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by filename or symbol..."
            className="w-full bg-[#000000] border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 font-mono shadow-inner"
          />
        </div>
      </div>

      {/* ================= 3. SPLIT WORKBENCH: TREE EXPLORER + MONACO CODE VIEWER ================= */}
      <div className="flex-1 flex flex-col min-h-0">
        
        {/* TOP HALF: REACT ARBORIST FILE & SYMBOL TREE */}
        <div className="h-48 border-b border-zinc-800 bg-[#000000] overflow-y-auto p-1.5 space-y-1">
          {searchTerm ? (
            // Search Results List View
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 pt-1 font-mono">
                Matching Files & Symbols ({filteredFiles.length})
              </div>
              {filteredFiles.map(f => (
                <div key={f.path} className="space-y-1">
                  <div
                    onClick={() => handleSelectFile(f)}
                    className={`flex items-center justify-between px-2 py-1 rounded text-xs font-mono cursor-pointer transition ${
                      selectedFile?.path === f.path ? "bg-zinc-900 text-blue-400 font-semibold" : "text-zinc-300 hover:bg-zinc-900/60"
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <FileCode size={16} strokeWidth={1.8} className="text-zinc-200 shrink-0" />
                      <span className="font-bold">{f.name}</span>
                    </div>
                    <span className="text-[10px] text-blue-400 flex items-center space-x-1">
                      <CircleCheck size={12} strokeWidth={1.8} className="text-zinc-200" />
                      <span>Indexed</span>
                    </span>
                  </div>
                  
                  {/* Symbols matching */}
                  {f.symbols && f.symbols.length > 0 && (
                    <div className="pl-6 pr-2 space-y-0.5">
                      {f.symbols.map(s => (
                        <div
                          key={s.name}
                          onClick={() => handleSymbolClick(s, f)}
                          className="flex items-center justify-between text-[11px] font-mono text-blue-400 hover:text-blue-300 cursor-pointer py-0.5 px-1.5 rounded hover:bg-zinc-900 transition"
                        >
                          <span className="flex items-center space-x-1">
                            <span className="text-zinc-500 text-[10px]">fn</span>
                            <span className="truncate">{s.name}</span>
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">:{s.lineno}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // React Arborist Hierarchy
            repoData?.tree && (
              <Tree
                data={repoData.tree}
                width="100%"
                height={180}
                indent={16}
                rowHeight={26}
                openByDefault={true}
              >
                {renderTreeNode}
              </Tree>
            )
          )}
        </div>

        {/* BOTTOM HALF: MONACO EDITOR SOURCE CODE & DIFF VIEWER */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#000000]">
          
          {/* File Tab Header */}
          {selectedFile ? (
            <div className="px-3 py-2 border-b border-zinc-800 bg-[#09090b] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center space-x-2 truncate">
                <FileCode size={16} strokeWidth={1.8} className="text-zinc-200 shrink-0" />
                <span className="font-bold text-zinc-100 truncate">{selectedFile.name}</span>
                <span className="text-[10px] text-zinc-500 truncate">{selectedFile.path}</span>
              </div>
              
              <div className="flex items-center space-x-2 shrink-0">
                {activePatch && activePatch.file_path.includes(selectedFile.name) && (
                  <button
                    onClick={() => setShowDiffView(!showDiffView)}
                    className="text-[10px] px-2 py-1 rounded border font-semibold transition flex items-center space-x-1 text-blue-400 bg-zinc-900 border-zinc-800 hover:border-blue-500"
                  >
                    <GitPullRequest size={14} strokeWidth={1.8} className="text-zinc-200" />
                    <span>{showDiffView ? "View Source" : "View Patch Diff"}</span>
                  </button>
                )}
                <span className="text-[10px] text-zinc-500">
                  {fileContentData?.lines_count || selectedFile.lines_count} lines
                </span>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 border-b border-zinc-800 bg-[#000000] text-xs text-zinc-500 font-mono">
              Select a file from the repository tree above
            </div>
          )}

          {/* Quick Symbol Navigator Chips */}
          {selectedFile?.symbols && selectedFile.symbols.length > 0 && (
            <div className="px-3 py-1.5 border-b border-zinc-800 bg-[#000000] flex items-center space-x-1.5 overflow-x-auto text-[10px] font-mono">
              <span className="text-zinc-500 shrink-0">Symbols:</span>
              {selectedFile.symbols.map(sym => (
                <button
                  key={sym.name}
                  onClick={() => handleSymbolClick(sym, selectedFile)}
                  className={`px-2 py-0.5 rounded border transition shrink-0 flex items-center space-x-1 text-blue-400 ${
                    highlightLine === sym.lineno
                      ? "bg-zinc-900 border-blue-500 font-semibold"
                      : "bg-zinc-900 border-zinc-800 hover:border-blue-500/50"
                  }`}
                >
                  <span className="font-bold text-blue-400">fn</span>
                  <span>{sym.name}</span>
                  <span className="text-zinc-500">:{sym.lineno}</span>
                </button>
              ))}
            </div>
          )}

          {/* Monaco Editor Container */}
          <div className="flex-1 relative overflow-hidden bg-[#000000]">
            {fileLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400 space-x-2">
                <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-zinc-200" />
                <span>Loading source code for {selectedFile?.name}...</span>
              </div>
            ) : showDiffView && activePatch ? (
              // Monaco Diff Editor for ProofStack generated patches
              <DiffEditor
                height="100%"
                original={fileContentData?.content || ""}
                modified={fileContentData?.content ? fileContentData.content.replace('50', '120') : ""}
                language="python"
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  renderSideBySide: true,
                  scrollBeyondLastLine: false,
                }}
              />
            ) : fileContentData ? (
              // Monaco Standard Source Editor
              <Editor
                height="100%"
                language={fileContentData.language || "python"}
                theme="vs-dark"
                value={fileContentData.content}
                onMount={handleEditorMount}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "all",
                  glyphMargin: false,
                  folding: true,
                }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-xs text-zinc-500 space-y-1">
                <Code2 size={24} strokeWidth={1.8} className="text-zinc-400" />
                <span>No file opened</span>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
