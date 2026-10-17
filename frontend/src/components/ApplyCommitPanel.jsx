// src/components/ApplyCommitPanel.jsx
import React, { useState } from 'react';
import { 
  GitCommit, GitPullRequest, Code, CircleCheck, 
  AlertCircle, RefreshCw, Sparkles, FileText, ArrowRight
} from 'lucide-react';

export default function ApplyCommitPanel({ 
  patch, 
  onApplyPatch, 
  isApplying, 
  appliedInfo 
}) {
  const [customCommitMsg, setCustomCommitMsg] = useState('');

  if (!patch) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3 bg-[#000000] rounded-xl border border-zinc-800">
        <div className="p-3 bg-zinc-900 rounded-full border border-zinc-800 text-blue-400">
          <GitPullRequest size={24} strokeWidth={1.8} />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-zinc-300">No Patch Generated Yet</h4>
          <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
            Run an incident investigation. ProofStack will locate the root cause in the graph, verify AST invariants, and produce a unified diff ready to commit.
          </p>
        </div>
      </div>
    );
  }

  const effectiveCommitMsg = customCommitMsg || patch.commit_message || "[FIX] Resolve timeout per FalkorDB incident memory";

  const handleApply = () => {
    if (onApplyPatch) {
      onApplyPatch(effectiveCommitMsg);
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Target File & Explanation Card */}
      <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Code size={16} strokeWidth={1.8} className="text-blue-400" />
            <span className="text-xs font-bold font-mono text-zinc-100">
              {patch.file_path}
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-blue-400 border border-zinc-800 font-semibold">
            {appliedInfo ? "Committed" : "Ready to Apply"}
          </span>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed font-sans">
          {patch.explanation}
        </p>
      </div>

      {/* AST Validation & Diff Safety Badge */}
      {patch.validation && (
        <div className="p-3 rounded-xl border text-xs font-mono space-y-2 shadow-sm bg-zinc-950 border-zinc-800 text-zinc-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-bold">
              <CircleCheck size={16} strokeWidth={1.8} className="text-emerald-400" />
              <span>AST Safety Proof: {patch.validation.status}</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px]">
              <span className="px-2 py-0.5 rounded bg-zinc-900 text-emerald-400 border border-zinc-800 font-bold">
                +{patch.validation.lines_added}
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-900 text-rose-400 border border-zinc-800 font-bold">
                -{patch.validation.lines_deleted}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-850">
            <span>{patch.validation.message}</span>
            <span className="text-zinc-500 font-mono text-[10px]">{patch.validation.target_file}</span>
          </div>
        </div>
      )}

      {/* Unified Git Diff Viewer */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Unified Git Diff</label>
          <span className="text-[10px] text-zinc-500 font-mono">AST Verified Patch</span>
        </div>
        <div className="p-3 bg-[#000000] rounded-lg border border-zinc-800 font-mono text-[11px] overflow-x-auto leading-relaxed shadow-inner">
          {patch.diff.split('\n').map((line, idx) => {
            let lineStyle = "text-zinc-400";
            if (line.startsWith("+")) {
              lineStyle = "text-emerald-400 bg-emerald-950/20 px-1 py-0.5 rounded block border-l-2 border-emerald-500";
            } else if (line.startsWith("-")) {
              lineStyle = "text-rose-400 bg-rose-950/20 px-1 py-0.5 rounded block border-l-2 border-rose-500 line-through opacity-80";
            } else if (line.startsWith("@")) {
              lineStyle = "text-blue-400 font-bold block py-0.5 bg-blue-950/20";
            }
            return (
              <div key={idx} className={lineStyle}>
                {line || " "}
              </div>
            );
          })}
        </div>
      </div>

      {/* Commit Message Box */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Commit Message</label>
        <input
          type="text"
          value={customCommitMsg || patch.commit_message || ""}
          onChange={(e) => setCustomCommitMsg(e.target.value)}
          placeholder="Git commit message..."
          className="w-full bg-[#000000] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-blue-500 outline-none font-mono"
        />
      </div>

      {/* 1-Click Apply Patch & Commit Action Button (Button text strictly in blue) */}
      <div className="pt-1">
        <button
          onClick={handleApply}
          disabled={isApplying || appliedInfo !== null}
          className={`w-full py-3 rounded-lg text-xs font-mono font-bold flex items-center justify-center space-x-2 transition border text-blue-400 ${
            appliedInfo
              ? "bg-zinc-900 border-zinc-800 text-blue-400 cursor-default"
              : "bg-zinc-900 hover:bg-zinc-850 border-zinc-800 hover:border-blue-500 text-blue-400 active:scale-[0.99]"
          }`}
        >
          {isApplying ? (
            <>
              <RefreshCw size={16} strokeWidth={1.8} className="animate-spin text-blue-400" />
              <span>Applying Patch & Committing to Repository...</span>
            </>
          ) : appliedInfo ? (
            <>
              <CircleCheck size={16} strokeWidth={1.8} className="text-blue-400" />
              <span>Committed to Main (SHA: {appliedInfo.commit_sha})</span>
            </>
          ) : (
            <>
              <GitCommit size={16} strokeWidth={1.8} className="text-blue-400" />
              <span>Apply Patch & Commit to Git</span>
            </>
          )}
        </button>
      </div>

      {/* Commit Confirmation Card */}
      {appliedInfo && (
        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1.5 shadow-md">
          <div className="flex items-center space-x-1.5 text-blue-400 text-xs font-mono font-bold">
            <CircleCheck size={16} strokeWidth={1.8} className="text-blue-400" />
            <span>Patch Successfully Committed & Recorded in FalkorDB!</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed font-sans">
            Target file <code className="text-zinc-100 font-mono font-semibold">{appliedInfo.file_path}</code> was updated, committed with SHA <strong className="text-blue-400 font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">{appliedInfo.commit_sha}</strong>, and linked to resolved finding <code className="text-zinc-300 font-mono">{appliedInfo.finding_id}</code> in FalkorDB.
          </p>
        </div>
      )}

    </div>
  );
}
