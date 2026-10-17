# backend/analyzer/falkordb_writer.py
"""
FalkorDB Graph Writer for ProofStack.
Persists verified AST entities, resolved call relationships, and git provenance
into an isolated FalkorDB multigraph namespace (`repo:<tenant_id>`).
"""

import json
from typing import Any, Dict, List
from falkordb import FalkorDB

from backend.analyzer.models import (
    ADRRecord,
    AnalysisResult,
    ClassSymbol,
    CommitRecord,
    FileRecord,
    FunctionSymbol,
    ImportRecord,
    ModuleRecord,
    RepoMetadata,
    ResolutionStatus,
    ResolvedCall,
)


def write_analysis_to_falkordb(
    analysis: AnalysisResult,
    db: FalkorDB,
    clean_wipe: bool = True,
) -> Dict[str, Any]:
    """
    Writes the complete repository analysis to FalkorDB.
    Guarantees stable identity, idempotency, and traceable CALLS edges.
    """
    tenant_id = analysis.metadata.repo_id
    graph_name = f"repo:{tenant_id}"
    g = db.select_graph(graph_name)

    if clean_wipe:
        try:
            g.delete()
            g = db.select_graph(graph_name)
        except Exception:
            pass

    # 1. Create indexes for blazing-fast Cypher traversals
    index_queries = [
        "CREATE INDEX FOR (r:Repository) ON (r.repo_id)",
        "CREATE INDEX FOR (f:File) ON (f.path)",
        "CREATE INDEX FOR (m:Module) ON (m.path)",
        "CREATE INDEX FOR (m:Module) ON (m.name)",
        "CREATE INDEX FOR (c:Class) ON (c.qname)",
        "CREATE INDEX FOR (c:Class) ON (c.name)",
        "CREATE INDEX FOR (c:Class) ON (c.symbol_id)",
        "CREATE INDEX FOR (c:Class) ON (c.snapshot_id)",
        "CREATE INDEX FOR (fn:Function) ON (fn.qname)",
        "CREATE INDEX FOR (fn:Function) ON (fn.name)",
        "CREATE INDEX FOR (fn:Function) ON (fn.symbol_id)",
        "CREATE INDEX FOR (fn:Function) ON (fn.snapshot_id)",
        "CREATE INDEX FOR (cm:Commit) ON (cm.sha)",
        "CREATE INDEX FOR (e:Engineer) ON (e.email)",
        "CREATE INDEX FOR (adr:ADR) ON (adr.decision_id)",
    ]
    for idx_q in index_queries:
        try:
            g.query(idx_q)
        except Exception:
            pass

    # 2. Write Repository node
    meta = analysis.metadata
    g.query(
        """
        MERGE (r:Repository {repo_id: $repo_id})
        SET r.commit_sha = $sha,
            r.default_branch = $branch,
            r.root_dir = $root_dir,
            r.remote_url = $remote_url,
            r.analyzed_at = $analyzed_at,
            r.status = 'INDEXED'
        """,
        {
            "repo_id": meta.repo_id,
            "sha": meta.commit_sha,
            "branch": meta.default_branch,
            "root_dir": meta.root_dir,
            "remote_url": meta.remote_url,
            "analyzed_at": meta.analyzed_at,
        },
    )

    # 3. Write File & Module nodes, and (:Repository)-[:HAS_FILE]->(:File)-[:DEFINES]->(:Module)
    for f in analysis.files:
        g.query(
            """
            MATCH (r:Repository {repo_id: $repo_id})
            MERGE (file:File {path: $path})
            SET file.language = $language,
                file.content_hash = $content_hash,
                file.lines_count = $lines_count,
                file.size_bytes = $size_bytes,
                file.parse_status = $parse_status,
                file.error_message = $error_message
            MERGE (r)-[:HAS_FILE]->(file)
            """,
            {
                "repo_id": meta.repo_id,
                "path": f.path,
                "language": f.language,
                "content_hash": f.content_hash,
                "lines_count": f.lines_count,
                "size_bytes": f.size_bytes,
                "parse_status": f.parse_status.value,
                "error_message": f.error_message or "",
            },
        )

    for m in analysis.modules:
        g.query(
            """
            MATCH (file:File {path: $path})
            MERGE (m:Module {path: $path})
            SET m.name = $name,
                m.language = $language
            MERGE (file)-[:DEFINES]->(m)
            """,
            {
                "path": m.path,
                "name": m.name,
                "language": m.language,
            },
        )

    # 4. Write Class nodes and hierarchy
    for cls in analysis.classes:
        cls_commit_sha = cls.commit_sha or meta.commit_sha
        cls_snapshot_id = f"{cls.symbol_id}@{cls_commit_sha}" if cls_commit_sha else cls.symbol_id
        g.query(
            """
            MERGE (c:Class {qname: $qname})
            SET c.symbol_id = $symbol_id,
                c.snapshot_id = $snapshot_id,
                c.module = $module,
                c.name = $name,
                c.file = $file,
                c.lineno = $lineno,
                c.end_lineno = $end_lineno,
                c.col_offset = $col_offset,
                c.loc = $loc,
                c.commit_sha = $sha,
                c.docstring = $docstring,
                c.bases = $bases_str,
                c.signature = $signature,
                c.visibility = $visibility,
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
                "qname": cls.qname,
                "symbol_id": cls.symbol_id,
                "snapshot_id": cls_snapshot_id,
                "module": cls.module,
                "name": cls.name,
                "file": cls.file,
                "lineno": cls.lineno,
                "end_lineno": cls.end_lineno,
                "col_offset": getattr(cls, "col_offset", 0),
                "loc": cls.loc,
                "sha": cls_commit_sha,
                "docstring": cls.docstring,
                "bases_str": ", ".join(cls.bases),
                "signature": cls.signature,
                "visibility": cls.visibility,
                "language": cls.language,
                "parent_class_qname": cls.parent_class_qname,
            },
        )

    # 5. Write Function nodes and relationships
    for fn in analysis.functions:
        params_json = json.dumps(fn.params)
        fn_commit_sha = fn.commit_sha or meta.commit_sha
        fn_snapshot_id = f"{fn.symbol_id}@{fn_commit_sha}" if fn_commit_sha else fn.symbol_id
        g.query(
            """
            MERGE (f:Function {qname: $qname})
            SET f.symbol_id = $symbol_id,
                f.snapshot_id = $snapshot_id,
                f.module = $module,
                f.name = $name,
                f.file = $file,
                f.lineno = $lineno,
                f.end_lineno = $end_lineno,
                f.col_offset = $col_offset,
                f.loc = $loc,
                f.commit_sha = $sha,
                f.signature = $signature,
                f.params = $params_json,
                f.return_type = $return_type,
                f.visibility = $visibility,
                f.docstring = $docstring,
                f.is_method = $is_method,
                f.class_name = $class_name,
                f.language = $language
            WITH f
            OPTIONAL MATCH (c:Class {qname: $parent_class_qname})
            FOREACH (_ IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END |
                MERGE (c)-[:DEFINES]->(f)
                MERGE (c)-[:CONTAINS]->(f)
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
                "qname": fn.qname,
                "symbol_id": fn.symbol_id,
                "snapshot_id": fn_snapshot_id,
                "module": fn.module,
                "name": fn.name,
                "file": fn.file,
                "lineno": fn.lineno,
                "end_lineno": fn.end_lineno,
                "col_offset": getattr(fn, "col_offset", 0),
                "loc": fn.loc,
                "sha": fn_commit_sha,
                "signature": fn.signature,
                "params_json": params_json,
                "return_type": fn.return_type,
                "visibility": fn.visibility,
                "docstring": fn.docstring,
                "is_method": fn.is_method,
                "class_name": fn.class_name,
                "parent_class_qname": fn.parent_class_qname,
                "parent_fn_qname": fn.parent_fn_qname,
                "language": fn.language,
            },
        )

    # 6. Write Class Inheritance (:Class)-[:INHERITS]->(:Class)
    for cls in analysis.classes:
        for base in cls.bases:
            base_clean = base.split(".")[-1]
            g.query(
                """
                MATCH (sub:Class {qname: $sub_qname})
                MATCH (parent:Class {name: $base_name})
                WHERE sub.qname <> parent.qname
                MERGE (sub)-[:INHERITS]->(parent)
                """,
                {"sub_qname": cls.qname, "base_name": base_clean},
            )

    # 7. Write Module Imports (:Module)-[:IMPORTS]->(:Module)
    for imp in analysis.imports:
        # Match target module in repository
        src_mod = imp.source_module.split(".")[-1]
        g.query(
            """
            MATCH (src:Module {path: $file})
            MATCH (target:Module)
            WHERE (target.name = $src_mod OR target.path ENDS WITH ($src_mod + '.py'))
              AND src.path <> target.path
            MERGE (src)-[r:IMPORTS]->(target)
            SET r.symbol = $sym, r.alias = $alias, r.line = $line
            """,
            {
                "file": imp.file,
                "src_mod": src_mod,
                "sym": imp.imported_symbol or "*",
                "alias": imp.alias or "",
                "line": imp.line,
            },
        )

    # 8. Write Verified CALLS Edges (Traceable, Provenance-backed)
    # ONLY write edges for resolved internal functions (never fabricated!)
    calls_written = 0
    for res_call in analysis.resolved_calls:
        if res_call.callee_qname and res_call.status in (
            ResolutionStatus.RESOLVED,
            ResolutionStatus.LOCAL,
            ResolutionStatus.CLASS_METHOD,
        ):
            g.query(
                """
                MATCH (caller:Function {qname: $caller_qname})
                MATCH (callee)
                WHERE (callee:Function OR callee:Class)
                  AND callee.qname = $callee_qname
                  AND caller.qname <> callee.qname
                MERGE (caller)-[r:CALLS]->(callee)
                SET r.caller_line = $line,
                    r.line = $line,
                    r.call_expr = $call_expr,
                    r.resolution_method = $method,
                    r.confidence = $confidence,
                    r.status = $status,
                    r.target_qname = $callee_qname
                """,
                {
                    "caller_qname": res_call.caller_qname,
                    "callee_qname": res_call.callee_qname,
                    "line": res_call.line,
                    "call_expr": res_call.call_expr,
                    "method": res_call.resolution_method,
                    "confidence": res_call.confidence,
                    "status": res_call.status.value,
                },
            )
            calls_written += 1

    # 9. Write ADR Nodes
    for adr in analysis.adrs:
        g.query(
            """
            MERGE (a:ADR {decision_id: $decision_id})
            SET a.title = $title,
                a.commit_sha = $sha,
                a.status = $status
            """,
            {
                "decision_id": adr.decision_id,
                "title": adr.title,
                "sha": adr.commit_sha,
                "status": adr.status,
            },
        )

    # 10. Write Commits, Engineers, and Provenance Relationships
    for cm in analysis.commits:
        # Create Engineer node
        g.query(
            """
            MERGE (e:Engineer {email: $email})
            SET e.name = $name,
                e.login = $email
            """,
            {"email": cm.author_email, "name": cm.author_name},
        )

        # Create Commit node and (:Commit)-[:AUTHORED_BY]->(:Engineer)
        # Also maintain bidirectional (:Engineer)-[:AUTHORED]->(:Commit) for backward-compat
        g.query(
            """
            MERGE (c:Commit {sha: $sha})
            SET c.message = $message,
                c.timestamp = $timestamp,
                c.author_name = $name,
                c.author_email = $email,
                c.decision_tag = $tag
            WITH c
            MATCH (e:Engineer {email: $email})
            MERGE (c)-[:AUTHORED_BY]->(e)
            MERGE (e)-[:AUTHORED]->(c)
            """,
            {
                "sha": cm.sha,
                "message": cm.message,
                "timestamp": cm.timestamp,
                "name": cm.author_name,
                "email": cm.author_email,
                "tag": cm.decision_tag,
            },
        )

        # Connect (:Commit)-[:GOVERNED_BY]->(:ADR)
        if cm.decision_tag != "GENERAL":
            g.query(
                """
                MATCH (c:Commit {sha: $sha})
                MATCH (a:ADR {decision_id: $tag})
                MERGE (c)-[:GOVERNED_BY]->(a)
                """,
                {"sha": cm.sha, "tag": cm.decision_tag},
            )

        # Connect (:Commit)-[:CHANGED]->(:File), (:Commit)-[:MODIFIED]->(:Module), and (:Engineer)-[:OWNERSHIP]->(:Module)
        for cf in cm.files:
            g.query(
                """
                MATCH (c:Commit {sha: $sha})
                MATCH (file:File)
                WHERE file.path = $cf OR file.path ENDS WITH ('/' + $cf)
                MERGE (c)-[:CHANGED]->(file)
                WITH c, file
                OPTIONAL MATCH (file)-[:DEFINES]->(m:Module)
                FOREACH (_ IN CASE WHEN m IS NOT NULL THEN [1] ELSE [] END |
                    MERGE (c)-[:MODIFIED]->(m)
                )
                WITH c, file
                OPTIONAL MATCH (file)-[:DEFINES]->(m2:Module), (e:Engineer {email: $email})
                FOREACH (_ IN CASE WHEN m2 IS NOT NULL AND e IS NOT NULL THEN [1] ELSE [] END |
                    MERGE (e)-[rel:OWNERSHIP]->(m2)
                    ON CREATE SET rel.commits = 1
                    ON MATCH SET rel.commits = rel.commits + 1
                )
                """,
                {"sha": cm.sha, "cf": cf, "email": cm.author_email},
            )

    # 11. Seed Track 02 Prior Agent Session Memory (for sample-fintech demo)
    if tenant_id == "sample-fintech":
        try:
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
        except Exception:
            pass

    return {
        "tenant_id": tenant_id,
        "graph_name": graph_name,
        "calls_written": calls_written,
        "total_files": len(analysis.files),
        "total_classes": len(analysis.classes),
        "total_functions": len(analysis.functions),
        "total_commits": len(analysis.commits),
        "total_adrs": len(analysis.adrs),
    }
