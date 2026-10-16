# NexusGraph AI 🕸

> **FalkorDB Multi-Agent Codebase & Company Brain**  
> Autonomous software intelligence powering multi-hop blast radius, native GraphBLAS algorithms, episodic agent memory, and Git/ADR architectural provenance.  
> Built for the **FalkorDB Hackathon** — Covering **Track 1** (Connected Data & Graph Algorithms), **Track 2** (Persistent Memory & Agent Coordination), and **Track 3** (Company Brain).

---

## 🌟 What is NexusGraph AI?

Modern engineering teams struggle with three disconnected layers of technical reality:
1. **Codebase AST**: How functions actually call each other across files and modules.
2. **Git & ADR Provenance**: Who authored the code, which PR made the change, and *why* architectural decisions were made (`[ADR-042]`, `[INC-8410]`).
3. **Agent Episodic Memory**: Past incidents, triage findings, and post-mortems discovered by previous agents that are lost after a session ends.

**NexusGraph AI** ingests Python codebases and real Git commit histories into **FalkorDB** multigraph isolated tenant namespaces (`repo:<tenant_id>`). It coordinates a 5-step multi-agent team via **Parameterized FastMCP Graph Tools** (zero raw Cypher generation by LLMs), lighting up the exact multi-hop execution path on an interactive force-directed canvas.

---

## 🏆 Hackathon Tracks Compliance Matrix

| Track | Feature in NexusGraph AI | FalkorDB Implementation |
| :--- | :--- | :--- |
| **Track 01: Agents That Act on Connected Data** | Multi-hop AST blast radius & Shortest Execution Paths | `MATCH p = (caller:Function)-[:CALLS*1..5]->(target:Function)`<br>`CALL algo.SPpaths` with directional weights |
| **Track 01: Graph Algorithms as Tools** | Native C/GraphBLAS Systemic Criticality Ranking | `CALL algo.pageRank('Function', 'CALLS') YIELD node, score` |
| **Track 02: Persistent Memory & Coordination** | Cross-session episodic findings attached directly to AST nodes | `(:Session)-[:RECORDED]->(:Finding)-[:ATTACHED_TO]->(:Function)`<br>Shared state across multiple agent roles |
| **Track 02: Multigraph Tenant Isolation** | Isolated graph namespaces per repository | `repo:sample-fintech`, `repo:<custom-tenant>` via `db.select_graph()` |
| **Track 03: Company Brain & Provenance** | Connects code to authoring engineers and decision records | `(:Engineer)-[:AUTHORED]->(:Commit)-[:MODIFIED]->(:Module)`<br>`[:OWNERSHIP]` commit frequencies and `[ADR-xxx]` tags |

---

## 📐 Graph Schema Model

```
Nodes:
  (:Module   {path, name})
  (:Function {qname, name, file, lineno, loc, docstring})
  (:Engineer {name, email})
  (:Commit   {sha, message, timestamp, decision_tag})
  (:Finding  {id, agent_role, summary, remediation, created_at})
  (:Session  {id, started_at})

Relationships:
  (Module)-[:DEFINES]->(Function)
  (Module)-[:IMPORTS]->(Module)
  (Function)-[:CALLS {line}]->(Function)
  (Engineer)-[:AUTHORED]->(Commit)
  (Commit)-[:MODIFIED]->(Module)
  (Engineer)-[:OWNERSHIP {commits}]->(Module)
  (Session)-[:RECORDED]->(Finding)
  (Finding)-[:ATTACHED_TO]->(Function)
```

---

## ⚡ The 6 Parameterized FastMCP Graph Tools

NexusGraph AI strictly avoids fragile LLM-generated raw Cypher, using 6 production-ready parameterized MCP tools:

1. **`mcp_ast_blast_radius(function_name)`**:
   Traverses `[:CALLS*1..5]` multi-hop edges to discover every upstream caller broken by a failure or signature change.
2. **`mcp_pagerank_hotspots()`**:
   Executes native FalkorDB `algo.pageRank` over the function call graph to rank systemic risk.
3. **`mcp_shortest_execution_path(source_fn, target_fn)`**:
   Uses FalkorDB's native `algo.SPpaths` to compute the shortest calling chain between entrypoints and targets.
4. **`mcp_company_brain_provenance(function_name)`**:
   Traces the owning engineer, commit history, and `[ADR-xxx]` architectural decision tags for any function.
5. **`mcp_recall_episodic_memory(function_name)`**:
   Retrieves prior session findings attached to the function from earlier agent investigations.
6. **`mcp_write_episodic_memory(function_name, agent_role, summary, remediation)`**:
   Commits a newly synthesized triage finding into FalkorDB attached to the target function for future agents.

---

## 🚀 Quick Start Guide

### Prerequisites
- Docker (for FalkorDB)
- Python 3.10+ (tested on Python 3.14)
- Node.js 18+

### 1. Launch FalkorDB
```bash
docker compose up -d
# Or: docker run -d --name falkordb -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest
```

### 2. Generate Sample Repo & Ingest to FalkorDB
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt

# 1. Generate realistic fintech repo with Git history & ADR tags
python create_sample_repo.py

# 2. Ingest AST + Git commits into FalkorDB
python ingest_repo.py
```

### 3. Start the FastAPI + FastMCP Server
```bash
uvicorn server:app --reload --port 8000
```

### 4. Start the React Force-Directed HUD
```bash
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🎬 Live Hackathon Demo Walkthrough

1. **Target**: Select `decrypt_card_token` and entrypoint `post_checkout_endpoint`.
2. Click **Run Multi-Agent Investigation**:
   - **Step 1 (EpisodicMemoryAgent)**: Recalls `mem-001` recorded by `SecurityTriageAgent` warning that `decrypt_card_token` throws a `504 timeout` under flash-sale load when gRPC timeout is `50ms`.
   - **Step 2 (ASTBlastRadiusAgent)**: Traces 5 impacted upstream callers (`post_checkout_endpoint`, `settle_payment`, `evaluate_fraud_risk`) across 4 hops.
   - **Step 3 (GraphAlgorithmAgent)**: Identifies `fetch_signing_key` and `decrypt_card_token` as high PageRank architectural bottlenecks, finding the 2-hop shortest execution route.
   - **Step 4 (CompanyBrainAgent)**: Discovers **Aarav Mehta** (`aarav@acmefintech.dev`) authored commit `67e6d1c` governed by **`[ADR-042]`** enforcing strict 50ms PCI SLA timeouts.
   - **Step 5 (CoordinatorStateAgent)**: Writes a newly coordinated triage finding into FalkorDB (`session-oct-17-live`).
3. **Visual Force-Directed Canvas**: The entire traversed path lights up with glowing amber/neon-gold rings around the participating nodes in real time.
4. **Inspect Cypher**: Switch to the **Cypher Inspector** tab to view the exact executed Cypher queries and native algorithm invocations.
5. **Cross-Session Memory Persistence Test**: Click **Run Multi-Agent Investigation** a second time. Step 1 will now recall **2 memories**, demonstrating persistent memory live in front of the judges!
