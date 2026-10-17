import React, { useState, useEffect } from 'react';
import { Tree } from 'react-arborist';
import { 
  Folder, FolderOpen, FileCode, GitCommit, Search, 
  RefreshCw, CircleCheck, GitPullRequest, FolderGit2,
  ChevronDown, ChevronRight, MoreHorizontal, Sparkles,
  Check, RotateCw, RotateCcw, Plus, FileDiff, GitBranch,
  Cloud, Target
} from 'lucide-react';

const API_BASE = "http://localhost:8000";

const getFileIcon = (filePath) => {
  if (!filePath) return <FileCode size={14} className="text-zinc-400 shrink-0" />;
  const ext = filePath.split('.').pop().toLowerCase();
  switch (ext) {
    case 'py':
      return <FileCode size={14} className="text-emerald-400 shrink-0" />;
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return <FileCode size={14} className="text-sky-400 shrink-0" />;
    case 'css':
    case 'scss':
      return <FileCode size={14} className="text-cyan-400 shrink-0" />;
    case 'json':
      return <FileCode size={14} className="text-amber-400 shrink-0" />;
    case 'md':
      return <FileCode size={14} className="text-indigo-400 shrink-0" />;
    case 'html':
      return <FileCode size={14} className="text-orange-400 shrink-0" />;
    default:
      return <FileCode size={14} className="text-zinc-400 shrink-0" />;
  }
};

export default function LeftSidebar({
  activeView,
  activeTenant,
  onOpenFile,
  selectedFile,
  onSelectGraphNode,
  graphData,
  highlightedNodes,
  evidenceList = [],
  onSelectEvidence,
  patch,
  onOpenDiff,
  onDiscardPatch,
  onApplyPatch,
  isApplyingPatch,
  appliedInfo,
  onIngest,
  isIngesting,
  ingestStatus,
  width = 260,
  onResizeStart,
  isResizing = false
}) {
  // Explorer state
  const [repoTree, setRepoTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Git Commits & Source Control state
  const [commits, setCommits] = useState([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedCommitSha, setSelectedCommitSha] = useState(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [isChangesOpen, setIsChangesOpen] = useState(true);
  const [isChangesListOpen, setIsChangesListOpen] = useState(true);
  const [isCommitsOpen, setIsCommitsOpen] = useState(true);

  // Sync commit message from patch if available
  useEffect(() => {
    if (patch?.commit_message && !commitMessage) {
      setCommitMessage(patch.commit_message);
    }
  }, [patch]);

  // Ingest form state
  const [ingestPath, setIngestPath] = useState('./sample_fintech_repo');

  useEffect(() => {
    if (activeView === 'explorer') {
      fetchTree();
    } else if (activeView === 'git') {
      fetchCommits();
    }
  }, [activeView, activeTenant]);

  const fetchTree = async () => {
    setTreeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/repositories/${activeTenant}/tree`);
      const data = await res.json();
      setRepoTree(data);
    } catch (e) {
      console.error("Failed to load repo tree:", e);
    } finally {
      setTreeLoading(false);
    }
  };

  const fetchCommits = async () => {
    setCommitsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/repositories/${activeTenant}/commits`);
      const data = await res.json();
      setCommits(data.commits || []);
    } catch (e) {
      console.error("Failed to fetch commits:", e);
    } finally {
      setCommitsLoading(false);
    }
  };

  // Node renderer for React Arborist
  const renderTreeNode = ({ node, style, dragHandle }) => {
    const isFile = node.data.type === 'file';
    const isSelected = selectedFile?.path === node.data.path;

    return (
      <div 
        style={style} 
        ref={dragHandle}
        className={`flex items-center justify-between px-2 py-0.5 cursor-pointer rounded transition text-xs font-sans select-none ${
          isSelected 
            ? "bg-zinc-900 text-blue-400 border-l-2 border-blue-500 font-semibold" 
            : "text-zinc-300 hover:bg-zinc-900/60 hover:text-white"
        }`}
        onClick={() => {
          if (isFile) {
            onOpenFile(node.data);
          } else {
            node.toggle();
          }
        }}
      >
        <div className="flex items-center space-x-1.5 truncate">
          {!isFile ? (
            node.isOpen ? <FolderOpen size={15} strokeWidth={1.8} className="text-zinc-300 shrink-0" /> : <Folder size={15} strokeWidth={1.8} className="text-zinc-400 shrink-0" />
          ) : (
            <FileCode size={15} strokeWidth={1.8} className="shrink-0 text-zinc-300" />
          )}
          <span className="truncate">{node.data.name}</span>
        </div>

        {isFile && node.data.indexed && (
          <CircleCheck size={14} strokeWidth={1.8} className="text-zinc-300 shrink-0 opacity-80" title="Indexed" />
        )}
      </div>
    );
  };

  // Filtered files for search
  const filteredFiles = repoTree?.files_flat?.filter(f => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return f.name.toLowerCase().includes(q) || f.symbols?.some(s => s.name.toLowerCase().includes(q));
  }) || [];

  // Filtered graph symbols
  const graphNodes = (graphData?.nodes || []).filter(n => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (n.name || n.display_name)?.toLowerCase().includes(q) || n.label?.toLowerCase().includes(q);
  });

  return (
    <div 
      style={{ width: `${width}px` }}
      className="bg-[#09090b] border-r border-zinc-800 flex flex-col h-full select-none shrink-0 overflow-hidden relative group font-sans"
    >
      {/* Right Edge Resize Handle */}
      <div 
        onMouseDown={onResizeStart}
        className={`absolute top-0 right-0 bottom-0 w-1 cursor-col-resize z-40 transition-colors ${
          isResizing 
            ? 'bg-blue-500 w-1' 
            : 'bg-transparent hover:bg-blue-500/70'
        }`}
        title="Drag to resize sidebar"
      />
      
      {/* Sidebar Section Title */}
      <div className="h-9 px-3 border-b border-zinc-800 flex items-center justify-between text-[11px] font-semibold text-zinc-300 font-sans tracking-wider uppercase bg-[#09090b]">
        <span>
          {activeView === 'explorer' && 'Explorer'}
          {activeView === 'git' && 'Source Control'}
          {activeView === 'graph' && 'Graph Navigator'}
          {activeView === 'evidence' && 'Evidence Registry'}
          {activeView === 'ingest' && 'Ingestion'}
        </span>
        <div className="flex items-center space-x-0.5">
          <button 
            onClick={activeView === 'explorer' ? fetchTree : fetchCommits}
            className="text-zinc-400 hover:text-zinc-100 p-1"
            title="Refresh"
          >
            <RefreshCw size={14} strokeWidth={1.8} />
          </button>
          {activeView === 'git' && (
            <button className="text-zinc-400 hover:text-zinc-100 p-1" title="Views and More Actions">
              <MoreHorizontal size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {/* ================= 1. EXPLORER VIEW (REACT ARBORIST FILE TREE) ================= */}
      {activeView === 'explorer' && (
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* Search Bar */}
          <div className="p-2 border-b border-zinc-800">
            <div className="relative">
              <Search size={14} strokeWidth={1.8} className="text-zinc-400 absolute left-2 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files & symbols..."
                className="w-full bg-[#000000] border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 font-sans"
              />
            </div>
          </div>

          {/* Repository Root Node */}
          <div className="px-3 py-1.5 flex items-center justify-between text-xs font-sans text-zinc-300 font-semibold border-b border-zinc-800">
            <span className="truncate">{activeTenant}</span>
            {repoTree?.stats && (
              <span className="text-[10px] text-zinc-500 font-normal font-sans">
                {repoTree.stats.indexing_status}
              </span>
            )}
          </div>

          {/* Tree View */}
          <div className="flex-1 overflow-y-auto p-1">
            {searchQuery ? (
              <div className="space-y-1">
                {filteredFiles.map(f => (
                  <div key={f.path} className="space-y-0.5">
                    <div
                      onClick={() => onOpenFile(f)}
                      className={`flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-sans cursor-pointer ${
                        selectedFile?.path === f.path ? "bg-zinc-900 text-blue-400 font-semibold" : "text-zinc-300 hover:bg-zinc-900/60"
                      }`}
                    >
                      <FileCode size={14} strokeWidth={1.8} className="text-zinc-300 shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </div>
                    {f.symbols && (
                      <div className="pl-5 space-y-0.5">
                        {f.symbols.map(s => (
                          <div
                            key={s.name}
                            onClick={() => onOpenFile(f, s.lineno, s.name)}
                            className="flex items-center justify-between text-[11px] font-mono text-zinc-400 hover:text-blue-400 cursor-pointer py-0.5 px-1.5 rounded hover:bg-zinc-900"
                          >
                            <span className="truncate">fn {s.name}</span>
                            <span className="text-zinc-600">:{s.lineno}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              repoTree?.tree && (
                <Tree
                  data={repoTree.tree}
                  width="100%"
                  height={450}
                  indent={14}
                  rowHeight={24}
                  openByDefault={true}
                >
                  {renderTreeNode}
                </Tree>
              )
            )}
          </div>

        </div>
      )}

      {/* ================= 2. GIT COMMITS & SOURCE CONTROL VIEW ================= */}
      {activeView === 'git' && (
        <div className="flex-1 flex flex-col min-h-0 font-sans text-xs bg-[#09090b] overflow-hidden">
          
          {/* Changes Accordion Section */}
          <div className="border-b border-zinc-800 shrink-0">
            {/* Changes Header Bar */}
            <div 
              onClick={() => setIsChangesOpen(!isChangesOpen)}
              className="px-2.5 py-1.5 flex items-center justify-between text-zinc-300 hover:bg-zinc-900/40 cursor-pointer select-none"
            >
              <div className="flex items-center space-x-1 font-semibold text-[11px] text-zinc-300 uppercase tracking-wider">
                {isChangesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>Changes</span>
              </div>
            </div>

            {isChangesOpen && (
              <div className="p-2 space-y-2">
                {/* Repository Subheader with Branch and Actions */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-sans px-0.5">
                  <div className="flex items-center space-x-1.5 font-medium truncate">
                    <ChevronDown size={13} className="text-zinc-500 shrink-0" />
                    <span className="text-zinc-200 font-semibold truncate max-w-[100px]">{activeTenant}</span>
                    <span className="text-zinc-500 text-[10px] font-mono">main</span>
                  </div>
                  <div className="flex items-center space-x-1 text-zinc-400 shrink-0">
                    <button 
                      onClick={fetchCommits} 
                      className="p-1 hover:text-white rounded hover:bg-zinc-800/60" 
                      title="Refresh"
                    >
                      <RotateCw size={13} />
                    </button>
                    <button 
                      onClick={() => onApplyPatch && onApplyPatch(commitMessage)}
                      disabled={!patch || isApplyingPatch}
                      className="p-1 hover:text-white rounded hover:bg-zinc-800/60 disabled:opacity-30" 
                      title="Commit Changes"
                    >
                      <Check size={13} />
                    </button>
                    <button 
                      onClick={onDiscardPatch}
                      disabled={!patch}
                      className="p-1 hover:text-white rounded hover:bg-zinc-800/60 disabled:opacity-30" 
                      title="Discard Changes"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button className="p-1 hover:text-white rounded hover:bg-zinc-800/60" title="More Actions">
                      <MoreHorizontal size={13} />
                    </button>
                  </div>
                </div>

                {/* Commit Message Box with Generate ✨ Button */}
                <div className="relative bg-[#18181b] border border-zinc-800 rounded focus-within:border-blue-500 transition shadow-inner">
                  <textarea
                    rows={2}
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        if (patch && !isApplyingPatch) {
                          onApplyPatch(commitMessage);
                        }
                      }
                    }}
                    placeholder="Message (⌘Enter to commit)"
                    className="w-full bg-transparent px-2.5 pt-2 pb-7 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none resize-none font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (patch?.commit_message) {
                        setCommitMessage(patch.commit_message);
                      } else {
                        setCommitMessage("fix: apply remediation patch per FalkorDB incident memory");
                      }
                    }}
                    className="absolute right-1.5 bottom-1.5 px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium transition flex items-center space-x-1 shadow-sm"
                    title="Generate commit message from patch"
                  >
                    <span>Generate</span>
                    <Sparkles size={11} className="text-blue-100" />
                  </button>
                </div>

                {/* Split Commit Button */}
                <div className="flex items-stretch rounded overflow-hidden shadow-sm">
                  <button
                    onClick={() => onApplyPatch && onApplyPatch(commitMessage)}
                    disabled={!patch || isApplyingPatch}
                    className="flex-1 py-1.5 px-3 bg-[#0078d4] hover:bg-[#006cc1] text-white text-xs font-medium transition flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:hover:bg-[#0078d4]"
                  >
                    {isApplyingPatch ? (
                      <RefreshCw size={13} className="animate-spin text-white" />
                    ) : (
                      <Check size={14} className="text-white" />
                    )}
                    <span>{isApplyingPatch ? "Committing..." : "Commit"}</span>
                  </button>
                  <div className="w-[1px] bg-[#0062ab]" />
                  <button
                    disabled={!patch || isApplyingPatch}
                    className="px-2 bg-[#0078d4] hover:bg-[#006cc1] text-white flex items-center justify-center disabled:opacity-40"
                    title="Commit Options"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                {/* Success Notification if patch was applied */}
                {appliedInfo && (
                  <div className="px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded text-[11px] text-blue-400 flex items-center justify-between">
                    <span className="flex items-center space-x-1 truncate">
                      <CircleCheck size={12} className="shrink-0 text-blue-400" />
                      <span>Committed <span className="font-mono font-bold">{appliedInfo.commit_sha?.slice(0, 7)}</span></span>
                    </span>
                    <span className="text-[10px] text-zinc-500">applied</span>
                  </div>
                )}

                {/* Changes List Sub-Accordion */}
                <div className="space-y-1 pt-1">
                  <div 
                    onClick={() => setIsChangesListOpen(!isChangesListOpen)}
                    className="flex items-center justify-between px-1 py-0.5 cursor-pointer text-zinc-400 hover:text-zinc-200 select-none text-[11px]"
                  >
                    <div className="flex items-center space-x-1 font-semibold">
                      {isChangesListOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span>Changes</span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                      {patch ? 1 : 0}
                    </span>
                  </div>

                  {isChangesListOpen && (
                    <div>
                      {patch ? (
                        <div
                          onClick={() => onOpenDiff && onOpenDiff(patch)}
                          className="flex items-center justify-between px-2 py-1 rounded hover:bg-zinc-900/80 cursor-pointer group transition text-xs"
                        >
                          <div className="flex items-center space-x-2 truncate min-w-0">
                            {getFileIcon(patch.file_path)}
                            <span className="text-zinc-200 font-medium truncate font-sans">
                              {patch.file_path ? patch.file_path.split('/').pop() : 'modified_file'}
                            </span>
                            <span className="text-zinc-500 text-[11px] font-sans truncate">
                              {patch.file_path && patch.file_path.includes('/')
                                ? patch.file_path.substring(0, patch.file_path.lastIndexOf('/'))
                                : '.'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1.5 shrink-0 ml-1">
                            {/* Hover Action Icons */}
                            <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenDiff && onOpenDiff(patch);
                                }}
                                className="p-0.5 hover:text-white text-zinc-400 rounded hover:bg-zinc-800"
                                title="Open Diff"
                              >
                                <FileDiff size={13} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDiscardPatch && onDiscardPatch();
                                }}
                                className="p-0.5 hover:text-white text-zinc-400 rounded hover:bg-zinc-800"
                                title="Discard Changes"
                              >
                                <RotateCcw size={13} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="p-0.5 hover:text-white text-zinc-400 rounded hover:bg-zinc-800"
                                title="Stage Changes"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                            {/* Status Badge 'M' for Modified */}
                            <span className="text-amber-400 font-bold font-mono text-xs px-1" title="Modified">
                              M
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-zinc-500 text-[11px] italic px-3 py-1.5 font-sans">
                          No changes detected.
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* ================= COMMITS SECTION WITH VISUAL GRAPH RAIL & SCROLLBAR ================= */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Commits Section Header */}
            <div className="px-2.5 py-1.5 border-b border-zinc-800 flex items-center justify-between text-zinc-400 bg-[#09090b] select-none shrink-0">
              <button
                onClick={() => setIsCommitsOpen(!isCommitsOpen)}
                className="flex items-center space-x-1.5 font-semibold text-[11px] text-zinc-300 hover:text-white uppercase tracking-wider"
              >
                {isCommitsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>Commits</span>
                <span className="text-zinc-500 font-mono font-normal">({commits.length})</span>
              </button>
              
              <div className="flex items-center space-x-1.5 text-zinc-500">
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono text-sky-400 bg-sky-500/10 border border-sky-500/20">
                  main
                </span>
                <button onClick={fetchCommits} className="p-0.5 hover:text-white rounded" title="Refresh commits">
                  <RotateCw size={12} />
                </button>
              </div>
            </div>

            {/* Scrollable Visual Commit Tree with Blue Connecting Rail */}
            {isCommitsOpen && (
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 vscode-scrollbar">
                {commitsLoading ? (
                  <div className="p-4 flex items-center justify-center space-x-2 text-zinc-500 text-xs">
                    <RefreshCw size={14} className="animate-spin text-zinc-400" />
                    <span>Loading commits...</span>
                  </div>
                ) : commits.length === 0 ? (
                  <div className="text-zinc-500 text-xs italic p-4 text-center">
                    No commits recorded.
                  </div>
                ) : (
                  <div className="relative pl-5 py-0.5 space-y-2">
                    {/* Continuous vertical blue rail track line */}
                    <div className="absolute left-[7px] top-2 bottom-3 w-[2px] bg-sky-500/60" />

                    {commits.map((c, idx) => {
                      const isHead = idx === 0;
                      const isSelected = selectedCommitSha === c.sha;

                      return (
                        <div
                          key={c.sha || idx}
                          onClick={() => setSelectedCommitSha(c.sha)}
                          className={`relative group cursor-pointer p-1.5 rounded transition ${
                            isSelected 
                              ? "bg-zinc-800/80 text-white" 
                              : "hover:bg-zinc-900/60 text-zinc-300 hover:text-zinc-100"
                          }`}
                        >
                          {/* Dot / Node on the track */}
                          <div className="absolute -left-[17px] top-[9px] z-10 flex items-center justify-center">
                            {isHead ? (
                              <div className="w-3 h-3 rounded-full border-2 border-sky-400 bg-[#09090b] flex items-center justify-center shadow-sm">
                                <div className="w-1 h-1 rounded-full bg-sky-400" />
                              </div>
                            ) : (
                              <div className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-[#09090b] shadow-sm" />
                            )}
                          </div>

                          {/* Commit Message & Badges */}
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <span className="text-xs font-sans font-medium truncate leading-tight group-hover:text-white">
                              {c.message}
                            </span>
                            {isHead && (
                              <span className="shrink-0 flex items-center space-x-0.5 px-1.5 py-0.2 text-[9px] font-mono text-sky-400 bg-sky-500/15 border border-sky-500/30 rounded-full">
                                <GitBranch size={9} className="mr-0.5" />
                                <span>main</span>
                              </span>
                            )}
                            {c.decision_tag && (
                              <span className="shrink-0 text-[9px] font-mono text-blue-400 bg-blue-500/10 px-1 rounded">
                                {c.decision_tag}
                              </span>
                            )}
                          </div>

                          {/* Author & Date / Hash */}
                          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-sans mt-0.5">
                            <span className="truncate">{c.author}</span>
                            <div className="flex items-center space-x-1.5 shrink-0 ml-1">
                              <span className="font-mono text-zinc-600">{c.short_sha}</span>
                              {c.date && <span>• {c.date}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ================= 3. GRAPH SYMBOL NAVIGATOR ================= */}
      {activeView === 'graph' && (
        <div className="flex-1 flex flex-col min-h-0 font-sans">
          <div className="p-2 border-b border-zinc-800">
            <div className="relative">
              <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter graph symbols..."
                className="w-full bg-[#000000] border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 font-sans"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {graphNodes.map(node => (
              <div
                key={node.id}
                onClick={() => onSelectGraphNode(node)}
                className="flex items-center justify-between px-2 py-1 rounded text-xs font-sans cursor-pointer hover:bg-zinc-900/60 transition group"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    node.label === 'Function' ? 'bg-blue-400' :
                    node.label === 'Module' ? 'bg-zinc-400' :
                    node.label === 'Commit' ? 'bg-zinc-500' :
                    node.label === 'Finding' ? 'bg-blue-300' : 'bg-zinc-600'
                  }`}></span>
                  <span className="text-zinc-300 font-mono text-xs group-hover:text-white truncate">
                    {node.name || node.display_name}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-sans shrink-0">{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 4. EVIDENCE REGISTRY SIDEBAR VIEW ================= */}
      {activeView === 'evidence' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 font-sans">
          {evidenceList.length === 0 ? (
            <div className="text-xs text-zinc-500 font-sans p-3 text-center">
              No evidence recorded yet.
            </div>
          ) : (
            evidenceList.map((ev, idx) => (
              <div
                key={ev.evidence_id || idx}
                onClick={() => onSelectEvidence && onSelectEvidence(ev)}
                className="p-2 bg-[#000000] border border-zinc-800/80 rounded hover:border-zinc-700 cursor-pointer transition text-xs font-sans space-y-1"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-blue-400 font-bold font-mono">{ev.evidence_id}</span>
                  <span className="text-zinc-500 font-sans">{ev.source_tool}</span>
                </div>
                <div className="text-zinc-200 text-xs font-sans leading-snug line-clamp-2">
                  {ev.claim}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ================= 5. REPO INGESTION VIEW ================= */}
      {activeView === 'ingest' && (
        <div className="flex-1 p-3 space-y-3 text-xs font-sans">
          <div className="text-zinc-400 text-xs font-sans">
            Repository path or Git URL:
          </div>
          <input
            type="text"
            value={ingestPath}
            onChange={(e) => setIngestPath(e.target.value)}
            className="w-full bg-[#000000] border border-zinc-800 rounded p-2 text-xs text-zinc-200 font-mono outline-none focus:border-blue-500"
          />
          <button
            onClick={() => onIngest(ingestPath, activeTenant)}
            disabled={isIngesting}
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500 text-blue-400 rounded text-xs font-sans font-medium transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {isIngesting ? <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-zinc-200" /> : <FolderGit2 size={16} strokeWidth={1.8} className="text-zinc-200" />}
            <span>{isIngesting ? "Ingesting..." : "Ingest Repository"}</span>
          </button>
          {ingestStatus && (
            <div className="text-xs text-zinc-300 font-sans leading-relaxed bg-[#000000] p-2 rounded border border-zinc-800">
              {ingestStatus}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
