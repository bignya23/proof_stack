import os
import re
import subprocess
import sys
from pathlib import Path
from falkordb import FalkorDB
import tree_sitter_language_pack as tslp

db = FalkorDB(host="localhost", port=6379)
IGNORE_DIRS = {".git", "venv", ".venv", "node_modules", "__pycache__", "dist", "build", ".next", ".cache"}


def parse_file_with_treesitter(filepath: Path, rel_path: str):
    """
    Language-agnostic AST extractor powered by tree-sitter-language-pack.
    Extracts Classes, Class Methods, Functions, Inheritance/Bases,
    Decorators, Imports, and Function/Method Calls for 100+ languages.
    """
    lang = tslp.detect_language_from_path(str(filepath))
    if not lang:
        return [], [], [], [], None

    try:
        source = filepath.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return [], [], [], [], lang

    if not source.strip():
        return [], [], [], [], lang

    classes = []
    functions = []
    imports = set()
    calls = []

    # 1. Structure & Imports via Tree-sitter Language Pack
    try:
        res = tslp.process(source, config=tslp.ProcessConfig(language=lang))
    except Exception as e:
        print(f"[-] Tree-sitter process warning for {rel_path} ({lang}): {e}")
        return [], [], [], [], lang

    for imp in res.imports:
        for item in (imp.items or []):
            clean_item = item.split(".")[0].strip()
            if clean_item:
                imports.add(clean_item)
        if imp.source:
            match = re.search(r'''(?:from|import|require\(['"])\s*([a-zA-Z0-9_\.\-]+)''', imp.source)
            if match:
                imports.add(match.group(1).split(".")[0].strip())

    # 2. Extract call expressions with line numbers via Tree-sitter parser
    raw_calls = []
    try:
        parser = tslp.get_parser(lang)
        tree = parser.parse(source.encode("utf-8", errors="ignore"))

        def find_calls(node):
            if node.type in ("call", "call_expression"):
                fn_node = node.child_by_field_name("function")
                if fn_node:
                    raw_text = fn_node.text.decode("utf-8", errors="ignore")
                    callee_name = raw_text.split(".")[-1].split("::")[-1].strip()
                    if callee_name and len(callee_name) < 80:
                        call_line = node.start_point[0] + 1
                        raw_calls.append((call_line, callee_name))
            for ch in node.children:
                find_calls(ch)

        find_calls(tree.root_node)
    except Exception as e:
        print(f"[-] Tree-sitter call parsing notice for {rel_path}: {e}")

    def assign_calls(caller_qname, start_line, end_line):
        for line, callee in raw_calls:
            if start_line <= line <= end_line:
                calls.append({
                    "caller_qname": caller_qname,
                    "callee_name": callee,
                    "call_line": line,
                })

    # 3. Process Classes, Methods, and Functions from Tree-sitter Structure recursively
    def process_node(st, parent_class=None, parent_fn=None, parent_qname=None):
        if not st:
            return
        kname = getattr(st.kind, "name", str(st.kind))
        # Tree-sitter spans are 0-indexed; convert to 1-indexed to match IDEs & editors
        start_l = st.span.start_line + 1
        end_l = st.span.end_line + 1
        loc = max(1, (end_l - start_l) + 1)
        doc = (st.doc_comment or "")[:200]
        sig = st.signature or ""

        if kname == "Class" and st.name:
            c_qname = f"{parent_qname}::{st.name}" if parent_qname else f"{rel_path}::{st.name}"
            bases = []
            if sig:
                b_match = re.search(r'''\bclass\s+\w+\s*(?:\(([^)]+)\)|extends\s+([A-Za-z0-9_.]+))''', sig)
                if b_match:
                    raw_b = b_match.group(1) or b_match.group(2)
                    bases = [b.strip() for b in raw_b.split(",") if b.strip()]

            classes.append({
                "qname": c_qname,
                "name": st.name,
                "file": rel_path,
                "lineno": start_l,
                "loc": loc,
                "docstring": doc,
                "bases": bases,
                "signature": sig[:150],
                "decorators": st.decorators or [],
                "language": lang,
                "parent_class_qname": parent_qname if parent_class else None,
            })

            # Traverse child nodes (nested classes, methods, inner functions)
            for ch in (st.children or []):
                process_node(ch, parent_class=st.name, parent_fn=None, parent_qname=c_qname)

        elif kname in ("Function", "Method"):
            if st.name:
                fn_qname = f"{parent_qname}::{st.name}" if parent_qname else f"{rel_path}::{st.name}"
                is_method = bool(parent_class)
                functions.append({
                    "qname": fn_qname,
                    "name": st.name,
                    "file": rel_path,
                    "lineno": start_l,
                    "loc": loc,
                    "docstring": doc,
                    "signature": sig[:150],
                    "is_method": is_method,
                    "class_name": parent_class or "",
                    "parent_class_qname": parent_qname if parent_class else None,
                    "parent_fn_qname": parent_qname if (parent_fn and not parent_class) else None,
                    "decorators": st.decorators or [],
                    "language": lang,
                })
                assign_calls(fn_qname, start_l, end_l)

                # Recursively extract inner/nested functions or classes
                for ch in (st.children or []):
                    process_node(ch, parent_class=None, parent_fn=st.name, parent_qname=fn_qname)
            else:
                # Anonymous function or callback wrapper (e.g. arrow function in useEffect)
                # Pass parent context through to traverse nested named functions
                for ch in (st.children or []):
                    process_node(ch, parent_class=parent_class, parent_fn=parent_fn, parent_qname=parent_qname)
        else:
            # Other AST constructs (namespaces, blocks)
            for ch in (st.children or []):
                process_node(ch, parent_class=parent_class, parent_fn=parent_fn, parent_qname=parent_qname)

    for st in res.structure:
        process_node(st)

    return classes, functions, list(imports), calls, lang


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
            parts = line.split("|", 5)
            if len(parts) >= 6:
                _, sha, name, email, date, msg = parts
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
    if not repo_path.exists():
        # Check if the repo exists in the workspace root
        root_sample = (Path(__file__).resolve().parent.parent / "sample_fintech_repo").resolve()
        if root_sample.exists():
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

    # Create indexes for blazing fast FalkorDB cypher queries
    g.query("CREATE INDEX FOR (m:Module) ON (m.path)")
    g.query("CREATE INDEX FOR (c:Class) ON (c.name)")
    g.query("CREATE INDEX FOR (c:Class) ON (c.qname)")
    g.query("CREATE INDEX FOR (fn:Function) ON (fn.qname)")
    g.query("CREATE INDEX FOR (fn:Function) ON (fn.name)")
    g.query("CREATE INDEX FOR (e:Engineer) ON (e.email)")
    g.query("CREATE INDEX FOR (c:Commit) ON (c.sha)")

    module_map = {}  # stem -> rel_path
    all_classes, all_functions, all_imports, all_calls = [], [], [], []

    # Step 1: Walk files and run Tree-sitter Language Pack
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in sorted(files):
            full_path = Path(root) / file
            rel_path = str(full_path.relative_to(repo_path)).replace("\\", "/")

            detected_lang = tslp.detect_language_from_path(str(full_path))
            if detected_lang:
                module_map[Path(file).stem] = rel_path
                clss, funcs, imps, calls, _ = parse_file_with_treesitter(full_path, rel_path)
                all_classes.extend(clss)
                all_functions.extend(funcs)
                all_imports.extend([(rel_path, imp) for imp in imps])
                all_calls.extend(calls)

                g.query(
                    "MERGE (m:Module {path: $path}) SET m.name = $name, m.language = $lang",
                    {"path": rel_path, "name": file, "lang": detected_lang},
                )

    # Step 2: Create Class nodes and (:Module | :Class)-[:DEFINES]->(:Class)
    for cls in all_classes:
        g.query(
            """
            MERGE (c:Class {qname: $qname})
            SET c.name = $name, c.file = $file, c.lineno = $lineno,
                c.loc = $loc, c.docstring = $docstring,
                c.bases = $bases_str, c.signature = $signature,
                c.language = $language
            WITH c
            OPTIONAL MATCH (parent_c:Class {qname: $parent_class_qname})
            FOREACH (_ IN CASE WHEN parent_c IS NOT NULL THEN [1] ELSE [] END |
                MERGE (parent_c)-[:DEFINES]->(c)
            )
            WITH c
            OPTIONAL MATCH (m:Module {path: $file})
            FOREACH (_ IN CASE WHEN m IS NOT NULL AND $parent_class_qname IS NULL THEN [1] ELSE [] END |
                MERGE (m)-[:DEFINES]->(c)
            )
            """,
            {
                "file": cls["file"],
                "qname": cls["qname"],
                "name": cls["name"],
                "lineno": cls["lineno"],
                "loc": cls["loc"],
                "docstring": cls["docstring"],
                "bases_str": ", ".join(cls["bases"]),
                "signature": cls.get("signature", ""),
                "language": cls.get("language", ""),
                "parent_class_qname": cls.get("parent_class_qname"),
            },
        )

    # Step 3: Create Function nodes and (:Module | :Class | :Function)-[:DEFINES]->(:Function)
    for fn in all_functions:
        g.query(
            """
            MERGE (f:Function {qname: $qname})
            SET f.name = $name, f.file = $file, f.lineno = $lineno,
                f.loc = $loc, f.docstring = $docstring,
                f.signature = $signature, f.is_method = $is_method,
                f.class_name = $class_name, f.language = $language
            WITH f
            OPTIONAL MATCH (c:Class {qname: $parent_class_qname})
            FOREACH (_ IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END |
                MERGE (c)-[:DEFINES]->(f)
            )
            WITH f
            OPTIONAL MATCH (pfn:Function {qname: $parent_fn_qname})
            FOREACH (_ IN CASE WHEN pfn IS NOT NULL THEN [1] ELSE [] END |
                MERGE (pfn)-[:DEFINES]->(f)
            )
            WITH f
            OPTIONAL MATCH (m:Module {path: $file})
            FOREACH (_ IN CASE WHEN m IS NOT NULL AND $parent_class_qname IS NULL AND $parent_fn_qname IS NULL THEN [1] ELSE [] END |
                MERGE (m)-[:DEFINES]->(f)
            )
            """,
            {
                "qname": fn["qname"],
                "name": fn["name"],
                "file": fn["file"],
                "lineno": fn["lineno"],
                "loc": fn["loc"],
                "docstring": fn["docstring"],
                "signature": fn.get("signature", ""),
                "is_method": fn.get("is_method", False),
                "class_name": fn.get("class_name", ""),
                "parent_class_qname": fn.get("parent_class_qname"),
                "parent_fn_qname": fn.get("parent_fn_qname"),
                "language": fn.get("language", ""),
            },
        )

    # Step 4: Create Class Inheritance (:Class)-[:INHERITS]->(:Class)
    for cls in all_classes:
        for base in cls["bases"]:
            base_clean = base.split(".")[-1]
            g.query(
                """
                MATCH (sub:Class {qname: $sub_qname})
                MATCH (parent:Class {name: $base_name})
                WHERE sub.qname <> parent.qname
                MERGE (sub)-[:INHERITS]->(parent)
                """,
                {"sub_qname": cls["qname"], "base_name": base_clean},
            )

    # Step 5: Create (:Module)-[:IMPORTS]->(:Module)
    for src_path, imp_stem in all_imports:
        if imp_stem in module_map and module_map[imp_stem] != src_path:
            g.query(
                """
                MATCH (a:Module {path: $src}), (b:Module {path: $dst})
                MERGE (a)-[:IMPORTS]->(b)
                """,
                {"src": src_path, "dst": module_map[imp_stem]},
            )

    # Step 6: Create (:Function)-[:CALLS {line}]->(:Function | :Class)
    edge_count = 0
    for call in all_calls:
        # Function to Function call
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

        # Function to Class instantiation / invocation
        g.query(
            """
            MATCH (caller:Function {qname: $caller_qname})
            MATCH (cls:Class {name: $callee_name})
            MERGE (caller)-[r:CALLS]->(cls)
            SET r.line = $call_line, r.type = 'instantiation'
            """,
            call,
        )

    # Step 7: Create Git Provenance (:Engineer)-[:AUTHORED]->(:Commit)-[:MODIFIED]->(:Module)
    commits = parse_git_log(repo_path)
    for c in commits:
        g.query(
            """
            MERGE (e:Engineer {email: $email})
            SET e.name = $name
            MERGE (cm:Commit {sha: $sha})
            SET cm.message = $msg, cm.timestamp = $ts, cm.decision_tag = $tag
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
                MATCH (cm:Commit {sha: $sha}), (m:Module {path: $path}), (e:Engineer {email: $email})
                MERGE (cm)-[:MODIFIED]->(m)
                MERGE (e)-[rel:OWNERSHIP]->(m)
                ON CREATE SET rel.commits = 1
                ON MATCH SET rel.commits = rel.commits + 1
                """,
                {"sha": c["sha"], "path": mod_file, "email": c["author_email"]},
            )

    # Step 8: Seed 1 Prior Agent Session Memory on `decrypt_card_token` (Track 02)
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

    print(f"\n[+] Ingested via Tree-sitter into FalkorDB Graph '{graph_name}':")
    print(f"    - {len(module_map)} Source Modules")
    print(f"    - {len(all_classes)} Classes with Hierarchies & Bases")
    print(f"    - {len(all_functions)} Functions/Methods & {edge_count} Cross-Entity [:CALLS] Edges")
    print(f"    - {len(commits)} Real Git Commits with Engineer Ownership & ADR Tags")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_dir = sys.argv[1]
    else:
        root_path = Path(__file__).resolve().parent.parent / "sample_fintech_repo"
        target_dir = "./sample_fintech_repo" if Path("./sample_fintech_repo").exists() else str(root_path)
    tenant = sys.argv[2] if len(sys.argv) > 2 else "sample-fintech"
    ingest_repo_to_falkordb(target_dir, tenant_id=tenant)