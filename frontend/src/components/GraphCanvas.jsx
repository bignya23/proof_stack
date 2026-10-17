// src/components/GraphCanvas.jsx
import React, { useRef, useState, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { 
  ZoomIn, ZoomOut, Maximize2, Search, X, 
  RotateCcw, Info, Database, Layers, Check, Copy,
  ArrowRight, ExternalLink, Compass, Shield, GitCommit
} from 'lucide-react';

export default function GraphCanvas({
  graphData,
  activeTenant,
  highlightedNodes = new Set(),
  executionPath = null,
  selectedNode,
  setSelectedNode,
  onNodeClick
}) {
  const fgRef = useRef();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Configure d3 force physics for ideal spacing and anti-collision
  useEffect(() => {
    if (fgRef.current) {
      const linkForce = fgRef.current.d3Force('link');
      if (linkForce) {
        linkForce.distance(link => {
          if (link.type === 'CALLS') return 100;
          if (link.type === 'DEFINES') return 70;
          if (link.type === 'AUTHORED') return 75;
          return 85;
        });
      }
      const chargeForce = fgRef.current.d3Force('charge');
      if (chargeForce) {
        chargeForce.strength(-250); // Strong repulsion prevents clumping
      }
    }
  }, [graphData]);

  // Extract node names and edge transitions for the investigated path
  const { pathNodeNames, pathEdgeTransitions } = useMemo(() => {
    const nodeNames = new Set();
    const transitions = new Set();

    if (executionPath?.nodes && Array.isArray(executionPath.nodes)) {
      const nodes = executionPath.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const curr = typeof nodes[i] === 'string' ? nodes[i] : nodes[i]?.name;
        if (curr) nodeNames.add(curr);

        if (i < nodes.length - 1) {
          const next = typeof nodes[i + 1] === 'string' ? nodes[i + 1] : nodes[i + 1]?.name;
          if (curr && next) {
            transitions.add(`${curr}->${next}`);
            transitions.add(`${next}->${curr}`);
          }
        }
      }
    }
    return { pathNodeNames: nodeNames, pathEdgeTransitions: transitions };
  }, [executionPath]);

  // Clean, human-readable node name — keeping raw UUIDs and numeric IDs hidden
  const getCleanNodeName = (node) => {
    if (!node) return "";
    if (node.label === "Commit") {
      if (node.sha) return `git:${node.sha.slice(0, 7)}`;
      if (node.display_name && !node.display_name.startsWith("commit-") && isNaN(node.display_name)) {
        return node.display_name;
      }
      return "Git Commit";
    }
    if (node.label === "Finding") {
      return node.id && String(node.id).startsWith("mem-") ? node.id : "Finding mem-001";
    }
    if (node.label === "Session") {
      return node.id && String(node.id).startsWith("session-") ? node.id : "Session";
    }
    if (node.name) return node.name;
    if (node.display_name && isNaN(node.display_name)) {
      return node.display_name;
    }
    return `${node.label} Symbol`;
  };

  // Check if a node is in the investigated path or highlighted
  const isNodeInvestigated = (node) => {
    const name = node.name || node.display_name;
    const id = String(node.id);
    return (
      highlightedNodes.has(name) ||
      highlightedNodes.has(id) ||
      pathNodeNames.has(name) ||
      pathNodeNames.has(id)
    );
  };

  // Check if a link is part of the currently investigated execution path
  const isInvestigatedLink = (link) => {
    const srcName = link.source?.name || link.source?.display_name || link.source;
    const tgtName = link.target?.name || link.target?.display_name || link.target;
    const srcId = String(link.source?.id || link.source);
    const tgtId = String(link.target?.id || link.target);

    // 1. Direct match in execution path consecutive sequence
    if (
      pathEdgeTransitions.has(`${srcName}->${tgtName}`) ||
      pathEdgeTransitions.has(`${tgtName}->${srcName}`) ||
      pathEdgeTransitions.has(`${srcId}->${tgtId}`) ||
      pathEdgeTransitions.has(`${tgtId}->${srcId}`)
    ) {
      return true;
    }

    // 2. Or if both endpoints are highlighted and it's a CALLS relationship
    const isSrcHighlighted = highlightedNodes.has(srcName) || highlightedNodes.has(srcId);
    const isTgtHighlighted = highlightedNodes.has(tgtName) || highlightedNodes.has(tgtId);
    if (link.type === 'CALLS' && isSrcHighlighted && isTgtHighlighted) {
      return true;
    }

    return false;
  };

  // Link color based on type and investigation state
  const getLinkColor = (link) => {
    if (isInvestigatedLink(link)) {
      return "#fbbf24"; // Radiant Gold for currently investigated path
    }
    switch (link.type) {
      case "CALLS":
        return "rgba(56, 189, 248, 0.55)"; // Sky blue
      case "DEFINES":
        return "rgba(20, 184, 166, 0.35)"; // Teal
      case "IMPORTS":
        return "rgba(16, 185, 129, 0.35)"; // Emerald
      case "OWNERSHIP":
      case "AUTHORED":
        return "rgba(245, 158, 11, 0.35)"; // Amber
      case "MODIFIED":
        return "rgba(168, 85, 247, 0.35)"; // Purple
      case "ATTACHED_TO":
      case "RECORDED":
        return "rgba(244, 63, 94, 0.55)";  // Rose
      default:
        return "rgba(100, 116, 139, 0.3)";  // Slate
    }
  };

  // Node base color
  const getNodeColor = (node, isInvestigated) => {
    switch (node.label) {
      case "Function":
        return isInvestigated ? "#f59e0b" : "#38bdf8"; // Gold when investigated, Sky Blue otherwise
      case "Module":
        return "#10b981"; // Emerald
      case "Engineer":
        return "#f97316"; // Orange
      case "Commit":
        return "#a855f7"; // Purple
      case "Finding":
        return "#ec4899"; // Pink
      case "Session":
        return "#64748b"; // Slate
      default:
        return "#60a5fa";
    }
  };

  // Custom node rendering on Force Graph Canvas
  const paintNode = (node, ctx, globalScale) => {
    const isInvestigated = isNodeInvestigated(node);
    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoveredNode?.id === node.id;
    const isSearchMatch = searchQuery && (
      node.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const radius = isInvestigated || isSelected ? 8 : (isHovered ? 7 : 5.5);
    const color = getNodeColor(node, isInvestigated);

    // 1. Draw outer gold glow halo for investigated path nodes
    if (isInvestigated || isSelected || isSearchMatch) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = isSelected 
        ? "rgba(56, 189, 248, 0.3)" 
        : (isInvestigated ? "rgba(251, 191, 36, 0.35)" : "rgba(239, 68, 68, 0.3)");
      ctx.fill();
    }

    // 2. Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();

    // 3. Ring border: Gold for investigated path, Sky for selected
    if (isInvestigated || isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
      ctx.strokeStyle = isSelected ? "#38bdf8" : "#fbbf24"; // Gold ring for investigated!
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();
    }

    // 4. Anti-Collision Text Rendering:
    // Only render full text when zoomed in (globalScale >= 1.25), or if the node is investigated/selected/hovered
    const shouldDrawLabel = isInvestigated || isSelected || isHovered || isSearchMatch || globalScale >= 1.25;

    if (shouldDrawLabel) {
      const rawLabel = getCleanNodeName(node);
      const label = rawLabel.length > 20 ? `${rawLabel.slice(0, 18)}…` : rawLabel;
      const fontSize = Math.max(9.5 / globalScale, 3);
      ctx.font = `${isInvestigated || isSelected ? '600' : '400'} ${fontSize}px 'JetBrains Mono', Inter, monospace`;

      const textMetrics = ctx.measureText(label);
      const textWidth = textMetrics.width;
      const paddingX = 3.5 / globalScale;
      const paddingY = 2 / globalScale;
      const pillHeight = fontSize + paddingY * 2;
      const pillWidth = textWidth + paddingX * 2;
      const pillY = node.y + radius + 2.5 / globalScale;

      // Dark backdrop pill to prevent edge line collisions
      ctx.fillStyle = isInvestigated || isSelected 
        ? "rgba(15, 23, 42, 0.95)" 
        : "rgba(15, 23, 42, 0.78)";
      
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(node.x - pillWidth / 2, pillY, pillWidth, pillHeight, 3 / globalScale);
      } else {
        ctx.rect(node.x - pillWidth / 2, pillY, pillWidth, pillHeight);
      }
      ctx.fill();

      // Pill border (gold if investigated, sky if selected)
      if (isInvestigated || isSelected) {
        ctx.strokeStyle = isSelected ? "#38bdf8" : "#fbbf24";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      // Text label
      ctx.fillStyle = isInvestigated ? "#fef08a" : (isSelected ? "#7dd3fc" : "#cbd5e1");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, node.x, pillY + pillHeight / 2);
    }
  };

  // Node hit area for smooth hover & click
  const paintNodeArea = (node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Canvas zoom & pan helpers
  const handleZoomIn = () => fgRef.current && fgRef.current.zoom(fgRef.current.zoom() * 1.3, 400);
  const handleZoomOut = () => fgRef.current && fgRef.current.zoom(fgRef.current.zoom() / 1.3, 400);
  const handleFitView = () => fgRef.current && fgRef.current.zoomToFit(400, 60);

  const handleCenterNode = (node) => {
    if (node && fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 500);
      fgRef.current.zoom(2.5, 500);
    }
  };

  const handleSearchNode = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const found = graphData.nodes.find(n => 
      n.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (found) {
      handleCenterNode(found);
      setSelectedNode(found);
    }
  };

  const handleCopyNodeId = (id) => {
    navigator.clipboard.writeText(String(id));
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Connected edges for the selected node in the inspector
  const connectedNeighbors = useMemo(() => {
    if (!selectedNode || !graphData.links) return { incoming: [], outgoing: [] };
    const id = String(selectedNode.id);
    const name = selectedNode.name;

    const incoming = [];
    const outgoing = [];

    graphData.links.forEach(l => {
      const srcId = String(l.source?.id || l.source);
      const tgtId = String(l.target?.id || l.target);
      const srcName = l.source?.name || l.source?.display_name || srcId;
      const tgtName = l.target?.name || l.target?.display_name || tgtId;

      if (tgtId === id || tgtName === name) {
        incoming.push({ type: l.type, from: srcName, line: l.line });
      }
      if (srcId === id || srcName === name) {
        outgoing.push({ type: l.type, to: tgtName, line: l.line });
      }
    });

    return { incoming, outgoing };
  }, [selectedNode, graphData.links]);

  return (
    <div className="flex-1 relative bg-slate-950 flex flex-col h-full overflow-hidden select-none">
      
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
        {(highlightedNodes.size > 0 || pathNodeNames.size > 0) && (
          <>
            <span className="text-xs text-slate-600">|</span>
            <span className="text-xs font-mono text-amber-300 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>{Math.max(highlightedNodes.size, pathNodeNames.size)} Hops in Investigated Path</span>
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
            placeholder="Find function/module..."
            className="bg-slate-900/90 backdrop-blur border border-slate-800 text-xs rounded-lg pl-8 pr-7 py-1.5 text-slate-200 outline-none focus:border-amber-500 font-mono w-44"
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
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitView}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ================= NODE INSPECTOR MODAL PANEL ================= */}
      {selectedNode && (
        <div className="absolute top-16 right-4 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-4 rounded-xl shadow-2xl max-w-sm w-88 space-y-3 text-xs animate-in fade-in duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                selectedNode.label === 'Function' ? 'bg-sky-950 text-sky-400 border border-sky-800/40' :
                selectedNode.label === 'Module' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' :
                selectedNode.label === 'Engineer' ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                selectedNode.label === 'Commit' ? 'bg-purple-950 text-purple-400 border border-purple-800/40' :
                selectedNode.label === 'Finding' ? 'bg-pink-950 text-pink-400 border border-pink-800/40' :
                'bg-slate-800 text-slate-300'
              }`}>
                {selectedNode.label}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Node Inspector</span>
            </div>
            <button 
              onClick={() => setSelectedNode(null)} 
              className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Symbol Title */}
          <div>
            <div className="font-bold text-white text-sm font-mono break-all">
              {getCleanNodeName(selectedNode)}
            </div>
            {selectedNode.qname && (
              <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                {selectedNode.qname}
              </div>
            )}
          </div>

          {/* Hidden FalkorDB UUID & Internal ID (Only visible in Inspector!) */}
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[10px] uppercase font-bold">FalkorDB Internal Node ID</span>
              <button
                onClick={() => handleCopyNodeId(selectedNode.id)}
                className="text-[10px] text-slate-400 hover:text-amber-400 flex items-center space-x-1"
                title="Copy ID"
              >
                {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <div className="text-amber-300 font-bold break-all">#{selectedNode.id}</div>
            {selectedNode.sha && (
              <div className="text-[10px] text-purple-300 pt-1 border-t border-slate-900">
                Commit SHA: <span className="font-bold">{selectedNode.sha}</span>
              </div>
            )}
          </div>

          {/* File location */}
          {(selectedNode.file || selectedNode.path) && (
            <div className="text-[11px] text-slate-300 font-mono flex items-center space-x-1.5 bg-slate-950/50 px-2 py-1.5 rounded border border-slate-800">
              <span className="text-slate-500">path:</span>
              <span className="text-emerald-400 truncate">{selectedNode.file || selectedNode.path}</span>
              {selectedNode.lineno && <span className="text-slate-500 font-bold">:{selectedNode.lineno}</span>}
              {selectedNode.loc && <span className="text-slate-500 text-[10px]">({selectedNode.loc} loc)</span>}
            </div>
          )}

          {/* Message / Decision Tag / Finding Summary */}
          {selectedNode.decision_tag && (
            <div className="text-[11px] text-amber-300 font-mono font-semibold bg-amber-950/40 p-2 rounded border border-amber-800/40 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Architectural Decision: {selectedNode.decision_tag}</span>
            </div>
          )}
          {selectedNode.message && (
            <div className="text-[11px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800 leading-relaxed font-sans">
              {selectedNode.message}
            </div>
          )}
          {selectedNode.summary && (
            <div className="text-[11px] text-pink-300 bg-pink-950/20 p-2 rounded border border-pink-800/40 leading-relaxed font-sans">
              <strong className="block text-[10px] uppercase text-pink-400">Incident Memory:</strong>
              {selectedNode.summary}
            </div>
          )}
          {selectedNode.remediation && (
            <div className="text-[11px] text-emerald-300 bg-emerald-950/20 p-2 rounded border border-emerald-800/40 leading-relaxed font-sans">
              <strong className="block text-[10px] uppercase text-emerald-400">Actionable Remediation:</strong>
              {selectedNode.remediation}
            </div>
          )}
          {selectedNode.email && (
            <div className="text-[11px] text-slate-400 font-mono">
              Email: <span className="text-slate-200">{selectedNode.email}</span>
            </div>
          )}

          {/* Connected Graph Relationships */}
          <div className="space-y-1 pt-1 border-t border-slate-800 text-[10px] font-mono">
            <span className="text-slate-500 uppercase font-bold">Connected Real Relationships</span>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
              {connectedNeighbors.incoming.map((rel, idx) => (
                <div key={idx} className="flex items-center space-x-1 text-slate-400">
                  <ArrowRight className="w-2.5 h-2.5 text-sky-400 rotate-180" />
                  <span className="text-sky-300 font-bold">{rel.type}</span>
                  <span className="text-slate-500">from</span>
                  <span className="text-slate-200 truncate">{rel.from}</span>
                  {rel.line && <span className="text-slate-500">:{rel.line}</span>}
                </div>
              ))}
              {connectedNeighbors.outgoing.map((rel, idx) => (
                <div key={idx} className="flex items-center space-x-1 text-slate-400">
                  <ArrowRight className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-amber-300 font-bold">{rel.type}</span>
                  <span className="text-slate-500">to</span>
                  <span className="text-slate-200 truncate">{rel.to}</span>
                  {rel.line && <span className="text-slate-500">:{rel.line}</span>}
                </div>
              ))}
              {connectedNeighbors.incoming.length === 0 && connectedNeighbors.outgoing.length === 0 && (
                <div className="text-slate-500 italic">No direct edges loaded</div>
              )}
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={() => handleCenterNode(selectedNode)}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded text-xs font-medium flex items-center justify-center space-x-1.5 transition"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Center Node in View</span>
          </button>
        </div>
      )}

      {/* Schema & Relationship Legend */}
      <div className="absolute bottom-4 right-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-2xl space-y-1.5 text-[11px]">
        <div className="font-bold text-slate-300 pb-1 border-b border-slate-800 flex items-center justify-between">
          <span>Graph Topology Legend</span>
          <span className="text-[10px] text-slate-500 font-mono">FalkorDB</span>
        </div>
        
        {/* Node types */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <span className="text-slate-300">Function (AST)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-slate-300">Module (File)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="text-slate-300">Engineer</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span className="text-slate-300">Commit (ADR)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span>
            <span className="text-slate-300">Finding (Memory)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
            <span className="text-slate-300">Session</span>
          </div>
        </div>

        {/* Investigated Path Gold Highlight Legend */}
        <div className="pt-1.5 border-t border-slate-800 flex items-center space-x-2 text-[10px]">
          <span className="w-3 h-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400"></span>
          <span className="text-amber-300 font-semibold">Investigated Path (Gold Glow)</span>
        </div>
      </div>

      {/* Force Directed Graph Canvas */}
      <div className="flex-1 cursor-grab active:cursor-grabbing w-full h-full">
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeId="id"
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintNodeArea}
          // Short label on hover
          nodeLabel={node => `${node.label}: ${getCleanNodeName(node)}`}
          onNodeClick={(node) => {
            setSelectedNode(node);
            if (onNodeClick) onNodeClick(node);
          }}
          onNodeHover={node => setHoveredNode(node || null)}
          
          // Edge configuration
          linkHoverPrecision={6}
          // Short label on hover for relationships
          linkLabel={link => `${link.type}${link.line ? ` [line ${link.line}]` : ''}`}
          linkColor={getLinkColor}
          linkWidth={link => isInvestigatedLink(link) ? 3.0 : (link.type === 'CALLS' ? 1.8 : 1.2)}
          
          // Directional Arrows on relationships such as CALLS
          linkDirectionalArrowLength={link => {
            if (isInvestigatedLink(link)) return 6.5;
            if (link.type === 'CALLS') return 5.5;
            if (link.type === 'ATTACHED_TO' || link.type === 'RECORDED') return 4.5;
            if (link.type === 'DEFINES' || link.type === 'IMPORTS') return 4.0;
            return 3.5;
          }}
          linkDirectionalArrowRelPos={0.95}
          linkDirectionalArrowColor={link => isInvestigatedLink(link) ? "#fbbf24" : getLinkColor(link)}
          
          // Flowing directional particles on active paths and CALLS
          linkDirectionalParticles={link => {
            if (isInvestigatedLink(link)) return 4;
            if (link.type === 'CALLS') return 2;
            return 0;
          }}
          linkDirectionalParticleWidth={link => isInvestigatedLink(link) ? 2.5 : 1.5}
          linkDirectionalParticleSpeed={link => isInvestigatedLink(link) ? 0.012 : 0.006}
          linkDirectionalParticleColor={link => isInvestigatedLink(link) ? "#fbbf24" : "#38bdf8"}
          onLinkHover={link => setHoveredLink(link || null)}
          
          d3VelocityDecay={0.3}
          cooldownTicks={120}
        />
      </div>

    </div>
  );
}
