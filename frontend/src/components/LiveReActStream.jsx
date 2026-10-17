// src/components/LiveReActStream.jsx
import React from 'react';
import { RefreshCw, CheckCircle2, Cpu, Zap, Database, Terminal, ArrowRight, Sparkles } from 'lucide-react';

export default function LiveReActStream({ 
  streamingTrace = [], 
  liveMessage = "", 
  liveTurn = 1,
  isComplete = false 
}) {
  return (
    <div className="p-3.5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-sky-500/40 rounded-xl space-y-3 shadow-xl shadow-sky-950/30 animate-fadeIn">
      
      {/* Live Stream Header */}
      <div className="flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center space-x-2">
          {!isComplete ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
            </span>
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span className="text-white font-bold tracking-tight">
            {!isComplete ? "Live ReAct Loop Streaming" : "Investigation Synthesized"}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800/50">
            SSE Stream
          </span>
        </div>

        <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1.5">
          <Cpu className="w-3 h-3 text-sky-400" />
          <span>Step {streamingTrace.length} Executed</span>
        </div>
      </div>

      {/* Live Thinking Status Message */}
      {liveMessage && (
        <div className="p-2.5 bg-sky-950/30 border border-sky-800/40 rounded-lg text-xs font-mono text-sky-200 flex items-center space-x-2">
          {!isComplete ? (
            <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="leading-relaxed">{liveMessage}</span>
        </div>
      )}

      {/* Live Stepper List */}
      {streamingTrace.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {streamingTrace.map((step, idx) => {
            const isRunning = step.status === "running";
            return (
              <div 
                key={step.step || idx}
                className={`p-2 rounded-lg border text-[11px] font-mono flex items-center justify-between transition ${
                  isRunning 
                    ? "bg-sky-950/40 border-sky-500/50 text-sky-200 shadow-sm"
                    : "bg-slate-950/70 border-slate-800/90 text-slate-300"
                }`}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  {isRunning ? (
                    <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  )}
                  <span className="text-slate-500 text-[10px]">
                    0{step.step}
                  </span>
                  <span className="font-bold text-white truncate">
                    {step.tool_name || step.agent_name}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {step.track_badge && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800 hidden sm:inline">
                      {step.track_badge.replace('Track 0', 'T')}
                    </span>
                  )}
                  <span className={`text-[10px] font-semibold ${
                    isRunning ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {isRunning ? "Running..." : "Done"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
