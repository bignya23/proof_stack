// src/components/GitUrlPanel.jsx
import React, { useState } from 'react';
import { Database, GitBranch, RefreshCw, CheckCircle2, AlertCircle, FolderGit2, Layers, Cpu } from 'lucide-react';

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
        <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
          <FolderGit2 className="w-4 h-4 text-sky-400" />
          <span>Codebase & Knowledge Graph Ingestion</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Ingest any local folder path or public GitHub URL. FalkorDB parses AST function call graphs, modules, and Git commits with architectural tags.
        </p>
      </div>

      {/* Preset Buttons */}
      <div>
        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Quick Presets</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <button
            type="button"
            onClick={() => handleSelectPreset("./sample_fintech_repo", "sample-fintech")}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition flex items-center space-x-1.5"
          >
            <span>💳</span>
            <span>Sample Fintech Repo (Local)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("https://github.com/fastapi/fastapi", "fastapi-demo")}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition flex items-center space-x-1.5"
          >
            <span>🚀</span>
            <span>FastAPI GitHub Repo</span>
          </button>
        </div>
      </div>

      {/* Ingestion Form */}
      <form onSubmit={handleSubmit} className="space-y-3 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl">
        <div>
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Repository Path or Git URL</label>
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="./sample_fintech_repo or https://github.com/..."
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-sky-500 outline-none font-mono"
            required
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tenant Namespace (FalkorDB Graph Key)</label>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs font-mono text-slate-500">repo:</span>
            <input
              type="text"
              value={tenantInput}
              onChange={(e) => setTenantInput(e.target.value)}
              placeholder="sample-fintech"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-sky-500 outline-none font-mono"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isIngesting}
          className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-sky-950/50 flex items-center justify-center space-x-2 transition disabled:opacity-50"
        >
          {isIngesting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Parsing AST & Ingesting into FalkorDB...</span>
            </>
          ) : (
            <>
              <Database className="w-4 h-4" />
              <span>Ingest Repository into FalkorDB</span>
            </>
          )}
        </button>
      </form>

      {/* Ingest Status Message */}
      {ingestStatus && (
        <div className={`p-3 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
          ingestStatus.toLowerCase().includes("success")
            ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
            : ingestStatus.toLowerCase().includes("error") || ingestStatus.toLowerCase().includes("failed")
            ? "bg-rose-950/40 border-rose-500/50 text-rose-300"
            : "bg-sky-950/40 border-sky-500/50 text-sky-300"
        }`}>
          {ingestStatus.toLowerCase().includes("success") ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
          )}
          <span>{ingestStatus}</span>
        </div>
      )}

      {/* FalkorDB Ingest Architecture Info */}
      <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2 text-[11px] text-slate-400">
        <div className="font-semibold text-slate-300 flex items-center space-x-1.5">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          <span>FalkorDB Graph Entities Ingested</span>
        </div>
        <ul className="space-y-1 list-disc list-inside text-slate-400 pl-1 font-mono text-[10px]">
          <li><span className="text-slate-200">(:Function)</span> nodes with parameters, lineno, and AST call paths</li>
          <li><span className="text-slate-200">(:Module)</span> nodes mapping Python source file hierarchies</li>
          <li><span className="text-slate-200">(:Commit)</span> nodes extracting <code className="text-amber-300">[ADR-xxx]</code> decision tags</li>
          <li><span className="text-slate-200">(:Engineer)</span> nodes linking author ownership and blame history</li>
        </ul>
      </div>

    </div>
  );
}
