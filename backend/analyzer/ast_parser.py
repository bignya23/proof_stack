# backend/analyzer/ast_parser.py
"""
High-fidelity AST Parser for ProofStack.
- Python: Uses native `ast` module for rich type annotations, parameter schemas,
  docstrings, exact imports/aliases, and scoped call-site extraction.
- Multi-language: Uses `tree-sitter-language-pack` for JavaScript, TypeScript,
  Go, Java, Rust, and 100+ other languages.
"""

import ast
import hashlib
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from collections import defaultdict
import tree_sitter_language_pack as tslp

from backend.analyzer.models import (
    CallSite,
    ClassSymbol,
    FileRecord,
    FunctionSymbol,
    ImportRecord,
    ModuleRecord,
    ParseStatus,
    build_symbol_id,
)


def compute_content_hash(content: str) -> str:
    """Computes SHA-256 hash of source code for versioned identity."""
    return hashlib.sha256(content.encode("utf-8", errors="ignore")).hexdigest()


def detect_visibility(name: str) -> str:
    """Determines visibility from naming conventions (Python / JS)."""
    if name.startswith("__") and not name.endswith("__"):
        return "private"
    if name.startswith("_") and not name.endswith("_"):
        return "protected"
    return "public"


# ============================================================================
# 1. PYTHON NATIVE AST PARSER
# ============================================================================

class PythonAstVisitor(ast.NodeVisitor):
    """
    Traverses Python AST with full lexical scope tracking.
    Extracts Classes, Functions/Methods, Nested Entities, Imports, and Call Sites.
    """

    def __init__(self, rel_path: str, repo_id: str, source_lines: List[str]):
        self.rel_path = rel_path
        self.repo_id = repo_id
        self.source_lines = source_lines

        # Compute dot-module name for logical symbol identity
        clean_mod = rel_path.replace("\\", "/").rstrip(".py")
        if clean_mod.endswith("/__init__"):
            clean_mod = clean_mod[:-9]
        self.mod_name = clean_mod.replace("/", ".")
        self.symbol_counts: Dict[str, int] = defaultdict(int)

        self.classes: List[ClassSymbol] = []
        self.functions: List[FunctionSymbol] = []
        self.imports: List[ImportRecord] = []
        self.call_sites: List[CallSite] = []

        # Scope tracking stacks
        self._class_stack: List[Tuple[str, str]] = []     # [(class_name, class_qname)]
        self._fn_stack: List[Tuple[str, str]] = []        # [(fn_name, fn_qname)]

    def _get_current_caller(self) -> Tuple[Optional[str], Optional[str]]:
        """Returns (caller_name, caller_qname) from the top of the function stack."""
        if self._fn_stack:
            return self._fn_stack[-1]
        return None, None

    def _get_current_class(self) -> Tuple[Optional[str], Optional[str]]:
        """Returns (class_name, class_qname) from the top of the class stack."""
        if self._class_stack:
            return self._class_stack[-1]
        return None, None

    def _format_source_line(self, lineno: int) -> str:
        if 1 <= lineno <= len(self.source_lines):
            return self.source_lines[lineno - 1].strip()
        return ""

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            self.imports.append(ImportRecord(
                file=self.rel_path,
                source_module=alias.name,
                imported_symbol=None,
                alias=alias.asname,
                is_relative=False,
                level=0,
                line=node.lineno,
            ))
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        module = node.module or ""
        is_rel = node.level > 0
        for alias in node.names:
            self.imports.append(ImportRecord(
                file=self.rel_path,
                source_module=module,
                imported_symbol=alias.name,
                alias=alias.asname,
                is_relative=is_rel,
                level=node.level,
                line=node.lineno,
            ))
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        parent_class, parent_class_qname = self._get_current_class()
        c_qname = f"{parent_class_qname}::{node.name}" if parent_class_qname else f"{self.rel_path}::{node.name}"

        # Resolve base classes
        bases = []
        for b in node.bases:
            if isinstance(b, ast.Name):
                bases.append(b.id)
            elif isinstance(b, ast.Attribute):
                bases.append(f"{ast.unparse(b.value)}.{b.attr}")
            else:
                try:
                    bases.append(ast.unparse(b))
                except Exception:
                    pass

        start_l = node.lineno
        end_l = getattr(node, "end_lineno", start_l) or start_l
        loc = max(1, (end_l - start_l) + 1)
        doc = ast.get_docstring(node) or ""
        sig = f"class {node.name}({', '.join(bases)}):" if bases else f"class {node.name}:"

        class_hierarchy = [c[0] for c in self._class_stack] + [node.name]
        qual_name = ".".join(class_hierarchy)
        disambiguator = self.symbol_counts[qual_name]
        self.symbol_counts[qual_name] += 1
        symbol_id = build_symbol_id(self.repo_id, "python", self.mod_name, qual_name, disambiguator)

        cls_symbol = ClassSymbol(
            symbol_id=symbol_id,
            qname=c_qname,
            name=node.name,
            module=self.mod_name,
            file=self.rel_path,
            lineno=start_l,
            end_lineno=end_l,
            loc=loc,
            col_offset=getattr(node, "col_offset", 0),
            docstring=doc[:300],
            bases=bases,
            signature=sig,
            visibility=detect_visibility(node.name),
            parent_class_qname=parent_class_qname,
            language="python",
            disambiguator=disambiguator,
        )
        self.classes.append(cls_symbol)

        # Push to class stack and visit children
        self._class_stack.append((node.name, c_qname))
        self.generic_visit(node)
        self._class_stack.pop()

    def _process_function(self, node: Any, is_async: bool = False):
        curr_class, curr_class_qname = self._get_current_class()
        curr_fn, curr_fn_qname = self._get_current_caller()

        if curr_class_qname:
            fn_qname = f"{curr_class_qname}::{node.name}"
            is_method = True
        elif curr_fn_qname:
            fn_qname = f"{curr_fn_qname}::{node.name}"
            is_method = False
        else:
            fn_qname = f"{self.rel_path}::{node.name}"
            is_method = False

        start_l = node.lineno
        end_l = getattr(node, "end_lineno", start_l) or start_l
        loc = max(1, (end_l - start_l) + 1)
        doc = ast.get_docstring(node) or ""

        # Extract parameters with type annotations & default values
        params = []
        pos_args = node.args.args
        defaults = [None] * (len(pos_args) - len(node.args.defaults)) + list(node.args.defaults)

        for arg, default in zip(pos_args, defaults):
            p_type = ""
            if arg.annotation:
                try:
                    p_type = ast.unparse(arg.annotation)
                except Exception:
                    p_type = ""
            def_val = ""
            if default:
                try:
                    def_val = ast.unparse(default)
                except Exception:
                    def_val = ""
            params.append({
                "name": arg.arg,
                "type": p_type,
                "default": def_val,
            })

        # Return type annotation
        return_type = ""
        if node.returns:
            try:
                return_type = ast.unparse(node.returns)
            except Exception:
                return_type = ""

        # Decorators
        decorators = []
        for dec in node.decorator_list:
            try:
                decorators.append(ast.unparse(dec))
            except Exception:
                pass

        # Signature string
        param_strs = []
        for p in params:
            s = p["name"]
            if p["type"]:
                s += f": {p['type']}"
            if p["default"]:
                s += f" = {p['default']}"
            param_strs.append(s)
        prefix = "async def" if is_async else "def"
        sig = f"{prefix} {node.name}({', '.join(param_strs)})"
        if return_type:
            sig += f" -> {return_type}"
        sig += ":"

        if self._class_stack:
            class_hierarchy = [c[0] for c in self._class_stack]
            qual_name = f"{'.'.join(class_hierarchy)}.{node.name}"
        elif self._fn_stack:
            fn_hierarchy = [f[0] for f in self._fn_stack]
            qual_name = f"{'.'.join(fn_hierarchy)}.{node.name}"
        else:
            qual_name = node.name

        disambiguator = self.symbol_counts[qual_name]
        self.symbol_counts[qual_name] += 1
        symbol_id = build_symbol_id(self.repo_id, "python", self.mod_name, qual_name, disambiguator)

        fn_symbol = FunctionSymbol(
            symbol_id=symbol_id,
            qname=fn_qname,
            name=node.name,
            module=self.mod_name,
            file=self.rel_path,
            lineno=start_l,
            end_lineno=end_l,
            loc=loc,
            col_offset=getattr(node, "col_offset", 0),
            signature=sig[:250],
            params=params,
            return_type=return_type,
            visibility=detect_visibility(node.name),
            docstring=doc[:300],
            is_method=is_method,
            class_name=curr_class or "",
            parent_class_qname=curr_class_qname,
            parent_fn_qname=curr_fn_qname,
            decorators=decorators,
            language="python",
            disambiguator=disambiguator,
        )
        self.functions.append(fn_symbol)

        # Push to function stack, visit body for calls/nested entities, then pop
        self._fn_stack.append((node.name, fn_qname))
        for item in node.body:
            self.visit(item)
        self._fn_stack.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self._process_function(node, is_async=False)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self._process_function(node, is_async=True)

    def visit_Call(self, node: ast.Call):
        caller_name, caller_qname = self._get_current_caller()
        if not caller_qname:
            # Module-level call (outside any function definition)
            caller_qname = f"{self.rel_path}::<module>"

        callee_name = ""
        callee_expr = ""
        is_attr = False
        attr_base = None

        if isinstance(node.func, ast.Name):
            callee_name = node.func.id
            callee_expr = node.func.id
        elif isinstance(node.func, ast.Attribute):
            callee_name = node.func.attr
            is_attr = True
            try:
                attr_base = ast.unparse(node.func.value)
                callee_expr = f"{attr_base}.{node.func.attr}"
            except Exception:
                callee_expr = node.func.attr
        else:
            try:
                callee_expr = ast.unparse(node.func)
                callee_name = callee_expr.split(".")[-1]
            except Exception:
                callee_name = "dynamic_call"
                callee_expr = "dynamic_call"

        # Text representation of call
        try:
            call_expr_text = ast.unparse(node)
        except Exception:
            call_expr_text = self._format_source_line(node.lineno)

        kwargs_names = [kw.arg for kw in node.keywords if kw.arg]

        self.call_sites.append(CallSite(
            caller_qname=caller_qname,
            caller_file=self.rel_path,
            line=node.lineno,
            col_offset=getattr(node, "col_offset", 0),
            call_expr=call_expr_text[:120],
            callee_name=callee_name,
            callee_expr=callee_expr[:100],
            args_count=len(node.args),
            kwargs_names=kwargs_names,
            is_attribute=is_attr,
            attribute_base=attr_base,
        ))

        self.generic_visit(node)


def parse_python_file(
    file_path: Path, rel_path: str, repo_id: str
) -> Tuple[FileRecord, Optional[ModuleRecord], List[ClassSymbol], List[FunctionSymbol], List[ImportRecord], List[CallSite]]:
    """Parses a Python file using the native ast module."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        rec = FileRecord(
            path=rel_path,
            language="python",
            content_hash="",
            lines_count=0,
            size_bytes=0,
            parse_status=ParseStatus.UNSUPPORTED,
            error_message=str(e),
        )
        return rec, None, [], [], [], []

    content_hash = compute_content_hash(content)
    lines = content.splitlines()
    size_bytes = file_path.stat().st_size if file_path.exists() else len(content.encode("utf-8"))

    if not content.strip():
        rec = FileRecord(
            path=rel_path,
            language="python",
            content_hash=content_hash,
            lines_count=len(lines),
            size_bytes=size_bytes,
            parse_status=ParseStatus.EMPTY,
        )
        return rec, None, [], [], [], []

    try:
        tree = ast.parse(content, filename=str(file_path))
    except SyntaxError as e:
        rec = FileRecord(
            path=rel_path,
            language="python",
            content_hash=content_hash,
            lines_count=len(lines),
            size_bytes=size_bytes,
            parse_status=ParseStatus.SYNTAX_ERROR,
            error_message=f"SyntaxError at line {e.lineno}: {e.msg}",
        )
        return rec, None, [], [], [], []

    visitor = PythonAstVisitor(rel_path=rel_path, repo_id=repo_id, source_lines=lines)
    visitor.visit(tree)

    # Compute dot-module name (e.g. services/payment_processor.py -> services.payment_processor)
    clean_mod = rel_path.replace("\\", "/").rstrip(".py")
    if clean_mod.endswith("/__init__"):
        clean_mod = clean_mod[:-9]
    mod_name = clean_mod.replace("/", ".")

    file_rec = FileRecord(
        path=rel_path,
        language="python",
        content_hash=content_hash,
        lines_count=len(lines),
        size_bytes=size_bytes,
        parse_status=ParseStatus.PARSED,
    )
    mod_rec = ModuleRecord(name=mod_name, path=rel_path, language="python")

    return file_rec, mod_rec, visitor.classes, visitor.functions, visitor.imports, visitor.call_sites


# ============================================================================
# 2. MULTI-LANGUAGE TREE-SITTER AST PARSER
# ============================================================================

def parse_multilang_file(
    file_path: Path, rel_path: str, repo_id: str, lang: str
) -> Tuple[FileRecord, Optional[ModuleRecord], List[ClassSymbol], List[FunctionSymbol], List[ImportRecord], List[CallSite]]:
    """Language-agnostic AST extractor powered by tree-sitter-language-pack."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        rec = FileRecord(
            path=rel_path,
            language=lang,
            content_hash="",
            lines_count=0,
            size_bytes=0,
            parse_status=ParseStatus.UNSUPPORTED,
            error_message=str(e),
        )
        return rec, None, [], [], [], []

    content_hash = compute_content_hash(content)
    lines = content.splitlines()
    size_bytes = file_path.stat().st_size if file_path.exists() else len(content.encode("utf-8"))

    if not content.strip():
        rec = FileRecord(
            path=rel_path,
            language=lang,
            content_hash=content_hash,
            lines_count=len(lines),
            size_bytes=size_bytes,
            parse_status=ParseStatus.EMPTY,
        )
        return rec, None, [], [], [], []

    classes: List[ClassSymbol] = []
    functions: List[FunctionSymbol] = []
    imports: List[ImportRecord] = []
    call_sites: List[CallSite] = []
    mod_name = rel_path.replace("\\", "/").rsplit(".", 1)[0].replace("/", ".")
    symbol_counts: Dict[str, int] = defaultdict(int)

    try:
        res = tslp.process(content, config=tslp.ProcessConfig(language=lang))
    except Exception as e:
        rec = FileRecord(
            path=rel_path,
            language=lang,
            content_hash=content_hash,
            lines_count=len(lines),
            size_bytes=size_bytes,
            parse_status=ParseStatus.SYNTAX_ERROR,
            error_message=str(e),
        )
        return rec, None, [], [], [], []

    # 1. Imports from Tree-sitter
    for imp in res.imports:
        for item in (imp.items or []):
            imports.append(ImportRecord(
                file=rel_path,
                source_module=imp.source or "",
                imported_symbol=item,
                alias=None,
                is_relative=bool(imp.source and imp.source.startswith(".")),
                line=imp.span.start_line + 1 if imp.span else 1,
            ))
        if not imp.items and imp.source:
            imports.append(ImportRecord(
                file=rel_path,
                source_module=imp.source,
                imported_symbol=None,
                alias=None,
                is_relative=imp.source.startswith("."),
                line=imp.span.start_line + 1 if imp.span else 1,
            ))

    # 2. Extract call expressions with line numbers via raw parser
    raw_calls = []
    try:
        parser = tslp.get_parser(lang)
        tree = parser.parse(content.encode("utf-8", errors="ignore"))

        def find_calls(node):
            if node.type in ("call", "call_expression"):
                fn_node = node.child_by_field_name("function")
                if fn_node:
                    raw_text = fn_node.text.decode("utf-8", errors="ignore")
                    callee_name = raw_text.split(".")[-1].split("::")[-1].strip()
                    if callee_name and len(callee_name) < 80:
                        call_line = node.start_point[0] + 1
                        raw_calls.append((call_line, callee_name, raw_text))
            for ch in node.children:
                find_calls(ch)

        find_calls(tree.root_node)
    except Exception:
        pass

    # 3. Recursive structure walker
    def process_node(st, parent_class=None, parent_fn=None, parent_qname=None):
        if not st:
            return
        kname = getattr(st.kind, "name", str(st.kind))
        start_l = st.span.start_line + 1
        end_l = st.span.end_line + 1
        loc = max(1, (end_l - start_l) + 1)
        doc = (st.doc_comment or "")[:300]
        sig = st.signature or ""

        if kname == "Class" and st.name:
            c_qname = f"{parent_qname}::{st.name}" if parent_qname else f"{rel_path}::{st.name}"
            bases = []
            if sig:
                b_match = re.search(r'''\bclass\s+\w+\s*(?:\(([^)]+)\)|extends\s+([A-Za-z0-9_.]+))''', sig)
                if b_match:
                    raw_b = b_match.group(1) or b_match.group(2)
                    bases = [b.strip() for b in raw_b.split(",") if b.strip()]

            qual_name = f"{parent_class}.{st.name}" if parent_class else st.name
            disambiguator = symbol_counts[qual_name]
            symbol_counts[qual_name] += 1
            symbol_id = build_symbol_id(repo_id, lang, mod_name, qual_name, disambiguator)

            classes.append(ClassSymbol(
                symbol_id=symbol_id,
                qname=c_qname,
                name=st.name,
                module=mod_name,
                file=rel_path,
                lineno=start_l,
                end_lineno=end_l,
                loc=loc,
                col_offset=0,
                docstring=doc,
                bases=bases,
                signature=sig[:200],
                visibility=detect_visibility(st.name),
                parent_class_qname=parent_qname if parent_class else None,
                language=lang,
                disambiguator=disambiguator,
            ))
            for ch in (st.children or []):
                process_node(ch, parent_class=st.name, parent_fn=None, parent_qname=c_qname)

        elif kname in ("Function", "Method"):
            if st.name:
                fn_qname = f"{parent_qname}::{st.name}" if parent_qname else f"{rel_path}::{st.name}"
                is_method = bool(parent_class)
                qual_name = f"{parent_class}.{st.name}" if parent_class else (f"{parent_fn}.{st.name}" if parent_fn else st.name)
                disambiguator = symbol_counts[qual_name]
                symbol_counts[qual_name] += 1
                symbol_id = build_symbol_id(repo_id, lang, mod_name, qual_name, disambiguator)

                functions.append(FunctionSymbol(
                    symbol_id=symbol_id,
                    qname=fn_qname,
                    name=st.name,
                    module=mod_name,
                    file=rel_path,
                    lineno=start_l,
                    end_lineno=end_l,
                    loc=loc,
                    col_offset=0,
                    signature=sig[:250],
                    visibility=detect_visibility(st.name),
                    docstring=doc,
                    is_method=is_method,
                    class_name=parent_class or "",
                    parent_class_qname=parent_qname if parent_class else None,
                    parent_fn_qname=parent_qname if (parent_fn and not parent_class) else None,
                    language=lang,
                    disambiguator=disambiguator,
                ))

                # Collect calls enclosed inside this function span
                for line, callee, raw_expr in raw_calls:
                    if start_l <= line <= end_l:
                        is_attr = "." in raw_expr
                        attr_base = raw_expr.split(".")[0] if is_attr else None
                        call_sites.append(CallSite(
                            caller_qname=fn_qname,
                            caller_file=rel_path,
                            line=line,
                            col_offset=0,
                            call_expr=f"{raw_expr}(...)",
                            callee_name=callee,
                            callee_expr=raw_expr,
                            args_count=0,
                            is_attribute=is_attr,
                            attribute_base=attr_base,
                        ))

                for ch in (st.children or []):
                    process_node(ch, parent_class=None, parent_fn=st.name, parent_qname=fn_qname)
            else:
                for ch in (st.children or []):
                    process_node(ch, parent_class=parent_class, parent_fn=parent_fn, parent_qname=parent_qname)
        else:
            for ch in (st.children or []):
                process_node(ch, parent_class=parent_class, parent_fn=parent_fn, parent_qname=parent_qname)

    for st in res.structure:
        process_node(st)

    stem = Path(rel_path).stem
    mod_name = rel_path.replace("\\", "/").rsplit(".", 1)[0].replace("/", ".")

    file_rec = FileRecord(
        path=rel_path,
        language=lang,
        content_hash=content_hash,
        lines_count=len(lines),
        size_bytes=size_bytes,
        parse_status=ParseStatus.PARSED,
    )
    mod_rec = ModuleRecord(name=mod_name, path=rel_path, language=lang)

    return file_rec, mod_rec, classes, functions, imports, call_sites


# ============================================================================
# 3. UNIFIED DISPATCHER
# ============================================================================

def parse_source_file(
    file_path: Path, rel_path: str, repo_id: str = "sample-fintech"
) -> Tuple[FileRecord, Optional[ModuleRecord], List[ClassSymbol], List[FunctionSymbol], List[ImportRecord], List[CallSite]]:
    """
    Unified entry point for AST extraction.
    Routes Python to native AST parser for maximum precision.
    Routes JavaScript, TypeScript, Go, Java, Rust to Tree-sitter Language Pack.
    """
    clean_rel = rel_path.replace("\\", "/")
    suffix = file_path.suffix.lower()

    if suffix == ".py":
        return parse_python_file(file_path, clean_rel, repo_id)

    detected_lang = tslp.detect_language_from_path(str(file_path))
    if detected_lang:
        return parse_multilang_file(file_path, clean_rel, repo_id, detected_lang)

    # Unsupported file type (e.g. .md, .txt, .json, .svg)
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
        content_hash = compute_content_hash(content)
        lines = content.splitlines()
        size_bytes = file_path.stat().st_size if file_path.exists() else len(content.encode("utf-8"))
    except Exception:
        content_hash = ""
        lines = []
        size_bytes = 0

    rec = FileRecord(
        path=clean_rel,
        language="unknown",
        content_hash=content_hash,
        lines_count=len(lines),
        size_bytes=size_bytes,
        parse_status=ParseStatus.UNSUPPORTED,
    )
    return rec, None, [], [], [], []
