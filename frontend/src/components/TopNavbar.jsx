import React from 'react';
import { 
  Network, Database, PanelRightOpen, 
  PanelRightClose, RefreshCw, Sparkles 
} from 'lucide-react';

export default function TopNavbar({
  activeTenant,
  tenants = ["sample-fintech"],
  setActiveTenant,
  llmStatus,
  graphData,
  isRightPanelOpen,
  setIsRightPanelOpen,
  isStreaming
}) {
  return (
    <header className="h-11 bg-[#09090b] border-b border-zinc-800 px-3 flex items-center justify-between select-none z-20 shrink-0">
      
      {/* Left: Brand Identity & Repo Breadcrumb */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-400">
            <Network size={16} strokeWidth={1.8} />
          </div>
          <span className="font-bold text-xs tracking-tight text-zinc-100 font-sans">
            ProofStack
          </span>
        </div>

        <span className="text-zinc-700">/</span>

        {/* Multigraph Tenant Selector */}
        <div className="flex items-center space-x-1.5">
          <Database size={16} strokeWidth={1.8} className="text-zinc-500" />
          <select 
            value={activeTenant} 
            onChange={(e) => setActiveTenant(e.target.value)}
            className="bg-transparent text-xs text-zinc-300 font-mono font-medium outline-none cursor-pointer hover:text-white"
          >
            {tenants.map(t => (
              <option key={t} value={t} className="bg-zinc-900 text-zinc-200">
                repo:{t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center: Live Telemetry Status Pills */}
      <div className="hidden md:flex items-center space-x-2">
        {/* Engine status */}
        <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
          <span className="text-zinc-500">Engine:</span>
          <span className="text-zinc-200 font-medium">
            {llmStatus?.engine_type === "azure_openai" 
              ? `Azure Foundry (${llmStatus.model || 'gpt-5'})`
              : llmStatus?.engine_type === "openai"
              ? `OpenAI (${llmStatus.model || 'gpt-4o'})`
              : "FalkorDB Reasoner"}
          </span>
        </div>

        {/* FalkorDB graph status */}
        <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
          <span className="text-zinc-500">Graph:</span>
          <span className="text-zinc-200 font-medium">
            {graphData?.nodes?.length || 0} nodes, {graphData?.links?.length || 0} edges
          </span>
        </div>
      </div>

      {/* Right: Copilot Drawer Toggle Button (Button text strictly in blue) */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className={`h-7 px-2.5 rounded border text-xs font-mono font-medium transition flex items-center space-x-1.5 text-blue-400 ${
            isRightPanelOpen
              ? "bg-zinc-900 border-blue-500/60"
              : "bg-zinc-900 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-850"
          }`}
          title={isRightPanelOpen ? "Close Copilot" : "Open Copilot"}
        >
          {isStreaming ? (
            <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-blue-400" />
          ) : (
            <Sparkles size={16} strokeWidth={1.8} className="text-blue-400" />
          )}
          <span>Copilot</span>
          {isRightPanelOpen ? (
            <PanelRightClose size={16} strokeWidth={1.8} className="opacity-70 text-blue-400" />
          ) : (
            <PanelRightOpen size={16} strokeWidth={1.8} className="opacity-70 text-blue-400" />
          )}
        </button>
      </div>

    </header>
  );
}
