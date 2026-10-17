// src/components/GraphCanvas.jsx
import React, { useRef, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { 
  ZoomIn, ZoomOut, Maximize2, Search, X, 
  RotateCcw, Info, Database, Layers, Check 
} from 'lucide-react';

export default function GraphCanvas({
  graphData,
  activeTenant,
  highlightedNodes = new Set(),
  selectedNode,
  setSelectedNode,
  onNodeClick
}) {
  const fgRef = useRef();
  const [searchQuery, setSearchQuery] = useState('');

  // Custom node rendering on Force Graph Canvas
  const paintNode = (node, ctx, globalScale) => {
    const isHighlighted = 
      highlightedNodes.has(node.display_name) || 
      highlightedNodes.has(node.name) || 
      highlightedNodes.has(node.id) ||
      (searchQuery && (node.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) || node.name?.toLowerCase().includes(searchQuery.toLowerCase())));

    const isSelected = selectedNode?.id === node.id;
    const radius = isHighlighted || isSelected ? 8 : 5;

    let color = "#3b82f6"; // default blue
    if (node.label === "Function") color = isHighlighted ? "#ef4444" : "#60a5fa";
    if (node.label === "Module") color = "#10b981";
    if (node.label === "Engineer") color = "#f59e0b";
    if (node.label === "Commit") color = "#8b5cf6";
    if (node.label === "Finding") color = "#ec4899";
    if (node.label === "Session") color = "#64748b";

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();

    // Traversed path halo
    if (isHighlighted || isSelected) {
      ctx.lineWidth = 2.5 / globalScale;
      ctx.strokeStyle = isSelected ? "#38bdf8" : "#fbbf24"; // Sky for selected, gold for traversed
      ctx.stroke();

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI, false);
      ctx.strokeStyle = isSelected ? "rgba(56, 189, 248, 0.4)" : "rgba(251, 191, 36, 0.4)";
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
    }

    // Label text
    const label = node.display_name || node.name || node.id;
    const fontSize = 11 / globalScale;
    ctx.font = `${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = isHighlighted || isSelected ? "#f8fafc" : "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(label, node.x, node.y + radius + fontSize + 2);
  };

  const handleZoomIn = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() * 1.3, 400);
    }
  };

  const handleZoomOut = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() / 1.3, 400);
    }
  };

  const handleFitView = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  };

  const handleSearchNode = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const found = graphData.nodes.find(n => 
      n.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.id?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (found && fgRef.current) {
      fgRef.current.centerAt(found.x, found.y, 600);
      fgRef.current.zoom(2.5, 600);
      setSelectedNode(found);
    }
  };

  return (
    <div className="flex-1 relative bg-slate-950 flex flex-col h-full overflow-hidden">
      
      {/* Top Floating Namespace & Stats Badge */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3.5 py-2 rounded-xl shadow-2xl">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
        <span className="text-xs font-mono text-slate-300">
          FalkorDB Namespace: <strong className="text-white">repo:{activeTenant}</strong>
        </span>
        <span className="text-xs text-slate-600">|</span>
        <span className="text-xs text-slate-400 font-mono">
          {graphData.nodes.length} Nodes, {graphData.links.length} Edges
        </span>
        {highlightedNodes.size > 0 && (
          <>
            <span className="text-xs text-slate-600">|</span>
            <span className="text-xs font-mono text-amber-300 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>{highlightedNodes.size} Traversed</span>
            </span>
          </>
        )}
      </div>

      {/* Floating Canvas Controls & Node Search */}
      <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
        <form onSubmit={handleSearchNode} className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search node..."
            className="bg-slate-900/90 backdrop-blur border border-slate-800 text-xs rounded-lg pl-8 pr-7 py-1.5 text-slate-200 outline-none focus:border-sky-500 font-mono w-44"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        <div className="flex items-center space-x-1 bg-slate-900/90 backdrop-blur border border-slate-800 p-1 rounded-lg">
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitView}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Selected Node Tooltip Card */}
      {selectedNode && (
        <div className="absolute top-16 right-4 z-10 bg-slate-900/95 backdrop-blur-md border border-slate-700 p-3.5 rounded-xl shadow-2xl max-w-sm space-y-2 text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="font-mono text-sky-400 font-bold uppercase tracking-wider text-[11px]">
              {selectedNode.label} Node
            </span>
            <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="font-bold text-white text-sm font-mono break-all">{selectedNode.display_name}</div>
          {selectedNode.file && (
            <div className="text-[11px] text-slate-300 font-mono flex items-center space-x-1">
              <span className="text-slate-500">file:</span>
              <span className="text-emerald-400">{selectedNode.file}</span>
              {selectedNode.lineno && <span className="text-slate-500">:{selectedNode.lineno}</span>}
            </div>
          )}
          {selectedNode.qname && (
            <div className="text-[10px] text-slate-400 font-mono truncate">
              qname: {selectedNode.qname}
            </div>
          )}
          {selectedNode.message && (
            <div className="text-[11px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800">
              {selectedNode.message}
            </div>
          )}
          {selectedNode.decision_tag && (
            <div className="text-[11px] text-amber-300 font-mono font-semibold">
              Tag: {selectedNode.decision_tag}
            </div>
          )}
          {selectedNode.summary && (
            <div className="text-[11px] text-pink-300 bg-slate-950 p-2 rounded border border-slate-800">
              {selectedNode.summary}
            </div>
          )}
        </div>
      )}

      {/* Schema Legend */}
      <div className="absolute bottom-4 right-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3.5 rounded-xl shadow-2xl space-y-1.5 text-[11px]">
        <div className="font-bold text-slate-300 pb-1 border-b border-slate-800 flex items-center justify-between">
          <span>Graph Schema Legend</span>
          <span className="text-[10px] text-slate-500 font-mono">FalkorDB</span>
        </div>
        <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span><span className="text-slate-300">Function (AST Code)</span></div>
        <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span className="text-slate-300">Module (Python File)</span></div>
        <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span className="text-slate-300">Engineer (Owner)</span></div>
        <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span><span className="text-slate-300">Git Commit (ADR/INC)</span></div>
        <div className="flex items-center space-x-2"><span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span><span className="text-slate-300">Finding (Episodic Memory)</span></div>
        <div className="flex items-center space-x-2 pt-1 border-t border-slate-800"><span className="w-2.5 h-2.5 rounded-full border border-amber-400 bg-red-500"></span><span className="text-amber-300 font-semibold">Traversed Path Hop</span></div>
      </div>

      {/* Force Directed Graph Canvas */}
      <div className="flex-1 cursor-grab active:cursor-grabbing w-full h-full">
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeId="id"
          nodeLabel={node => `${node.label}: ${node.display_name}`}
          nodeCanvasObject={paintNode}
          onNodeClick={(node) => {
            setSelectedNode(node);
            if (onNodeClick) onNodeClick(node);
          }}
          linkColor={() => "rgba(100, 116, 139, 0.25)"}
          linkWidth={1.5}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleSpeed={0.008}
        />
      </div>

    </div>
  );
}
