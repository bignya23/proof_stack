# backend/server.py
import os
import shutil
import subprocess
import tempfile
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Ensure backend directory is in sys.path regardless of CWD
_BACKEND_DIR = str(Path(__file__).resolve().parent)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import json
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent import (
    apply_diff_patch,
    get_llm_client,
    run_llm_mcp_agent,
    stream_agent_investigation,
)
from ingest_repo import ingest_repo_to_falkordb
from mcp_tools import db, get_repo_graph, resolve_repo_dir

# Load environment variables
load_dotenv()
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ============================================================================
# FASTAPI APPLICATION SETUP
# ============================================================================

app = FastAPI(
    title="NexusGraph: Multi-Agent Codebase & Company Brain",
    description="FalkorDB Graph Intelligence with FastMCP Tools & Azure Foundry GPT-5",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# PYDANTIC PAYLOAD SCHEMAS
# ============================================================================

class InvestigatePayload(BaseModel):
    prompt: Optional[str] = "Checkout is failing with 504 timeouts. Investigate decrypt_card_token and fix it."
    function_name: Optional[str] = "decrypt_card_token"
    entrypoint_fn: Optional[str] = "post_checkout_endpoint"
    tenant_id: str = "sample-fintech"
    persist_new_memory: bool = True


class ApplyPatchPayload(BaseModel):
    tenant_id: str = "sample-fintech"
    file_path: str = "vault_client.py"
    patch_diff: Optional[str] = None
    commit_message: Optional[str] = "[FIX-8410] Resolve gRPC timeout in decrypt_card_token per agent analysis"


class IngestPayload(BaseModel):
    repo_path_or_url: str = "./sample_fintech_repo"
    tenant_id: str = "sample-fintech"


# ============================================================================
# FASTAPI ENDPOINTS
# ============================================================================

@app.get("/api/llm/status")
def get_llm_status():
    """Returns the active LLM engine status (Azure Foundry, OpenAI, or Autonomous FalkorDB Reasoner)."""
    _, model, engine_type = get_llm_client()
    return {
        "engine_type": engine_type,
        "model": model or "Autonomous FalkorDB Engine",
        "has_azure": bool(os.getenv("AZURE_OPENAI_ENDPOINT") and os.getenv("AZURE_OPENAI_API_KEY")),
        "has_openai": bool(os.getenv("OPENAI_API_KEY") and "placeholder" not in os.getenv("OPENAI_API_KEY", "")),
        "falkordb_status": "connected",
    }


@app.get("/api/tenants")
def list_isolated_tenant_graphs():
    """Lists all isolated `repo:*` multigraphs currently hosted in FalkorDB."""
    graphs = db.list_graphs()
    repo_tenants = [g.replace("repo:", "") for g in graphs if g.startswith("repo:")]
    return {"tenants": repo_tenants or ["sample-fintech"]}


@app.get("/api/graph/{tenant_id}")
def get_visual_graph_topology(tenant_id: str):
    """
    Returns every Node (Module, Function, Engineer, Commit, Finding, Session)
    and Edge so the React Force-Directed Graph can render and highlight paths.
    """
    g = get_repo_graph(tenant_id)
    nodes_res = g.query("MATCH (n) RETURN ID(n), labels(n)[0], properties(n)")
    edges_res = g.query("MATCH (a)-[r]->(b) RETURN ID(a), ID(b), type(r), properties(r)")

    nodes = []
    for r in nodes_res.result_set:
        node_id, label, props = str(r[0]), r[1], r[2]
        display_name = (
            props.get("name")
            or props.get("sha")
            or props.get("id")
            or props.get("path")
            or node_id
        )
        nodes.append({
            "id": node_id,
            "label": label,
            "display_name": display_name,
            **props,
        })

    links = [
        {
            "source": str(r[0]),
            "target": str(r[1]),
            "type": r[2],
            **(r[3] or {}),
        }
        for r in edges_res.result_set
    ]
    return {
        "tenant_id": tenant_id,
        "graph_key": f"repo:{tenant_id}",
        "nodes": nodes,
        "links": links,
    }


@app.post("/api/investigate")
@app.post("/api/agent/investigate")
def execute_multi_agent_investigation(req: InvestigatePayload):
    """
    [Track 01, Track 02, Track 03 Multi-Agent ReAct Engine]
    Executes dynamic FastMCP tool selection, multi-hop reasoning over FalkorDB,
    and patch generation.
    """
    return run_llm_mcp_agent(
        prompt=req.prompt or f"Investigate {req.function_name} and generate patch",
        tenant_id=req.tenant_id,
        function_name=req.function_name,
        entrypoint_fn=req.entrypoint_fn,
    )


def _generate_sse_events(req: InvestigatePayload):
    for event in stream_agent_investigation(
        prompt=req.prompt or f"Investigate {req.function_name} and generate patch",
        tenant_id=req.tenant_id,
        function_name=req.function_name,
        entrypoint_fn=req.entrypoint_fn,
    ):
        yield f"data: {json.dumps(event)}\n\n"


@app.post("/api/investigate/stream")
@app.post("/api/agent/investigate/stream")
def stream_investigation_endpoint(req: InvestigatePayload):
    """
    [Streaming ReAct Loop via SSE]
    Streams live step-by-step thinking, dynamic MCP tool calls, FalkorDB Cypher execution,
    and patch synthesis in real time.
    """
    return StreamingResponse(
        _generate_sse_events(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/investigate/stream")
@app.get("/api/agent/investigate/stream")
def stream_investigation_get(
    prompt: Optional[str] = "Checkout is failing with 504 timeouts. Investigate decrypt_card_token and fix it.",
    function_name: Optional[str] = "decrypt_card_token",
    entrypoint_fn: Optional[str] = "post_checkout_endpoint",
    tenant_id: str = "sample-fintech",
):
    """GET endpoint variant for browser EventSource or curl testing."""
    payload = InvestigatePayload(
        prompt=prompt,
        function_name=function_name,
        entrypoint_fn=entrypoint_fn,
        tenant_id=tenant_id,
    )
    return stream_investigation_endpoint(payload)



@app.post("/api/patch/apply")
def apply_patch_and_commit(req: ApplyPatchPayload):
    """
    [Track 01 & Action]
    Applies the remediated code patch directly to the target Git repository,
    creates a real Git commit, and attaches a new resolved Finding in FalkorDB!
    """
    repo_dir = resolve_repo_dir(req.tenant_id)
    clean_path = req.file_path.replace("sample_fintech_repo/", "").lstrip("/")
    target_file = (repo_dir / clean_path).resolve()

    if not target_file.exists():
        found = list(repo_dir.glob(f"**/{Path(req.file_path).name}"))
        if found:
            target_file = found[0]
        else:
            raise HTTPException(status_code=404, detail=f"Target file {req.file_path} not found in {repo_dir}")

    # Read current content and apply the actual LLM diff patch
    current_content = target_file.read_text(encoding="utf-8")
    new_content = apply_diff_patch(current_content, req.patch_diff)
    target_file.write_text(new_content, encoding="utf-8")

    # Run git add & commit
    commit_msg = req.commit_message or "[FIX-8410] Remediate gRPC timeout per FalkorDB incident memory"
    commit_sha = "patch-local"
    try:
        subprocess.check_call(
            ["git", "add", str(target_file)],
            cwd=str(repo_dir),
        )
        subprocess.run(
            ["git", "commit", "-m", commit_msg, "--author=NexusGraph AI Agent <agent@nexusgraph.ai>"],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
        )
        sha_res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            check=True,
        )
        commit_sha = sha_res.stdout.strip()[:7]
    except Exception as e:
        print(f"[!] Git commit note: {e}")

    # Update FalkorDB: create Commit and Finding
    g = get_repo_graph(req.tenant_id)
    finding_id = f"patch-{uuid.uuid4().hex[:6]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    update_cypher = """
    MERGE (c:Commit {sha: $sha})
    ON CREATE SET c.message = $msg, c.author = 'NexusGraph AI Agent', c.timestamp = $ts
    MERGE (f:Finding {id: $fid})
    SET f.status = 'RESOLVED',
        f.summary = 'Automated patch applied and committed to Git',
        f.remediation = $msg,
        f.resolved_commit = $sha,
        f.timestamp = $ts
    WITH c, f
    MATCH (fn:Function) WHERE fn.name = 'decrypt_card_token' OR fn.file CONTAINS $fn_file
    MERGE (fn)-[:HAS_FINDING]->(f)
    MERGE (f)-[:RESOLVED_BY_COMMIT]->(c)
    RETURN f.id, c.sha
    """
    try:
        g.query(
            update_cypher,
            {
                "sha": commit_sha,
                "msg": commit_msg,
                "ts": now_iso,
                "fid": finding_id,
                "fn_file": target_file.name,
            },
        )
    except Exception as err:
        print(f"[!] Finding update Cypher note: {err}")

    return {
        "status": "applied_and_committed",
        "commit_sha": commit_sha,
        "commit_message": commit_msg,
        "file_path": str(target_file.relative_to(repo_dir)),
        "finding_id": finding_id,
        "tenant_id": req.tenant_id,
    }


@app.post("/api/ingest")
def ingest_any_local_or_github_repo(req: IngestPayload):
    """Allows live ingestion of any local folder path or public GitHub URL into an isolated tenant graph."""
    target = req.repo_path_or_url.strip()
    temp_dir = None
    try:
        if target.startswith("http://") or target.startswith("https://"):
            temp_dir = tempfile.mkdtemp(prefix="nexus_git_")
            subprocess.check_call(["git", "clone", "--depth", "40", target, temp_dir])
            ingest_repo_to_falkordb(temp_dir, tenant_id=req.tenant_id)
        else:
            resolved_target = target
            if not os.path.exists(resolved_target):
                root_check = (Path(__file__).resolve().parent.parent / target).resolve()
                if root_check.exists():
                    resolved_target = str(root_check)
                else:
                    backend_check = (Path(__file__).resolve().parent / target).resolve()
                    if backend_check.exists():
                        resolved_target = str(backend_check)
                    else:
                        raise HTTPException(status_code=400, detail=f"Path not found: {target}")
            ingest_repo_to_falkordb(resolved_target, tenant_id=req.tenant_id)
        return {"status": "ingested", "tenant_graph": f"repo:{req.tenant_id}"}
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
