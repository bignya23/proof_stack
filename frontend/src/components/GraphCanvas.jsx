// src/components/GraphCanvas.jsx
import React, { useRef, useState, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { 
  ZoomIn, ZoomOut, Maximize2, Search, X, 
  RotateCcw, Info, Database, Layers, Check, Copy,
  ArrowRight, ExternalLink, Compass, ShieldAlert, GitCommit,
  Filter, Eye, EyeOff, Target, Network, ChevronDown, ChevronRight,
  Code2, Sparkles, Sliders, Tag
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
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isInitialFitDone = useRef(false);

  // Global label display toggle (defaults to true so labels are visible at normal zoom)
  const [showLabels, setShowLabels] = useState(true);

  // =========================================================================
  // 1. GRAPH DISPLAY MODES & COLLAPSIBLE MODULES
  // =========================================================================
  // Modes: 'investigation' | 'overview' | 'full'
  const hasInvestigationPath = Boolean(
    (executionPath?.nodes && executionPath.nodes.length > 0) || 
    (highlightedNodes && highlightedNodes.size > 0)
  );

  const [displayMode, setDisplayMode] = useState(
    hasInvestigationPath ? 'investigation' : 'overview'
  );

  // Auto-switch to 'investigation' mode only when a NEW agent investigation run completes
  const prevExecutionPathRef = useRef(null);
  useEffect(() => {
    if (executionPath && executionPath !== prevExecutionPathRef.current) {
      prevExecutionPathRef.current = executionPath;
      setDisplayMode('investigation');
      // Smoothly fit view to the newly investigated path
      setTimeout(() => {
        if (fgRef.current) fgRef.current.zoomToFit(500, 60);
      }, 350);
    }
  }, [executionPath]);

  // Dynamic ResizeObserver: re-measures visible container when side panels toggle so canvas matches container size
  // NOTE: Does NOT call zoomToFit so user zoom/pan is never reset when toggling or clicking side panels!
  useEffect(() => {
    if (!containerRef.current) return;

    const measure = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions(prev => {
            if (prev.width === clientWidth && prev.height === clientHeight) return prev;
            return { width: clientWidth, height: clientHeight };
          });
        }
      }
    };

    measure();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const w = Math.round(width);
          const h = Math.round(height);
          setDimensions(prev => {
            if (prev.width === w && prev.height === h) return prev;
            return { width: w, height: h };
          });
        }
      }
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // When a node is selected from sidebar or navigator, gently center on it without resetting zoom
  const prevSelectedNodeIdRef = useRef(null);
  useEffect(() => {
    if (selectedNode && selectedNode.id !== prevSelectedNodeIdRef.current) {
      prevSelectedNodeIdRef.current = selectedNode.id;
      if (fgRef.current && selectedNode.x != null && selectedNode.y != null) {
        fgRef.current.centerAt(selectedNode.x, selectedNode.y, 400);
      }
    }
  }, [selectedNode]);

  // Initial fit ONLY ONCE when graph first mounts and dimensions become available
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && !isInitialFitDone.current) {
      isInitialFitDone.current = true;
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(400, 60);
        }
      }, 300);
    }
  }, [dimensions]);

  // When activeTenant changes, reset initial fit flag and smoothly center the new repository graph
  useEffect(() => {
    isInitialFitDone.current = false;
    const timer = setTimeout(() => {
      if (fgRef.current) {
        fgRef.current.zoomToFit(400, 60);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [activeTenant]);

  // Collapsed modules state for 'overview' mode and grouping
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [groupFunctionsByModule, setGroupFunctionsByModule] = useState(false);

  // =========================================================================
  // 2. RELATIONSHIP & ENTITY FILTER TOGGLES
  // =========================================================================
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Enabled relationship types (code & git topology)
  const [enabledRelTypes, setEnabledRelTypes] = useState({
    CALLS: true,
    DEFINES: true,
    INHERITS: true,
    AUTHORED: true,
    MODIFIED: true,
  });

  // Enabled node entity types (excluding memory nodes)
  const [enabledNodeTypes, setEnabledNodeTypes] = useState({
    Function: true,
    Class: true,
    Module: true,
    Commit: true,
    Engineer: true,
  });

  // Quick 1-click Preset: Code Path Only (hides commits & engineers)
  const applyCodeOnlyFilter = () => {
    setEnabledRelTypes({
      CALLS: true,
      DEFINES: true,
      INHERITS: true,
      AUTHORED: false,
      MODIFIED: false,
    });
    setEnabledNodeTypes({
      Function: true,
      Class: true,
      Module: true,
      Commit: false,
      Engineer: false,
    });
  };

  const resetAllFilters = () => {
    setEnabledRelTypes({
      CALLS: true,
      DEFINES: true,
      INHERITS: true,
      AUTHORED: true,
      MODIFIED: true,
      RECORDED: true,
    });
    setEnabledNodeTypes({
      Function: true,
      Class: true,
      Module: true,
      Commit: true,
      Engineer: true,
      Finding: true,
      Session: true,
    });
    setFocusedNode(null);
  };

  // =========================================================================
  // 3. LOCAL EXPLORATION & NEIGHBORHOOD FOCUS
  // =========================================================================
  // focusedNode: { id, name, hops: 1 | 2 }
  const [focusedNode, setFocusedNode] = useState(null);

  // Canvas search & hover states
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Physics tuning for balanced layout
  useEffect(() => {
    if (fgRef.current) {
      const linkForce = fgRef.current.d3Force('link');
      if (linkForce) {
        linkForce.distance(link => {
          if (link.type === 'CALLS') return 95;
          if (link.type === 'DEFINES') return 65;
          if (link.type === 'AUTHORED') return 70;
          return 80;
        });
      }
      const chargeForce = fgRef.current.d3Force('charge');
      if (chargeForce) {
        chargeForce.strength(-240);
      }
    }
  }, [graphData]);

  // =========================================================================
  // 4. EXECUTION PATH SEQUENCE & TRANSITIONS
  // =========================================================================
  const { pathNodeNames, pathNodeOrder, pathEdgeTransitions } = useMemo(() => {
    const nodeNames = new Set();
    const nodeOrder = new Map(); // name -> 1-based hop step
    const transitions = new Set();

    if (executionPath?.nodes && Array.isArray(executionPath.nodes)) {
      const nodes = executionPath.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const curr = typeof nodes[i] === 'string' ? nodes[i] : nodes[i]?.name;
        if (curr) {
          nodeNames.add(curr);
          if (!nodeOrder.has(curr)) {
            nodeOrder.set(curr, i + 1);
          }
        }

        if (i < nodes.length - 1) {
          const next = typeof nodes[i + 1] === 'string' ? nodes[i + 1] : nodes[i + 1]?.name;
          if (curr && next) {
            transitions.add(`${curr}->${next}`);
            transitions.add(`${next}->${curr}`);
          }
        }
      }
    }
    return { pathNodeNames: nodeNames, pathNodeOrder: nodeOrder, pathEdgeTransitions: transitions };
  }, [executionPath]);

  // Human-readable node name
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
    if (!node) return false;
    const name = node.name || node.display_name;
    const id = String(node.id);
    return (
      highlightedNodes.has(name) ||
      highlightedNodes.has(id) ||
      pathNodeNames.has(name) ||
      pathNodeNames.has(id)
    );
  };

  // Check if link is in the gold execution path
  const isInvestigatedLink = (link) => {
    const srcName = link.source?.name || link.source?.display_name || link.source;
    const tgtName = link.target?.name || link.target?.display_name || link.target;
    const srcId = String(link.source?.id || link.source);
    const tgtId = String(link.target?.id || link.target);

    if (
      pathEdgeTransitions.has(`${srcName}->${tgtName}`) ||
      pathEdgeTransitions.has(`${tgtName}->${srcName}`) ||
      pathEdgeTransitions.has(`${srcId}->${tgtId}`) ||
      pathEdgeTransitions.has(`${tgtId}->${srcId}`)
    ) {
      return true;
    }

    const isSrcHighlighted = highlightedNodes.has(srcName) || highlightedNodes.has(srcId);
    const isTgtHighlighted = highlightedNodes.has(tgtName) || highlightedNodes.has(tgtId);
    return link.type === 'CALLS' && isSrcHighlighted && isTgtHighlighted;
  };

  // =========================================================================
  // 5. LOCAL EXPLORATION NEIGHBORHOOD COMPUTATION
  // =========================================================================
  const focusedNeighborhood = useMemo(() => {
    if (!focusedNode || !graphData?.links) return null;
    const targetId = String(focusedNode.id);
    const targetName = focusedNode.name;
    const neighborIds = new Set([targetId]);

    // Hop 1
    graphData.links.forEach(l => {
      const sId = String(l.source?.id || l.source);
      const tId = String(l.target?.id || l.target);
      const sName = l.source?.name || l.source?.display_name || sId;
      const tName = l.target?.name || l.target?.display_name || tId;

      if (sId === targetId || sName === targetName) {
        neighborIds.add(tId);
        if (tName) neighborIds.add(tName);
      }
      if (tId === targetId || tName === targetName) {
        neighborIds.add(sId);
        if (sName) neighborIds.add(sName);
      }
    });

    // Hop 2
    if (focusedNode.hops >= 2) {
      const hop1Set = new Set(neighborIds);
      graphData.links.forEach(l => {
        const sId = String(l.source?.id || l.source);
        const tId = String(l.target?.id || l.target);
        const sName = l.source?.name || l.source?.display_name || sId;
        const tName = l.target?.name || l.target?.display_name || tId;

        if (hop1Set.has(sId) || hop1Set.has(sName)) {
          neighborIds.add(tId);
          if (tName) neighborIds.add(tName);
        }
        if (hop1Set.has(tId) || hop1Set.has(tName)) {
          neighborIds.add(sId);
          if (sName) neighborIds.add(sName);
        }
      });
    }

    return neighborIds;
  }, [focusedNode, graphData.links]);

  // Check if a node is relevant to the investigated path (investigated or 1-hop neighbor)
  const isRelevantToInvestigation = useMemo(() => {
    const relevantIds = new Set();
    if (!graphData?.nodes || !graphData?.links) return relevantIds;

    // Add all direct path nodes
    graphData.nodes.forEach(n => {
      if (isNodeInvestigated(n)) {
        relevantIds.add(String(n.id));
        if (n.name) relevantIds.add(n.name);
      }
    });

    // Add 1-hop direct neighbors & connected evidence
    graphData.links.forEach(l => {
      const sId = String(l.source?.id || l.source);
      const tId = String(l.target?.id || l.target);
      const sName = l.source?.name || l.source?.display_name || sId;
      const tName = l.target?.name || l.target?.display_name || tId;

      if (relevantIds.has(sId) || relevantIds.has(sName)) {
        relevantIds.add(tId);
        if (tName) relevantIds.add(tName);
      }
      if (relevantIds.has(tId) || relevantIds.has(tName)) {
        relevantIds.add(sId);
        if (sName) relevantIds.add(sName);
      }
    });

    return relevantIds;
  }, [graphData, highlightedNodes, pathNodeNames]);

  // =========================================================================
  // 6. FILTERED & COMPUTED GRAPH DATA (MODES, FILTERS, CLUSTERS)
  // =========================================================================
  const filteredGraphData = useMemo(() => {
    if (!graphData?.nodes || !graphData?.links) {
      return { nodes: [], links: [] };
    }

    // Filter nodes by enabled entity types and exclude memory nodes
    let visibleNodes = graphData.nodes.filter(n => {
      // Exclude episodic memory nodes from the visual graph
      if (n.label === 'Finding' || n.label === 'Session' || n.label === 'Memory') return false;
      if (n.id && (String(n.id).startsWith('mem-') || String(n.id).startsWith('session-'))) return false;

      // Type filter
      if (enabledNodeTypes[n.label] === false) return false;
      return true;
    });

    // In 'overview' mode, collapse low-level functions unless module is expanded
    if (displayMode === 'overview' || groupFunctionsByModule) {
      visibleNodes = visibleNodes.filter(n => {
        if (n.label === 'Function') {
          // Keep if it's investigated or highlighted
          if (isNodeInvestigated(n)) return true;
          // Keep if its module file is expanded
          const parentFile = n.file || n.path;
          if (parentFile && expandedModules.has(parentFile)) return true;
          // Otherwise hide low-level function in overview
          return false;
        }
        return true;
      });
    }

    const visibleNodeIds = new Set(visibleNodes.map(n => String(n.id)));
    const visibleNodeNames = new Set(visibleNodes.map(n => n.name).filter(Boolean));

    // Filter links by enabled relationship types and visible endpoints
    const visibleLinks = graphData.links.filter(l => {
      // Exclude memory-recording edges
      if (l.type === 'RECORDED' || l.type === 'ATTACHED_TO') return false;
      if (enabledRelTypes[l.type] === false) return false;

      const sId = String(l.source?.id || l.source);
      const tId = String(l.target?.id || l.target);
      const sName = l.source?.name || l.source?.display_name;
      const tName = l.target?.name || l.target?.display_name;

      const sVisible = visibleNodeIds.has(sId) || (sName && visibleNodeNames.has(sName));
      const tVisible = visibleNodeIds.has(tId) || (tName && visibleNodeNames.has(tName));
      return sVisible && tVisible;
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, enabledNodeTypes, enabledRelTypes, displayMode, groupFunctionsByModule, expandedModules, highlightedNodes, pathNodeNames]);

  // Node base color
  const getNodeColor = (node, isInvestigated) => {
    switch (node.label) {
      case "Class":
        return isInvestigated ? "#f59e0b" : "#a855f7"; // Vibrant Violet/Purple for Classes
      case "Function":
        return isInvestigated ? "#f59e0b" : "#38bdf8"; // Gold when investigated, Sky Blue otherwise
      case "Module":
        return "#10b981"; // Emerald
      case "Engineer":
        return "#f97316"; // Orange
      case "Commit":
        return "#c084fc"; // Lavender/Purple
      case "Finding":
        return "#ec4899"; // Pink
      case "Session":
        return "#64748b"; // Slate
      default:
        return "#60a5fa";
    }
  };

  // Node opacity based on display mode & local focus
  const getNodeOpacity = (node) => {
    if (selectedNode?.id === node.id || hoveredNode?.id === node.id) {
      return 1.0;
    }
    const id = String(node.id);
    const name = node.name;

    // 1. Local Focus overrides all
    if (focusedNeighborhood) {
      return (focusedNeighborhood.has(id) || (name && focusedNeighborhood.has(name))) ? 1.0 : 0.10;
    }

    // 2. Investigation Mode: prominently show investigated path, mute neighbors, fade unrelated
    if (displayMode === 'investigation') {
      if (isNodeInvestigated(node)) return 1.0;
      if (isRelevantToInvestigation.has(id) || (name && isRelevantToInvestigation.has(name))) {
        return 0.70; // Nearby dependencies visible but muted
      }
      return 0.12; // Unrelated elements faded
    }

    // 3. Full & Overview modes
    return 1.0;
  };

  // Edge opacity based on display mode & local focus
  const getLinkColor = (link) => {
    const isInvestigated = isInvestigatedLink(link);

    // If local focus is active, fade links outside the focused neighborhood
    if (focusedNeighborhood) {
      const sId = String(link.source?.id || link.source);
      const tId = String(link.target?.id || link.target);
      const sName = link.source?.name || link.source?.display_name;
      const tName = link.target?.name || link.target?.display_name;
      const inNeighborhood = 
        (focusedNeighborhood.has(sId) || (sName && focusedNeighborhood.has(sName))) &&
        (focusedNeighborhood.has(tId) || (tName && focusedNeighborhood.has(tName)));

      if (!inNeighborhood) return "rgba(100, 116, 139, 0.05)";
    }

    if (isInvestigated) {
      return "#fbbf24"; // Radiant Gold for currently investigated path
    }

    // In investigation mode, mute or fade non-investigated links
    if (displayMode === 'investigation') {
      const sId = String(link.source?.id || link.source);
      const tId = String(link.target?.id || link.target);
      const sName = link.source?.name || link.source?.display_name;
      const tName = link.target?.name || link.target?.display_name;

      const isRelevant = 
        (isRelevantToInvestigation.has(sId) || (sName && isRelevantToInvestigation.has(sName))) &&
        (isRelevantToInvestigation.has(tId) || (tName && isRelevantToInvestigation.has(tName)));

      if (!isRelevant) return "rgba(100, 116, 139, 0.08)";
    }

    switch (link.type) {
      case "CALLS":
        return "rgba(56, 189, 248, 0.60)"; // Sky blue
      case "DEFINES":
        return "rgba(20, 184, 166, 0.40)"; // Teal
      case "IMPORTS":
        return "rgba(16, 185, 129, 0.40)"; // Emerald
      case "AUTHORED":
        return "rgba(245, 158, 11, 0.40)"; // Amber
      case "MODIFIED":
        return "rgba(168, 85, 247, 0.40)"; // Purple
      default:
        return "rgba(100, 116, 139, 0.35)";  // Slate
    }
  };

  // Directional arrow head color (vibrant & visible on dark background)
  const getLinkArrowColor = (link) => {
    if (isInvestigatedLink(link)) return "#fbbf24"; // Radiant Gold
    if (focusedNeighborhood) {
      const sId = String(link.source?.id || link.source);
      const tId = String(link.target?.id || link.target);
      const sName = link.source?.name || link.source?.display_name;
      const tName = link.target?.name || link.target?.display_name;
      const inNeighborhood = 
        (focusedNeighborhood.has(sId) || (sName && focusedNeighborhood.has(sName))) &&
        (focusedNeighborhood.has(tId) || (tName && focusedNeighborhood.has(tName)));
      if (!inNeighborhood) return "rgba(100, 116, 139, 0.15)";
    }
    switch (link.type) {
      case "CALLS":
        return "#38bdf8"; // Vibrant Sky blue
      case "DEFINES":
        return "#14b8a6"; // Bright Teal
      case "IMPORTS":
        return "#10b981"; // Bright Emerald
      case "AUTHORED":
        return "#f59e0b"; // Bright Amber
      case "MODIFIED":
        return "#a855f7"; // Bright Purple
      default:
        return "#94a3b8"; // Clean Slate
    }
  };

  // =========================================================================
  // 7. CANVAS NODE RENDERING WITH ANTI-COLLISION & GOLD HIGHLIGHT
  // =========================================================================
  const paintNode = (node, ctx, globalScale) => {
    const isInvestigated = isNodeInvestigated(node);
    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoveredNode?.id === node.id;
    const isSearchMatch = searchQuery && (
      node.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const opacity = getNodeOpacity(node);
    ctx.save();
    ctx.globalAlpha = opacity;

    const radius = isInvestigated || isSelected ? 8.5 : (isHovered ? 7.5 : 5.5);
    const color = getNodeColor(node, isInvestigated);

    // 1. Draw outer gold glow halo for investigated path nodes
    if (isInvestigated || isSelected || isSearchMatch) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4.5 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = isSelected 
        ? "rgba(56, 189, 248, 0.35)" 
        : (isInvestigated ? "rgba(251, 191, 36, 0.45)" : "rgba(239, 68, 68, 0.35)");
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
      ctx.strokeStyle = isSelected ? "#38bdf8" : "#fbbf24";
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();
    }

    // 4. Draw Hop Step Sequence Badge on investigated path nodes (1, 2, 3...)
    const hopStep = pathNodeOrder.get(node.name || node.display_name);
    if (hopStep && globalScale >= 0.8) {
      const badgeRadius = 4 / globalScale;
      const badgeX = node.x + radius - 1 / globalScale;
      const badgeY = node.y - radius + 1 / globalScale;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.font = `bold ${Math.max(5.5 / globalScale, 3)}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(hopStep), badgeX, badgeY);
    }

    // 5. Anti-Collision Useful Label Logic:
    // Labels are shown when showLabels is toggled on (scale >= 0.2), 
    // or always if investigated, selected, hovered, search matched, or in focused neighborhood.
    const isFocusedOrNeighbor = focusedNeighborhood && (
      focusedNeighborhood.has(String(node.id)) || 
      (node.name && focusedNeighborhood.has(node.name))
    );

    const shouldDrawLabel = 
      isInvestigated || 
      isSelected || 
      isHovered || 
      isSearchMatch || 
      (focusedNode && isFocusedOrNeighbor) ||
      (showLabels && globalScale >= 0.20);

    if (shouldDrawLabel && (opacity > 0.2 || isHovered || isSelected)) {
      const rawLabel = getCleanNodeName(node);
      const maxChars = globalScale >= 1.5 ? 28 : 22;
      const label = rawLabel.length > maxChars ? `${rawLabel.slice(0, maxChars - 2)}…` : rawLabel;
      const fontSize = Math.max(9.5 / globalScale, 2.5);
      ctx.font = `${isInvestigated || isSelected ? '600' : '500'} ${fontSize}px 'JetBrains Mono', Inter, monospace`;

      const textMetrics = ctx.measureText(label);
      const textWidth = textMetrics.width;
      const paddingX = 4 / globalScale;
      const paddingY = 2 / globalScale;
      const pillHeight = fontSize + paddingY * 2;
      const pillWidth = textWidth + paddingX * 2;
      const pillY = node.y + radius + 3 / globalScale;

      // Dark backdrop pill to prevent edge line collisions
      ctx.fillStyle = isInvestigated || isSelected 
        ? "rgba(15, 23, 42, 0.96)" 
        : (isHovered ? "rgba(15, 23, 42, 0.94)" : "rgba(15, 23, 42, 0.88)");
      
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(node.x - pillWidth / 2, pillY, pillWidth, pillHeight, 3.5 / globalScale);
      } else {
        ctx.rect(node.x - pillWidth / 2, pillY, pillWidth, pillHeight);
      }
      ctx.fill();

      // Pill border
      if (isInvestigated) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 1.2 / globalScale;
        ctx.stroke();
      } else if (isSelected) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.2 / globalScale;
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(51, 65, 85, 0.55)";
        ctx.lineWidth = 0.75 / globalScale;
        ctx.stroke();
      }

      // Label text color matching node type
      let textColor = "#cbd5e1";
      if (isInvestigated) {
        textColor = "#fef08a"; // Gold
      } else if (isSelected) {
        textColor = "#7dd3fc"; // Sky
      } else if (isHovered) {
        textColor = "#ffffff"; // Bright White
      } else {
        switch (node.label) {
          case "Function":
            textColor = "#bae6fd"; // Light sky
            break;
          case "Module":
            textColor = "#a7f3d0"; // Light emerald
            break;
          case "Engineer":
            textColor = "#fed7aa"; // Light orange
            break;
          case "Commit":
            textColor = "#e9d5ff"; // Light purple
            break;
          case "Finding":
            textColor = "#fbcfe8"; // Light pink
            break;
          default:
            textColor = "#cbd5e1"; // Slate
        }
      }

      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, node.x, pillY + pillHeight / 2);
    }

    ctx.restore();
  };

  // Node hit area for smooth hover & click
  const paintNodeArea = (node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 11, 0, 2 * Math.PI, false);
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
    const found = filteredGraphData.nodes.find(n => 
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
    <div className="flex-1 relative bg-[#000000] flex flex-col h-full overflow-hidden select-none font-sans">
      
      {/* ================= 1. TOP TOOLBAR: UNIFIED DISPLAY MODES & CONTROLS ================= */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2">
        
        {/* Left: Segmented Display Mode Switcher */}
        <div className="pointer-events-auto bg-[#121214]/95 backdrop-blur-md border border-zinc-800 p-1 rounded-xl shadow-2xl flex items-center space-x-1 shrink-0">
          <button
            onClick={() => setDisplayMode('investigation')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-medium flex items-center space-x-1.5 transition ${
              displayMode === 'investigation'
                ? "bg-zinc-850 text-blue-400 border border-zinc-700 font-bold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            }`}
            title="Show only incident path, relevant functions, and connected evidence"
          >
            <ShieldAlert size={14} strokeWidth={1.8} className={displayMode === 'investigation' ? 'text-zinc-100' : 'text-zinc-400'} />
            <span className="hidden sm:inline">Investigation</span>
            {hasInvestigationPath && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            )}
          </button>

          <button
            onClick={() => setDisplayMode('overview')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-medium flex items-center space-x-1.5 transition ${
              displayMode === 'overview'
                ? "bg-zinc-850 text-blue-400 border border-zinc-700 font-bold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            }`}
            title="Repositories, modules, services, and major relationships"
          >
            <Layers size={14} strokeWidth={1.8} className={displayMode === 'overview' ? 'text-zinc-100' : 'text-zinc-400'} />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setDisplayMode('full')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-medium flex items-center space-x-1.5 transition ${
              displayMode === 'full'
                ? "bg-zinc-850 text-blue-400 border border-zinc-700 font-bold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            }`}
            title="Every indexed node and relationship in FalkorDB"
          >
            <Network size={14} strokeWidth={1.8} className={displayMode === 'full' ? 'text-zinc-100' : 'text-zinc-400'} />
            <span>Full Graph</span>
          </button>
        </div>

        {/* Right: Search, Filters, Labels, and Zoom Controls */}
        <div className="pointer-events-auto flex items-center space-x-1.5 shrink-0">
          
          {/* Node Search Bar */}
          <form onSubmit={handleSearchNode} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbol..."
              className="bg-[#121214] border border-zinc-800 text-xs rounded-lg pl-7 pr-6 py-1.5 text-zinc-200 outline-none focus:border-blue-500 font-sans w-28 sm:w-36 focus:w-44 transition-all shadow-lg"
            />
            <Search size={13} strokeWidth={1.8} className="text-zinc-400 absolute left-2 top-2" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-2 text-zinc-400 hover:text-white"
              >
                <X size={12} strokeWidth={1.8} />
              </button>
            )}
          </form>

          {/* Relationship & Filter Drawer Toggle Button */}
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-sans font-medium transition flex items-center space-x-1.5 text-blue-400 ${
              showFilterMenu
                ? "bg-zinc-850 border-blue-500/80 font-bold"
                : "bg-[#121214] border-zinc-800 hover:border-zinc-700"
            }`}
            title="Filter relationships and node types"
          >
            <Filter size={13} strokeWidth={1.8} className="text-zinc-200" />
            <span className="hidden md:inline">Filters</span>
          </button>

          {/* Labels Display Toggle Button */}
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-sans font-medium transition flex items-center space-x-1.5 text-blue-400 ${
              showLabels
                ? "bg-zinc-850 border-blue-500/80 font-semibold"
                : "bg-[#121214] border-zinc-800 hover:border-zinc-700 text-zinc-400"
            }`}
            title={showLabels ? "Hide node labels (clean view)" : "Show all node labels"}
          >
            <Tag size={13} strokeWidth={1.8} className="text-zinc-200" />
            <span className="hidden md:inline">Labels</span>
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center space-x-0.5 bg-[#121214] border border-zinc-800 p-1 rounded-lg shadow-lg">
            <button
              onClick={handleZoomIn}
              className="p-1 hover:bg-zinc-850 text-zinc-300 hover:text-white rounded transition"
              title="Zoom In"
            >
              <ZoomIn size={14} strokeWidth={1.8} className="text-zinc-300" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 hover:bg-zinc-850 text-zinc-300 hover:text-white rounded transition"
              title="Zoom Out"
            >
              <ZoomOut size={14} strokeWidth={1.8} className="text-zinc-300" />
            </button>
            <button
              onClick={handleFitView}
              className="p-1 hover:bg-zinc-850 text-zinc-300 hover:text-white rounded transition"
              title="Fit to Screen"
            >
              <Maximize2 size={14} strokeWidth={1.8} className="text-zinc-300" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= 2. ACTIVE FOCUS BANNER ================= */}
      {focusedNode && (
        <div className="absolute top-16 left-4 z-10 bg-zinc-900/95 backdrop-blur-md border border-blue-500/60 px-3.5 py-1.5 rounded-xl shadow-2xl flex items-center space-x-2.5 text-xs font-sans text-blue-400 animate-in fade-in duration-150">
          <Target size={14} strokeWidth={1.8} className="text-zinc-200 animate-pulse" />
          <span>
            Focus: <strong className="text-zinc-100 font-mono font-semibold">{focusedNode.name}</strong> ({focusedNode.hops}-Hop Neighborhood)
          </span>
          <button
            onClick={() => setFocusedNode(null)}
            className="text-zinc-300 hover:text-white p-0.5 rounded hover:bg-zinc-800 ml-1"
            title="Reset Focus"
          >
            <X size={13} strokeWidth={1.8} className="text-zinc-300" />
          </button>
        </div>
      )}

      {/* ================= 4. FILTER POPOVER MENU ================= */}
      {showFilterMenu && (
        <div className="absolute top-14 right-4 z-20 bg-[#121214]/95 backdrop-blur-md border border-zinc-800 p-4 rounded-xl shadow-2xl w-80 space-y-3.5 text-xs font-sans animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-semibold text-zinc-200 font-sans flex items-center space-x-1.5">
              <Sliders size={14} strokeWidth={1.8} className="text-zinc-200" />
              <span>Graph Filters & Projections</span>
            </span>
            <button 
              onClick={() => setShowFilterMenu(false)}
              className="text-zinc-400 hover:text-white"
            >
              <X size={14} strokeWidth={1.8} className="text-zinc-300" />
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center space-x-2">
            <button
              onClick={applyCodeOnlyFilter}
              className="flex-1 py-1 px-2 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-sans font-medium text-blue-400 transition text-center"
            >
              Code Path Only
            </button>
            <button
              onClick={resetAllFilters}
              className="py-1 px-2 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-sans text-zinc-400 hover:text-white transition"
            >
              Reset
            </button>
          </div>

          {/* Relationship Filters */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-500 font-sans tracking-wider">
              Relationship Types
            </label>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-sans">
              {['CALLS', 'DEFINES', 'INHERITS', 'AUTHORED', 'MODIFIED'].map(rel => (
                <label 
                  key={rel}
                  className="flex items-center space-x-2 p-1.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-855 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={enabledRelTypes[rel] !== false}
                    onChange={(e) => setEnabledRelTypes(prev => ({ ...prev, [rel]: e.target.checked }))}
                    className="accent-blue-500 rounded"
                  />
                  <span className="text-zinc-300 font-mono text-[10px]">{rel}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Entity Filters */}
          <div className="space-y-1.5 pt-1 border-t border-zinc-800">
            <label className="text-[10px] uppercase font-bold text-zinc-500 font-sans tracking-wider">
              Node Entities
            </label>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-sans">
              {[
                { label: 'Function', color: 'bg-sky-400' },
                { label: 'Class', color: 'bg-purple-500' },
                { label: 'Module', color: 'bg-emerald-400' },
                { label: 'Commit', color: 'bg-purple-400' },
                { label: 'Engineer', color: 'bg-orange-400' }
              ].map(item => (
                <label 
                  key={item.label}
                  className="flex items-center space-x-2 p-1.5 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-855 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={enabledNodeTypes[item.label] !== false}
                    onChange={(e) => setEnabledNodeTypes(prev => ({ ...prev, [item.label]: e.target.checked }))}
                    className="accent-blue-500 rounded"
                  />
                  <span className={`w-2 h-2 rounded-full ${item.color}`}></span>
                  <span className="text-zinc-300 font-sans">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= 5. NODE INSPECTOR MODAL PANEL ================= */}
      {selectedNode && (
        <div className="absolute top-16 right-4 z-20 bg-[#121214]/95 backdrop-blur-md border border-zinc-800 p-4 rounded-xl shadow-2xl max-w-sm w-88 space-y-3 text-xs font-sans animate-in fade-in duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-900 text-zinc-300 border border-zinc-800 font-sans">
                {selectedNode.label}
              </span>
              <span className="text-[10px] text-zinc-500 font-sans">Inspector</span>
            </div>
            <button 
              onClick={() => setSelectedNode(null)} 
              className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-zinc-900"
            >
              <X size={14} strokeWidth={1.8} className="text-zinc-300" />
            </button>
          </div>

          {/* Symbol Title */}
          <div>
            <div className="font-bold text-zinc-100 text-sm font-mono break-all">
              {getCleanNodeName(selectedNode)}
            </div>
            {selectedNode.qname && (
              <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                {selectedNode.qname}
              </div>
            )}
          </div>

          {/* Local Exploration Focus Actions */}
          <div className="p-2.5 bg-zinc-900/60 rounded-lg border border-zinc-800/80 space-y-1.5 font-sans">
            <span className="text-[10px] text-zinc-500 uppercase font-bold font-sans tracking-wider">Local Exploration</span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFocusedNode({ id: selectedNode.id, name: selectedNode.name, hops: 1 })}
                className="flex-1 py-1 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500 text-blue-400 rounded text-[11px] font-sans font-medium transition flex items-center justify-center space-x-1"
                title="Focus on this node and dim everything outside 1 hop"
              >
                <Target size={12} strokeWidth={1.8} className="text-zinc-200" />
                <span>Focus 1-Hop</span>
              </button>
              <button
                onClick={() => setFocusedNode({ id: selectedNode.id, name: selectedNode.name, hops: 2 })}
                className="flex-1 py-1 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500 text-blue-400 rounded text-[11px] font-sans font-medium transition flex items-center justify-center space-x-1"
                title="Focus on this node and dim everything outside 2 hops"
              >
                <Target size={12} strokeWidth={1.8} className="text-zinc-200" />
                <span>Focus 2-Hop</span>
              </button>
              {focusedNode && (
                <button
                  onClick={() => setFocusedNode(null)}
                  className="px-2 py-1 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white rounded text-[11px] font-sans transition"
                  title="Clear Local Focus"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Internal Node ID */}
          <div className="bg-[#000000] p-2.5 rounded-lg border border-zinc-800 space-y-1.5 font-sans text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Node ID</span>
              <button
                onClick={() => handleCopyNodeId(selectedNode.id)}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-sans flex items-center space-x-1"
                title="Copy ID"
              >
                {copiedId ? <Check size={14} strokeWidth={1.8} className="text-zinc-200" /> : <Copy size={14} strokeWidth={1.8} className="text-zinc-200" />}
                <span>{copiedId ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <div className="text-zinc-300 font-bold font-mono break-all">#{selectedNode.id}</div>
            {selectedNode.sha && (
              <div className="text-[10px] text-zinc-400 pt-1 border-t border-zinc-900 font-sans">
                Commit: <span className="font-bold text-zinc-200 font-mono">{selectedNode.sha}</span>
              </div>
            )}
          </div>

          {/* File location */}
          {(selectedNode.file || selectedNode.path) && (
            <div className="text-[11px] text-zinc-300 font-sans flex items-center space-x-1.5 bg-[#000000] px-2 py-1.5 rounded border border-zinc-800">
              <span className="text-zinc-500 font-sans">path:</span>
              <span className="text-zinc-200 truncate font-mono">{selectedNode.file || selectedNode.path}</span>
              {selectedNode.lineno && <span className="text-zinc-500 font-bold font-mono">:{selectedNode.lineno}</span>}
              {selectedNode.loc && <span className="text-zinc-500 text-[10px] font-sans">({selectedNode.loc} loc)</span>}
            </div>
          )}

          {/* Class Bases / Inheritance */}
          {selectedNode.bases && (
            <div className="text-[11px] text-zinc-300 font-sans flex items-center space-x-1.5 bg-[#000000] px-2 py-1.5 rounded border border-zinc-800">
              <span className="text-zinc-500 font-sans">inherits:</span>
              <span className="text-purple-300 font-mono font-medium truncate">{selectedNode.bases}</span>
            </div>
          )}

          {/* Member of Class */}
          {selectedNode.class_name && (
            <div className="text-[11px] text-zinc-300 font-sans flex items-center space-x-1.5 bg-[#000000] px-2 py-1.5 rounded border border-zinc-800">
              <span className="text-zinc-500 font-sans">class:</span>
              <span className="text-purple-300 font-mono font-medium truncate">{selectedNode.class_name}</span>
            </div>
          )}

          {/* ADR Decision Tag */}
          {selectedNode.decision_tag && (
            <div className="text-[11px] text-zinc-200 font-sans font-semibold bg-zinc-900 p-2 rounded border border-zinc-800 flex items-center space-x-1.5">
              <ShieldAlert size={14} strokeWidth={1.8} className="text-zinc-200" />
              <span>Decision: {selectedNode.decision_tag}</span>
            </div>
          )}

          {/* Incident Memory */}
          {selectedNode.summary && (
            <div className="text-[11px] text-zinc-300 bg-[#000000] p-2 rounded border border-zinc-800 leading-relaxed font-sans">
              <strong className="block text-[10px] uppercase text-zinc-400 font-sans tracking-wider">Incident Memory:</strong>
              {selectedNode.summary}
            </div>
          )}

          {/* Connected Graph Relationships */}
          <div className="space-y-1 pt-1 border-t border-zinc-800 text-[10px] font-sans">
            <span className="text-zinc-500 uppercase font-bold tracking-wider">Connected Relationships</span>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-sans">
              {connectedNeighbors.incoming.map((rel, idx) => (
                <div key={idx} className="flex items-center space-x-1 text-zinc-400">
                  <ArrowRight size={14} strokeWidth={1.8} className="text-zinc-300 rotate-180" />
                  <span className="text-zinc-200 font-bold font-mono">{rel.type}</span>
                  <span className="text-zinc-500 font-sans">from</span>
                  <span className="text-zinc-300 truncate font-mono">{rel.from}</span>
                  {rel.line && <span className="text-zinc-500 font-mono">:{rel.line}</span>}
                </div>
              ))}
              {connectedNeighbors.outgoing.map((rel, idx) => (
                <div key={idx} className="flex items-center space-x-1 text-zinc-400">
                  <ArrowRight size={14} strokeWidth={1.8} className="text-zinc-300" />
                  <span className="text-zinc-200 font-bold font-mono">{rel.type}</span>
                  <span className="text-zinc-500 font-sans">to</span>
                  <span className="text-zinc-300 truncate font-mono">{rel.to}</span>
                  {rel.line && <span className="text-zinc-500 font-mono">:{rel.line}</span>}
                </div>
              ))}
              {connectedNeighbors.incoming.length === 0 && connectedNeighbors.outgoing.length === 0 && (
                <div className="text-zinc-500 italic font-sans">No direct edges loaded</div>
              )}
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={() => handleCenterNode(selectedNode)}
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500 text-blue-400 rounded text-xs font-sans font-medium flex items-center justify-center space-x-1.5 transition"
          >
            <Compass size={16} strokeWidth={1.8} className="text-zinc-200" />
            <span>Center Node in View</span>
          </button>
        </div>
      )}

      {/* ================= 6. SCHEMA & TOPOLOGY LEGEND ================= */}
      <div className="absolute bottom-4 right-4 z-10 bg-[#121214]/90 backdrop-blur-md border border-zinc-800 p-3 rounded-xl shadow-2xl space-y-1.5 text-[11px] font-sans">
        <div className="font-bold text-zinc-300 pb-1 border-b border-zinc-800 flex items-center justify-between">
          <span>Topology Legend</span>
          <span className="text-[10px] text-zinc-500 font-sans">FalkorDB</span>
        </div>
        
        {/* Node types */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <span className="text-zinc-300">Function (AST)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-zinc-300">Module (File)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
            <span className="text-zinc-300">Engineer</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
            <span className="text-zinc-300">Commit</span>
          </div>
        </div>

        {/* Investigated Path Highlight Legend */}
        <div className="pt-1.5 border-t border-zinc-800 flex items-center space-x-2 text-[10px]">
          <span className="w-3 h-1.5 rounded-full bg-amber-400"></span>
          <span className="text-amber-400 font-semibold font-sans">Investigated Path (Gold)</span>
        </div>
      </div>

      {/* ================= 7. FORCE DIRECTED GRAPH CANVAS ================= */}
      <div 
        ref={containerRef} 
        className="flex-1 w-full h-full relative overflow-hidden"
      >
        {dimensions.width > 0 && dimensions.height > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={filteredGraphData}
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
            linkHoverPrecision={8}
            linkLabel={link => `${link.type}${link.line ? ` [line ${link.line}]` : ''}`}
            linkColor={getLinkColor}
            linkWidth={link => isInvestigatedLink(link) ? 3.2 : (link.type === 'CALLS' ? 2.0 : 1.2)}
            
            // Directional Arrow Pointers on relationships (CALLS, DEFINES, IMPORTS, etc.)
            linkDirectionalArrowLength={link => {
              if (isInvestigatedLink(link)) return 9.5;
              if (link.type === 'CALLS') return 8.5;
              if (link.type === 'DEFINES' || link.type === 'IMPORTS') return 7.5;
              if (link.type === 'AUTHORED' || link.type === 'MODIFIED') return 7.5;
              return 7.0;
            }}
            linkDirectionalArrowRelPos={0.58}
            linkDirectionalArrowColor={getLinkArrowColor}
            
            // Flowing directional particles on active paths and CALLS
            linkDirectionalParticles={link => {
              if (isInvestigatedLink(link)) return 4;
              if (link.type === 'CALLS' && displayMode !== 'overview') return 2;
              return 0;
            }}
            linkDirectionalParticleWidth={link => isInvestigatedLink(link) ? 2.8 : 1.5}
            linkDirectionalParticleSpeed={link => isInvestigatedLink(link) ? 0.012 : 0.006}
            linkDirectionalParticleColor={link => isInvestigatedLink(link) ? "#fbbf24" : "#38bdf8"}
            onLinkHover={link => setHoveredLink(link || null)}
            
            d3VelocityDecay={0.3}
            cooldownTicks={120}
          />
        )}
      </div>

    </div>
  );
}
