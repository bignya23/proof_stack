import React, { useState, useEffect } from 'react';
import { Tree } from 'react-arborist';
import { 
  Folder, FolderOpen, FileCode, GitCommit, Search, 
  RefreshCw, CircleCheck, GitPullRequest, FolderGit2
} from 'lucide-react';

const API_BASE = "http://localhost:8000";

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
  onApplyPatch,
  isApplyingPatch,
  appliedInfo,
  onIngest,
  isIngesting,
  ingestStatus
}) {
  // Explorer state
  const [repoTree, setRepoTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Git Commits state
  const [commits, setCommits] = useState([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [selectedCommitSha, setSelectedCommitSha] = useState(null);

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
        className={`flex items-center justify-between px-2 py-0.5 cursor-pointer rounded transition text-xs font-mono select-none ${
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
            node.isOpen ? <FolderOpen size={15} strokeWidth={1.8} className="text-zinc-400 shrink-0" /> : <Folder size={15} strokeWidth={1.8} className="text-zinc-500 shrink-0" />
          ) : (
            <FileCode size={15} strokeWidth={1.8} className={`shrink-0 ${node.data.language === 'python' ? 'text-blue-400' : 'text-zinc-500'}`} />
          )}
          <span className="truncate">{node.data.name}</span>
        </div>

        {isFile && node.data.indexed && (
          <CircleCheck size={14} strokeWidth={1.8} className="text-blue-400 shrink-0 opacity-80" title="Indexed" />
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
    <div className="w-64 bg-[#09090b] border-r border-zinc-800 flex flex-col h-full select-none shrink-0 overflow-hidden">
      
      {/* Sidebar Section Title */}
      <div className="h-9 px-3 border-b border-zinc-800 flex items-center justify-between text-[11px] font-bold text-zinc-400 font-mono tracking-wider uppercase bg-[#09090b]">
        <span>
          {activeView === 'explorer' && 'Explorer'}
          {activeView === 'git' && 'Source Control'}
          {activeView === 'graph' && 'Graph Navigator'}
          {activeView === 'evidence' && 'Evidence Registry'}
          {activeView === 'ingest' && 'Ingestion'}
        </span>
        <button 
          onClick={activeView === 'explorer' ? fetchTree : fetchCommits}
          className="text-zinc-500 hover:text-blue-400 p-1"
          title="Refresh"
        >
          <RefreshCw size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/* ================= 1. EXPLORER VIEW (REACT ARBORIST FILE TREE) ================= */}
      {activeView === 'explorer' && (
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* Search Bar */}
          <div className="p-2 border-b border-zinc-800">
            <div className="relative">
              <Search size={14} strokeWidth={1.8} className="text-zinc-500 absolute left-2 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files & symbols..."
                className="w-full bg-[#000000] border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Repository Root Node */}
          <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-zinc-400 font-bold border-b border-zinc-800">
            <span className="truncate">{activeTenant}</span>
            {repoTree?.stats && (
              <span className="text-[10px] text-zinc-500 font-normal">
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
                      className={`flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-mono cursor-pointer ${
                        selectedFile?.path === f.path ? "bg-zinc-900 text-blue-400" : "text-zinc-300 hover:bg-zinc-900/60"
                      }`}
                    >
                      <FileCode size={14} strokeWidth={1.8} className="text-blue-400 shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </div>
                    {f.symbols && (
                      <div className="pl-5 space-y-0.5">
                        {f.symbols.map(s => (
                          <div
                            key={s.name}
                            onClick={() => onOpenFile(f, s.lineno, s.name)}
                            className="flex items-center justify-between text-[10px] font-mono text-zinc-400 hover:text-blue-400 cursor-pointer py-0.5 px-1.5 rounded hover:bg-zinc-900"
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
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-2 space-y-3">
          
          {/* Pending Agent Patch Card */}
          {patch ? (
            <div className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-200 font-bold">
                <span className="flex items-center space-x-1">
                  <GitPullRequest size={16} strokeWidth={1.8} className="text-blue-400" />
                  <span>Proposed Patch</span>
                </span>
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              </div>
              <div className="text-[11px] text-zinc-300 font-mono truncate">{patch.file_path}</div>
              <button
                onClick={onApplyPatch}
                disabled={isApplyingPatch}
                className="w-full py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500 text-blue-400 rounded text-xs font-mono font-bold transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {isApplyingPatch ? <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-blue-400" /> : <GitCommit size={16} strokeWidth={1.8} className="text-blue-400" />}
                <span>{isApplyingPatch ? "Committing..." : "Apply & Commit"}</span>
              </button>
              {appliedInfo && (
                <div className="text-[10px] text-blue-400 font-mono">
                  Committed: {appliedInfo.commit_sha?.slice(0, 7)}
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500 font-mono p-2 bg-[#000000] rounded border border-zinc-800/60">
              No pending patch.
            </div>
          )}

          {/* Commit History Timeline */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-zinc-500 font-mono tracking-wider">
              Commits ({commits.length})
            </span>
            <div className="space-y-1">
              {commits.map(c => (
                <div
                  key={c.sha}
                  onClick={() => setSelectedCommitSha(c.sha)}
                  className={`p-2 rounded border cursor-pointer transition text-xs font-mono ${
                    selectedCommitSha === c.sha
                      ? "bg-zinc-900 border-blue-500/60 text-zinc-100"
                      : "bg-[#000000] border-zinc-800/80 text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-blue-400 font-bold">{c.short_sha}</span>
                    <span className="text-zinc-500">{c.date}</span>
                  </div>
                  <div className="text-[11px] font-sans text-zinc-200 truncate mt-1">{c.message}</div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{c.author}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ================= 3. GRAPH SYMBOL NAVIGATOR ================= */}
      {activeView === 'graph' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-2 border-b border-zinc-800">
            <div className="relative">
              <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter graph symbols..."
                className="w-full bg-[#000000] border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {graphNodes.map(node => (
              <div
                key={node.id}
                onClick={() => onSelectGraphNode(node)}
                className="flex items-center justify-between px-2 py-1 rounded text-xs font-mono cursor-pointer hover:bg-zinc-900/60 transition group"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    node.label === 'Function' ? 'bg-blue-400' :
                    node.label === 'Module' ? 'bg-zinc-400' :
                    node.label === 'Commit' ? 'bg-zinc-500' :
                    node.label === 'Finding' ? 'bg-blue-300' : 'bg-zinc-600'
                  }`}></span>
                  <span className="text-zinc-300 group-hover:text-white truncate">
                    {node.name || node.display_name}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0">{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 4. EVIDENCE REGISTRY SIDEBAR VIEW ================= */}
      {activeView === 'evidence' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {evidenceList.length === 0 ? (
            <div className="text-xs text-zinc-500 font-mono p-3 text-center">
              No evidence recorded yet.
            </div>
          ) : (
            evidenceList.map((ev, idx) => (
              <div
                key={ev.evidence_id || idx}
                onClick={() => onSelectEvidence && onSelectEvidence(ev)}
                className="p-2 bg-[#000000] border border-zinc-800/80 rounded hover:border-zinc-700 cursor-pointer transition text-xs font-mono space-y-1"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-blue-400 font-bold">{ev.evidence_id}</span>
                  <span className="text-zinc-500">{ev.source_tool}</span>
                </div>
                <div className="text-zinc-200 text-[11px] font-sans leading-tight line-clamp-2">
                  {ev.claim}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ================= 5. REPO INGESTION VIEW ================= */}
      {activeView === 'ingest' && (
        <div className="flex-1 p-3 space-y-3 text-xs font-mono">
          <div className="text-zinc-400 text-[11px]">
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
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500 text-blue-400 rounded font-bold transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {isIngesting ? <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-blue-400" /> : <FolderGit2 size={16} strokeWidth={1.8} className="text-blue-400" />}
            <span>{isIngesting ? "Ingesting..." : "Ingest Repository"}</span>
          </button>
          {ingestStatus && (
            <div className="text-[10px] text-zinc-300 leading-relaxed bg-[#000000] p-2 rounded border border-zinc-800">
              {ingestStatus}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
