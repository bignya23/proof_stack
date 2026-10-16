import ast
import os
import re
import subprocess
import sys
from pathlib import Path
from falkordb import FalkorDB

db = FalkorDB(host="localhost", port=6379)
IGNORE_DIRS = {".git", "venv", ".venv", "node_modules", "__pycache__"}


def parse_python_ast(filepath: Path, rel_path: str):
    """Extracts Functions, Imports, and Outgoing Calls with exact line numbers."""
    source = filepath.read_text(encoding="utf-8", errors="ignore")
    tree = ast.parse(source, filename=rel_path)

    functions = []
    imports = set()
    calls = []

    for node in ast.walk(tree):
        # 1. Track module imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module.split(".")[0])

        # 2. Track function definitions and their internal calls
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            qname = f"{rel_path}::{node.name}"
            end_line = getattr(node, "end_lineno", node.lineno)
            functions.append({
                "qname": qname,
                "name": node.name,
                "file": rel_path,
                "lineno": node.lineno,
                "loc": (end_line - node.lineno) + 1,
                "docstring": (ast.get_docstring(node) or "")[:200],
            })

            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    callee = None
                    if isinstance(child.func, ast.Name):
                        callee = child.func.id
                    elif isinstance(child.func, ast.Attribute):
                        callee = child.func.attr
                    if callee:
                        calls.append({
                            "caller_qname": qname,
                            "callee_name": callee,
                            "call_line": getattr(child, "lineno", node.lineno),
                        })

    return functions, list(imports), calls


def parse_git_log(repo_path: Path):
    """Extracts Engineers, Commits, ADR/Incident tags, and modified files from git."""
    if not repo_path.exists() or not (repo_path / ".git").exists():
        return []
    cmd = [
        "git", "-C", str(repo_path), "log",
        "--pretty=format:COMMIT|%h|%an|%ae|%ad|%s",
        "--date=iso",
        "--name-only",
    ]
    try:
        output = subprocess.check_output(cmd, text=True)
    except Exception:
        return []
    commits = []
    current = None

    for line in output.splitlines():
        if line.startswith("COMMIT|"):
            _, sha, name, email, date, msg = line.split("|", 5)
            # Extract ADR or Incident IDs like [ADR-042] or [INC-8410]
            tag_match = re.search(r"\[(ADR-\d+|INC-\d+)\]", msg)
            commits.append({
                "sha": sha,
                "author_name": name,
                "author_email": email,
                "timestamp": date,
                "message": msg,
                "decision_tag": tag_match.group(1) if tag_match else "GENERAL",
                "files": [],
            })
            current = commits[-1]
        elif line.strip() and current is not None:
            current["files"].append(line.strip())

    return commits


def ingest_repo_to_falkordb(repo_dir: str, tenant_id: str = "sample-fintech"):
    repo_path = Path(repo_dir).resolve()
    if not repo_path.exists() or not any(repo_path.glob("*.py")):
        # Check if the repo exists in the workspace root
        root_sample = (Path(__file__).resolve().parent.parent / "sample_fintech_repo").resolve()
        if root_sample.exists() and any(root_sample.glob("*.py")):
            repo_path = root_sample
        else:
            print(f"[*] Target directory '{repo_path}' is missing. Building sample repository...")
            try:
                from create_sample_repo import build_sample_repo, REPO_DIR
                build_sample_repo()
                repo_path = Path(REPO_DIR).resolve()
            except Exception as e:
                print(f"[-] Error auto-building sample repo: {e}")

    graph_name = f"repo:{tenant_id}"
    g = db.select_graph(graph_name)

    # Clean wipe for repeatable runs
    try:
        g.delete()
        g = db.select_graph(graph_name)
    except Exception:
        pass

    # Create indexes
    g.query("CREATE INDEX FOR (m:Module) ON (m.path)")
    g.query("CREATE INDEX FOR (fn:Function) ON (fn.qname)")
    g.query("CREATE INDEX FOR (fn:Function) ON (fn.name)")
    g.query("CREATE INDEX FOR (e:Engineer) ON (e.email)")
    g.query("CREATE INDEX FOR (c:Commit) ON (c.sha)")

    module_map = {}  # stem -> rel_path
    all_functions, all_imports, all_calls = [], [], []

    # Step 1: Walk Python files and run AST parser
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in sorted(files):
            if file.endswith(".py"):
                full_path = Path(root) / file
                rel_path = str(full_path.relative_to(repo_path)).replace("\\", "/")
                module_map[Path(file).stem] = rel_path

                funcs, imps, calls = parse_python_ast(full_path, rel_path)
                all_functions.extend(funcs)
                all_imports.extend([(rel_path, imp) for imp in imps])
                all_calls.extend(calls)

                g.query(
                    "MERGE (m:Module {path: $path}) SET m.name =$name",
                    {"path": rel_path, "name": file},
                )

    # Step 2: Create Function nodes and (:Module)-[:DEFINES]->(:Function)
    for fn in all_functions:
        g.query(
            """
            MATCH (m:Module {path: $file})
            MERGE (f:Function {qname: $qname})
            SET f.name = $name, f.file = $file, f.lineno =$lineno,
                f.loc = $loc, f.docstring =$docstring
            MERGE (m)-[:DEFINES]->(f)
            """,
            fn,
        )

    # Step 3: Create (:Module)-[:IMPORTS]->(:Module)
    for src_path, imp_stem in all_imports:
        if imp_stem in module_map and module_map[imp_stem] != src_path:
            g.query(
                """
                MATCH (a:Module {path: $src}), (b:Module {path:$dst})
                MERGE (a)-[:IMPORTS]->(b)
                """,
                {"src": src_path, "dst": module_map[imp_stem]},
            )

    # Step 4: Create (:Function)-[:CALLS {line}]->(:Function)
    edge_count = 0
    for call in all_calls:
        res = g.query(
            """
            MATCH (caller:Function {qname: $caller_qname})
            MATCH (callee:Function {name: $callee_name})
            WHERE caller.qname <> callee.qname
            MERGE (caller)-[r:CALLS]->(callee)
            SET r.line = $call_line
            RETURN count(r)
            """,
            call,
        )
        edge_count += res.result_set[0][0] if res.result_set else 0

    # Step 5: Create Git Provenance (:Engineer)-[:AUTHORED]->(:Commit)-[:MODIFIED]->(:Module)
    commits = parse_git_log(repo_path)
    for c in commits:
        g.query(
            """
            MERGE (e:Engineer {email: $email})
            SET e.name = $name
            MERGE (cm:Commit {sha: $sha})
            SET cm.message = $msg, cm.timestamp = $ts, cm.decision_tag =$tag
            MERGE (e)-[:AUTHORED]->(cm)
            """,
            {
                "email": c["author_email"],
                "name": c["author_name"],
                "sha": c["sha"],
                "msg": c["message"],
                "ts": c["timestamp"],
                "tag": c["decision_tag"],
            },
        )
        for mod_file in c["files"]:
            g.query(
                """
                MATCH (cm:Commit {sha: $sha}), (m:Module {path: $path}), (e:Engineer {email:$email})
                MERGE (cm)-[:MODIFIED]->(m)
                MERGE (e)-[rel:OWNERSHIP]->(m)
                ON CREATE SET rel.commits = 1
                ON MATCH SET rel.commits = rel.commits + 1
                """,
                {"sha": c["sha"], "path": mod_file, "email": c["author_email"]},
            )

    # Step 6: Seed 1 Prior Agent Session Memory on `decrypt_card_token` (Track 02)
    g.query(
        """
        MATCH (fn:Function {name: 'decrypt_card_token'})
        MERGE (s:Session {id: 'session-oct-15'})
        CREATE (f:Finding {
            id: 'mem-001',
            agent_role: 'SecurityTriageAgent',
            summary: 'decrypt_card_token throws 504 timeout under flash-sale load when gRPC timeout is 50ms.',
            remediation: 'Bump timeout to 120ms or enable connection pooling in vault_client.py.',
            created_at: '2026-10-15T21:00:00Z'
        })
        CREATE (s)-[:RECORDED]->(f)
        CREATE (f)-[:ATTACHED_TO]->(fn)
        """
    )

    print(f"\n[+] Ingested into FalkorDB Graph '{graph_name}':")
    print(f"    - {len(module_map)} Python Modules")
    print(f"    - {len(all_functions)} AST Functions & {edge_count} Cross-Function [:CALLS] Edges")
    print(f"    - {len(commits)} Real Git Commits with Engineer Ownership & ADR Tags")

    # =========================================================================
    # VERIFICATION: Run 3 Multi-Hop Queries Right Now to Prove It Works
    # =========================================================================
    print("\n--- TEST 1: Multi-Hop Blast Radius if `fetch_signing_key` fails (Track 01) ---")
    q1 = g.query(
        """
        MATCH p = (caller:Function)-[:CALLS*1..4]->(target:Function {name: 'fetch_signing_key'})
        RETURN caller.qname, length(p) AS hops, [n IN nodes(p) | n.name] AS explainable_path
        ORDER BY hops ASC
        """
    )
    for row in q1.result_set:
        print(f"  [{row[1]} hops] {row[0]}  --> Path: {' -> '.join(row[2])}")

    print("\n--- TEST 2: FalkorDB Native `algo.pageRank` on Function Call Graph (Track 01) ---")
    q2 = g.query(
        """
        CALL algo.pageRank('Function', 'CALLS') YIELD node, score
        RETURN node.qname, score ORDER BY score DESC LIMIT 5
        """
    )
    for row in q2.result_set:
        print(f"  Score {row[1]:.4f} | {row[0]}")

    print("\n--- TEST 3: Git Provenance + ADR Trace on `vault_client.py` (Track 03) ---")
    q3 = g.query(
        """
        MATCH (e:Engineer)-[:AUTHORED]->(c:Commit)-[:MODIFIED]->(m:Module {path: 'vault_client.py'})
        RETURN e.name, c.sha, c.decision_tag, c.message
        ORDER BY c.timestamp DESC
        """
    )
    for row in q3.result_set:
        print(f"  Author: {row[0]} | Commit: {row[1]} | Tag: {row[2]} | Why: {row[3]}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_dir = sys.argv[1]
    else:
        root_path = Path(__file__).resolve().parent.parent / "sample_fintech_repo"
        target_dir = "./sample_fintech_repo" if Path("./sample_fintech_repo").exists() else str(root_path)
    ingest_repo_to_falkordb(target_dir)