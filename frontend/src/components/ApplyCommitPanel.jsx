// src/components/ApplyCommitPanel.jsx
import React, { useState } from 'react';
import { 
  GitCommit, GitPullRequest, Code, CheckCircle2, 
  AlertTriangle, RefreshCw, Check, Sparkles, FileText, ArrowRight
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
      <div className="h-64 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3 bg-slate-950/30 rounded-xl border border-slate-800/80">
        <div className="p-3 bg-slate-900 rounded-full border border-slate-800 text-slate-600">
          <GitPullRequest className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-300">No Patch Generated Yet</h4>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
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
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Code className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold font-mono text-white">
              {patch.file_path}
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 font-semibold">
            {appliedInfo ? "Committed" : "Ready to Apply"}
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {patch.explanation}
        </p>
      </div>

      {/* AST Validation & Diff Safety Badge */}
      {patch.validation && (
        <div className={`p-3 rounded-xl border text-xs font-mono space-y-2 shadow-sm ${
          patch.validation.syntax_valid
            ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
            : "bg-amber-950/30 border-amber-500/40 text-amber-200"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>AST Safety Proof: {patch.validation.status}</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px]">
              <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 font-bold">
                +{patch.validation.lines_added}
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700/50 font-bold">
                -{patch.validation.lines_deleted}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1 border-t border-slate-800">
            <span>{patch.validation.message}</span>
            <span className="text-slate-400 font-mono text-[10px]">{patch.validation.target_file}</span>
          </div>
        </div>
      )}

      {/* Unified Git Diff Viewer */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unified Git Diff</label>
          <span className="text-[10px] text-slate-500 font-mono">AST Verified Patch</span>
        </div>
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] overflow-x-auto leading-relaxed shadow-inner">
          {patch.diff.split('\n').map((line, idx) => {
            let lineStyle = "text-slate-400";
            if (line.startsWith("+")) {
              lineStyle = "text-emerald-300 bg-emerald-950/40 px-1 py-0.5 rounded block border-l-2 border-emerald-500";
            } else if (line.startsWith("-")) {
              lineStyle = "text-rose-400 bg-rose-950/40 px-1 py-0.5 rounded block border-l-2 border-rose-500 line-through opacity-80";
            } else if (line.startsWith("@")) {
              lineStyle = "text-sky-400 font-bold block py-0.5 bg-sky-950/20";
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
        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Commit Message</label>
        <input
          type="text"
          value={customCommitMsg || patch.commit_message || ""}
          onChange={(e) => setCustomCommitMsg(e.target.value)}
          placeholder="Git commit message..."
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 outline-none font-mono"
        />
      </div>

      {/* 1-Click Apply Patch & Commit Action Button */}
      <div className="pt-1">
        <button
          onClick={handleApply}
          disabled={isApplying || appliedInfo !== null}
          className={`w-full py-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition shadow-lg ${
            appliedInfo
              ? "bg-emerald-600 text-white cursor-default"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white active:scale-[0.99] shadow-emerald-950/50"
          }`}
        >
          {isApplying ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Applying Patch & Committing to Repository...</span>
            </>
          ) : appliedInfo ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Committed to Main (SHA: {appliedInfo.commit_sha})</span>
            </>
          ) : (
            <>
              <GitCommit className="w-4 h-4" />
              <span>Apply Patch & Commit to Git</span>
            </>
          )}
        </button>
      </div>

      {/* Commit Confirmation Card */}
      {appliedInfo && (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/50 rounded-xl space-y-1.5 shadow-md">
          <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-bold">
            <Check className="w-4 h-4" />
            <span>Patch Successfully Committed & Recorded in FalkorDB!</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            Target file <code className="text-emerald-300 font-mono font-semibold">{appliedInfo.file_path}</code> was updated, committed with SHA <strong className="text-white font-mono bg-slate-900 px-1.5 py-0.5 rounded">{appliedInfo.commit_sha}</strong>, and linked to resolved finding <code className="text-pink-400 font-mono">{appliedInfo.finding_id}</code> in FalkorDB.
          </p>
        </div>
      )}

    </div>
  );
}
