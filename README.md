# ProofStack AI

> **Graph Hacks Track 1: Agents That Act on Connected Data**  
> *Autonomous Code Intelligence & Incident Remediation Powered by FalkorDB GraphBLAS, FastMCP, and Explainable openCypher Provenance.*

[![FalkorDB](https://img.shields.io/badge/FalkorDB-GraphBLAS%20Powered-red.svg)](https://falkordb.com/)
[![Track](https://img.shields.io/badge/Track-1%3A%20Agents%20That%20Act%20on%20Connected%20Data-blue.svg)]()
[![FastMCP](https://img.shields.io/badge/MCP-FastMCP%20Tools-emerald.svg)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-2.0.0-teal.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-cyan.svg)](https://react.dev)

---

## 📌 Executive Summary

Traditional AI coding assistants treat codebases as flat text files — grepping substrings, hallucinating execution paths, and producing ungrounded diffs. 

**ProofStack** turns this paradigm on its head by making **FalkorDB the central, load-bearing brain** of software incident triage and autonomous remediation. The graph determines which functions to inspect, calculates upstream blast radiuses, recalls historical incident memory, evaluates structural risk with GraphBLAS PageRank, and provides cryptographic-grade openCypher explainability for every single action.

---

## 🎯 Track 1: Five Key Focus Pillars

ProofStack is engineered from the ground up to address all five requirements in the **Track 1 Brief**:

| Pillar | Implementation in ProofStack |
|---|---|
| **1. Multi-Hop Reasoning** | Derives call chains and execution paths using openCypher `shortestPath((src)-[:CALLS*1..10]->(tgt))` and multi-hop blast radius `[:CALLS*1..5]` over connected AST nodes. |
| **2. Graph Queries & Algorithms as Agent Tools** | Employs native FalkorDB GraphBLAS algorithms as FastMCP tools: `algo.pageRank` for systemic risk ranking, `shortestPath` for execution routes, and parameterized Cypher queries for module containment. |
| **3. Tool Selection Through FastMCP** | Implements dynamic tool selection via Model Context Protocol (FastMCP). The LLM autonomously chooses which graph traversal tool to invoke next based strictly on prior graph observations. |
| **4. Actions Based on What the Graph Shows** | Acts directly on graph findings: generates an AST-verified diff patch, applies it to the target git repository with a real commit, and attaches a resolved `Finding` node into FalkorDB. |
| **5. Explainable Results** | Features an **Evidence Registry**: every single claim is anchored to its exact `cypher_used` query, execution coordinates (`file:line`), and source nodes. Zero black-box hallucinations. |

---

## 🏗️ Architecture & Investigation Flow

```mermaid
flowchart TD
    User([🚨 Incident Report: "504 Gateway Timeout"]) --> Agent[ProofStack Autonomous Agent]
    
    subgraph FastMCP["FastMCP Graph Tools"]
        T1["mcp_find_symbol"]
        T2["mcp_shortest_execution_path"]
        T3["mcp_ast_blast_radius"]
        T4["mcp_pagerank_hotspots"]
        T5["mcp_company_brain_provenance"]
        T6["mcp_read_code_file"]
        T7["mcp_write_episodic_memory"]
    end
    
    subgraph FalkorDB["FalkorDB Graph Engine (GraphBLAS)"]
        G1[AST Function Nodes]
        G2[Module Nodes]
        G3[Git Commits & ADR Tags]
        G4[Prior Incident Memory]
        G5[Native PageRank Engine]
    end

    Agent -->|Dynamic Tool Selection| FastMCP
    FastMCP <-->|openCypher & GraphBLAS| FalkorDB
    
    Agent -->|Live SSE Stream| UI[React 2D Force-Directed Graph HUD]
    UI --> ER[Evidence Registry: cypher_used per claim]
    UI --> AP[1-Click AST Patch & Git Commit]
```

---

## ⚡ Live Incident Walkthrough (Demo Scenario)

When an engineer reports:  
> *"Checkout is failing with 504 Gateway Timeouts under flash-sale load. Investigate."*

ProofStack executes a 10-step autonomous ReAct loop:

1. **`mcp_find_symbol("checkout")`**:  
   FalkorDB anchors natural language to exact graph nodes: `post_checkout_endpoint` (`checkout_router.py:9`) and `decrypt_card_token` (`vault_client.py:25`).
2. **`mcp_recall_episodic_memory("decrypt_card_token")`**:  
   FalkorDB recalls past incident `mem-001` where a strict 50ms gRPC timeout under queue backlog caused 504s.
3. **`mcp_shortest_execution_path`**:  
   Executes native openCypher `shortestPath` and proves the 2-hop execution chain:  
   `post_checkout_endpoint` ──[:CALLS]──► `settle_payment` ──[:CALLS]──► `decrypt_card_token`.
4. **`mcp_ast_blast_radius`**:  
   Traverses `[:CALLS*1..5]` to discover **5 upstream callers** in the failure path (including fraud evaluation and payment processor).
5. **`mcp_pagerank_hotspots`**:  
   Computes GraphBLAS PageRank structural risk scores across the call topology.
6. **`mcp_company_brain_provenance`**:  
   Traces Git history to identify code authorship and governing architectural decisions (`[ADR-042]`).
7. **`mcp_read_code_file`**:  
   Inspects `vault_client.py` and detects that an operational clamp re-triggers the ADR-042 50ms timeout.
8. **Patch Synthesis & AST Proof**:  
   Generates a safe multi-hunk diff, parses the resulting Python AST to guarantee 0 syntax errors, and updates the repository via 1-click git commit.
9. **`mcp_write_episodic_memory`**:  
   Persists the remediation finding into FalkorDB for future investigations.

---

## 🖥️ User Interface Highlights

- **Evidence Registry Panel**:  
  Inspect every claim with its corresponding parameterized `cypher_used` query, syntax highlighting, 1-click query copy, and clickable source nodes.
- **Interactive Force Graph Canvas**:  
  Watch traversed call paths illuminate in real time with golden glowing halos and animated directional particles.
- **Live ReAct SSE Stream HUD**:  
  Live step-by-step thinking ticker with real-time tool status and progress indicators.
- **1-Click Apply & Commit**:  
  Review unified diffs with AST safety verification (`VERIFIED_SAFE_TO_APPLY`) and commit directly to Git.
- **Dynamic Git Ingestion**:  
  Ingest any local directory or public GitHub repository into isolated FalkorDB multigraphs (`repo:*`).

---

## 🚀 Quickstart

### 1. Prerequisites
- Docker (for FalkorDB)
- Python 3.10+
- Node.js 18+

### 2. Start FalkorDB
```bash
docker run -p 6379:6379 -it --rm falkordb/falkordb:latest
```

### 3. Backend Setup
```bash
# In repository root:
source backend/venv/bin/activate
uvicorn server:app --reload --port 8000
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173** to launch the ProofStack AI interface.
