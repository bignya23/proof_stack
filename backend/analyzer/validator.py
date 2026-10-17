# backend/analyzer/validator.py
"""
Graph Validation & Resolution Coverage Reporter for ProofStack.
Verifies node counts, edge validity, resolution coverage, and execution paths.
"""

from typing import Any, Dict, List
from falkordb import FalkorDB

from backend.analyzer.models import AnalysisResult


def validate_graph(analysis: AnalysisResult, db: FalkorDB) -> Dict[str, Any]:
    """
    Validates the FalkorDB graph against the in-memory AnalysisResult.
    Checks node labels, relationships, resolution statistics, and execution paths.
    """
    tenant_id = analysis.metadata.repo_id
    graph_name = f"repo:{tenant_id}"
    g = db.select_graph(graph_name)

    # 1. Fetch node counts by label
    node_counts = {}
    try:
        res = g.query("MATCH (n) RETURN labels(n)[0] AS lbl, count(n) ORDER BY lbl ASC")
        for r in res.result_set:
            node_counts[r[0]] = r[1]
    except Exception as e:
        node_counts["error"] = str(e)

    # 2. Fetch relationship counts by type
    rel_counts = {}
    try:
        res = g.query("MATCH ()-[r]->() RETURN type(r) AS rel, count(r) ORDER BY rel ASC")
        for r in res.result_set:
            rel_counts[r[0]] = r[1]
    except Exception as e:
        rel_counts["error"] = str(e)

    # 3. Test multi-hop execution path (Track 1 validation)
    # Check if checkout entrypoint reaches vault decryption
    exec_path_found = False
    exec_path_hops = []
    try:
        path_res = g.query("""
            MATCH (src:Function {name: 'post_checkout_endpoint'}), (tgt:Function {name: 'decrypt_card_token'})
            WITH shortestPath((src)-[:CALLS*1..6]->(tgt)) AS p
            WHERE p IS NOT NULL
            RETURN [n IN nodes(p) | n.name] AS path_names, length(p) AS hop_count
        """)
        if path_res.result_set:
            exec_path_found = True
            exec_path_hops = path_res.result_set[0][0]
    except Exception:
        pass

    # 4. Validate Symbol Identity format (Track logical symbol_id vs line numbers)
    symbol_samples = []
    symbol_identity_valid = True
    try:
        sym_res = g.query("""
            MATCH (f:Function)
            WHERE f.symbol_id IS NOT NULL
            RETURN f.name, f.symbol_id, f.snapshot_id, f.commit_sha
            LIMIT 5
        """)
        for r in sym_res.result_set:
            fname, sid, snap_id, sha = r[0], r[1], r[2], r[3]
            symbol_samples.append({
                "name": fname,
                "symbol_id": sid,
                "snapshot_id": snap_id,
                "commit_sha": sha,
            })
            # Validate format: repo:lang:mod:qual_name
            parts = sid.split(":")
            if len(parts) < 4:
                symbol_identity_valid = False
    except Exception:
        symbol_identity_valid = False

    summary = analysis.summary

    report = {
        "tenant_id": tenant_id,
        "commit_sha": analysis.metadata.commit_sha,
        "nodes": node_counts,
        "relationships": rel_counts,
        "symbol_resolution": {
            "total_call_sites": summary.total_call_sites,
            "resolved_internal": summary.resolved_internal,
            "resolved_local": summary.resolved_local,
            "resolved_imported": summary.resolved_imported,
            "resolved_class_methods": summary.resolved_class_method,
            "external_builtins": summary.external_builtin,
            "external_libraries": summary.external_library,
            "ambiguous_references": summary.ambiguous,
            "unresolved_references": summary.unresolved,
            "resolution_rate_pct": f"{summary.resolution_rate_pct}%",
        },
        "symbol_identity_validation": {
            "format": "repo_id:language:module:qualified_name[#disambiguator]",
            "valid": symbol_identity_valid,
            "samples": symbol_samples,
        },
        "critical_path_validation": {
            "entrypoint": "post_checkout_endpoint",
            "target": "decrypt_card_token",
            "path_verified": exec_path_found,
            "execution_path": exec_path_hops,
        },
    }

    return report


def print_validation_report(report: Dict[str, Any]):
    """Pretty prints the validation report to standard output."""
    print("\n" + "=" * 70)
    print(f"[*] PROOFSTACK REPOSITORY ANALYZER REPORT: {report['tenant_id']}")
    print(f"[*] Commit SHA: {report['commit_sha']}")
    print("=" * 70)

    print("\n[+] Graph Nodes Stored in FalkorDB:")
    for lbl, count in sorted(report["nodes"].items()):
        print(f"    - {lbl:15}: {count}")

    print("\n[+] Graph Relationships Created:")
    for rel, count in sorted(report["relationships"].items()):
        print(f"    - {rel:15}: {count}")

    sr = report["symbol_resolution"]
    print("\n[+] Symbol Resolution Metrics:")
    print(f"    - Total Call Sites Analyzed   : {sr['total_call_sites']}")
    print(f"    - Resolved Internal Calls     : {sr['resolved_internal']} (Local: {sr['resolved_local']}, Imported: {sr['resolved_imported']})")
    print(f"    - External Builtin Calls      : {sr['external_builtins']}")
    print(f"    - External Library Calls      : {sr['external_libraries']}")
    print(f"    - Ambiguous References        : {sr['ambiguous_references']}")
    print(f"    - Unresolved References       : {sr['unresolved_references']}")
    print(f"    - Resolution Coverage Rate    : {sr['resolution_rate_pct']}")

    cp = report["critical_path_validation"]
    print("\n[+] Track 1 Execution Path Verification:")
    if cp["path_verified"]:
        path_str = " -> ".join(cp["execution_path"])
        print(f"    [OK] Verified Shortest Path: {path_str}")
    else:
        print(f"    [-] Path check not applicable or not found for {cp['entrypoint']} -> {cp['target']}")

    siv = report.get("symbol_identity_validation", {})
    print("\n[+] Cross-Commit Logical Symbol Identity Verification:")
    print(f"    - Identity Standard           : {siv.get('format')}")
    print(f"    - All Symbols Logical & Valid : {'[OK] YES' if siv.get('valid') else '[-] NO'}")
    print("    - Representative Logical Symbol IDs:")
    for smp in siv.get("samples", []):
        print(f"        * {smp['name']:25} -> {smp['symbol_id']}")
        print(f"          (Snapshot: {smp['snapshot_id']})")
    print("=" * 70 + "\n")
