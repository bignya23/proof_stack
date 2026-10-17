# backend/analyzer/models.py
"""
Data models for ProofStack Repository Analyzer & Symbol Resolution Pipeline.
Defines entity representations for files, modules, classes, functions,
call sites, resolved relationships, and git provenance metadata.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set


class ParseStatus(str, Enum):
    PARSED = "PARSED"
    SYNTAX_ERROR = "SYNTAX_ERROR"
    UNSUPPORTED = "UNSUPPORTED"
    EMPTY = "EMPTY"


class ResolutionStatus(str, Enum):
    RESOLVED = "resolved"
    LOCAL = "local"
    IMPORTED = "imported"
    CLASS_METHOD = "class_method"
    EXTERNAL_BUILTIN = "external_builtin"
    EXTERNAL_LIBRARY = "external_library"
    AMBIGUOUS = "ambiguous"
    UNRESOLVED = "unresolved"
    DYNAMIC = "dynamic"


@dataclass
class RepoMetadata:
    repo_id: str
    root_dir: str
    default_branch: str = "main"
    commit_sha: str = "HEAD"
    remote_url: str = ""
    analyzed_at: str = ""


@dataclass
class FileRecord:
    path: str                       # Repo-relative path (e.g. services/payment_processor.py)
    language: str                   # python, javascript, etc.
    content_hash: str               # SHA-256 of source content
    lines_count: int
    size_bytes: int
    parse_status: ParseStatus = ParseStatus.PARSED
    error_message: Optional[str] = None


@dataclass
class ModuleRecord:
    name: str                       # Dot-path module name (e.g. services.payment_processor or payment_processor)
    path: str                       # File path
    language: str


def build_symbol_id(
    repo_id: str,
    language: str,
    module: str,
    qual_name: str,
    disambiguator: int = 0,
) -> str:
    """
    Constructs a logical symbol identity:
      {repo_id}:{language}:{module}:{qualified_name}
    With '#{disambiguator}' suffix if disambiguator > 0 for duplicate/overloaded symbols.
    Independent of line numbers, preserving identity across commits.
    """
    base = f"{repo_id}:{language}:{module}:{qual_name}"
    if disambiguator > 0:
        return f"{base}#{disambiguator}"
    return base


@dataclass
class ClassSymbol:
    symbol_id: str                  # Logical ID: {repo_id}:{language}:{module}:{qual_name}[#{disambiguator}]
    qname: str                      # File-rooted QName: services/payment_processor.py::PaymentProcessor
    name: str                       # Short name: PaymentProcessor
    module: str                     # Module name: services.payment_processor
    file: str                       # File path
    lineno: int                     # 1-indexed start line (source location)
    end_lineno: int                 # 1-indexed end line (source location)
    loc: int                        # Lines of code
    col_offset: int = 0             # Column offset
    docstring: str = ""
    bases: List[str] = field(default_factory=list)
    signature: str = ""
    visibility: str = "public"      # public, protected, private
    parent_class_qname: Optional[str] = None
    language: str = "python"
    disambiguator: int = 0
    commit_sha: str = ""


@dataclass
class FunctionSymbol:
    symbol_id: str                  # Logical ID: {repo_id}:{language}:{module}:{qual_name}[#{disambiguator}]
    qname: str                      # File-rooted QName: services/payment_processor.py::settle_payment
    name: str                       # Short name: settle_payment
    module: str                     # Module name: services.payment_processor
    file: str                       # File path
    lineno: int                     # 1-indexed start line (source location)
    end_lineno: int                 # 1-indexed end line (source location)
    loc: int                        # Lines of code
    col_offset: int = 0             # Column offset
    signature: str = ""             # Full signature def settle_payment(...) -> dict:
    params: List[Dict[str, Any]] = field(default_factory=list) # [{name, type, default}]
    return_type: str = ""
    visibility: str = "public"      # public, protected, private
    docstring: str = ""
    is_method: bool = False
    class_name: str = ""
    parent_class_qname: Optional[str] = None
    parent_fn_qname: Optional[str] = None
    decorators: List[str] = field(default_factory=list)
    language: str = "python"
    disambiguator: int = 0
    commit_sha: str = ""


@dataclass
class ImportRecord:
    file: str                       # File making the import
    source_module: str              # e.g. services.vault_client or os
    imported_symbol: Optional[str]  # e.g. decrypt_card_token (None for import services.vault_client)
    alias: Optional[str]            # e.g. decrypt (if as decrypt)
    is_relative: bool = False
    level: int = 0                  # 1 for ., 2 for ..
    line: int = 1


@dataclass
class CallSite:
    caller_qname: str               # Qualified name of the caller function
    caller_file: str                # File path where call occurs
    line: int                       # 1-indexed line number of call expression
    col_offset: int                 # Column offset
    call_expr: str                  # Textual representation (e.g. decrypt_card_token(token))
    callee_name: str                # Identifier being invoked (e.g. decrypt_card_token)
    callee_expr: str                # Full callee expression (e.g. vault.decrypt_card_token)
    args_count: int = 0
    kwargs_names: List[str] = field(default_factory=list)
    is_attribute: bool = False      # True if obj.method(...)
    attribute_base: Optional[str] = None # 'self', 'cls', 'vault', etc.


@dataclass
class ResolvedCall:
    caller_qname: str
    callee_qname: Optional[str]     # Target symbol qualified name if resolved
    callee_name: str
    caller_file: str
    line: int
    call_expr: str
    resolution_method: str          # import_direct, import_alias, local_scope, class_method, qualified_module, builtin, external_library, ambiguous, unresolved
    confidence: float               # 0.0 to 1.0
    status: ResolutionStatus
    reason: str = ""


@dataclass
class CommitRecord:
    sha: str
    author_name: str
    author_email: str
    timestamp: str
    message: str
    decision_tag: str = "GENERAL"   # ADR-xxx, INC-xxx, FIX-xxx
    files: List[str] = field(default_factory=list)


@dataclass
class ADRRecord:
    decision_id: str                # ADR-042, ADR-019, etc.
    title: str                      # Decision title
    commit_sha: str
    source_file: str = ""
    status: str = "ACTIVE"


@dataclass
class ResolutionSummary:
    total_call_sites: int = 0
    resolved_internal: int = 0
    resolved_local: int = 0
    resolved_imported: int = 0
    resolved_class_method: int = 0
    external_builtin: int = 0
    external_library: int = 0
    ambiguous: int = 0
    unresolved: int = 0
    resolution_rate_pct: float = 0.0


@dataclass
class AnalysisResult:
    metadata: RepoMetadata
    files: List[FileRecord] = field(default_factory=list)
    modules: List[ModuleRecord] = field(default_factory=list)
    classes: List[ClassSymbol] = field(default_factory=list)
    functions: List[FunctionSymbol] = field(default_factory=list)
    imports: List[ImportRecord] = field(default_factory=list)
    call_sites: List[CallSite] = field(default_factory=list)
    resolved_calls: List[ResolvedCall] = field(default_factory=list)
    commits: List[CommitRecord] = field(default_factory=list)
    adrs: List[ADRRecord] = field(default_factory=list)
    summary: ResolutionSummary = field(default_factory=ResolutionSummary)
