// src/components/TopNavbar.jsx
import React from 'react';
import { 
  Network, Database, PanelRightOpen, PanelRightClose 
} from 'lucide-react';

export default function TopNavbar({
  activeTenant,
  tenants = ["sample-fintech"],
  setActiveTenant,
  isRightPanelOpen,
  setIsRightPanelOpen
}) {
  return (
    <header className="h-11 bg-[#09090b] border-b border-zinc-800 px-3.5 flex items-center justify-between select-none z-20 shrink-0">
      
      {/* Left Spacer to keep middle items perfectly centered */}
      <div className="flex-1" />

      {/* Middle: Brand Identity & Repo Breadcrumb */}
      <div className="flex items-center space-x-3 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100">
            <Network size={16} strokeWidth={1.8} />
          </div>
          <span className="font-bold text-xs tracking-tight text-zinc-100 font-sans">
            ProofStack
          </span>
        </div>

        <span className="text-zinc-700">/</span>

        {/* Multigraph Tenant Selector */}
        <div className="flex items-center space-x-1.5">
          <Database size={16} strokeWidth={1.8} className="text-zinc-400" />
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

      {/* Complete Right: Panel Drawer Toggle Button (Star icon removed) */}
      <div className="flex-1 flex items-center justify-end">
        <button
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className={`h-7 w-7 rounded border transition flex items-center justify-center text-zinc-300 hover:text-white ${
            isRightPanelOpen
              ? "bg-zinc-900 border-zinc-700"
              : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850"
          }`}
          title={isRightPanelOpen ? "Close panel" : "Open panel"}
        >
          {isRightPanelOpen ? (
            <PanelRightClose size={15} strokeWidth={1.8} className="text-zinc-200" />
          ) : (
            <PanelRightOpen size={15} strokeWidth={1.8} className="text-zinc-200" />
          )}
        </button>
      </div>

    </header>
  );
}
