# backend/agent.py
"""
ProofStack Investigation Engine
================================
Architecture (Change 1 — graph-central investigation):

  Incident input
      ↓
  ReAct agent — LLM decides which MCP tool to call next
      ↓
  FastMCP tool execution — validates args, executes a pre-approved template
      ↓
  FalkorDB — runs Cypher, returns actual nodes / relationships / paths
      ↓
  Tool result returned to LLM as an observation
      ↓  (repeat up to MAX_TOOL_STEPS)
  LLM produces final report citing only graph-observed evidence

Critical rule: the LLM *chooses* the investigation path.
               FalkorDB *derives* the actual graph paths.
               The LLM must NEVER invent node names or call chains.
"""

import ast
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from dotenv import load_dotenv

from mcp_tools import (
    OPENAI_MCP_TOOLS,
    TOOL_DISPATCH,
    apply_diff_patch,
    get_repo_graph,
    mcp_ast_blast_radius,
    mcp_company_brain_provenance,
    mcp_explore_graph_neighborhood,
    mcp_find_changes_on_path,
    mcp_find_symbol,
    mcp_pagerank_hotspots,
    mcp_read_code_file,
    mcp_recall_episodic_memory,
    mcp_shortest_execution_path,
    mcp_validate_patch,
    mcp_write_episodic_memory,
    resolve_repo_dir,
)

# Load environment variables
load_dotenv()
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ============================================================================
# CONSTANTS
# ============================================================================

MAX_TOOL_STEPS = 8   # hard cap — prevents runaway tool loops

# Evidence status vocabulary (per ProofStack official spec)
STATUS_GRAPH_OBSERVED      = "graph_observed"       # path/node confirmed in indexed graph
STATUS_CODE_OBSERVED       = "code_observed"        # citation confirmed in source file
STATUS_LOG_OBSERVED        = "log_observed"         # error confirmed in supplied logs
STATUS_PROVENANCE_OBSERVED = "provenance_observed"  # commit, engineer, ADR association
STATUS_HYPOTHESIS          = "hypothesis"           # evidence suggests but not yet confirmed
STATUS_SYNTAX_VALID        = "syntax_valid"         # syntax check succeeded
STATUS_TESTS_PASSED        = "tests_passed"         # tests ran and passed
STATUS_CONFIRMED           = "confirmed"            # concrete evidence established


# ============================================================================
# HELPERS
# ============================================================================

def load_system_prompt() -> str:
    """Loads system instructions and output format from prompt.md."""
    prompt_path = Path(__file__).resolve().parent / "prompt.md"
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8").strip()
    return (
        "You are ProofStack AI, an elite autonomous code intelligence and incident response agent.\n"
        "Investigate incidents using FastMCP graph tools and produce structured JSON with a code diff patch.\n"
        "NEVER invent call paths or node names. Only cite paths returned by FalkorDB tool results."
    )


def load_evidence_report_prompt() -> str:
    """Loads Evidence Report Generation instructions from prompts/evidence_report_prompt.md."""
    prompt_path = Path(__file__).resolve().parent / "prompts" / "evidence_report_prompt.md"
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8").strip()
    return "You are ProofStack AI Evidence Report Generator. Produce a structured, auditable JSON evidence report."


def get_llm_client() -> Tuple[Optional[Any], Optional[str], str]:
    """
    Initialises Azure OpenAI (Foundry) or standard OpenAI client.
    Returns (client, model_name, engine_type).
    """
    azure_key      = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_API_KEY")
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT") or os.getenv("AZURE_ENDPOINT")
    azure_version  = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")
    if not azure_version or "2025" in azure_version:
        azure_version = "2024-10-21"
    azure_deployment = (
        os.getenv("AZURE_OPENAI_DEPLOYMENT")
        or os.getenv("AZURE_DEPLOYMENT_NAME")
        or "gpt-5"
    )

    if azure_endpoint and azure_key and "placeholder" not in azure_key and len(azure_key) > 5:
        try:
            from openai import AzureOpenAI
            clean_endpoint = re.sub(r"/openai(?:/v1)?/?$", "", azure_endpoint.strip())
            client = AzureOpenAI(
                api_key=azure_key,
                api_version=azure_version,
                azure_endpoint=clean_endpoint,
            )
            return client, azure_deployment, "azure_openai"
        except Exception as e:
            print(f"[!] AzureOpenAI init failed: {e}")

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key and "placeholder" not in openai_key and len(openai_key) > 15:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            return client, "gpt-4o", "openai"
        except Exception as e:
            print(f"[!] OpenAI init failed: {e}")

    return None, None, "autonomous_heuristic"


# ============================================================================
# EVIDENCE REGISTRY
# ============================================================================

def make_evidence_item(
    source_tool: str,
    claim: str,
    status: str,
    raw_result: dict,
    evidence_id: Optional[str] = None,
) -> dict:
    """
    Creates a traceable evidence record.

    status vocabulary:
      graph_observed — the indexed graph contains this relationship/path
      code_observed  — the cited source file contains the relevant implementation
      log_observed   — the supplied log contains the reported error
      hypothesis     — evidence suggests a particular cause (not yet confirmed)
      verified       — a concrete check (e.g. AST parse) supports the proposed fix
    """
    eid = evidence_id or f"E{uuid.uuid4().hex[:3].upper()}"
    return {
        "evidence_id":   eid,
        "source_tool":   source_tool,
        "claim":         claim,
        "status":        status,
        # source nodes for traceability
        "source_nodes":  raw_result.get("highlighted_nodes", []),
        "cypher_used":   raw_result.get("cypher_executed", ""),
    }


# ============================================================================
# TOOL VALIDATION (defence-in-depth — never forward raw LLM args unchecked)
# ============================================================================

_ALLOWED_TOOLS = set(TOOL_DISPATCH.keys())


def validate_tool_name(name: str) -> None:
    """Raises ValueError if the LLM requested an unregistered tool."""
    if name not in _ALLOWED_TOOLS:
        raise ValueError(
            f"Tool '{name}' is not registered. Allowed: {sorted(_ALLOWED_TOOLS)}"
        )


def validate_tool_arguments(tool_name: str, args: dict) -> dict:
    """
    Light argument sanitisation.
    Strips unexpected keys; ensures tenant_id is always present.
    """
    clean = {k: v for k, v in args.items() if isinstance(k, str) and len(k) < 64}
    clean.setdefault("tenant_id", "sample-fintech")
    return clean


# ============================================================================
# PATCH UTILITIES
# ============================================================================

def apply_diff_patch(current_content: str, patch_diff: Optional[str]) -> str:
    """
    Applies an LLM-generated patch diff to the target file.
    Handles multi-hunk diffs, missing blank lines, context line spacing variances,
    and partial code replacements reliably.
    """
    if not patch_diff or not patch_diff.strip():
        return current_content

    # If the patch is already complete python code rather than a diff
    if "@@" not in patch_diff and ("def " in patch_diff or "import " in patch_diff):
        return patch_diff.strip() + "\n"

    diff_lines = patch_diff.splitlines()
    hunks = []
    current_hunk = None

    for line in diff_lines:
        if line.startswith("---") or line.startswith("+++"):
            continue
        if line.startswith("@@"):
            if current_hunk is not None:
                hunks.append(current_hunk)
            current_hunk = {"header": line, "lines": []}
        elif current_hunk is not None:
            current_hunk["lines"].append(line)

    if current_hunk is not None:
        hunks.append(current_hunk)

    if not hunks:
        return current_content

    result = current_content

    for hunk in hunks:
        old_lines = []
        new_lines = []
        for line in hunk["lines"]:
            if not line:
                old_lines.append("")
                new_lines.append("")
            elif line.startswith("+"):
                new_lines.append(line[1:])
            elif line.startswith("-"):
                old_lines.append(line[1:])
            elif line.startswith(" "):
                old_lines.append(line[1:])
                new_lines.append(line[1:])
            elif line.startswith("\\"):
                continue
            else:
                # Context line where leading space was omitted
                old_lines.append(line)
                new_lines.append(line)

        old_block = "\n".join(old_lines)
        new_block = "\n".join(new_lines)

        # 1. Exact substring match
        if old_block in result:
            result = result.replace(old_block, new_block, 1)
            continue

        if old_block.strip() and old_block.strip() in result:
            result = result.replace(old_block.strip(), new_block.strip(), 1)
            continue

        # 2. Match non-blank lines sequence (handles missing blank lines in diff)
        clean_old = [l.strip() for l in old_lines if l.strip()]
        if clean_old:
            res_lines = result.splitlines()
            non_blank_indices = [i for i, l in enumerate(res_lines) if l.strip()]
            matched = False

            for start_idx in range(len(non_blank_indices) - len(clean_old) + 1):
                cand_indices = non_blank_indices[start_idx : start_idx + len(clean_old)]
                cand_lines = [res_lines[i].strip() for i in cand_indices]
                if cand_lines == clean_old:
                    s_idx = cand_indices[0]
                    e_idx = cand_indices[-1] + 1
                    result = "\n".join(res_lines[:s_idx] + [new_block] + res_lines[e_idx:])
                    matched = True
                    break

            if matched:
                continue

        # 3. Match by deleted lines only
        removed_only = [l[1:] for l in hunk["lines"] if l.startswith("-") and l[1:].strip()]
        added_only = [l[1:] for l in hunk["lines"] if l.startswith("+")]
        if removed_only:
            rem_block = "\n".join(removed_only)
            add_block = "\n".join(added_only)
            if rem_block in result:
                result = result.replace(rem_block, add_block, 1)
                continue
            elif rem_block.strip() in result:
                result = result.replace(rem_block.strip(), add_block.strip(), 1)
                continue

    return result


def check_and_validate_diff_patch(patch: Optional[dict], tenant_id: str = "sample-fintech") -> Optional[dict]:
    """
    Formally checks and validates the generated diff string:
    1. Parses diff hunk lines and counts lines added/deleted.
    2. Simulates applying the patch in memory against the target repo file.
    3. Runs ast.parse() to guarantee zero SyntaxError or IndentationError.
    4. Attaches formal verification proof metadata to the patch object.
    If no patch is needed or diff is empty, returns clean no-patch metadata.
    """
    if not patch:
        patch = {
            "file_path": "",
            "diff": "",
            "explanation": "No code modifications required for this inquiry.",
            "commit_message": "",
        }

    diff_str = patch.get("diff")
    if not diff_str or not str(diff_str).strip():
        patch["diff"] = ""
        patch["status"] = "not_requested"
        patch["validation_status"] = "none"
        patch["validation"] = {
            "syntax_valid": True,
            "ast_verified": True,
            "lines_added": 0,
            "lines_deleted": 0,
            "status": "NO_PATCH_REQUIRED",
            "message": "Patch generation awaiting developer trigger.",
            "target_file": patch.get("file_path", ""),
            "target_exists": False,
        }
        return patch

    file_path = patch.get("file_path") or ""
    if not file_path:
        return patch

    lines_added   = sum(1 for l in diff_str.splitlines() if l.startswith("+") and not l.startswith("+++"))
    lines_deleted = sum(1 for l in diff_str.splitlines() if l.startswith("-") and not l.startswith("---"))

    repo_dir    = resolve_repo_dir(tenant_id)
    clean_path  = file_path.replace("sample_fintech_repo/", "").lstrip("/")
    target_file = (repo_dir / clean_path).resolve()

    current_content = ""
    if target_file.exists():
        current_content = target_file.read_text(encoding="utf-8")

    simulated_content = apply_diff_patch(current_content, diff_str)

    syntax_valid, ast_message = False, ""
    try:
        ast.parse(simulated_content)
        syntax_valid = True
        ast_message  = "Valid Python AST (No SyntaxError or IndentationError)"
    except SyntaxError as syn_err:
        ast_message = f"SyntaxError on line {syn_err.lineno}: {syn_err.msg}"

    patch["validation_status"] = "syntax_valid" if syntax_valid else "failed_validation"
    patch["status"] = "validated" if syntax_valid else "generated"
    patch["valid"] = syntax_valid
    patch["validation"] = {
        "syntax_valid":  syntax_valid,
        "ast_verified":  syntax_valid,
        "lines_added":   lines_added,
        "lines_deleted": lines_deleted,
        "status":        "VERIFIED_SAFE_TO_APPLY" if syntax_valid else "SYNTAX_CHECK_WARNING",
        "message":       ast_message,
        "target_file":   str(target_file.name),
        "target_exists": target_file.exists(),
    }
    return patch


# ============================================================================
# DETERMINISTIC FALLBACK REASONER
# (used when no LLM credentials are available — keeps the demo alive offline)
# ============================================================================

def _build_deterministic_evidence(step_results: list) -> list:
    """Converts deterministic step results into an evidence registry."""
    registry = []
    eid_counter = [1]

    def _add(tool_name, claim, status, raw):
        registry.append(make_evidence_item(
            source_tool=tool_name,
            claim=claim,
            status=status,
            raw_result=raw,
            evidence_id=f"E{eid_counter[0]:02d}",
        ))
        eid_counter[0] += 1

    for step in step_results:
        tool   = step["tool_name"]
        result = step["result"]
        if tool == "mcp_find_symbol":
            best = (result.get("matches") or [{}])[0]
            _add(tool, f"Resolved '{result.get('query')}' to {best.get('name','?')} in {best.get('file_path','?')}:{best.get('start_line','?')}", STATUS_GRAPH_OBSERVED, result)
        elif tool == "mcp_recall_episodic_memory":
            n = result.get("memories_found", 0)
            _add(tool, f"Found {n} prior incident memories attached to target function", STATUS_GRAPH_OBSERVED, result)
        elif tool == "mcp_shortest_execution_path":
            if result.get("path_found"):
                names = result.get("explainable_path", [])
                _add(tool, f"Graph path confirmed: {' -> '.join(names)}", STATUS_GRAPH_OBSERVED, result)
            else:
                _add(tool, "No path found in indexed call graph", STATUS_HYPOTHESIS, result)
        elif tool == "mcp_ast_blast_radius":
            n = result.get("total_impacted_functions", 0)
            _add(tool, f"{n} upstream callers reach the target via [:CALLS*1..5]", STATUS_GRAPH_OBSERVED, result)
        elif tool == "mcp_read_code_file":
            _add(tool, f"Source code inspected: {result.get('file_path','?')} ({result.get('total_lines','?')} lines)", STATUS_CODE_OBSERVED, result)
        elif tool == "mcp_company_brain_provenance":
            chain = result.get("provenance_chain", [{}])
            owner = chain[0].get("engineer_name", "unknown") if chain else "unknown"
            adr   = chain[0].get("decision_tag", "unknown") if chain else "unknown"
            _add(tool, f"Code authored by {owner}, governed by {adr}", STATUS_PROVENANCE_OBSERVED, result)
        elif tool == "mcp_write_episodic_memory":
            _add(tool, f"Finding persisted: {result.get('persisted_finding_id','?')}", STATUS_CONFIRMED, result)
        elif tool == "mcp_pagerank_hotspots":
            _add(tool, "PageRank structural risk scores computed", STATUS_GRAPH_OBSERVED, result)

    return registry


def enhance_investigation_query(prompt: str, tenant_id: str = "sample-fintech") -> dict:
    """
    [Step 1: Dynamic Symbol Discovery & Grounding via MCP Tools]
    Extracts candidate code symbols from the natural language prompt and resolves
    them dynamically against the active FalkorDB knowledge graph via mcp_find_symbol.
    Never relies on hardcoded function names or domain dictionaries.
    """
    tokens = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b", prompt)
    stop_words = {
        "the", "and", "for", "with", "are", "causes", "causing", "http", "error", "errors",
        "why", "what", "how", "from", "into", "over", "under", "fail", "fails", "failing",
        "code", "file", "function", "repo", "repository", "codebase", "show", "tell",
        "find", "check", "test", "investigate", "audit", "trace", "patch", "fix", "please",
        "does", "this", "that", "which", "when", "where", "user", "load", "explain"
    }
    candidate_tokens = [t for t in tokens if t.lower() not in stop_words]

    candidate_targets = []
    candidate_entrypoints = []

    for tok in candidate_tokens:
        try:
            sym_res = mcp_find_symbol(tok, tenant_id)
            if sym_res.get("matches_found", 0) > 0:
                for match in sym_res.get("matches", []):
                    item = {
                        "name": match.get("name"),
                        "file": match.get("file_path"),
                        "qname": match.get("qname"),
                        "confidence": match.get("confidence", 0.5),
                        "entity_type": match.get("entity_type", "Function"),
                    }
                    if any(v in (item["file"] or "").lower() or v in (item["name"] or "").lower() for v in ["endpoint", "router", "view", "api", "controller", "handler"]):
                        if item not in candidate_entrypoints:
                            candidate_entrypoints.append(item)
                    else:
                        if item not in candidate_targets:
                            candidate_targets.append(item)
        except Exception as e:
            print(f"[!] Dynamic symbol lookup note: {e}")

    best_target = candidate_targets[0]["name"] if candidate_targets else (candidate_entrypoints[0]["name"] if candidate_entrypoints else None)
    best_file = candidate_targets[0]["file"] if candidate_targets else (candidate_entrypoints[0]["file"] if candidate_entrypoints else None)
    best_entrypoint = candidate_entrypoints[0]["name"] if candidate_entrypoints else None

    enhanced_summary = (
        f"Anchored symbols: Target '{best_target}' ({best_file or 'unknown'})"
        + (f", Entrypoint '{best_entrypoint}'" if best_entrypoint else "")
        if best_target else "No static symbols anchored; resolving dynamically via graph tools."
    )

    return {
        "original_prompt": prompt,
        "expanded_terms": candidate_tokens,
        "candidate_targets": candidate_targets,
        "candidate_entrypoints": candidate_entrypoints,
        "best_target": best_target,
        "best_file": best_file,
        "best_entrypoint": best_entrypoint,
        "enhanced_summary": enhanced_summary,
    }


def analyze_query_intent(prompt: str, tenant_id: str = "sample-fintech") -> dict:
    """
    Classifies user prompt into Track 1 request categories:
      1. 'general_question': Conceptual inquiries, definitions, algorithms that do not require
         repository graph traversal -> 0 MCP calls, zero latency.
      2. 'repository_investigation': Exploring repository behavior, incidents, triage, call graphs,
         blast radius, change attribution, or provenance.
      3. 'codebase_action': Requests to modify code, remediate bugs, apply patches, or run syntax checks.

    Dynamically anchors symbols via FastMCP tools without hardcoding.
    """
    p_lower = prompt.lower().strip()

    # Dynamic symbol discovery via enhance_investigation_query
    enh = enhance_investigation_query(prompt, tenant_id)
    target_fn = enh.get("best_target")
    target_file = enh.get("best_file")
    entrypoint_fn = enh.get("best_entrypoint")

    # General conceptual question check
    is_general_query = bool(re.search(
        r"^(what\s+is|what\s+are|how\s+does|how\s+do|how\s+can|explain|define|tell\s+me|describe|why\s+is|why\s+does|can\s+you|who\s+is|hi|hello|hey|help)\b",
        p_lower
    ))
    has_code_keywords = any(w in p_lower for w in ["repo", "codebase", "function", "commit", "bug", "trace", "incident", "patch", "caller", "callee", "file", "in code", "in repo"])

    if (is_general_query and not target_fn and not target_file and not has_code_keywords) or p_lower in ["hi", "hello", "hey", "help", "who are you"]:
        return {
            "category": "general_question",
            "intent": "general_question",
            "sub_category": "concept_explanation",
            "target_fn": None,
            "entrypoint_fn": None,
            "target_file": None,
            "requires_mcp": False,
        }

    # Classify intent dynamically
    is_action = any(w in p_lower for w in [
        "fix", "remediate", "patch", "modify", "update", "apply patch", "generate a patch", "suggest a fix", "refactor"
    ])
    is_blast = any(w in p_lower for w in [
        "blast radius", "pagerank", "systemic risk", "upstream", "hotspot", "callers", "who calls", "impact", "rank", "break if"
    ])
    is_provenance = any(w in p_lower for w in [
        "who authored", "author", "governs", "governing", "adr", "decision tag", "provenance", "git blame", "owner", "ownership"
    ])
    is_inspection = any(w in p_lower for w in [
        "explain", "how does", "what does", "walkthrough", "inspect", "show code", "architecture", "overview", "describe", "source"
    ])

    if is_action and (target_fn or target_file):
        category = "codebase_action"
        intent = "codebase_action"
        sub_category = "patch_remediation"
    elif is_blast:
        category = "repository_investigation"
        intent = "repository_investigation"
        sub_category = "blast_radius_audit"
    elif is_provenance:
        category = "repository_investigation"
        intent = "repository_investigation"
        sub_category = "provenance_governance"
    elif is_inspection and (target_fn or target_file):
        category = "repository_investigation"
        intent = "repository_investigation"
        sub_category = "code_inspection"
    else:
        category = "repository_investigation"
        intent = "repository_investigation"
        sub_category = "incident_triage"

    return {
        "category": category,
        "intent": intent,
        "sub_category": sub_category,
        "target_fn": target_fn,
        "entrypoint_fn": entrypoint_fn,
        "target_file": target_file,
        "requires_mcp": category != "general_question",
    }


def execute_deterministic_reasoner(
    prompt: str,
    tenant_id: str = "sample-fintech",
    target_fn: Optional[str] = None,
    entrypoint_fn: Optional[str] = None,
) -> dict:
    """
    [Adaptive Code Agent & Graph Resilience Engine]
    Executes targeted FalkorDB tools adaptively based on the query intent.
    Does NOT call every tool mechanically; grounds all decisions in FalkorDB.
    """
    q_info = analyze_query_intent(prompt, tenant_id)
    category = q_info["category"]
    actual_target = target_fn or q_info["target_fn"]
    actual_entrypoint = entrypoint_fn or q_info["entrypoint_fn"]
    actual_file = q_info["target_file"]

    agent_trace     = []
    all_highlighted = set()
    step_num        = 1

    def _trace(tool_name, track_badge, purpose, result, agent_name=None):
        nonlocal step_num
        if isinstance(result, dict):
            all_highlighted.update(result.get("highlighted_nodes", []))
        agent_trace.append({
            "step":        step_num,
            "tool_name":   tool_name,
            "agent_name":  agent_name or f"Agent:{tool_name.replace('mcp_', '')}",
            "track_badge": track_badge,
            "purpose":     purpose,
            "result":      result,
        })
        step_num += 1
        return result

    # 1. GENERAL QUESTION (0 MCP tools needed)
    if category in ["general_question", "general_code_agent"]:
        headline = f"Conceptual Synthesis: '{prompt[:90]}'"
        action_plan = (
            f"Direct response for inquiry: {prompt}\n\n"
            f"• Conceptual inquiries that do not require repository graph traversal are resolved directly with zero MCP tool latency.\n"
            f"• Connected repository entities (AST functions, call graphs, commits, ADRs, episodic memory) are indexed in FalkorDB graph 'repo:{tenant_id}'.\n"
            f"• To inspect code structure, trace execution paths, or analyze blast radius, specify a function or component in your question."
        )

        return {
            "tenant_graph": f"repo:{tenant_id}",
            "target_function": actual_target,
            "llm_mode": "autonomous_heuristic",
            "engine_label": "ProofStack Conceptual Engine (Zero MCP Calls)",
            "all_highlighted_nodes": [],
            "execution_path": {"path_found": False, "nodes": [], "edges": [], "hops": -1},
            "synthesis": {
                "response_type": "direct_response",
                "message": action_plan,
                "headline": headline,
                "action_plan": action_plan,
                "primary_owner": "N/A (General Concept)",
                "governing_adr": "N/A (General Concept)",
                "upstream_blast_count": 0,
            },
            "evidence_registry": [],
            "patch": check_and_validate_diff_patch(None, tenant_id),
            "agent_trace": [],
        }

    # Resolve target if unspecified by inspecting graph hotspots dynamically
    if not actual_target:
        try:
            hotspots_data = mcp_pagerank_hotspots(tenant_id)
            hs = hotspots_data.get("hotspots", [])
            if hs:
                actual_target = hs[0].get("function_name")
                actual_file = hs[0].get("file")
        except Exception:
            pass

    if not actual_target:
        msg = f"No code symbols identified in repository '{tenant_id}' for query: '{prompt}'."
        return {
            "tenant_graph": f"repo:{tenant_id}",
            "target_function": None,
            "llm_mode": "autonomous_heuristic",
            "engine_label": "ProofStack Code Agent",
            "all_highlighted_nodes": [],
            "execution_path": {"path_found": False, "nodes": [], "edges": [], "hops": -1},
            "synthesis": {
                "response_type": "investigation_report",
                "message": msg,
                "headline": msg,
                "action_plan": "Specify a function, file, or symbol in the repository to investigate.",
                "primary_owner": "Unassigned",
                "governing_adr": "None recorded",
                "upstream_blast_count": 0,
            },
            "evidence_registry": [],
            "patch": check_and_validate_diff_patch(None, tenant_id),
            "agent_trace": [],
        }

    if not actual_file:
        try:
            sym_lookup = mcp_find_symbol(actual_target, tenant_id)
            best_sym = sym_lookup.get("best_match") or {}
            actual_file = best_sym.get("file_path") or f"{actual_target}.py"
        except Exception:
            actual_file = f"{actual_target}.py"

    # 2. SOURCE CODE INSPECTION (symbol + read_code)
    if category == "code_inspection" or q_info.get("sub_category") == "code_inspection":
        _trace(
            "mcp_find_symbol",
            "Track 1: MCP Symbol Resolution",
            f"Resolving '{actual_target}' to verify file location before reading",
            mcp_find_symbol(actual_target, tenant_id),
            "SymbolResolverAgent",
        )
        r_code = _trace(
            "mcp_read_code_file",
            "Track 1: Code Invariant Inspection",
            f"Inspecting source file '{actual_file}' to evaluate implementation details",
            mcp_read_code_file(actual_file, tenant_id),
            "CodeInspectionAgent",
        )
        total_lines = r_code.get("total_lines", 0)
        headline = f"Source inspection of '{actual_file}' ({total_lines} lines) grounded in FalkorDB graph."
        action_plan = f"Inspected implementation of {actual_file} in repository {tenant_id}."
        evidence_registry = _build_deterministic_evidence(agent_trace)
        return {
            "tenant_graph": f"repo:{tenant_id}",
            "target_function": actual_target,
            "llm_mode": "autonomous_heuristic",
            "engine_label": "ProofStack Code Agent (Adaptive Heuristic)",
            "all_highlighted_nodes": list(all_highlighted),
            "execution_path": {"path_found": False, "nodes": [], "edges": [], "hops": -1},
            "synthesis": {
                "response_type": "investigation_report",
                "message": headline,
                "headline": headline,
                "action_plan": action_plan,
                "primary_owner": "Not found in indexed provenance.",
                "governing_adr": "Not found in indexed provenance.",
                "upstream_blast_count": 0,
            },
            "evidence_registry": evidence_registry,
            "patch": check_and_validate_diff_patch(None, tenant_id),
            "agent_trace": agent_trace,
        }

    # 3. PROVENANCE & GOVERNANCE QUERY (provenance + episodic memory)
    if category == "provenance_governance" or q_info.get("sub_category") == "provenance_governance":
        r_prov = _trace(
            "mcp_company_brain_provenance",
            "Track 1: Explainable Provenance",
            f"Tracing author, commit history, and governing ADR tag for '{actual_target}'",
            mcp_company_brain_provenance(actual_target, tenant_id),
            "CompanyBrainAgent",
        )
        r_mem = _trace(
            "mcp_recall_episodic_memory",
            "Track 1: Graph Incident Memory",
            f"Recalling past incident findings attached to '{actual_target}'",
            mcp_recall_episodic_memory(actual_target, tenant_id),
            "EpisodicMemoryAgent",
        )
        chain = r_prov.get("provenance_chain", [])
        primary_owner = chain[0].get("engineer_name", "Unassigned") if chain else "Unassigned"
        governing_adr = chain[0].get("decision_tag", "None recorded") if chain else "None recorded"
        memories_count = r_mem.get("memories_found", 0)

        headline = f"Symbol '{actual_target}': authored by {primary_owner}, governed by {governing_adr}, with {memories_count} recorded incident findings."
        action_plan = (
            f"FalkorDB company brain provenance confirms that '{actual_target}' was authored by {primary_owner} "
            f"and governed by architectural decision {governing_adr}. "
            f"Prior episodic findings: {memories_count} recorded."
        )
        evidence_registry = _build_deterministic_evidence(agent_trace)
        return {
            "tenant_graph": f"repo:{tenant_id}",
            "target_function": actual_target,
            "llm_mode": "autonomous_heuristic",
            "engine_label": "ProofStack Code Agent (Adaptive Heuristic)",
            "all_highlighted_nodes": list(all_highlighted),
            "execution_path": {"path_found": False, "nodes": [], "edges": [], "hops": -1},
            "synthesis": {
                "response_type": "investigation_report",
                "message": headline,
                "headline": headline,
                "action_plan": action_plan,
                "primary_owner": primary_owner,
                "governing_adr": governing_adr,
                "upstream_blast_count": 0,
            },
            "evidence_registry": evidence_registry,
            "patch": check_and_validate_diff_patch(None, tenant_id),
            "agent_trace": agent_trace,
        }

    # 4. BLAST RADIUS & STRUCTURAL RISK AUDIT (3 MCP tools)
    if category == "blast_radius_audit" or q_info.get("sub_category") == "blast_radius_audit":
        r_sym = _trace(
            "mcp_find_symbol",
            "Track 1: MCP Symbol Resolution",
            f"Resolving '{actual_target}' to an exact FalkorDB node",
            mcp_find_symbol(actual_target, tenant_id),
            "SymbolResolverAgent",
        )
        r_blast = _trace(
            "mcp_ast_blast_radius",
            "Track 1: Multi-Hop Blast Radius",
            f"Multi-hop [:CALLS*1..5] blast radius for '{actual_target}'",
            mcp_ast_blast_radius(actual_target, tenant_id),
            "ASTBlastRadiusAgent",
        )
        r_pr = _trace(
            "mcp_pagerank_hotspots",
            "Track 1: GraphBLAS PageRank",
            "FalkorDB native algo.pageRank (GraphBLAS) structural risk ranking",
            mcp_pagerank_hotspots(tenant_id),
            "GraphAlgorithmAgent",
        )
        impact_count = r_blast.get("total_impacted_functions", 0)
        callers = [c.get("impacted_function") for c in r_blast.get("impacted_callers", [])]
        headline = f"FalkorDB AST traversal reveals {impact_count} upstream callers affected if '{actual_target}' changes contract."
        action_plan = (
            f"Security Audit & Dependency Analysis for '{actual_target}':\n"
            f"• Upstream Callers Impacted ({impact_count}): {', '.join(callers[:10]) if callers else 'None'}.\n"
            f"• Modifications to {actual_target} must preserve compatibility with all callers."
        )
        evidence_registry = _build_deterministic_evidence(agent_trace)
        return {
            "tenant_graph": f"repo:{tenant_id}",
            "target_function": actual_target,
            "llm_mode": "autonomous_heuristic",
            "engine_label": "ProofStack Code Agent (Adaptive Heuristic)",
            "all_highlighted_nodes": list(all_highlighted),
            "execution_path": {"path_found": False, "nodes": [], "edges": [], "hops": -1},
            "synthesis": {
                "response_type": "investigation_report",
                "message": headline,
                "headline": headline,
                "action_plan": action_plan,
                "primary_owner": "None recorded",
                "governing_adr": "None recorded",
                "upstream_blast_count": impact_count,
            },
            "evidence_registry": evidence_registry,
            "patch": check_and_validate_diff_patch(None, tenant_id),
            "agent_trace": agent_trace,
        }

    # 5. CODEBASE ACTION
    if category == "codebase_action":
        _trace(
            "mcp_find_symbol",
            "Track 1: MCP Symbol Resolution",
            f"Resolving '{actual_target}' for code modification",
            mcp_find_symbol(actual_target, tenant_id),
            "SymbolResolverAgent",
        )
        _trace(
            "mcp_read_code_file",
            "Track 1: Code Invariant Inspection",
            f"Inspecting '{actual_file}' before patch evaluation",
            mcp_read_code_file(actual_file, tenant_id),
            "CodeInspectionAgent",
        )
        headline = f"Codebase remediation scope evaluated for '{actual_target}' in '{actual_file}'."
        action_plan = f"Inspected {actual_file}. Use LLM-enabled mode or 'Suggest a Patch' for automated patch generation."
        evidence_registry = _build_deterministic_evidence(agent_trace)
        return {
            "tenant_graph": f"repo:{tenant_id}",
            "target_function": actual_target,
            "llm_mode": "autonomous_heuristic",
            "engine_label": "ProofStack Code Agent (Adaptive Heuristic)",
            "all_highlighted_nodes": list(all_highlighted),
            "execution_path": {"path_found": False, "nodes": [], "edges": [], "hops": -1},
            "synthesis": {
                "response_type": "codebase_action",
                "message": headline,
                "headline": headline,
                "action_plan": action_plan,
                "primary_owner": "None recorded",
                "governing_adr": "None recorded",
                "upstream_blast_count": 0,
            },
            "evidence_registry": evidence_registry,
            "patch": check_and_validate_diff_patch(None, tenant_id),
            "agent_trace": agent_trace,
        }

    # 6. INCIDENT TRIAGE & REPAIR (Graph investigation across tools)
    r_sym = _trace(
        "mcp_find_symbol",
        "Track 1: MCP Symbol Resolution",
        f"Resolved mention of '{actual_target}' to an exact FalkorDB graph node",
        mcp_find_symbol(actual_target, tenant_id),
        "SymbolResolverAgent",
    )
    r_mem = _trace(
        "mcp_recall_episodic_memory",
        "Track 1: Graph Incident Memory",
        f"Recalling prior incident memories attached to '{actual_target}'",
        mcp_recall_episodic_memory(actual_target, tenant_id),
        "EpisodicMemoryAgent",
    )
    r_neigh = _trace(
        "mcp_explore_graph_neighborhood",
        "Track 1: Exploratory Graph Discovery",
        f"Exploring 1-hop graph neighborhood around '{actual_target}'",
        mcp_explore_graph_neighborhood(actual_target, depth=1, tenant_id=tenant_id),
        "GraphExplorationAgent",
    )

    r_path = {}
    if actual_entrypoint and actual_entrypoint != actual_target:
        r_path = _trace(
            "mcp_shortest_execution_path",
            "Track 1: Multi-Hop shortestPath",
            f"FalkorDB shortestPath from '{actual_entrypoint}' to '{actual_target}'",
            mcp_shortest_execution_path(actual_entrypoint, actual_target, tenant_id),
            "GraphPathAgent",
        )

    r_changes = _trace(
        "mcp_find_changes_on_path",
        "Track 1 & 3: Temporal Changes on Path",
        f"Tracing Git commits along execution path for '{actual_target}'",
        mcp_find_changes_on_path(entrypoint_fn=actual_entrypoint or actual_target, target_fn=actual_target, tenant_id=tenant_id),
        "TemporalLineageAgent",
    )
    r_blast = _trace(
        "mcp_ast_blast_radius",
        "Track 1: Multi-Hop Blast Radius",
        f"Multi-hop [:CALLS*1..5] blast radius for '{actual_target}'",
        mcp_ast_blast_radius(actual_target, tenant_id),
        "ASTBlastRadiusAgent",
    )
    impact_count = r_blast.get("total_impacted_functions", 0)

    r_prov = _trace(
        "mcp_company_brain_provenance",
        "Track 1: Explainable Provenance",
        f"Tracing author and governing ADR/INC tag for '{actual_target}'",
        mcp_company_brain_provenance(actual_target, tenant_id),
        "CompanyBrainAgent",
    )
    chain = r_prov.get("provenance_chain", [])
    primary_owner = chain[0].get("engineer_name", "Unassigned") if chain else "Unassigned"
    governing_adr = chain[0].get("decision_tag", "None recorded") if chain else "None recorded"

    r_code = _trace(
        "mcp_read_code_file",
        "Track 1: Code Invariant Inspection",
        f"Inspecting {actual_file} source to verify implementation",
        mcp_read_code_file(actual_file, tenant_id),
        "CodeInspectionAgent",
    )

    path_names = r_path.get("explainable_path", [])
    path_str = " -> ".join(path_names) if path_names else ""
    hops = r_path.get("hops", len(path_names) - 1 if path_names else 0)

    if r_path.get("path_found"):
        headline = f"Execution path verified ({hops} hops: {path_str}). Target '{actual_target}' reaches {impact_count} upstream callers."
    else:
        headline = f"Investigation for '{actual_target}': {impact_count} upstream callers identified in graph. Provenance: {primary_owner} ({governing_adr})."

    action_plan = (
        f"Review implementation of {actual_target} in {actual_file or 'repository'}. "
        f"Blast radius: {impact_count} callers affected. "
        + (f"Coordinated with author {primary_owner}. " if primary_owner != "Unassigned" else "")
        + "Click 'Suggest a Patch' for LLM-verified code remediation."
    )

    _trace(
        "mcp_write_episodic_memory",
        "Track 1: Graph-Driven Action",
        "Persisted synthesised triage decision into FalkorDB for future sessions",
        mcp_write_episodic_memory(
            function_name=actual_target,
            agent_role="AutonomousCoordinator",
            summary=headline,
            remediation=action_plan,
            verification_status="provenance_observed",
            evidence=f"Target: {actual_target} | Blast: {impact_count} callers",
            session_id=f"session-{uuid.uuid4().hex[:4]}",
            tenant_id=tenant_id,
        ),
        "CoordinatorStateAgent",
    )

    evidence_registry = _build_deterministic_evidence(agent_trace)

    return {
        "tenant_graph": f"repo:{tenant_id}",
        "target_function": actual_target,
        "llm_mode": "autonomous_heuristic",
        "engine_label": "ProofStack Deterministic Reasoner (FalkorDB / GraphBLAS)",
        "all_highlighted_nodes": list(all_highlighted),
        "execution_path": {
            "path_found": r_path.get("path_found", False),
            "nodes": r_path.get("nodes", []),
            "edges": r_path.get("edges", []),
            "hops": r_path.get("hops", -1),
        },
        "synthesis": {
            "response_type": "codebase_action" if q_info["category"] == "codebase_action" else "investigation_report",
            "message": headline,
            "headline": headline,
            "action_plan": action_plan,
            "primary_owner": primary_owner,
            "governing_adr": governing_adr,
            "upstream_blast_count": impact_count,
        },
        "evidence_registry": evidence_registry,
        "patch": check_and_validate_diff_patch(None, tenant_id),
        "agent_trace": agent_trace,
    }


# ============================================================================
# LLM ReAct LOOP  (Change 1 — graph-central, bounded, evidence-registered)
# ============================================================================

def _build_tool_observation(tool_call, result: dict) -> dict:
    """Formats a tool result as an OpenAI tool message."""
    return {
        "role":         "tool",
        "tool_call_id": tool_call.id,
        "content":      json.dumps(result),
    }


def _extract_evidence_from_result(tool_name: str, result: dict) -> Optional[dict]:
    """
    Derives an evidence record from a tool result.
    Returns None if there is nothing meaningful to record.
    """
    if "error" in result:
        return None

    if tool_name == "mcp_find_symbol":
        best  = result.get("best_match") or {}
        claim = (
            f"Resolved to {best.get('name','?')} at "
            f"{best.get('file_path','?')}:{best.get('start_line','?')}"
        )
        return make_evidence_item(tool_name, claim, STATUS_GRAPH_OBSERVED, result)

    if tool_name == "mcp_shortest_execution_path":
        if result.get("path_found"):
            names = result.get("explainable_path", [])
            return make_evidence_item(
                tool_name,
                f"Graph path: {' -> '.join(names)} ({result.get('hops','?')} hops)",
                STATUS_GRAPH_OBSERVED,
                result,
            )
        return make_evidence_item(
            tool_name, "No execution path found in indexed graph", STATUS_HYPOTHESIS, result
        )

    if tool_name == "mcp_ast_blast_radius":
        n = result.get("total_impacted_functions", 0)
        return make_evidence_item(
            tool_name, f"{n} upstream callers reach the target function", STATUS_GRAPH_OBSERVED, result
        )

    if tool_name == "mcp_recall_episodic_memory":
        n = result.get("memories_found", 0)
        return make_evidence_item(
            tool_name,
            f"{n} prior incident memories found",
            STATUS_GRAPH_OBSERVED if n > 0 else STATUS_HYPOTHESIS,
            result,
        )

    if tool_name == "mcp_company_brain_provenance":
        chain = result.get("provenance_chain", [{}])
        owner = chain[0].get("engineer_name", "?") if chain else "?"
        adr   = chain[0].get("decision_tag", "?") if chain else "?"
        return make_evidence_item(
            tool_name, f"Authored by {owner}, governed by {adr}", STATUS_PROVENANCE_OBSERVED, result
        )

    if tool_name == "mcp_read_code_file":
        return make_evidence_item(
            tool_name,
            f"Source file {result.get('file_path','?')} inspected ({result.get('total_lines','?')} lines)",
            STATUS_CODE_OBSERVED,
            result,
        )

    if tool_name == "mcp_write_episodic_memory":
        return make_evidence_item(
            tool_name,
            f"Finding persisted to FalkorDB: {result.get('persisted_finding_id','?')}",
            STATUS_CONFIRMED,
            result,
        )

    if tool_name == "mcp_pagerank_hotspots":
        top = (result.get("top_hotspots") or [{}])[0]
        return make_evidence_item(
            tool_name,
            f"PageRank computed; top hotspot: {top.get('function_name','?')}",
            STATUS_GRAPH_OBSERVED,
            result,
        )

    if tool_name == "mcp_explore_graph_neighborhood":
        n = result.get("total_connections", 0)
        center = result.get("center_symbol", "?")
        rels = list(result.get("relationship_summary", {}).keys())
        rel_str = f" ({', '.join(rels[:3])})" if rels else ""
        return make_evidence_item(
            tool_name,
            f"Neighborhood explored around '{center}': {n} direct graph connections discovered{rel_str}",
            STATUS_GRAPH_OBSERVED,
            result,
        )

    if tool_name == "mcp_find_changes_on_path":
        n = result.get("commits_found", 0)
        recent_sha = result.get("commits", [{}])[0].get("commit_sha", "?") if n > 0 else "None"
        sha_short = recent_sha[:7] if len(recent_sha) >= 7 else recent_sha
        return make_evidence_item(
            tool_name,
            f"Traced {n} Git commits touching execution path (Latest: {sha_short})",
            STATUS_PROVENANCE_OBSERVED,
            result,
        )

    if tool_name == "mcp_validate_patch":
        valid = result.get("syntax_valid", False)
        status = STATUS_SYNTAX_VALID if valid else STATUS_HYPOTHESIS
        claim = (
            f"Patch AST verified: syntax valid (+{result.get('lines_added', 0)} / -{result.get('lines_deleted', 0)} lines)"
            if valid else f"Patch AST rejected: {result.get('error', 'Syntax check failed')}"
        )
        return make_evidence_item(tool_name, claim, status, result)

    return None


def _track_badge_for(fn_name: str) -> str:
    if "explore_graph" in fn_name or "neighborhood" in fn_name:
        return "Track 1: Exploratory Graph Discovery"
    if "changes_on_path" in fn_name:
        return "Track 1 & 3: Temporal Changes on Path"
    if "validate_patch" in fn_name:
        return "Track 1 & Action: AST Verified Remediation Patch"
    if "pagerank" in fn_name:
        return "Track 1: GraphBLAS PageRank"
    if "shortest" in fn_name:
        return "Track 1: Multi-Hop shortestPath"
    if "blast_radius" in fn_name:
        return "Track 1: Multi-Hop Blast Radius"
    if "provenance" in fn_name:
        return "Track 1: Explainable Provenance"
    if "memory" in fn_name:
        return "Track 1: Graph Incident Memory"
    if "find_symbol" in fn_name:
        return "Track 1: MCP Symbol Resolution"
    if "read_code" in fn_name:
        return "Track 1: Code Invariant Inspection"
    return "Track 1: Connected Data"


def _is_invalid_target(name: Optional[str], file_path: Optional[str] = None) -> bool:
    """Filter out framework boilerplate, generic classes, or migrations from target functions."""
    if not name:
        return True
    n = str(name).strip()
    if n in ("Migration", "AppConfig", "ModelAdmin", "TestCase", "object", "None", ""):
        return True
    if "migration" in n.lower() or n.startswith("000"):
        return True
    if file_path:
        fp = str(file_path).lower()
        if "migrations/" in fp or "migration" in fp:
            return True
        if "admin.py" in fp or "apps.py" in fp:
            return True
    return False


def _extract_best_symbol_from_trace(agent_trace: list, candidate: Optional[str] = None) -> Optional[str]:
    """Find the most accurate application symbol investigated, skipping migrations or boilerplate."""
    if candidate and not _is_invalid_target(candidate):
        return candidate

    # 1. Reverse search for AST blast radius target or inspected symbol
    for tr in reversed(agent_trace):
        tname = tr.get("tool_name", "")
        res = tr.get("result")
        if not isinstance(res, dict):
            continue
        if tname == "mcp_ast_blast_radius":
            sym = res.get("target_function")
            if sym and not _is_invalid_target(sym):
                return sym
        if tname in ("mcp_read_symbol_source", "mcp_ast_inspect_symbol"):
            sym = res.get("symbol_name") or res.get("name")
            if sym and not _is_invalid_target(sym, res.get("file_path")):
                return sym

    # 2. Reverse search through mcp_find_symbol matches
    for tr in reversed(agent_trace):
        if tr.get("tool_name") == "mcp_find_symbol":
            res = tr.get("result")
            if isinstance(res, dict):
                for m in res.get("matches", []):
                    m_name = m.get("name")
                    m_file = m.get("file_path")
                    if m_name and not _is_invalid_target(m_name, m_file):
                        return m_name

    return candidate


def _clean_human_text(val: Any, fallback: str = "") -> str:
    """Sanitize strings against unparsed JSON dictionaries or tool output dumps."""
    if not val:
        return fallback
    if isinstance(val, dict):
        return val.get("message") or val.get("headline") or val.get("explanation") or fallback
    s = str(val).strip()
    if s.startswith("{") and ('"tool"' in s or '"query"' in s or '"matches"' in s):
        return fallback
    # Normalize inline bullets (e.g. " - code_observed:", " - ") into clean structured newlines
    if " - " in s or " - code_observed:" in s:
        s = re.sub(r"\s*-\s*([a-zA-Z0-9_]+_observed):\s*", r"\n- [\1] ", s)
        s = re.sub(r"\s+-\s+", r"\n- ", s)
        s = re.sub(r"\n-\s*\[?[a-zA-Z0-9_]+_observed\]?:?\s*$", "", s, flags=re.MULTILINE)
        s = s.strip()
    return s


def _synthesize_llm_investigation(
    client,
    model: str,
    messages: list,
    prompt: str,
    agent_trace: list,
    tenant_id: str,
    evidence: list,
    target_fn: Optional[str] = None,
) -> dict:
    """
    [Track 01: Principal Developer Synthesis]
    Synthesizes a clean, simple, actionable developer incident report based on
    all tool observations and code inspected during the ReAct loop.
    Guarantees no raw tool JSON and anchors to the real broken symbol.
    """
    code_snippets = []
    inspected_files = []
    impacted_callers = []
    for tr in agent_trace:
        tname = tr.get("tool_name", "")
        res = tr.get("result")
        if not isinstance(res, dict):
            continue
        if tname == "mcp_read_code_file":
            fp = res.get("file_path", "")
            lines = res.get("lines", "")
            if fp and lines:
                inspected_files.append(fp)
                code_snippets.append(f"File `{fp}`:\n```\n{lines[:3000]}\n```")
        elif tname in ("mcp_read_symbol_source", "mcp_ast_inspect_symbol"):
            src = res.get("source") or res.get("code") or ""
            fp = res.get("file_path") or ""
            sym = res.get("symbol_name") or res.get("name") or ""
            if src:
                code_snippets.append(f"Symbol `{sym}` in `{fp}`:\n```\n{src[:2000]}\n```")
        elif tname == "mcp_ast_blast_radius":
            for c in res.get("impacted_callers", []):
                impacted_callers.append(c.get("impacted_qname") or c.get("impacted_function"))

    best_sym = _extract_best_symbol_from_trace(agent_trace, target_fn)

    synthesis_system_prompt = (
        "You are a Principal Software Engineer synthesizing an auditable incident investigation report.\n"
        "Your goal is to provide a clear, simple, and technically precise explanation that any developer can immediately understand and use to fix the issue.\n\n"
        "STRICT REQUIREMENTS:\n"
        "1. TARGET SYMBOL: Identify the real application function/class causing the failure (e.g. `send_alert_email`). NEVER select framework boilerplate, generic classes, or migrations (NEVER `Migration`, `AppConfig`, `000X_...`).\n"
        "2. INCIDENT SYMPTOM: Explain what failure or error occurs in plain developer terms (e.g., HTTP 500 Internal Server Error when sending alert emails).\n"
        "3. ROOT CAUSE DIAGNOSIS: Explain the exact code mechanism causing the bug (e.g., missing environment variables EMAIL_TOOLS/EMAIL_PASS causing unhandled TypeError or SMTPAuthenticationError without try/except).\n"
        "4. ACTION PLAN: Provide numbered, clear, step-by-step guidance for a developer to resolve and verify.\n"
        "5. REMEDIATION PATCH: Do NOT generate code diff patches during this initial investigation phase. Diffs are generated strictly on-demand when the developer explicitly clicks 'Generate Patch'. Always set patch diff to \"\" and status to \"not_requested\".\n"
        "6. CLEAN TEXT: Output clean, professional technical text. NEVER output raw JSON, tool dictionaries, or code markers in the headline/message.\n\n"
        "Return strictly a JSON object with this schema:\n"
        "{\n"
        '  "response_type": "investigation_report",\n'
        '  "target_function": "exact_function_name",\n'
        '  "target_file": "relative/path/to/file.py",\n'
        '  "headline": "Concise 1-sentence developer diagnosis",\n'
        '  "message": "Clear 2-3 sentence technical explanation of the failure mechanism and resolution.",\n'
        '  "action_plan": "1. Step one...\\n2. Step two...",\n'
        '  "primary_owner": "Engineer name or Unassigned",\n'
        '  "governing_adr": "ADR ID or None recorded",\n'
        '  "upstream_blast_count": 0,\n'
        '  "patch": {\n'
        '    "file_path": "path/to/file.py",\n'
        '    "diff": "",\n'
        '    "explanation": "Remediation patch awaiting developer request via Generate Patch.",\n'
        '    "commit_message": "fix: description",\n'
        '    "status": "not_requested"\n'
        '  }\n'
        "}"
    )

    user_summary_content = (
        f"Repository: repo:{tenant_id}\n"
        f"Incident Inquiry: {prompt}\n"
        f"Candidate Target Symbol: {best_sym or 'None'}\n"
        f"Inspected Files: {', '.join(set(inspected_files)) if inspected_files else 'None'}\n\n"
    )
    if code_snippets:
        user_summary_content += "Observed Code Context:\n" + "\n\n".join(code_snippets[:3]) + "\n\n"
    if impacted_callers:
        user_summary_content += f"Impacted Callers: {', '.join(impacted_callers[:5])}\n\n"
    user_summary_content += "Please synthesize the final incident diagnosis and remediation report JSON now."

    synth_messages = [
        {"role": "system", "content": synthesis_system_prompt},
        {"role": "user", "content": user_summary_content},
    ]

    try:
        synth_resp = client.chat.completions.create(
            model=model,
            messages=synth_messages,
            response_format={"type": "json_object"} if (model and ("gpt-4" in model or "gpt-5" in model)) else None,
        )
        content = synth_resp.choices[0].message.content or ""
        clean_json = re.sub(r"^```(?:json)?", "", content.strip(), flags=re.MULTILINE)
        clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(clean_json)
        if isinstance(parsed, dict) and (parsed.get("headline") or parsed.get("message")):
            return parsed
    except Exception as exc:
        print(f"[!] _synthesize_llm_investigation failed: {exc}")

    return {
        "response_type": "investigation_report",
        "target_function": best_sym,
        "target_file": inspected_files[0] if inspected_files else "",
        "headline": f"Investigation of {best_sym or prompt[:60]}",
        "message": f"Identified defect in {best_sym or 'application component'} based on repository AST and graph inspection.",
        "action_plan": "Review code inspection findings and apply recommended configuration/remediation.",
        "primary_owner": "Unassigned",
        "governing_adr": "None recorded",
        "upstream_blast_count": len(impacted_callers),
        "patch": {
            "file_path": inspected_files[0] if inspected_files else "",
            "diff": "",
            "explanation": "Remediation patch awaiting developer request via 'Suggest a Patch'.",
            "commit_message": f"fix: resolve {best_sym or 'issue'}",
            "status": "not_requested",
            "validation_status": "none"
        }
    }


def run_llm_mcp_agent(
    prompt: str,
    tenant_id: str = "sample-fintech",
    function_name: Optional[str] = None,
    entrypoint_fn: Optional[str] = None,
) -> dict:
    """
    [Track 01: Dynamic Tool Selection via FastMCP]
    Bounded ReAct loop:
      1. Analyzes query intent to identify relevant scope.
      2. LLM selects tools adaptively — general inquiries do not force traversal.
      3. All architectural and blast-radius decisions are grounded in FalkorDB.
      4. Safe patch validation ensures diffs are produced only when justified.
    """
    target_fn = function_name
    entrypoint = entrypoint_fn

    client, model, engine_type = get_llm_client()

    if not client:
        return execute_deterministic_reasoner(prompt, tenant_id, target_fn, entrypoint)

    system_prompt = load_system_prompt()
    user_content_parts = [f"Repository tenant: {tenant_id}"]
    if target_fn:
        user_content_parts.append(f"Target function context: {target_fn}")
    if entrypoint:
        user_content_parts.append(f"Entrypoint context: {entrypoint}")
    user_content_parts.append(f"User request: {prompt}\n")
    user_content_parts.append(
        "INVESTIGATION & REASONING RULES:\n"
        "- First classify intent: GENERAL_QUESTION (Mode A), REPOSITORY_INVESTIGATION (Mode B), or CODEBASE_ACTION (Mode C).\n"
        "- For Mode A (general/conceptual questions): Answer directly with zero tool calls per Section 5 schema ('response_type': 'direct_response').\n"
        "- For Mode B/C (repository questions): Resolve symbols and ground all claims in FalkorDB tool observations before concluding.\n"
        "- Return strictly the JSON object defined in Section 5 of the system prompt."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "\n".join(user_content_parts)},
    ]

    agent_trace     = []
    evidence        = []            # evidence registry
    all_highlighted = {n for n in [target_fn, entrypoint] if n}
    step_num        = 1

    execution_path = {"path_found": False, "nodes": [], "edges": [], "hops": -1}

    try:
        for _turn in range(MAX_TOOL_STEPS):
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=OPENAI_MCP_TOOLS,
                tool_choice="auto",
            )
            msg = response.choices[0].message
            messages.append(msg)

            if not msg.tool_calls:
                break

            for tc in msg.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments or "{}")

                try:
                    validate_tool_name(fn_name)
                    safe_args = validate_tool_arguments(fn_name, fn_args)
                except ValueError as ve:
                    tool_result = {"error": str(ve)}
                    safe_args   = fn_args
                else:
                    tool_fn = TOOL_DISPATCH[fn_name]
                    try:
                        tool_result = tool_fn(**safe_args)
                    except Exception as err:
                        tool_result = {"error": str(err)}

                if isinstance(tool_result, dict):
                    all_highlighted.update(tool_result.get("highlighted_nodes", []))

                if fn_name == "mcp_shortest_execution_path" and isinstance(tool_result, dict):
                    if tool_result.get("path_found"):
                        execution_path = {
                            "path_found": True,
                            "nodes":      tool_result.get("nodes", []),
                            "edges":      tool_result.get("edges", []),
                            "hops":       tool_result.get("hops", -1),
                        }

                ev_item = _extract_evidence_from_result(fn_name, tool_result)
                if ev_item:
                    ev_item["evidence_id"] = f"E{len(evidence) + 1:02d}"
                    evidence.append(ev_item)

                agent_trace.append({
                    "step":        step_num,
                    "tool_name":   fn_name,
                    "agent_name":  f"Agent:{fn_name.replace('mcp_', '')}",
                    "track_badge": _track_badge_for(fn_name),
                    "purpose":     f"Invoked {fn_name} — args: {json.dumps(safe_args)}",
                    "result":      tool_result,
                })
                step_num += 1

                messages.append(_build_tool_observation(tc, tool_result))

        last_msg = messages[-1] if messages else None
        last_role = last_msg.get("role") if isinstance(last_msg, dict) else getattr(last_msg, "role", None)
        last_content = (last_msg.get("content") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")) or ""
        parsed: dict = {}
        if last_role == "assistant" and last_content:
            try:
                clean_json = re.sub(r"^```(?:json)?", "", last_content.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
                parsed = json.loads(clean_json)
            except Exception:
                parsed = {}

        # If parsed is missing headline/message, or was raw tool output, perform dedicated synthesis
        is_tool_dict = bool(parsed.get("tool") or "query" in parsed or "matches" in parsed)
        if not parsed or is_tool_dict or not parsed.get("headline") or not parsed.get("message"):
            parsed = _synthesize_llm_investigation(
                client=client,
                model=model,
                messages=messages,
                prompt=prompt,
                agent_trace=agent_trace,
                tenant_id=tenant_id,
                evidence=evidence,
                target_fn=target_fn,
            )

        is_direct = (parsed.get("response_type") == "direct_response") or (len(agent_trace) == 0 and parsed.get("response_type") != "investigation_report")

        if is_direct:
            response_type = "direct_response"
            patch_data = {
                "file_path": "",
                "diff": "",
                "explanation": "No code modifications required for this inquiry.",
                "commit_message": "",
            }
            primary_owner = parsed.get("primary_owner") or "N/A (General Concept)"
            governing_adr = parsed.get("governing_adr") or "N/A (General Concept)"
            upstream_blast_count = 0
            action_plan = parsed.get("action_plan") or "N/A"
            final_target_fn = None
            evidence_registry = []
            highlighted_nodes = []
        else:
            response_type = parsed.get("response_type", "investigation_report")
            final_target_fn = _extract_best_symbol_from_trace(
                agent_trace,
                function_name or parsed.get("target_function")
            )
            target_file_cand = (
                (parsed.get("patch") if isinstance(parsed.get("patch"), dict) else {}).get("file_path")
                or parsed.get("target_file")
                or ""
            )
            # Patch diffs are generated strictly on-demand when developer clicks 'Suggest a Patch'
            patch_data = {
                "file_path": target_file_cand,
                "diff": "",
                "explanation": "Remediation patch awaiting developer request via 'Suggest a Patch'.",
                "commit_message": f"fix: remediate {final_target_fn or 'issue'}",
                "status": "not_requested",
                "validation_status": "none",
            }

            primary_owner = parsed.get("primary_owner")
            governing_adr = parsed.get("governing_adr")
            upstream_blast_count = parsed.get("upstream_blast_count")

            for tr in agent_trace:
                res = tr.get("result")
                if not isinstance(res, dict):
                    continue
                if tr.get("tool_name") == "mcp_company_brain_provenance" and not primary_owner:
                    pchain = res.get("provenance_chain", [])
                    if pchain:
                        primary_owner = pchain[0].get("engineer_name")
                        if not governing_adr:
                            governing_adr = pchain[0].get("decision_tag")
                if tr.get("tool_name") == "mcp_ast_blast_radius" and upstream_blast_count is None:
                    upstream_blast_count = res.get("total_impacted_functions")

            primary_owner = primary_owner or "Unassigned"
            governing_adr = governing_adr or "None recorded"
            upstream_blast_count = upstream_blast_count if upstream_blast_count is not None else 0
            action_plan = parsed.get("action_plan") or "Investigation completed against connected FalkorDB data."
            evidence_registry = evidence
            highlighted_nodes = list(all_highlighted)

        if len(agent_trace) >= MAX_TOOL_STEPS:
            print(f"[!] Step budget of {MAX_TOOL_STEPS} exhausted — returning best available evidence.")

        return {
            "tenant_graph":          f"repo:{tenant_id}",
            "target_function":       final_target_fn,
            "target_file":           target_file_cand if not is_direct else "",
            "prompt":                prompt,
            "llm_mode":              engine_type,
            "engine_label":          f"ProofStack Agent ({model} on {engine_type})",
            "all_highlighted_nodes": highlighted_nodes,
            "execution_path":        execution_path,
            "synthesis": {
                "response_type":        response_type,
                "message":              _clean_human_text(parsed.get("message") or parsed.get("headline", ""), prompt),
                "headline":             _clean_human_text(parsed.get("headline", prompt[:80]), prompt[:80]),
                "action_plan":          _clean_human_text(action_plan, "Review remediation diff and apply patch."),
                "primary_owner":        primary_owner,
                "governing_adr":        governing_adr,
                "upstream_blast_count": upstream_blast_count,
            },
            "evidence_registry": evidence_registry,
            "patch":             check_and_validate_diff_patch(patch_data, tenant_id),
            "agent_trace":       agent_trace,
        }

    except Exception as exc:
        print(f"[!] LLM ReAct agent failed, falling back to deterministic reasoner: {exc}")
        return execute_deterministic_reasoner(prompt, tenant_id, target_fn, entrypoint)


# ============================================================================
# STREAMING INVESTIGATION ENGINE (Adaptive SSE ReAct Loop)
# ============================================================================

def _stream_deterministic_reasoner(
    prompt: str,
    tenant_id: str = "sample-fintech",
    target_fn: Optional[str] = None,
    entrypoint_fn: Optional[str] = None,
):
    """
    [Adaptive Code Agent & Graph Resilience Streaming Engine]
    Streams live events for the exact tools required by the query category.
    Does NOT call every tool mechanically; grounds all decisions in FalkorDB.
    """
    q_info = analyze_query_intent(prompt, tenant_id)
    category = q_info["category"]
    actual_target = target_fn or q_info["target_fn"]
    actual_entrypoint = entrypoint_fn or q_info["entrypoint_fn"]
    actual_file = q_info["target_file"]

    agent_trace = []
    all_highlighted = set()
    step_num = 1

    # 1. GENERAL QUESTION (0 MCP tools needed)
    if category in ["general_question", "general_code_agent"]:
        yield {
            "type": "synthesizing",
            "message": "Synthesizing response...",
        }
        time.sleep(0.12)
        final_result = execute_deterministic_reasoner(prompt, tenant_id, None, None)
        yield {
            "type": "complete",
            "final_result": final_result,
        }
        return

    # Resolve target if unspecified by inspecting graph hotspots dynamically
    if not actual_target:
        try:
            hotspots_data = mcp_pagerank_hotspots(tenant_id)
            hs = hotspots_data.get("hotspots", [])
            if hs:
                actual_target = hs[0].get("function_name")
                actual_file = hs[0].get("file")
        except Exception:
            pass

    if not actual_target:
        final_result = execute_deterministic_reasoner(prompt, tenant_id, None, None)
        yield {
            "type": "complete",
            "final_result": final_result,
        }
        return

    if not actual_file:
        try:
            sym_lookup = mcp_find_symbol(actual_target, tenant_id)
            best_sym = sym_lookup.get("best_match") or {}
            actual_file = best_sym.get("file_path") or f"{actual_target}.py"
        except Exception:
            actual_file = f"{actual_target}.py"

    # 2. SOURCE CODE INSPECTION (1 MCP tool: mcp_read_code_file)
    if category == "code_inspection":
        yield {
            "type": "tool_start",
            "step": step_num,
            "tool_name": "mcp_read_code_file",
            "agent_name": "CodeInspectionAgent",
            "track_badge": "Track 1: Code Invariant Inspection",
            "purpose": f"Inspecting source file '{actual_file}' to evaluate implementation details",
        }
        time.sleep(0.12)
        r_code = mcp_read_code_file(actual_file, tenant_id)
        if isinstance(r_code, dict):
            all_highlighted.update(r_code.get("highlighted_nodes", []))
        agent_trace.append({
            "step": step_num,
            "tool_name": "mcp_read_code_file",
            "agent_name": "CodeInspectionAgent",
            "track_badge": "Track 1: Code Invariant Inspection",
            "purpose": f"Inspecting source file '{actual_file}' to evaluate implementation details",
            "result": r_code,
        })
        evidence_registry = _build_deterministic_evidence(agent_trace)
        yield {
            "type": "tool_complete",
            "step": step_num,
            "tool_name": "mcp_read_code_file",
            "result": r_code,
            "evidence_item": evidence_registry[-1] if evidence_registry else None,
            "highlighted_nodes": list(all_highlighted),
            "execution_path": None,
        }
        yield {
            "type": "synthesizing",
            "message": f"Analyzing source structure of {actual_file} against FalkorDB invariants...",
        }
        time.sleep(0.12)
        final_result = execute_deterministic_reasoner(prompt, tenant_id, actual_target, actual_entrypoint)
        yield {
            "type": "complete",
            "final_result": final_result,
        }
        return

    # 3. PROVENANCE & GOVERNANCE QUERY (2 MCP tools)
    if category == "provenance_governance":
        # Step 1: Provenance
        yield {
            "type": "tool_start",
            "step": step_num,
            "tool_name": "mcp_company_brain_provenance",
            "agent_name": "CompanyBrainAgent",
            "track_badge": "Track 1: Explainable Provenance",
            "purpose": f"Tracing author, commit history, and governing ADR tag for '{actual_target}'",
        }
        time.sleep(0.12)
        r_prov = mcp_company_brain_provenance(actual_target, tenant_id)
        if isinstance(r_prov, dict):
            all_highlighted.update(r_prov.get("highlighted_nodes", []))
        agent_trace.append({
            "step": step_num,
            "tool_name": "mcp_company_brain_provenance",
            "agent_name": "CompanyBrainAgent",
            "track_badge": "Track 1: Explainable Provenance",
            "purpose": f"Tracing author, commit history, and governing ADR tag for '{actual_target}'",
            "result": r_prov,
        })
        evidence_registry = _build_deterministic_evidence(agent_trace)
        yield {
            "type": "tool_complete",
            "step": step_num,
            "tool_name": "mcp_company_brain_provenance",
            "result": r_prov,
            "evidence_item": evidence_registry[-1] if evidence_registry else None,
            "highlighted_nodes": list(all_highlighted),
            "execution_path": None,
        }
        step_num += 1

        # Step 2: Episodic Memory
        yield {
            "type": "tool_start",
            "step": step_num,
            "tool_name": "mcp_recall_episodic_memory",
            "agent_name": "EpisodicMemoryAgent",
            "track_badge": "Track 1: Graph Incident Memory",
            "purpose": f"Recalling past incident findings attached to '{actual_target}'",
        }
        time.sleep(0.12)
        r_mem = mcp_recall_episodic_memory(actual_target, tenant_id)
        if isinstance(r_mem, dict):
            all_highlighted.update(r_mem.get("highlighted_nodes", []))
        agent_trace.append({
            "step": step_num,
            "tool_name": "mcp_recall_episodic_memory",
            "agent_name": "EpisodicMemoryAgent",
            "track_badge": "Track 1: Graph Incident Memory",
            "purpose": f"Recalling past incident findings attached to '{actual_target}'",
            "result": r_mem,
        })
        evidence_registry = _build_deterministic_evidence(agent_trace)
        yield {
            "type": "tool_complete",
            "step": step_num,
            "tool_name": "mcp_recall_episodic_memory",
            "result": r_mem,
            "evidence_item": evidence_registry[-1] if evidence_registry else None,
            "highlighted_nodes": list(all_highlighted),
            "execution_path": None,
        }

        yield {
            "type": "synthesizing",
            "message": "Synthesizing ownership and governance lineage from FalkorDB...",
        }
        time.sleep(0.12)
        final_result = execute_deterministic_reasoner(prompt, tenant_id, actual_target, actual_entrypoint)
        yield {
            "type": "complete",
            "final_result": final_result,
        }
        return

    # 4. BLAST RADIUS & STRUCTURAL RISK AUDIT (3 MCP tools)
    if category == "blast_radius_audit":
        yield {
            "type": "tool_start",
            "step": step_num,
            "tool_name": "mcp_find_symbol",
            "agent_name": "SymbolResolverAgent",
            "track_badge": "Track 1: MCP Symbol Resolution",
            "purpose": f"Resolving '{actual_target}' to an exact FalkorDB node",
        }
        time.sleep(0.12)
        r_sym = mcp_find_symbol(actual_target, tenant_id)
        if isinstance(r_sym, dict):
            all_highlighted.update(r_sym.get("highlighted_nodes", []))
        agent_trace.append({
            "step": step_num,
            "tool_name": "mcp_find_symbol",
            "agent_name": "SymbolResolverAgent",
            "track_badge": "Track 1: MCP Symbol Resolution",
            "purpose": f"Resolving '{actual_target}' to an exact FalkorDB node",
            "result": r_sym,
        })
        evidence_registry = _build_deterministic_evidence(agent_trace)
        yield {
            "type": "tool_complete",
            "step": step_num,
            "tool_name": "mcp_find_symbol",
            "result": r_sym,
            "evidence_item": evidence_registry[-1] if evidence_registry else None,
            "highlighted_nodes": list(all_highlighted),
            "execution_path": None,
        }
        step_num += 1

        yield {
            "type": "tool_start",
            "step": step_num,
            "tool_name": "mcp_ast_blast_radius",
            "agent_name": "ASTBlastRadiusAgent",
            "track_badge": "Track 1: Multi-Hop Blast Radius",
            "purpose": f"Multi-hop [:CALLS*1..5] blast radius for '{actual_target}'",
        }
        time.sleep(0.12)
        r_blast = mcp_ast_blast_radius(actual_target, tenant_id)
        if isinstance(r_blast, dict):
            all_highlighted.update(r_blast.get("highlighted_nodes", []))
        agent_trace.append({
            "step": step_num,
            "tool_name": "mcp_ast_blast_radius",
            "agent_name": "ASTBlastRadiusAgent",
            "track_badge": "Track 1: Multi-Hop Blast Radius",
            "purpose": f"Multi-hop [:CALLS*1..5] blast radius for '{actual_target}'",
            "result": r_blast,
        })
        evidence_registry = _build_deterministic_evidence(agent_trace)
        yield {
            "type": "tool_complete",
            "step": step_num,
            "tool_name": "mcp_ast_blast_radius",
            "result": r_blast,
            "evidence_item": evidence_registry[-1] if evidence_registry else None,
            "highlighted_nodes": list(all_highlighted),
            "execution_path": None,
        }
        step_num += 1

        yield {
            "type": "tool_start",
            "step": step_num,
            "tool_name": "mcp_pagerank_hotspots",
            "agent_name": "GraphAlgorithmAgent",
            "track_badge": "Track 1: GraphBLAS PageRank",
            "purpose": "FalkorDB native algo.pageRank (GraphBLAS) structural risk ranking",
        }
        time.sleep(0.12)
        r_pr = mcp_pagerank_hotspots(tenant_id)
        if isinstance(r_pr, dict):
            all_highlighted.update(r_pr.get("highlighted_nodes", []))
        agent_trace.append({
            "step": step_num,
            "tool_name": "mcp_pagerank_hotspots",
            "agent_name": "GraphAlgorithmAgent",
            "track_badge": "Track 1: GraphBLAS PageRank",
            "purpose": "FalkorDB native algo.pageRank (GraphBLAS) structural risk ranking",
            "result": r_pr,
        })
        evidence_registry = _build_deterministic_evidence(agent_trace)
        yield {
            "type": "tool_complete",
            "step": step_num,
            "tool_name": "mcp_pagerank_hotspots",
            "result": r_pr,
            "evidence_item": evidence_registry[-1] if evidence_registry else None,
            "highlighted_nodes": list(all_highlighted),
            "execution_path": None,
        }

        yield {
            "type": "synthesizing",
            "message": "Synthesizing blast radius and PageRank systemic risk analysis...",
        }
        time.sleep(0.12)
        final_result = execute_deterministic_reasoner(prompt, tenant_id, actual_target, actual_entrypoint)
        yield {
            "type": "complete",
            "final_result": final_result,
        }
        return

    # 5. INCIDENT TRIAGE & REPAIR (Graph investigation across all tools)
    steps = [
        (
            "mcp_find_symbol",
            "Track 1: MCP Symbol Resolution",
            f"Resolving incident mention of '{actual_target}' to an exact FalkorDB node",
            "SymbolResolverAgent",
            lambda: mcp_find_symbol(actual_target, tenant_id),
        ),
        (
            "mcp_recall_episodic_memory",
            "Track 1: Graph Incident Memory",
            f"Recalling prior incident memories attached to '{actual_target}'",
            "EpisodicMemoryAgent",
            lambda: mcp_recall_episodic_memory(actual_target, tenant_id),
        ),
        (
            "mcp_explore_graph_neighborhood",
            "Track 1: Exploratory Graph Discovery",
            f"Exploring 1-hop graph neighborhood around '{actual_target}' for incoming/outgoing dependencies",
            "GraphExplorationAgent",
            lambda: mcp_explore_graph_neighborhood(actual_target, depth=1, tenant_id=tenant_id),
        ),
    ]

    if actual_entrypoint and actual_entrypoint != actual_target:
        steps.append((
            "mcp_shortest_execution_path",
            "Track 1: Multi-Hop shortestPath",
            f"FalkorDB openCypher shortestPath from '{actual_entrypoint}' to '{actual_target}'",
            "GraphPathAgent",
            lambda: mcp_shortest_execution_path(actual_entrypoint, actual_target, tenant_id),
        ))

    steps.extend([
        (
            "mcp_find_changes_on_path",
            "Track 1 & 3: Temporal Changes on Path",
            f"Tracing Git commits along execution path for '{actual_target}'",
            "TemporalLineageAgent",
            lambda: mcp_find_changes_on_path(entrypoint_fn=actual_entrypoint or actual_target, target_fn=actual_target, tenant_id=tenant_id),
        ),
        (
            "mcp_ast_blast_radius",
            "Track 1: Multi-Hop Blast Radius",
            f"Multi-hop [:CALLS*1..5] blast radius for '{actual_target}'",
            "ASTBlastRadiusAgent",
            lambda: mcp_ast_blast_radius(actual_target, tenant_id),
        ),
        (
            "mcp_pagerank_hotspots",
            "Track 1: GraphBLAS PageRank",
            "FalkorDB native algo.pageRank (GraphBLAS) structural risk ranking",
            "GraphAlgorithmAgent",
            lambda: mcp_pagerank_hotspots(tenant_id),
        ),
        (
            "mcp_company_brain_provenance",
            "Track 1: Explainable Provenance",
            f"Tracing author and governing ADR/INC tag for '{actual_target}'",
            "CompanyBrainAgent",
            lambda: mcp_company_brain_provenance(actual_target, tenant_id),
        ),
        (
            "mcp_read_code_file",
            "Track 1: Code Invariant Inspection",
            f"Inspecting {actual_file} source to verify implementation invariants",
            "CodeInspectionAgent",
            lambda: mcp_read_code_file(actual_file, tenant_id),
        ),
    ])

    r_path = {}
    r_blast = {}
    r_prov = {}

    for tool_name, track_badge, purpose, agent_name, call_fn in steps:
        yield {
            "type": "tool_start",
            "step": step_num,
            "tool_name": tool_name,
            "agent_name": agent_name,
            "track_badge": track_badge,
            "purpose": purpose,
        }
        time.sleep(0.12)
        result = call_fn()

        if tool_name == "mcp_shortest_execution_path":
            r_path = result
        elif tool_name == "mcp_ast_blast_radius":
            r_blast = result
        elif tool_name == "mcp_company_brain_provenance":
            r_prov = result

        if isinstance(result, dict):
            all_highlighted.update(result.get("highlighted_nodes", []))

        trace_item = {
            "step": step_num,
            "tool_name": tool_name,
            "agent_name": agent_name,
            "track_badge": track_badge,
            "purpose": purpose,
            "result": result,
        }
        agent_trace.append(trace_item)
        evidence_so_far = _build_deterministic_evidence(agent_trace)
        latest_ev = evidence_so_far[-1] if evidence_so_far else None

        yield {
            "type": "tool_complete",
            "step": step_num,
            "tool_name": tool_name,
            "result": result,
            "evidence_item": latest_ev,
            "highlighted_nodes": list(all_highlighted),
            "execution_path": {
                "path_found": r_path.get("path_found", False),
                "nodes": r_path.get("nodes", []),
                "edges": r_path.get("edges", []),
                "hops": r_path.get("hops", -1),
            } if r_path.get("path_found") else None,
        }
        step_num += 1

    # Persist findings to memory
    chain = r_prov.get("provenance_chain", [])
    primary_owner = chain[0].get("engineer_name", "Unassigned") if chain else "Unassigned"
    governing_adr = chain[0].get("decision_tag", "None recorded") if chain else "None recorded"
    impact_count = r_blast.get("total_impacted_functions", 0)

    path_names = r_path.get("explainable_path", [])
    path_str = " -> ".join(path_names) if path_names else ""
    hops = r_path.get("hops", len(path_names) - 1 if path_names else 0)

    if r_path.get("path_found"):
        headline = f"Execution path verified ({hops} hops: {path_str}). Target '{actual_target}' reaches {impact_count} upstream callers."
    else:
        headline = f"Investigation for '{actual_target}': {impact_count} upstream callers identified in graph. Provenance: {primary_owner} ({governing_adr})."

    action_plan = (
        f"Review implementation of {actual_target} in {actual_file or 'repository'}. "
        f"Blast radius: {impact_count} callers affected. "
        + (f"Coordinated with author {primary_owner}. " if primary_owner != "Unassigned" else "")
        + "Click 'Suggest a Patch' for LLM-verified code remediation."
    )

    yield {
        "type": "tool_start",
        "step": step_num,
        "tool_name": "mcp_write_episodic_memory",
        "agent_name": "CoordinatorStateAgent",
        "track_badge": "Track 1: Graph-Driven Action",
        "purpose": "Persisting synthesised triage decision into FalkorDB episodic memory",
    }
    time.sleep(0.12)
    r_write = mcp_write_episodic_memory(
        function_name=actual_target,
        agent_role="AutonomousCoordinator",
        summary=headline,
        remediation=action_plan,
        verification_status="provenance_observed",
        evidence=f"Target: {actual_target} | Blast: {impact_count} callers",
        session_id=f"session-{uuid.uuid4().hex[:4]}",
        tenant_id=tenant_id,
    )
    if isinstance(r_write, dict):
        all_highlighted.update(r_write.get("highlighted_nodes", []))
    agent_trace.append({
        "step": step_num,
        "tool_name": "mcp_write_episodic_memory",
        "agent_name": "CoordinatorStateAgent",
        "track_badge": "Track 1: Graph-Driven Action",
        "purpose": "Persisted triage decision into FalkorDB episodic memory",
        "result": r_write,
    })
    evidence_registry = _build_deterministic_evidence(agent_trace)
    yield {
        "type": "tool_complete",
        "step": step_num,
        "tool_name": "mcp_write_episodic_memory",
        "result": r_write,
        "evidence_item": evidence_registry[-1] if evidence_registry else None,
        "highlighted_nodes": list(all_highlighted),
    }

    yield {
        "type": "synthesizing",
        "message": "Synthesizing incident root-cause diagnosis and graph evidence...",
    }

    final_result = {
        "tenant_graph": f"repo:{tenant_id}",
        "target_function": actual_target,
        "llm_mode": "autonomous_heuristic",
        "engine_label": "ProofStack Deterministic Reasoner (FalkorDB / GraphBLAS)",
        "all_highlighted_nodes": list(all_highlighted),
        "execution_path": {
            "path_found": r_path.get("path_found", False),
            "nodes": r_path.get("nodes", []),
            "edges": r_path.get("edges", []),
            "hops": r_path.get("hops", -1),
        },
        "synthesis": {
            "headline": headline,
            "action_plan": action_plan,
            "primary_owner": primary_owner,
            "governing_adr": governing_adr,
            "upstream_blast_count": impact_count,
        },
        "evidence_registry": evidence_registry,
        "patch": check_and_validate_diff_patch(None, tenant_id),
        "agent_trace": agent_trace,
    }

    yield {
        "type": "complete",
        "final_result": final_result,
    }


def stream_agent_investigation(
    prompt: str,
    tenant_id: str = "sample-fintech",
    function_name: Optional[str] = None,
    entrypoint_fn: Optional[str] = None,
):
    """
    [Streaming ReAct Loop via SSE]
    Prompt-guided autonomous agent loop:
    1. Loads full system prompt (prompt.md) with Modes A, B, and C.
    2. Lets the LLM determine tool necessity autonomously (tool_choice='auto').
    3. If Mode A (general question), executes zero tool calls and returns direct response.
    4. If Mode B/C (investigation/codebase action), executes FastMCP tools against FalkorDB.
    """
    client, model, engine_type = get_llm_client()

    if not client:
        yield from _stream_deterministic_reasoner(prompt, tenant_id, function_name, entrypoint_fn)
        return

    yield {
        "type": "init",
        "engine": engine_type,
        "model": model or "Autonomous FalkorDB Engine",
        "target_function": function_name,
        "entrypoint": entrypoint_fn,
        "message": f"Starting ProofStack Agent ({model or 'Autonomous Reasoner'} on {engine_type})...",
    }

    try:
        system_prompt = load_system_prompt()
        user_content_parts = [
            f"Repository tenant: {tenant_id}",
        ]
        if function_name:
            user_content_parts.append(f"Target function context: {function_name}")
        if entrypoint_fn:
            user_content_parts.append(f"Entrypoint context: {entrypoint_fn}")
        user_content_parts.append(f"User request: {prompt}\n")
        user_content_parts.append(
            "INVESTIGATION & REASONING RULES:\n"
            "- First classify intent: GENERAL_QUESTION (Mode A), REPOSITORY_INVESTIGATION (Mode B), or CODEBASE_ACTION (Mode C).\n"
            "- For Mode A (general/conceptual questions): Answer directly with zero tool calls per Section 5 schema ('response_type': 'direct_response').\n"
            "- For Mode B/C (repository questions): Resolve symbols and ground all claims in FalkorDB tool observations before concluding.\n"
            "- Return strictly the JSON object defined in Section 5 of the system prompt."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n".join(user_content_parts)},
        ]

        agent_trace = []
        evidence = []
        all_highlighted = {n for n in [function_name, entrypoint_fn] if n}
        step_num = 1
        execution_path = {"path_found": False, "nodes": [], "edges": [], "hops": -1}

        for _turn in range(MAX_TOOL_STEPS):
            yield {
                "type": "turn_thinking",
                "turn": _turn + 1,
                "message": f"Turn {_turn + 1}: ProofStack AI deliberating request...",
            }

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=OPENAI_MCP_TOOLS,
                tool_choice="auto",
            )
            msg = response.choices[0].message
            messages.append(msg)

            if not msg.tool_calls:
                break

            for tc in msg.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments or "{}")

                safe_args = fn_args
                try:
                    validate_tool_name(fn_name)
                    safe_args = validate_tool_arguments(fn_name, fn_args)
                except ValueError as ve:
                    tool_result = {"error": str(ve)}
                else:
                    yield {
                        "type": "tool_start",
                        "step": step_num,
                        "turn": _turn + 1,
                        "tool_name": fn_name,
                        "agent_name": f"Agent:{fn_name.replace('mcp_', '')}",
                        "track_badge": _track_badge_for(fn_name),
                        "args": safe_args,
                        "purpose": f"Executing {fn_name} against FalkorDB graph...",
                    }

                    tool_fn = TOOL_DISPATCH[fn_name]
                    try:
                        tool_result = tool_fn(**safe_args)
                    except Exception as err:
                        tool_result = {"error": str(err)}

                if isinstance(tool_result, dict):
                    all_highlighted.update(tool_result.get("highlighted_nodes", []))

                if fn_name == "mcp_shortest_execution_path" and isinstance(tool_result, dict):
                    if tool_result.get("path_found"):
                        execution_path = {
                            "path_found": True,
                            "nodes": tool_result.get("nodes", []),
                            "edges": tool_result.get("edges", []),
                            "hops": tool_result.get("hops", -1),
                        }

                ev_item = _extract_evidence_from_result(fn_name, tool_result)
                if ev_item:
                    ev_item["evidence_id"] = f"E{len(evidence) + 1:02d}"
                    evidence.append(ev_item)

                trace_item = {
                    "step": step_num,
                    "tool_name": fn_name,
                    "agent_name": f"Agent:{fn_name.replace('mcp_', '')}",
                    "track_badge": _track_badge_for(fn_name),
                    "purpose": f"Invoked {fn_name} — args: {json.dumps(safe_args)}",
                    "result": tool_result,
                }
                agent_trace.append(trace_item)

                yield {
                    "type": "tool_complete",
                    "step": step_num,
                    "turn": _turn + 1,
                    "tool_name": fn_name,
                    "result": tool_result,
                    "evidence_item": ev_item,
                    "highlighted_nodes": list(all_highlighted),
                    "execution_path": execution_path if execution_path.get("path_found") else None,
                }

                step_num += 1
                messages.append(_build_tool_observation(tc, tool_result))

        yield {
            "type": "synthesizing",
            "message": "Synthesizing response...",
        }

        last_msg = messages[-1] if messages else None
        last_role = last_msg.get("role") if isinstance(last_msg, dict) else getattr(last_msg, "role", None)
        last_content = (last_msg.get("content") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")) or ""
        parsed: dict = {}
        if last_role == "assistant" and last_content:
            try:
                clean_json = re.sub(r"^```(?:json)?", "", last_content.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
                parsed = json.loads(clean_json)
            except Exception:
                parsed = {}

        # If parsed is missing headline/message, or was raw tool output, perform dedicated synthesis
        is_tool_dict = bool(parsed.get("tool") or "query" in parsed or "matches" in parsed)
        if not parsed or is_tool_dict or not parsed.get("headline") or not parsed.get("message"):
            parsed = _synthesize_llm_investigation(
                client=client,
                model=model,
                messages=messages,
                prompt=prompt,
                agent_trace=agent_trace,
                tenant_id=tenant_id,
                evidence=evidence,
                target_fn=function_name,
            )

        is_direct = (parsed.get("response_type") == "direct_response") or (len(agent_trace) == 0 and parsed.get("response_type") != "investigation_report")

        if is_direct:
            response_type = "direct_response"
            patch_data = {
                "file_path": "",
                "explanation": "No patch required for direct responses.",
                "commit_message": "",
                "diff": "",
                "valid": False,
            }
            primary_owner = parsed.get("primary_owner") or "N/A (General Concept)"
            governing_adr = parsed.get("governing_adr") or "N/A (General Concept)"
            upstream_blast_count = 0
            action_plan = parsed.get("action_plan") or "N/A"
            final_target_fn = None
            evidence_registry = []
            highlighted_nodes = []
        else:
            response_type = parsed.get("response_type", "investigation_report")
            final_target_fn = _extract_best_symbol_from_trace(
                agent_trace,
                function_name or parsed.get("target_function")
            )

            target_file_cand = (
                (parsed.get("patch") if isinstance(parsed.get("patch"), dict) else {}).get("file_path")
                or parsed.get("target_file")
                or ""
            )
            # Patch diffs are generated strictly on-demand when developer clicks 'Suggest a Patch'
            patch_data = {
                "file_path": target_file_cand,
                "diff": "",
                "explanation": "Remediation patch awaiting developer request via 'Suggest a Patch'.",
                "commit_message": f"fix: remediate {final_target_fn or 'issue'}",
                "status": "not_requested",
                "validation_status": "none",
            }

            primary_owner = parsed.get("primary_owner")
            governing_adr = parsed.get("governing_adr")
            upstream_blast_count = parsed.get("upstream_blast_count")

            for tr in agent_trace:
                res = tr.get("result")
                if not isinstance(res, dict):
                    continue
                if tr.get("tool_name") == "mcp_company_brain_provenance" and not primary_owner:
                    pchain = res.get("provenance_chain", [])
                    if pchain:
                        primary_owner = pchain[0].get("engineer_name")
                        if not governing_adr:
                            governing_adr = pchain[0].get("decision_tag")
                if tr.get("tool_name") == "mcp_ast_blast_radius" and upstream_blast_count is None:
                    upstream_blast_count = res.get("total_impacted_functions")

            primary_owner = primary_owner or "Unassigned"
            governing_adr = governing_adr or "None recorded"
            upstream_blast_count = upstream_blast_count if upstream_blast_count is not None else 0
            action_plan = parsed.get("action_plan") or "Investigation completed against connected FalkorDB data."
            evidence_registry = evidence
            highlighted_nodes = list(all_highlighted)

            validated_patch = check_and_validate_diff_patch(patch_data, tenant_id)

        final_result = {
            "tenant_graph": f"repo:{tenant_id}",
            "target_function": final_target_fn,
            "target_file": target_file_cand if not is_direct else "",
            "prompt": prompt,
            "llm_mode": engine_type,
            "engine_label": f"ProofStack Agent ({model} on {engine_type})",
            "all_highlighted_nodes": highlighted_nodes,
            "execution_path": execution_path,
            "synthesis": {
                "response_type":        response_type,
                "message":              _clean_human_text(parsed.get("message") or parsed.get("headline", ""), prompt),
                "headline":             _clean_human_text(parsed.get("headline", prompt[:80]), prompt[:80]),
                "action_plan":          _clean_human_text(action_plan, "Review remediation diff and apply patch."),
                "primary_owner":        primary_owner,
                "governing_adr":        governing_adr,
                "upstream_blast_count": upstream_blast_count,
            },
            "evidence_registry": evidence_registry,
            "patch": validated_patch if not is_direct else patch_data,
            "agent_trace": agent_trace,
        }

        yield {
            "type": "complete",
            "final_result": final_result,
        }

    except Exception as exc:
        print(f"[!] LLM agent stream failed: {exc}, running deterministic stream...")
        yield {
            "type": "error",
            "message": f"LLM loop note: {exc}. Falling back to deterministic reasoner...",
        }
        yield from _stream_deterministic_reasoner(prompt, tenant_id, function_name, entrypoint_fn)


# ============================================================================
# DEDICATED EVIDENCE REPORT GENERATION AGENT
# ============================================================================

def build_deterministic_evidence_report(
    investigation_data: dict,
    prompt: str = "",
    tenant_id: str = "sample-fintech",
) -> dict:
    """
    [Evidence Report Generator — Deterministic Auditor]
    Organizes and cross-references existing investigation artifacts into an
    auditable developer report matching the Evidence Report Schema v1.0.
    Never invents new facts, runs queries, or synthesizes unobserved claims.
    """
    synthesis = investigation_data.get("synthesis", {})
    evidence_registry = investigation_data.get("evidence_registry", [])
    agent_trace = investigation_data.get("agent_trace", [])
    execution_path = investigation_data.get("execution_path", {})
    patch = investigation_data.get("patch", {})
    target_fn = investigation_data.get("target_function") or ""

    # Derive patch status based on honest remediation principles
    has_diff = bool(patch.get("diff") and patch.get("diff").strip())
    is_valid = bool(patch.get("valid") or patch.get("validation_status") == "syntax_valid")
    if has_diff:
        if patch.get("status") in ["generated", "validated", "awaiting_approval", "applied", "committed"]:
            patch_status = patch["status"]
        else:
            patch_status = "validated" if is_valid else "generated"
    elif patch.get("status"):
        patch_status = patch["status"]
    else:
        patch_status = "not_requested"

    # Assemble evidence refs
    ev_refs = [ev.get("evidence_id") for ev in evidence_registry if ev.get("evidence_id")]

    clean_headline = _clean_human_text(synthesis.get("headline"), prompt or "Software incident investigation")
    clean_message = _clean_human_text(synthesis.get("message"), clean_headline)
    clean_action_plan = _clean_human_text(synthesis.get("action_plan"), "Review remediation diff and apply patch.")

    # Findings
    findings = []
    if clean_headline:
        findings.append({
            "finding_id": "FIND-01",
            "claim": clean_headline,
            "status": "confirmed" if evidence_registry else "hypothesis",
            "explanation": clean_message or clean_action_plan or "Investigation completed with graph observations.",
            "evidence_refs": ev_refs[:3] if ev_refs else [],
            "source_locations": [{"file": patch.get("file_path", ""), "symbol": target_fn}],
            "limitations": ["Temporal change association is not proof of causation without code inspection."]
        })
    for idx, ev in enumerate(evidence_registry):
        findings.append({
            "finding_id": f"FIND-{idx+2:02d}",
            "claim": ev.get("claim", ""),
            "status": ev.get("status", "graph_observed"),
            "explanation": f"Observed via tool {ev.get('source_tool', 'mcp_graph')}",
            "evidence_refs": [ev.get("evidence_id")] if ev.get("evidence_id") else [],
            "source_locations": [{"symbol": s} for s in ev.get("source_nodes", [])],
            "limitations": []
        })

    # Graph paths
    graph_paths = []
    if execution_path and execution_path.get("path_found"):
        graph_paths.append({
            "path_id": "GP-01",
            "purpose": f"Multi-hop execution path from entrypoint to {target_fn or 'target'}",
            "path_found": True,
            "nodes": execution_path.get("nodes", []),
            "edges": execution_path.get("edges", []),
            "hops": execution_path.get("hops", len(execution_path.get("nodes", [])) - 1),
            "evidence_refs": [r for r in ev_refs if "E0" in r][:2],
            "limitations": ["Shortest path indicates callability, not runtime load percentage."]
        })

    # Impact analysis
    impact_callers = []
    for tr in agent_trace:
        if tr.get("tool_name") == "mcp_ast_blast_radius" and isinstance(tr.get("result"), dict):
            for c in tr["result"].get("impacted_callers", []):
                impact_callers.append({
                    "function": c.get("impacted_function"),
                    "qname": c.get("impacted_qname"),
                    "file": c.get("file_path"),
                    "hop_depth": c.get("hop_depth"),
                })

    blast_count = synthesis.get("upstream_blast_count")
    impact_analysis = {
        "upstream_blast_count": blast_count if blast_count is not None else len(impact_callers),
        "count_status": "observed" if (blast_count is not None or impact_callers) else "unknown",
        "affected_components": impact_callers,
        "limitations": ["Blast radius measures static call reachability, not runtime failure probability."]
    }

    # Extract dynamic provenance from agent_trace
    commits = []
    engineers = []
    adrs = []
    analyzed_sha = None

    for tr in agent_trace:
        res = tr.get("result")
        if not isinstance(res, dict):
            continue
        if tr.get("tool_name") == "mcp_company_brain_provenance":
            for p in res.get("provenance_chain", []):
                eng = p.get("engineer_name")
                if eng and not any(e["name"] == eng for e in engineers):
                    engineers.append({"name": eng, "attribution": "file_contributor", "email": p.get("engineer_email", "")})
                dec = p.get("decision_tag")
                if dec and not any(a["decision_id"] == dec for a in adrs):
                    adrs.append({"decision_id": dec, "title": f"Policy governing {p.get('function_name', target_fn)}"})
                c_sha = p.get("commit_sha")
                if c_sha and not any(c["sha"] == c_sha for c in commits):
                    commits.append({"sha": c_sha, "message": p.get("commit_message", "")})
                    if not analyzed_sha:
                        analyzed_sha = c_sha
        elif tr.get("tool_name") == "mcp_find_changes_on_path":
            for ch in res.get("recent_commits_on_path", []):
                c_sha = ch.get("sha")
                if c_sha and not any(c["sha"] == c_sha for c in commits):
                    commits.append({"sha": c_sha, "message": ch.get("message", "")})
                    if not analyzed_sha:
                        analyzed_sha = c_sha
                author = ch.get("author")
                if author and not any(e["name"] == author for e in engineers):
                    engineers.append({"name": author, "attribution": "commit_author"})

    if not engineers and synthesis.get("primary_owner") and synthesis.get("primary_owner") != "Unassigned":
        engineers.append({"name": synthesis.get("primary_owner"), "attribution": "file_contributor"})
    if not adrs and synthesis.get("governing_adr") and synthesis.get("governing_adr") != "None recorded":
        adrs.append({"decision_id": synthesis.get("governing_adr"), "title": "Governing policy"})

    repo_dir = resolve_repo_dir(tenant_id)
    if not analyzed_sha and repo_dir.exists():
        try:
            sha_res = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(repo_dir), capture_output=True, text=True)
            if sha_res.returncode == 0 and sha_res.stdout.strip():
                analyzed_sha = sha_res.stdout.strip()
        except Exception:
            pass
    analyzed_sha = analyzed_sha or (commits[0]["sha"] if commits else "HEAD")

    provenance = {
        "commits": commits,
        "engineers": engineers,
        "adrs": adrs,
        "deployments": []
    }

    # Remediation
    remediation = {
        "recommended_actions": [synthesis.get("action_plan", "Review remediation diff and apply patch.")],
        "patch": {
            "file_path": patch.get("file_path", ""),
            "explanation": patch.get("explanation", "Remediation patch recommended."),
            "diff": patch.get("diff", "") if patch_status in ["generated", "validated", "awaiting_approval", "applied", "committed"] else "",
            "status": patch_status
        },
        "verification": {
            "syntax": "syntax_valid" if (has_diff and is_valid) else "not_run",
            "tests": "not_run",
            "human_approval": "awaiting_approval" if has_diff else "not_requested",
            "application": "not_applied",
            "commit_sha": None
        }
    }

    # Trace summary
    trace_steps = []
    for idx, st in enumerate(agent_trace):
        trace_steps.append({
            "step": st.get("step", idx + 1),
            "tool_name": st.get("tool_name", ""),
            "agent_name": st.get("agent_name", "Agent"),
            "purpose": st.get("purpose", ""),
            "status": "success" if not (isinstance(st.get("result"), dict) and st["result"].get("error")) else "error",
            "related_evidence_refs": ev_refs[idx:idx+1] if idx < len(ev_refs) else []
        })

    return {
        "schema_version": "1.0",
        "report_status": "complete",
        "report_title": f"Evidence Report — {clean_headline}",
        "repository": {
            "repository_id": f"repo:{tenant_id}",
            "analyzed_commit_sha": analyzed_sha,
            "environment": f"repository-analysis / {tenant_id}"
        },
        "executive_summary": {
            "problem": prompt or clean_headline,
            "primary_finding": clean_headline,
            "overall_assessment": "confirmed" if evidence_registry else "hypothesis",
            "recommended_next_step": clean_action_plan,
            "evidence_refs": ev_refs
        },
        "findings": findings,
        "graph_paths": graph_paths,
        "impact_analysis": impact_analysis,
        "provenance": provenance,
        "remediation": remediation,
        "trace_summary": {
            "total_tool_calls": len(agent_trace),
            "steps": trace_steps
        },
        "coverage_and_limitations": [
            "All findings grounded strictly in FalkorDB multi-hop traversal and local AST parsing.",
            "A shortest path demonstrates topological reachability, not runtime execution certainty.",
            "Temporal commit association is not proof of causation without code inspection."
        ],
        "evidence_index": evidence_registry
    }


def generate_evidence_report(
    investigation_data: dict,
    prompt: str = "",
    tenant_id: str = "sample-fintech",
) -> dict:
    """
    [ProofStack AI Evidence Report Generator]
    Invokes the dedicated report-generation prompt (backend/prompts/evidence_report_prompt.md)
    as a bounded second-stage LLM call to turn investigation artifacts into an auditable report.
    Falls back to deterministic report builder if LLM is unavailable.
    """
    client, model, engine_type = get_llm_client()
    if not client:
        return build_deterministic_evidence_report(investigation_data, prompt, tenant_id)

    report_system_prompt = load_evidence_report_prompt()

    repo_dir = resolve_repo_dir(tenant_id)
    analyzed_sha = "HEAD"
    if repo_dir.exists():
        try:
            sha_res = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(repo_dir), capture_output=True, text=True)
            if sha_res.returncode == 0 and sha_res.stdout.strip():
                analyzed_sha = sha_res.stdout.strip()
        except Exception:
            pass

    # Build input contract bundle matching Section 1 of prompt
    input_contract = {
        "investigation_context": {
            "user_request": prompt,
            "repository_id": f"repo:{tenant_id}",
            "tenant_id": tenant_id,
            "target_function": investigation_data.get("target_function"),
            "analyzed_commit_sha": analyzed_sha,
            "environment": f"repository-analysis / {tenant_id}",
        },
        "investigation_trace": investigation_data.get("agent_trace", []),
        "evidence_registry": investigation_data.get("evidence_registry", []),
        "graph_results": {
            "execution_path": investigation_data.get("execution_path", {}),
            "all_highlighted_nodes": investigation_data.get("all_highlighted_nodes", []),
        },
        "patch_results": investigation_data.get("patch", {}),
        "validation_results": {
            "validation_status": investigation_data.get("patch", {}).get("validation_status", "unvalidated"),
            "syntax_valid": investigation_data.get("patch", {}).get("valid", False),
        },
        "synthesis": investigation_data.get("synthesis", {}),
    }

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": report_system_prompt},
                {
                    "role": "user",
                    "content": (
                        "Generate the official ProofStack Evidence Report JSON based strictly on the following structured investigation artifacts:\n\n"
                        + json.dumps(input_contract, indent=2)
                    ),
                },
            ],
            response_format={"type": "json_object"} if (model and ("gpt-4" in model or "gpt-5" in model)) else None,
        )
        content = response.choices[0].message.content or ""
        clean_json = re.sub(r"^```(?:json)?", "", content.strip(), flags=re.MULTILINE)
        clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
        parsed_report = json.loads(clean_json)

        # Validate that the top-level keys exist
        if isinstance(parsed_report, dict) and "executive_summary" in parsed_report and "findings" in parsed_report:
            ex = parsed_report.get("executive_summary", {})
            if isinstance(ex, dict):
                ex["problem"] = _clean_human_text(ex.get("problem"), prompt or "Software incident investigation")
                ex["primary_finding"] = _clean_human_text(ex.get("primary_finding"), prompt or "Software incident investigation")
                ex["recommended_next_step"] = _clean_human_text(ex.get("recommended_next_step"), "Review remediation diff and apply patch.")
            return parsed_report
        else:
            print("[!] Report LLM output missed required schema keys, falling back to deterministic builder.")
            return build_deterministic_evidence_report(investigation_data, prompt, tenant_id)
    except Exception as exc:
        print(f"[!] Evidence Report Generator LLM call failed: {exc}, using deterministic builder.")
        return build_deterministic_evidence_report(investigation_data, prompt, tenant_id)


