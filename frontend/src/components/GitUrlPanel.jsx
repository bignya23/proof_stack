// src/components/GitUrlPanel.jsx
import React, { useState } from 'react';
import { Database, GitBranch, RefreshCw, CircleCheck, AlertCircle, FolderGit2, Layers } from 'lucide-react';

export default function GitUrlPanel({ 
  onIngest, 
  activeTenant, 
  setActiveTenant, 
  isIngesting, 
  ingestStatus 
}) {
  const [repoInput, setRepoInput] = useState("./sample_fintech_repo");
  const [tenantInput, setTenantInput] = useState(activeTenant || "sample-fintech");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onIngest) {
      onIngest(repoInput, tenantInput);
    }
  };

  const handleSelectPreset = (path, tenant) => {
    setRepoInput(path);
    setTenantInput(tenant);
  };

  return (
    <div className="space-y-4">
      
      {/* Intro Header */}
      <div className="space-y-1">
        <h3 className="text-xs font-bold text-zinc-200 flex items-center space-x-1.5 font-mono">
          <FolderGit2 size={16} strokeWidth={1.8} className="text-blue-400" />
          <span>Codebase & Knowledge Graph Ingestion</span>
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed font-sans">
          Ingest any local folder path or public GitHub URL. FalkorDB parses AST function call graphs, modules, and Git commits with architectural tags.
        </p>
      </div>

      {/* Preset Buttons (Button text strictly in blue) */}
      <div>
        <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">Quick Presets</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <button
            type="button"
            onClick={() => handleSelectPreset("./sample_fintech_repo", "sample-fintech")}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-blue-400 hover:border-blue-500/50 hover:bg-zinc-850 transition flex items-center space-x-1.5 font-mono"
          >
            <FolderGit2 size={14} strokeWidth={1.8} className="text-blue-400" />
            <span>Sample Fintech Repo (Local)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("https://github.com/fastapi/fastapi", "fastapi-demo")}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-blue-400 hover:border-blue-500/50 hover:bg-zinc-850 transition flex items-center space-x-1.5 font-mono"
          >
            <Database size={14} strokeWidth={1.8} className="text-blue-400" />
            <span>FastAPI GitHub Repo</span>
          </button>
        </div>
      </div>

      {/* Ingestion Form */}
      <form onSubmit={handleSubmit} className="space-y-3 p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
        <div>
          <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Repository Path or Git URL</label>
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="./sample_fintech_repo or https://github.com/..."
            className="w-full mt-1 bg-[#000000] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-blue-500 outline-none font-mono"
            required
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Tenant Namespace (FalkorDB Graph Key)</label>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs font-mono text-zinc-500">repo:</span>
            <input
              type="text"
              value={tenantInput}
              onChange={(e) => setTenantInput(e.target.value)}
              placeholder="sample-fintech"
              className="flex-1 bg-[#000000] border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-blue-500 outline-none font-mono"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isIngesting}
          className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500 text-blue-400 text-xs font-bold rounded-lg flex items-center justify-center space-x-2 transition disabled:opacity-50 font-mono"
        >
          {isIngesting ? (
            <>
              <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-blue-400" />
              <span>Parsing AST & Ingesting into FalkorDB...</span>
            </>
          ) : (
            <>
              <Database size={16} strokeWidth={1.8} className="text-blue-400" />
              <span>Ingest Repository into FalkorDB</span>
            </>
          )}
        </button>
      </form>

      {/* Ingest Status Message */}
      {ingestStatus && (
        <div className={`p-3 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
          ingestStatus.toLowerCase().includes("success")
            ? "bg-zinc-950 border-zinc-800 text-emerald-400"
            : ingestStatus.toLowerCase().includes("error") || ingestStatus.toLowerCase().includes("failed")
            ? "bg-zinc-950 border-zinc-800 text-rose-400"
            : "bg-zinc-950 border-zinc-800 text-blue-400"
        }`}>
          {ingestStatus.toLowerCase().includes("success") ? (
            <CircleCheck size={16} strokeWidth={1.8} className="text-emerald-400 shrink-0" />
          ) : (
            <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-blue-400 shrink-0" />
          )}
          <span>{ingestStatus}</span>
        </div>
      )}

      {/* FalkorDB Ingest Architecture Info */}
      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-[11px] text-zinc-400 font-mono">
        <div className="font-semibold text-zinc-300 flex items-center space-x-1.5">
          <Layers size={14} strokeWidth={1.8} className="text-blue-400" />
          <span>FalkorDB Graph Entities Ingested</span>
        </div>
        <ul className="space-y-1 list-disc list-inside text-zinc-400 pl-1 text-[10px]">
          <li><span className="text-zinc-200">(:Function)</span> nodes with parameters, lineno, and AST call paths</li>
          <li><span className="text-zinc-200">(:Module)</span> nodes mapping Python source file hierarchies</li>
          <li><span className="text-zinc-200">(:Commit)</span> nodes extracting <code className="text-blue-400 font-bold">[ADR-xxx]</code> decision tags</li>
          <li><span className="text-zinc-200">(:Engineer)</span> nodes linking author ownership and blame history</li>
        </ul>
      </div>

    </div>
  );
}
