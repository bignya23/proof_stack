# backend/analyzer/symbol_resolver.py
"""
Symbol Resolution Engine for ProofStack.
Connects AST call sites to their exact definitions through a staged resolution pipeline:
  Step 1: Parse source files (handled by ast_parser.py)
  Step 2: Build repository symbol table (files, modules, classes, functions, aliases)
  Step 3: Resolve imports and lexical scopes per file
  Step 4: Resolve function call sites (matching callers and callees via scopes, imports, and classes)
  Step 5: Output resolved relationships with confidence and traceability metadata
"""

from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from backend.analyzer.models import (
    CallSite,
    ClassSymbol,
    FileRecord,
    FunctionSymbol,
    ImportRecord,
    ModuleRecord,
    ResolutionStatus,
    ResolutionSummary,
    ResolvedCall,
)

# Standard Python builtins
PYTHON_BUILTINS = {
    "abs", "all", "any", "ascii", "bin", "bool", "breakpoint", "bytearray", "bytes",
    "callable", "chr", "classmethod", "compile", "complex", "delattr", "dict", "dir",
    "divmod", "enumerate", "eval", "exec", "filter", "float", "format", "frozenset",
    "getattr", "globals", "hasattr", "hash", "help", "hex", "id", "input", "int",
    "isinstance", "issubclass", "iter", "len", "list", "locals", "map", "max",
    "memoryview", "min", "next", "object", "oct", "open", "ord", "pow", "print",
    "property", "range", "repr", "reversed", "round", "set", "setattr", "slice",
    "sorted", "staticmethod", "str", "sum", "super", "tuple", "type", "vars", "zip",
    "__import__",
    # Standard exceptions
    "BaseException", "Exception", "ArithmeticError", "BufferError", "LookupError",
    "AssertionError", "AttributeError", "EOFError", "FloatingPointError", "GeneratorExit",
    "ImportError", "ModuleNotFoundError", "IndexError", "KeyError", "KeyboardInterrupt",
    "MemoryError", "NameError", "NotImplementedError", "OSError", "OverflowError",
    "RecursionError", "ReferenceError", "RuntimeError", "StopIteration", "StopAsyncIteration",
    "SyntaxError", "IndentationError", "TabError", "SystemError", "SystemExit", "TypeError",
    "UnboundLocalError", "UnicodeError", "ValueError", "ZeroDivisionError", "TimeoutError",
}

# Common standard library modules
PYTHON_STDLIB_MODULES = {
    "os", "sys", "re", "json", "time", "random", "math", "datetime", "pathlib",
    "subprocess", "typing", "collections", "itertools", "functools", "logging",
    "threading", "multiprocessing", "asyncio", "socket", "http", "urllib", "hashlib",
    "hmac", "uuid", "shutil", "glob", "unittest", "tempfile", "copy", "io", "csv",
    "sqlite3", "dataclasses", "enum", "contextlib", "inspect", "ast", "traceback",
}

# Standard JavaScript / Browser builtins
JS_BUILTINS = {
    "console", "require", "fetch", "setTimeout", "setInterval", "clearTimeout",
    "clearInterval", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURI",
    "decodeURI", "encodeURIComponent", "decodeURIComponent", "alert", "prompt",
    "confirm", "JSON", "Math", "Object", "Array", "String", "Number", "Boolean",
    "Date", "RegExp", "Error", "Map", "Set", "Promise", "Symbol",
}


class SymbolResolver:
    """
    Language-aware symbol resolver that maps call sites to exact graph entities.
    Tracks imports, aliases, scopes, and classes to guarantee no false edges.
    """

    def __init__(
        self,
        files: List[FileRecord],
        modules: List[ModuleRecord],
        classes: List[ClassSymbol],
        functions: List[FunctionSymbol],
        imports: List[ImportRecord],
        call_sites: List[CallSite],
    ):
        self.files = files
        self.modules = modules
        self.classes = classes
        self.functions = functions
        self.imports = imports
        self.call_sites = call_sites

        # Symbol tables
        self.modules_by_dotpath: Dict[str, ModuleRecord] = {}
        self.modules_by_path: Dict[str, ModuleRecord] = {}
        self.modules_by_stem: Dict[str, List[ModuleRecord]] = defaultdict(list)

        self.functions_by_qname: Dict[str, FunctionSymbol] = {}
        self.functions_by_file_and_name: Dict[Tuple[str, str], List[FunctionSymbol]] = defaultdict(list)
        self.functions_by_name: Dict[str, List[FunctionSymbol]] = defaultdict(list)

        self.classes_by_qname: Dict[str, ClassSymbol] = {}
        self.classes_by_file_and_name: Dict[Tuple[str, str], List[ClassSymbol]] = defaultdict(list)
        self.classes_by_name: Dict[str, List[ClassSymbol]] = defaultdict(list)

        # File import environments: file -> {imported_name -> (target_module, orig_name)}
        self.file_import_symbols: Dict[str, Dict[str, Tuple[str, str]]] = defaultdict(dict)
        # File imported modules: file -> {imported_module_alias -> target_module}
        self.file_import_modules: Dict[str, Dict[str, str]] = defaultdict(dict)
        # File star imports: file -> set of target_modules
        self.file_star_imports: Dict[str, Set[str]] = defaultdict(set)

        self._build_symbol_tables()
        self._build_import_environments()

    def _build_symbol_tables(self):
        """Stage 2: Index all files, modules, classes, functions, and methods."""
        for m in self.modules:
            self.modules_by_dotpath[m.name] = m
            self.modules_by_path[m.path] = m
            stem = Path(m.path).stem
            self.modules_by_stem[stem].append(m)

        for c in self.classes:
            self.classes_by_qname[c.qname] = c
            self.classes_by_file_and_name[(c.file, c.name)].append(c)
            self.classes_by_name[c.name].append(c)

        for f in self.functions:
            self.functions_by_qname[f.qname] = f
            self.functions_by_file_and_name[(f.file, f.name)].append(f)
            self.functions_by_name[f.name].append(f)

    def _resolve_relative_module(self, current_file: str, source_module: str, level: int) -> str:
        """Resolves relative import dotpaths (e.g. from . import vault_client)."""
        parts = Path(current_file).parts[:-1]  # parent directory parts
        if level > 1:
            strip_count = level - 1
            parts = parts[:-strip_count] if len(parts) >= strip_count else ()
        prefix = ".".join(parts)
        if prefix and source_module:
            return f"{prefix}.{source_module}"
        if prefix:
            return prefix
        return source_module

    def _build_import_environments(self):
        """Stage 3: Build per-file import namespaces and alias mappings."""
        for imp in self.imports:
            src_mod = imp.source_module
            if imp.is_relative and imp.level > 0:
                src_mod = self._resolve_relative_module(imp.file, src_mod, imp.level)

            if imp.imported_symbol:
                if imp.imported_symbol == "*":
                    self.file_star_imports[imp.file].add(src_mod)
                else:
                    visible_name = imp.alias or imp.imported_symbol
                    self.file_import_symbols[imp.file][visible_name] = (src_mod, imp.imported_symbol)
            else:
                # Whole module import (e.g. import services.vault_client as vc)
                visible_name = imp.alias or (src_mod.split(".")[-1] if src_mod else "")
                if visible_name:
                    self.file_import_modules[imp.file][visible_name] = src_mod

    def _find_module(self, mod_query: str) -> Optional[ModuleRecord]:
        """Finds a repository module by dotpath, path, or filename stem."""
        if mod_query in self.modules_by_dotpath:
            return self.modules_by_dotpath[mod_query]
        if mod_query in self.modules_by_path:
            return self.modules_by_path[mod_query]
        # Try matching stem
        stem = mod_query.split(".")[-1]
        candidates = self.modules_by_stem.get(stem, [])
        if len(candidates) == 1:
            return candidates[0]
        # Suffix matching
        for m in self.modules:
            if m.name.endswith(mod_query) or m.path.endswith(f"{mod_query}.py"):
                return m
        return None

    def resolve_call(self, call: CallSite) -> ResolvedCall:
        """
        Stage 4: Resolves a single CallSite to its target symbol with confidence and method.
        """
        caller_file = call.caller_file
        callee_name = call.callee_name
        callee_expr = call.callee_expr

        # 4.1 Built-in functions / methods
        if callee_name in PYTHON_BUILTINS or callee_name in JS_BUILTINS:
            return ResolvedCall(
                caller_qname=call.caller_qname,
                callee_qname=None,
                callee_name=callee_name,
                caller_file=caller_file,
                line=call.line,
                call_expr=call.call_expr,
                resolution_method="builtin",
                confidence=1.0,
                status=ResolutionStatus.EXTERNAL_BUILTIN,
                reason=f"Standard language built-in: {callee_name}",
            )

        # 4.2 Local Scope: inner functions defined in caller, or top-level functions in the same file
        # Check inner functions inside the caller
        for f in self.functions_by_file_and_name.get((caller_file, callee_name), []):
            if f.parent_fn_qname == call.caller_qname:
                return ResolvedCall(
                    caller_qname=call.caller_qname,
                    callee_qname=f.qname,
                    callee_name=callee_name,
                    caller_file=caller_file,
                    line=call.line,
                    call_expr=call.call_expr,
                    resolution_method="local_nested",
                    confidence=1.0,
                    status=ResolutionStatus.LOCAL,
                    reason=f"Enclosed nested function in {call.caller_qname}",
                )

        # Check standalone functions defined in the same file (not a method of another class)
        if not call.is_attribute:
            for f in self.functions_by_file_and_name.get((caller_file, callee_name), []):
                if not f.is_method:
                    return ResolvedCall(
                        caller_qname=call.caller_qname,
                        callee_qname=f.qname,
                        callee_name=callee_name,
                        caller_file=caller_file,
                        line=call.line,
                        call_expr=call.call_expr,
                        resolution_method="local_scope",
                        confidence=1.0,
                        status=ResolutionStatus.LOCAL,
                        reason=f"Top-level function in same file {caller_file}",
                    )

        # 4.3 Class Scope: self.method(...) or cls.method(...)
        if call.is_attribute and call.attribute_base in ("self", "cls"):
            caller_fn = self.functions_by_qname.get(call.caller_qname)
            if caller_fn and caller_fn.parent_class_qname:
                class_qname = caller_fn.parent_class_qname
                # Look for method in the same class
                for f in self.functions:
                    if f.parent_class_qname == class_qname and f.name == callee_name:
                        return ResolvedCall(
                            caller_qname=call.caller_qname,
                            callee_qname=f.qname,
                            callee_name=callee_name,
                            caller_file=caller_file,
                            line=call.line,
                            call_expr=call.call_expr,
                            resolution_method="class_method",
                            confidence=1.0,
                            status=ResolutionStatus.CLASS_METHOD,
                            reason=f"Member method of {class_qname}",
                        )
                # Check inherited base classes
                cls_obj = self.classes_by_qname.get(class_qname)
                if cls_obj:
                    for base_name in cls_obj.bases:
                        base_classes = self.classes_by_name.get(base_name.split(".")[-1], [])
                        for base_cls in base_classes:
                            for f in self.functions:
                                if f.parent_class_qname == base_cls.qname and f.name == callee_name:
                                    return ResolvedCall(
                                        caller_qname=call.caller_qname,
                                        callee_qname=f.qname,
                                        callee_name=callee_name,
                                        caller_file=caller_file,
                                        line=call.line,
                                        call_expr=call.call_expr,
                                        resolution_method="class_inherited",
                                        confidence=0.95,
                                        status=ResolutionStatus.CLASS_METHOD,
                                        reason=f"Inherited method from base class {base_cls.qname}",
                                    )

        # 4.4 Explicit Direct Import or Alias: from mod import func [as alias]
        file_syms = self.file_import_symbols.get(caller_file, {})
        if callee_name in file_syms:
            src_mod, orig_name = file_syms[callee_name]
            target_mod = self._find_module(src_mod)
            if target_mod:
                # Search target module for function
                matches = self.functions_by_file_and_name.get((target_mod.path, orig_name), [])
                if matches:
                    method_str = "import_alias" if callee_name != orig_name else "import_direct"
                    return ResolvedCall(
                        caller_qname=call.caller_qname,
                        callee_qname=matches[0].qname,
                        callee_name=orig_name,
                        caller_file=caller_file,
                        line=call.line,
                        call_expr=call.call_expr,
                        resolution_method=method_str,
                        confidence=1.0,
                        status=ResolutionStatus.RESOLVED,
                        reason=f"Imported from {target_mod.path} ({method_str})",
                    )
                # Search target module for class instantiation (e.g. UserSerializer(...))
                cls_matches = self.classes_by_file_and_name.get((target_mod.path, orig_name), [])
                if cls_matches:
                    method_str = "import_alias" if callee_name != orig_name else "import_direct"
                    return ResolvedCall(
                        caller_qname=call.caller_qname,
                        callee_qname=cls_matches[0].qname,
                        callee_name=orig_name,
                        caller_file=caller_file,
                        line=call.line,
                        call_expr=call.call_expr,
                        resolution_method=method_str,
                        confidence=1.0,
                        status=ResolutionStatus.RESOLVED,
                        reason=f"Class instantiated from {target_mod.path}",
                    )
            elif src_mod in PYTHON_STDLIB_MODULES:
                return ResolvedCall(
                    caller_qname=call.caller_qname,
                    callee_qname=None,
                    callee_name=orig_name,
                    caller_file=caller_file,
                    line=call.line,
                    call_expr=call.call_expr,
                    resolution_method="external_library",
                    confidence=1.0,
                    status=ResolutionStatus.EXTERNAL_LIBRARY,
                    reason=f"Standard library import: {src_mod}.{orig_name}",
                )
            else:
                return ResolvedCall(
                    caller_qname=call.caller_qname,
                    callee_qname=None,
                    callee_name=orig_name,
                    caller_file=caller_file,
                    line=call.line,
                    call_expr=call.call_expr,
                    resolution_method="external_library",
                    confidence=0.9,
                    status=ResolutionStatus.EXTERNAL_LIBRARY,
                    reason=f"External third-party package: {src_mod}.{orig_name}",
                )

        # 4.5 Qualified Module Call: mod.function(...)
        if call.is_attribute and call.attribute_base:
            file_mods = self.file_import_modules.get(caller_file, {})
            if call.attribute_base in file_mods:
                src_mod = file_mods[call.attribute_base]
                target_mod = self._find_module(src_mod)
                if target_mod:
                    matches = self.functions_by_file_and_name.get((target_mod.path, callee_name), [])
                    if matches:
                        return ResolvedCall(
                            caller_qname=call.caller_qname,
                            callee_qname=matches[0].qname,
                            callee_name=callee_name,
                            caller_file=caller_file,
                            line=call.line,
                            call_expr=call.call_expr,
                            resolution_method="qualified_module",
                            confidence=1.0,
                            status=ResolutionStatus.RESOLVED,
                            reason=f"Qualified module call via {src_mod}",
                        )
                elif src_mod in PYTHON_STDLIB_MODULES:
                    return ResolvedCall(
                        caller_qname=call.caller_qname,
                        callee_qname=None,
                        callee_name=callee_name,
                        caller_file=caller_file,
                        line=call.line,
                        call_expr=call.call_expr,
                        resolution_method="external_library",
                        confidence=1.0,
                        status=ResolutionStatus.EXTERNAL_LIBRARY,
                        reason=f"Standard library call: {src_mod}.{callee_name}",
                    )

        # 4.6 Star imports (from mod import *)
        for star_mod_name in self.file_star_imports.get(caller_file, set()):
            target_mod = self._find_module(star_mod_name)
            if target_mod:
                matches = self.functions_by_file_and_name.get((target_mod.path, callee_name), [])
                if matches:
                    return ResolvedCall(
                        caller_qname=call.caller_qname,
                        callee_qname=matches[0].qname,
                        callee_name=callee_name,
                        caller_file=caller_file,
                        line=call.line,
                        call_expr=call.call_expr,
                        resolution_method="star_import",
                        confidence=0.9,
                        status=ResolutionStatus.RESOLVED,
                        reason=f"Resolved via wildcard import from {star_mod_name}",
                    )

        # 4.7 Candidate Check: Do NOT fabricate edges without evidence!
        candidates = self.functions_by_name.get(callee_name, [])
        if not candidates:
            return ResolvedCall(
                caller_qname=call.caller_qname,
                callee_qname=None,
                callee_name=callee_name,
                caller_file=caller_file,
                line=call.line,
                call_expr=call.call_expr,
                resolution_method="unresolved",
                confidence=0.0,
                status=ResolutionStatus.UNRESOLVED,
                reason="Symbol not defined in repository or imports",
            )

        if len(candidates) == 1:
            # Single candidate in entire repository, but unimported
            # Mark as ambiguous or inferred with lower confidence
            return ResolvedCall(
                caller_qname=call.caller_qname,
                callee_qname=None, # Leave unlinked in graph to prevent false edges per prompt requirements
                callee_name=callee_name,
                caller_file=caller_file,
                line=call.line,
                call_expr=call.call_expr,
                resolution_method="unimported_reference",
                confidence=0.4,
                status=ResolutionStatus.AMBIGUOUS,
                reason=f"Unimported function match exists at {candidates[0].qname}",
            )

        # Multiple candidates exist across repository
        return ResolvedCall(
            caller_qname=call.caller_qname,
            callee_qname=None,
            callee_name=callee_name,
            caller_file=caller_file,
            line=call.line,
            call_expr=call.call_expr,
            resolution_method="ambiguous",
            confidence=0.0,
            status=ResolutionStatus.AMBIGUOUS,
            reason=f"Ambiguous reference: {len(candidates)} distinct functions named '{callee_name}' in repo",
        )

    def resolve_all_calls(self) -> Tuple[List[ResolvedCall], ResolutionSummary]:
        """Resolves all call sites and produces a full resolution summary."""
        resolved: List[ResolvedCall] = []
        summary = ResolutionSummary(total_call_sites=len(self.call_sites))

        for call in self.call_sites:
            res = self.resolve_call(call)
            resolved.append(res)

            if res.status == ResolutionStatus.RESOLVED:
                summary.resolved_internal += 1
                if res.resolution_method in ("import_direct", "import_alias", "star_import"):
                    summary.resolved_imported += 1
            elif res.status == ResolutionStatus.LOCAL:
                summary.resolved_internal += 1
                summary.resolved_local += 1
            elif res.status == ResolutionStatus.CLASS_METHOD:
                summary.resolved_internal += 1
                summary.resolved_class_method += 1
            elif res.status == ResolutionStatus.EXTERNAL_BUILTIN:
                summary.external_builtin += 1
            elif res.status == ResolutionStatus.EXTERNAL_LIBRARY:
                summary.external_library += 1
            elif res.status == ResolutionStatus.AMBIGUOUS:
                summary.ambiguous += 1
            elif res.status == ResolutionStatus.UNRESOLVED:
                summary.unresolved += 1

        total_known = (
            summary.resolved_internal + summary.external_builtin + summary.external_library
        )
        if summary.total_call_sites > 0:
            summary.resolution_rate_pct = round((total_known / summary.total_call_sites) * 100, 1)
        else:
            summary.resolution_rate_pct = 100.0

        return resolved, summary
