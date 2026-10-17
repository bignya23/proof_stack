# backend/analyzer/git_extractor.py
"""
Git Provenance and Architectural Decision Record (ADR) Extractor for ProofStack.
Connects commits to changed files, recorded authors, and documented ADR / Incident decisions.
"""

import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from backend.analyzer.models import ADRRecord, CommitRecord, RepoMetadata


def run_git_cmd(repo_path: Path, args: List[str]) -> str:
    """Executes a git command and returns standard output."""
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo_path)] + args,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return ""


def extract_git_metadata(repo_path: Path, repo_id: str) -> Tuple[RepoMetadata, List[CommitRecord], List[ADRRecord]]:
    """
    Extracts git commit history, active HEAD SHA, author identities,
    changed files, and architectural decisions (ADRs) from repository history.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    if not repo_path.exists() or not (repo_path / ".git").exists():
        meta = RepoMetadata(
            repo_id=repo_id,
            root_dir=str(repo_path),
            default_branch="main",
            commit_sha="NO_GIT",
            remote_url="",
            analyzed_at=now_iso,
        )
        return meta, [], []

    head_sha = run_git_cmd(repo_path, ["rev-parse", "HEAD"]) or "UNKNOWN"
    branch = run_git_cmd(repo_path, ["rev-parse", "--abbrev-ref", "HEAD"]) or "main"
    remote = run_git_cmd(repo_path, ["config", "--get", "remote.origin.url"]) or ""

    meta = RepoMetadata(
        repo_id=repo_id,
        root_dir=str(repo_path),
        default_branch=branch,
        commit_sha=head_sha,
        remote_url=remote,
        analyzed_at=now_iso,
    )

    # Extract git commits with author, ISO date, message, and changed files
    raw_log = run_git_cmd(repo_path, [
        "log",
        "--pretty=format:COMMIT|%h|%H|%an|%ae|%ad|%s",
        "--date=iso",
        "--name-only",
    ])

    commits: List[CommitRecord] = []
    adrs: List[ADRRecord] = []
    seen_adrs = set()

    current_commit: Optional[CommitRecord] = None

    for line in raw_log.splitlines():
        if line.startswith("COMMIT|"):
            parts = line.split("|", 6)
            if len(parts) >= 7:
                _, short_sha, full_sha, name, email, date_str, msg = parts
                tag_match = re.search(r"\[(ADR-\d+|INC-\d+|FIX-\d+)\]", msg)
                tag = tag_match.group(1) if tag_match else "GENERAL"

                current_commit = CommitRecord(
                    sha=short_sha,
                    author_name=name,
                    author_email=email,
                    timestamp=date_str,
                    message=msg,
                    decision_tag=tag,
                    files=[],
                )
                commits.append(current_commit)

                # Extract Architectural Decision Records
                if tag != "GENERAL" and tag not in seen_adrs:
                    seen_adrs.add(tag)
                    clean_title = re.sub(r"^\[.*?\]\s*", "", msg)
                    adrs.append(ADRRecord(
                        decision_id=tag,
                        title=clean_title,
                        commit_sha=short_sha,
                        source_file="",
                        status="ACTIVE",
                    ))
        elif line.strip() and current_commit is not None:
            clean_file = line.strip().replace("\\", "/")
            if clean_file not in current_commit.files:
                current_commit.files.append(clean_file)

    return meta, commits, adrs
