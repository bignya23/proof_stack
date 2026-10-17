# backend/ingest_repo.py
"""
ProofStack Repository Ingestion CLI & Core Driver.
Executes the staged Repository Analyzer and Symbol Resolution Pipeline:
  1. Discovery & AST Parsing (Native Python AST + Tree-sitter for multi-language)
  2. Repository Symbol Table Generation
  3. Scope & Import Resolution
  4. Traceable Call Site Resolution (no fabricated edges!)
  5. FalkorDB Graph Persistence
  6. Graph Validation & Coverage Reporting
"""

import sys
from pathlib import Path
from falkordb import FalkorDB

# Add backend directory to sys.path so analyzer is importable
_BACKEND_DIR = Path(__file__).resolve().parent
_ROOT_DIR = _BACKEND_DIR.parent

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

from backend.analyzer import analyze_repository

db = FalkorDB(host="localhost", port=6379)


def ingest_repo_to_falkordb(repo_dir: str, tenant_id: str = "sample-fintech"):
    """
    Main ingestion entry point called by server, agents, or CLI.
    Runs the full staged AST parsing, symbol resolution, and FalkorDB persistence pipeline.
    """
    repo_path = Path(repo_dir).resolve()
    if not repo_path.exists():
        # Check if the repo exists in the workspace root
        root_sample = (Path(__file__).resolve().parent.parent / "sample_fintech_repo").resolve()
        if root_sample.exists():
            repo_path = root_sample
        else:
            print(f"[*] Target directory '{repo_path}' is missing. Building sample repository...")
            try:
                from backend.create_sample_repo import build_sample_repo, REPO_DIR
                build_sample_repo()
                repo_path = Path(REPO_DIR).resolve()
            except Exception as e:
                print(f"[-] Error auto-building sample repo: {e}")

    # Execute staged analyzer pipeline
    analysis = analyze_repository(
        repo_dir=str(repo_path),
        tenant_id=tenant_id,
        db=db,
        clean_wipe=True,
        verbose=True,
    )
    return analysis


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_dir = sys.argv[1]
    else:
        root_path = Path(__file__).resolve().parent.parent / "sample_fintech_repo"
        target_dir = "./sample_fintech_repo" if Path("./sample_fintech_repo").exists() else str(root_path)
    tenant = sys.argv[2] if len(sys.argv) > 2 else "sample-fintech"
    ingest_repo_to_falkordb(target_dir, tenant_id=tenant)