# backend/mcp_tools.py
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from falkordb import FalkorDB
from fastmcp import FastMCP

# Load environment variables
load_dotenv()
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# 1. Connect to FalkorDB
FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", 6379))
db = FalkorDB(host=FALKORDB_HOST, port=FALKORDB_PORT)
mcp = FastMCP("NexusGraph-Codebase-MCP")


def get_repo_graph(tenant_id: str = "sample-fintech"):
    """
    [Track 02 Core Feature] Multigraph tenant isolation.
    Each repository lives in its own isolated graph namespace `repo:<tenant_id>`.
    """
    return db.select_graph(f"repo:{tenant_id}")


def resolve_repo_dir(tenant_id: str = "sample-fintech") -> Path:
    """Resolves the local repository path for file inspection & patches."""
    root = Path(__file__).resolve().parent.parent
    backend = Path(__file__).resolve().parent

    candidates = [
        root / "repos" / tenant_id,
        root / "repos" / tenant_id.replace("-", "_"),
        root / f"{tenant_id.replace('-', '_')}_repo",
        root / "sample_fintech_repo",
        root / tenant_id,
        backend / "repos" / tenant_id,
        backend / f"{tenant_id.replace('-', '_')}_repo",
        backend / "sample_fintech_repo",
    ]
    for c in candidates:
        if c.exists() and c.is_dir():
            return c
    return root / "sample_fintech_repo"


# ============================================================================
# PARAMETERIZED MCP TOOLS (Track 01, Track 02, Track 03)
# ============================================================================

@mcp.tool()
def mcp_ast_blast_radius(function_name: str, tenant_id: str = "sample-fintech") -> dict:
    """
    [Track 01: Act on Connected Data]
    Traverses multi-hop (:Function)-[:CALLS*1..5]->(:Function) edges to calculate
    the upstream blast radius if `function_name` breaks or changes signature.
    """
    g = get_repo_graph(tenant_id)
    cypher = """
    MATCH (target)
    WHERE (target:Function OR target:Class) AND target.name = $fn_name
    MATCH p = (caller:Function)-[:CALLS*1..5]->(target)
    RETURN caller.qname AS impacted_qname,
           caller.name AS impacted_fn,
           caller.file AS file_path,
           caller.lineno AS line_number,
           length(p) AS hop_depth,
           [n IN nodes(p) | n.name] AS explainable_path,
           [n IN nodes(p) | n.qname] AS qname_path
    ORDER BY hop_depth ASC
    """
    res = g.query(cypher, {"fn_name": function_name})

    impacted = []
    highlighted_nodes = {function_name}

    for row in res.result_set:
        path_names = row[5]
        for n in path_names:
            highlighted_nodes.add(n)
        impacted.append({
            "impacted_qname": row[0],
            "impacted_function": row[1],
            "file_path": row[2],
            "line_number": row[3],
            "hop_depth": row[4],
            "explainable_path": path_names,
            "qname_path": row[6],
        })

    return {
        "tool": "mcp_ast_blast_radius",
        "track": "Track 01: Connected Data",
        "target_function": function_name,
        "cypher_executed": cypher.strip(),
        "total_impacted_functions": len(impacted),
        "impacted_callers": impacted,
        "highlighted_nodes": list(highlighted_nodes),
    }


@mcp.tool()
def mcp_pagerank_hotspots(tenant_id: str = "sample-fintech") -> dict:
    """
    [Track 01: Graph Algorithms as Tools]
    Runs FalkorDB's native C/GraphBLAS `algo.pageRank` over the AST call graph
    to rank functions by architectural criticality and systemic risk.
    """
    g = get_repo_graph(tenant_id)
    cypher = """
    CALL algo.pageRank('Function', 'CALLS') YIELD node, score
    RETURN node.qname AS qname,
           node.name AS name,
           node.file AS file,
           node.loc AS loc,
           score
    ORDER BY score DESC
    LIMIT 5
    """
    res = g.query(cypher)
    hotspots = []
    highlighted = set()

    for r in res.result_set:
        fn_name = r[1]
        highlighted.add(fn_name)
        hotspots.append({
            "qname": r[0],
            "function_name": fn_name,
            "file_path": r[2],
            "loc": r[3],
            "systemic_risk_score": round(float(r[4]), 4),
        })

    return {
        "tool": "mcp_pagerank_hotspots",
        "track": "Track 01: Graph Algorithms as Tools",
        "algorithm": "FalkorDB native algo.pageRank (GraphBLAS)",
        "cypher_executed": cypher.strip(),
        "top_hotspots": hotspots,
        "highlighted_nodes": list(highlighted),
    }


@mcp.tool()
def mcp_find_symbol(symbol_name: str, tenant_id: str = "sample-fintech") -> dict:
    """
    [Track 01: Symbol Resolution]
    Resolves a natural-language function or endpoint name to an exact graph node.
    Use this as the FIRST step in any investigation to anchor the LLM to real
    graph node IDs — never let the LLM invent node identifiers.
    """
    g = get_repo_graph(tenant_id)
    cypher = """
    MATCH (n)
    WHERE (n:Function OR n:Class)
      AND (n.name = $sym
           OR n.qname CONTAINS $sym
           OR toLower(n.name) CONTAINS toLower($sym))
    RETURN n.name         AS name,
           n.qname        AS qname,
           n.file         AS file_path,
           n.lineno       AS start_line,
           n.loc          AS loc,
           n.docstring    AS docstring,
           labels(n)[0]   AS entity_type
    ORDER BY
      CASE WHEN n.name = $sym THEN 0 ELSE 1 END,
      n.name
    LIMIT 5
    """
    res = g.query(cypher, {"sym": symbol_name})

    matches = []
    highlighted = set()
    for r in res.result_set:
        matches.append({
            "name":        r[0],
            "qname":       r[1],
            "file_path":   r[2],
            "start_line":  r[3],
            "loc":         r[4],
            "docstring":   r[5],
            "entity_type": r[6],
        })
        highlighted.add(r[0])

    if not matches:
        tokens = [tok for tok in re.split(r"[_\s\-]+", symbol_name.lower()) if len(tok) >= 3]
        if tokens:
            fallback_cypher = """
            MATCH (n)
            WHERE (n:Function OR n:Class)
              AND ANY(t IN $tokens WHERE toLower(n.name) CONTAINS t OR toLower(n.file) CONTAINS t)
            RETURN n.name         AS name,
                   n.qname        AS qname,
                   n.file         AS file_path,
                   n.lineno       AS start_line,
                   n.loc          AS loc,
                   n.docstring    AS docstring,
                   labels(n)[0]   AS entity_type
            LIMIT 5
            """
            try:
                fallback_res = g.query(fallback_cypher, {"tokens": tokens})
                for r in fallback_res.result_set:
                    matches.append({
                        "name":        r[0],
                        "qname":       r[1],
                        "file_path":   r[2],
                        "start_line":  r[3],
                        "loc":         r[4],
                        "docstring":   r[5],
                        "entity_type": r[6],
                    })
                    highlighted.add(r[0])
            except Exception:
                pass

    return {
        "tool":             "mcp_find_symbol",
        "track":            "Track 01: Symbol Resolution",
        "query":            symbol_name,
        "cypher_executed":  cypher.strip(),
        "matches_found":    len(matches),
        "matches":          matches,
        "highlighted_nodes": list(highlighted),
        # Convenience: best match (exact name match preferred)
        "best_match": matches[0] if matches else None,
    }


@mcp.tool()
def mcp_shortest_execution_path(
    entrypoint_fn: str,
    target_fn: str,
    tenant_id: str = "sample-fintech",
) -> dict:
    """
    [Track 01: Graph Algorithms as Tools]
    Finds the shortest call execution chain from an API entrypoint to the target function.
    Returns structured nodes+edges with file and line numbers per hop so the LLM can
    cite actual graph evidence — never invent a path.
    Uses FalkorDB openCypher shortestPath traversal.
    """
    g = get_repo_graph(tenant_id)
    cypher = """
    MATCH (src), (tgt)
    WHERE (src:Function OR src:Class) AND src.name = $src_name
      AND (tgt:Function OR tgt:Class) AND tgt.name = $tgt_name
    WITH src, tgt,
         shortestPath((src)-[:CALLS*1..10]->(tgt)) AS p
    WHERE p IS NOT NULL
    RETURN
      [n IN nodes(p) | {
          name:       n.name,
          qname:      n.qname,
          file_path:  n.file,
          start_line: n.lineno
      }] AS path_nodes,
      [r IN relationships(p) | type(r)] AS path_edges,
      length(p) AS hop_distance
    """
    res = g.query(cypher, {"src_name": entrypoint_fn, "tgt_name": target_fn})

    if not res.result_set:
        return {
            "tool":             "mcp_shortest_execution_path",
            "track":            "Track 01: Graph Algorithms as Tools",
            "path_found":       False,
            "hops":             -1,
            "nodes":            [],
            "edges":            [],
            "highlighted_nodes": [entrypoint_fn, target_fn],
            "cypher_executed":  cypher.strip(),
            "note": "No path found within indexed call graph. Check symbol resolution or ingestion coverage.",
        }

    row         = res.result_set[0]
    path_nodes  = row[0]   # list of dicts from FalkorDB
    path_edges  = row[1]   # list of relationship type strings
    hop_distance = row[2]

    # Normalise: FalkorDB may return node property dicts or Node objects
    nodes_out = []
    highlighted = set()
    for n in path_nodes:
        if isinstance(n, dict):
            name = n.get("name") or ""
            node_entry = {
                "name":       name,
                "qname":      n.get("qname") or "",
                "file_path":  n.get("file_path") or "",
                "start_line": n.get("start_line") or 0,
            }
        else:
            # FalkorDB Node object fallback
            name = getattr(n, "properties", {}).get("name", str(n))
            props = getattr(n, "properties", {})
            node_entry = {
                "name":       props.get("name", ""),
                "qname":      props.get("qname", ""),
                "file_path":  props.get("file", ""),
                "start_line": props.get("lineno", 0),
            }
        nodes_out.append(node_entry)
        highlighted.add(node_entry["name"])

    # Backward-compat: keep explainable_path as flat list of names
    name_path = [n["name"] for n in nodes_out]

    return {
        "tool":              "mcp_shortest_execution_path",
        "track":             "Track 01: Graph Algorithms as Tools",
        "algorithm":         "FalkorDB openCypher shortestPath",
        "path_found":        True,
        "entrypoint":        entrypoint_fn,
        "target":            target_fn,
        "hops":              hop_distance,
        # Structured output — cite this in reports; do NOT invent alternative paths
        "nodes":             nodes_out,
        "edges":             path_edges,
        # Backwards-compatible fields
        "hop_distance":      hop_distance,
        "explainable_path":  name_path,
        "qname_path":        [n["qname"] for n in nodes_out],
        "highlighted_nodes": list(highlighted),
        "cypher_executed":   cypher.strip(),
    }


@mcp.tool()
def mcp_company_brain_provenance(function_name: str, tenant_id: str = "sample-fintech") -> dict:
    """
    [Track 03: Company Brain - Connect Code to People & Rationale]
    Traverses:
    (:Module)-[:DEFINES]->(:Function {name})
    MATCH (e:Engineer)-[:AUTHORED]->(c:Commit)-[:MODIFIED]->(m)
    Returns authoring engineers, git commits, and architectural decision tags ([ADR-xxx], [INC-xxx]).
    """
    g = get_repo_graph(tenant_id)
    cypher = """
    MATCH (m:Module)-[:DEFINES*1..2]->(target)
    WHERE (target:Function OR target:Class) AND target.name = $fn_name
    MATCH (e:Engineer)-[:AUTHORED]->(c:Commit)-[:MODIFIED]->(m)
    RETURN e.name AS engineer_name,
           e.email AS engineer_email,
           c.sha AS commit_sha,
           c.message AS commit_message,
           c.decision_tag AS decision_tag,
           c.timestamp AS commit_timestamp,
           m.path AS module_path
    ORDER BY c.timestamp DESC
    LIMIT 5
    """
    res = g.query(cypher, {"fn_name": function_name})

    provenance = []
    highlighted = {function_name}

    for r in res.result_set:
        eng_name, sha, tag, mod_path = r[0], r[2], r[4], r[6]
        highlighted.add(eng_name)
        highlighted.add(sha)
        provenance.append({
            "engineer_name": eng_name,
            "engineer_email": r[1],
            "commit_sha": sha,
            "commit_message": r[3],
            "decision_tag": tag,
            "commit_timestamp": r[5],
            "module_path": mod_path,
        })

    return {
        "tool": "mcp_company_brain_provenance",
        "track": "Track 03: Company Brain",
        "target_function": function_name,
        "cypher_executed": cypher.strip(),
        "commits_traced": len(provenance),
        "provenance_chain": provenance,
        "highlighted_nodes": list(highlighted),
    }


@mcp.tool()
def mcp_recall_episodic_memory(function_name: str, tenant_id: str = "sample-fintech") -> dict:
    """
    [Track 02: Agent Memory & Coordination]
    Reads persistent findings attached to `function_name` from earlier sessions
    before proposing a fix.
    """
    g = get_repo_graph(tenant_id)
    cypher = """
    MATCH (s:Session)-[:RECORDED]->(f:Finding)-[:ATTACHED_TO]->(fn:Function {name: $fn_name})
    RETURN f.id AS finding_id,
           f.agent_role AS recorded_by_agent,
           f.summary AS memory_summary,
           f.remediation AS recommended_fix,
           f.created_at AS created_at,
           s.id AS session_id,
           [s.id, f.id, fn.name] AS explainable_path
    ORDER BY f.created_at DESC
    """
    res = g.query(cypher, {"fn_name": function_name})
    memories = []
    highlighted = {function_name}

    for r in res.result_set:
        for item in r[6]:
            highlighted.add(item)
        memories.append({
            "finding_id": r[0],
            "agent_role": r[1],
            "summary": r[2],
            "remediation": r[3],
            "created_at": r[4],
            "session_id": r[5],
            "explainable_path": r[6],
        })

    return {
        "tool": "mcp_recall_episodic_memory",
        "track": "Track 02: Agent Memory & Coordination",
        "target_function": function_name,
        "cypher_executed": cypher.strip(),
        "memories_found": len(memories),
        "memories": memories,
        "highlighted_nodes": list(highlighted),
    }


@mcp.tool()
def mcp_write_episodic_memory(
    function_name: str,
    summary: str,
    remediation: str,
    agent_role: str = "TriageAgent",
    session_id: str = "session-live",
    tenant_id: str = "sample-fintech",
) -> dict:
    """
    [Track 02: Agent Memory & Coordination]
    Writes a new agent finding directly into the FalkorDB graph attached to `function_name`
    so downstream agents and future sessions share state.
    """
    g = get_repo_graph(tenant_id)
    finding_id = f"mem-{uuid.uuid4().hex[:6]}"
    now = datetime.now(timezone.utc).isoformat()

    cypher = """
    MATCH (fn:Function {name: $fn_name})
    MERGE (s:Session {id: $session_id})
    ON CREATE SET s.started_at = $now
    CREATE (f:Finding {
        id: $finding_id,
        agent_role: $agent_role,
        summary: $summary,
        remediation: $remediation,
        created_at: $now
    })
    CREATE (s)-[:RECORDED]->(f)
    CREATE (f)-[:ATTACHED_TO]->(fn)
    RETURN f.id, s.id, fn.qname
    """
    res = g.query(
        cypher,
        {
            "fn_name": function_name,
            "session_id": session_id,
            "finding_id": finding_id,
            "agent_role": agent_role,
            "summary": summary,
            "remediation": remediation,
            "now": now,
        },
    )
    if not res.result_set:
        raise ValueError(f"Function '{function_name}' not found in graph repo:{tenant_id}")

    return {
        "tool": "mcp_write_episodic_memory",
        "track": "Track 02: Agent Memory & Coordination",
        "persisted_finding_id": finding_id,
        "session_id": session_id,
        "attached_to": res.result_set[0][2],
        "cypher_executed": cypher.strip(),
        "explainable_path": [session_id, finding_id, function_name],
        "highlighted_nodes": [session_id, finding_id, function_name],
    }


@mcp.tool()
def mcp_read_code_file(file_path: str, tenant_id: str = "sample-fintech") -> dict:
    """
    [Track 01 & Action] Reads source code from the target repository so the
    agent can inspect exact lines and generate an accurate patch diff.
    """
    repo_dir = resolve_repo_dir(tenant_id)
    clean_path = file_path.replace("sample_fintech_repo/", "").lstrip("/")
    target = (repo_dir / clean_path).resolve()

    if not target.exists():
        found = list(repo_dir.glob(f"**/{Path(file_path).name}"))
        if found:
            target = found[0]
        else:
            return {
                "tool": "mcp_read_code_file",
                "file_path": file_path,
                "error": f"File '{file_path}' not found in {repo_dir}",
                "highlighted_nodes": [],
            }

    content = target.read_text(encoding="utf-8")
    return {
        "tool": "mcp_read_code_file",
        "track": "Track 01: Connected Data to Code",
        "file_path": str(target.relative_to(repo_dir)),
        "content": content,
        "total_lines": len(content.splitlines()),
        "highlighted_nodes": [target.name],
    }


# ============================================================================
# TOOL REGISTRY & OPENAI FUNCTION CALLING SCHEMAS
# ============================================================================

TOOL_DISPATCH = {
    "mcp_find_symbol":              mcp_find_symbol,
    "mcp_recall_episodic_memory":   mcp_recall_episodic_memory,
    "mcp_ast_blast_radius":         mcp_ast_blast_radius,
    "mcp_pagerank_hotspots":        mcp_pagerank_hotspots,
    "mcp_shortest_execution_path":  mcp_shortest_execution_path,
    "mcp_company_brain_provenance": mcp_company_brain_provenance,
    "mcp_read_code_file":           mcp_read_code_file,
    "mcp_write_episodic_memory":    mcp_write_episodic_memory,
}

OPENAI_MCP_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "mcp_find_symbol",
            "description": (
                "Resolves a natural-language function or endpoint name to exact graph node IDs, "
                "file paths, and line numbers from FalkorDB. ALWAYS call this first to anchor "
                "the investigation to real nodes — never invent node identifiers."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol_name": {"type": "string", "description": "Function or endpoint name from the incident report, e.g. 'decrypt_card_token' or 'checkout'."},
                    "tenant_id":   {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
                "required": ["symbol_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_recall_episodic_memory",
            "description": "Recalls prior session findings, incident reports, and operational memories attached directly to a function in FalkorDB (Track 02).",
            "parameters": {
                "type": "object",
                "properties": {
                    "function_name": {"type": "string", "description": "The function name to check, e.g. 'decrypt_card_token'."},
                    "tenant_id": {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
                "required": ["function_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_ast_blast_radius",
            "description": "Traverses multi-hop AST (:Function)-[:CALLS*1..5]->(:Function) edges in FalkorDB to calculate every upstream caller impacted if target function breaks (Track 01).",
            "parameters": {
                "type": "object",
                "properties": {
                    "function_name": {"type": "string", "description": "Target function to compute blast radius for."},
                    "tenant_id": {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
                "required": ["function_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_pagerank_hotspots",
            "description": "Runs FalkorDB's native C/GraphBLAS algo.pageRank algorithm over the AST call graph to rank functions by systemic risk and architectural centrality (Track 01).",
            "parameters": {
                "type": "object",
                "properties": {
                    "tenant_id": {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_shortest_execution_path",
            "description": (
                "Finds the shortest call execution chain from an API entrypoint to the target function "
                "using FalkorDB shortestPath. Returns structured nodes with file path and line number per hop, "
                "plus the relationship types on each edge. Only cite paths returned by this tool — "
                "never invent a path from your own knowledge (Track 01)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entrypoint_fn": {"type": "string", "description": "API entrypoint function, e.g. 'post_checkout_endpoint'."},
                    "target_fn":     {"type": "string", "description": "Target function, e.g. 'decrypt_card_token'."},
                    "tenant_id":     {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
                "required": ["entrypoint_fn", "target_fn"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_company_brain_provenance",
            "description": "Traces Git commits, authoring engineers, ownership metrics, and [ADR-xxx] or [INC-xxx] architectural decisions for a function in FalkorDB (Track 03).",
            "parameters": {
                "type": "object",
                "properties": {
                    "function_name": {"type": "string", "description": "Target function name, e.g. 'decrypt_card_token'."},
                    "tenant_id": {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
                "required": ["function_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_read_code_file",
            "description": "Reads source code from the repository so the agent can inspect implementation details and produce an exact code patch.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative file path, e.g. 'vault_client.py'."},
                    "tenant_id": {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
                "required": ["file_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_write_episodic_memory",
            "description": "Persists an investigation finding or triage conclusion into FalkorDB attached to the target function for subsequent agent sessions (Track 02).",
            "parameters": {
                "type": "object",
                "properties": {
                    "function_name": {"type": "string", "description": "Target function name."},
                    "summary": {"type": "string", "description": "Summary of finding or incident triage."},
                    "remediation": {"type": "string", "description": "Recommended remediation plan or patch description."},
                    "tenant_id": {"type": "string", "description": "Tenant repository namespace, default 'sample-fintech'."},
                },
                "required": ["function_name", "summary", "remediation"],
            },
        },
    },
]
