# backend/analyzer/__init__.py
"""
ProofStack Repository Analyzer & Symbol Resolution Package.
Full staged pipeline:
  1. Repository Discovery & AST Parsing
  2. Symbol Table Generation
  3. Scope & Import Resolution
  4. Call Site Resolution
  5. FalkorDB Graph Persistence
  6. Graph Validation & Coverage Reporting
"""

from pathlib import Path
from typing import Optional
from falkordb import FalkorDB

from backend.analyzer.models import (
    AnalysisResult,
    CallSite,
    ClassSymbol,
    FileRecord,
    FunctionSymbol,
    ImportRecord,
    ModuleRecord,
    RepoMetadata,
    ResolutionStatus,
    ResolutionSummary,
    ResolvedCall,
)
from backend.analyzer.ast_parser import parse_source_file
from backend.analyzer.symbol_resolver import SymbolResolver
from backend.analyzer.git_extractor import extract_git_metadata
from backend.analyzer.falkordb_writer import write_analysis_to_falkordb
from backend.analyzer.validator import validate_graph, print_validation_report

IGNORE_DIRS = {
    ".git", "venv", ".venv", "node_modules", "__pycache__", "dist",
    "build", ".next", ".cache", ".pytest_cache", ".ruff_cache", ".mypy_cache"
}


def analyze_repository(
    repo_dir: str,
    tenant_id: str = "sample-fintech",
    db: Optional[FalkorDB] = None,
    clean_wipe: bool = True,
    verbose: bool = True,
) -> AnalysisResult:
    """
    Executes the complete ProofStack staged analysis and symbol resolution pipeline.
    """
    repo_path = Path(repo_dir).resolve()
    if not repo_path.exists():
        raise FileNotFoundError(f"Target repository directory does not exist: {repo_path}")

    if verbose:
        print(f"[*] Starting ProofStack Analyzer for '{tenant_id}' at: {repo_path}")

    # Stage 1: Git Metadata & ADR Extraction
    meta, commits, adrs = extract_git_metadata(repo_path, tenant_id)
    if verbose:
        print(f"[+] Discovered {len(commits)} commits, {len(adrs)} ADR decisions, HEAD SHA: {meta.commit_sha[:8]}")

    # Stage 2: File Discovery & AST Parsing
    all_files = []
    all_modules = []
    all_classes = []
    all_functions = []
    all_imports = []
    all_call_sites = []
    # Discover and parse all source files
    walk_iter = repo_path.walk() if hasattr(repo_path, "walk") else _compat_walk(repo_path)
    for root, dirs, files in walk_iter:
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in sorted(files):
            full_path = Path(root) / f
            rel_path = str(full_path.relative_to(repo_path)).replace("\\", "/")

            file_rec, mod_rec, classes, functions, imports, call_sites = parse_source_file(
                full_path, rel_path, tenant_id
            )
            all_files.append(file_rec)
            if mod_rec:
                all_modules.append(mod_rec)
            all_classes.extend(classes)
            all_functions.extend(functions)
            all_imports.extend(imports)
            all_call_sites.extend(call_sites)

    # Attach commit_sha to all symbols
    for cls in all_classes:
        cls.commit_sha = meta.commit_sha
    for fn in all_functions:
        fn.commit_sha = meta.commit_sha

    if verbose:
        print(f"[+] Extracted AST from {len(all_files)} files: {len(all_classes)} classes, {len(all_functions)} functions, {len(all_call_sites)} raw call sites")

    # Stage 3 & 4: Staged Symbol Resolution
    resolver = SymbolResolver(
        files=all_files,
        modules=all_modules,
        classes=all_classes,
        functions=all_functions,
        imports=all_imports,
        call_sites=all_call_sites,
    )
    resolved_calls, summary = resolver.resolve_all_calls()

    if verbose:
        print(f"[+] Call Resolution Complete: {summary.resolved_internal} internal calls resolved ({summary.resolved_imported} imported, {summary.resolved_local} local), {summary.external_builtin + summary.external_library} external calls")
        print(f"[+] Resolution Coverage Rate: {summary.resolution_rate_pct}%")

    analysis = AnalysisResult(
        metadata=meta,
        files=all_files,
        modules=all_modules,
        classes=all_classes,
        functions=all_functions,
        imports=all_imports,
        call_sites=all_call_sites,
        resolved_calls=resolved_calls,
        commits=commits,
        adrs=adrs,
        summary=summary,
    )

    # Stage 5: FalkorDB Graph Persistence
    if db is not None:
        if verbose:
            print(f"[*] Persisting entities and resolved relationships to FalkorDB (repo:{tenant_id})...")
        write_analysis_to_falkordb(analysis, db, clean_wipe=clean_wipe)
        val_report = validate_graph(analysis, db)
        if verbose:
            print_validation_report(val_report)

    return analysis


def _compat_walk(path: Path):
    """Fallback directory walker for older Python versions without Path.walk."""
    import os
    for root, dirs, files in os.walk(str(path)):
        yield Path(root), dirs, files
