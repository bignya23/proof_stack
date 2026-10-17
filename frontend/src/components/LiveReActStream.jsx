// src/components/LiveReActStream.jsx
import React from 'react';
import { RefreshCw, CircleCheck, Cpu, Sparkles } from 'lucide-react';

export default function LiveReActStream({ 
  streamingTrace = [], 
  liveMessage = "", 
  liveTurn = 1, 
  isComplete = false 
}) {
  return (
    <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 font-sans">
      
      {/* Live Stream Header */}
      <div className="flex items-center justify-between text-xs font-semibold font-sans">
        <div className="flex items-center space-x-2">
          {!isComplete ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
          ) : (
            <CircleCheck size={16} strokeWidth={1.8} className="text-zinc-200" />
          )}
          <span className="text-zinc-100 font-bold tracking-tight font-sans">
            {!isComplete ? "Live ReAct Loop" : "Investigation Complete"}
          </span>
        </div>

        <div className="text-[10px] font-sans text-zinc-400 flex items-center space-x-1.5">
          <Cpu size={14} strokeWidth={1.8} className="text-zinc-200" />
          <span>Step {streamingTrace.length}</span>
        </div>
      </div>

      {/* Live Thinking Status Message */}
      {liveMessage && (
        <div className="p-2.5 bg-[#000000] border border-zinc-800 rounded-lg text-xs font-sans text-zinc-300 flex items-center space-x-2">
          {!isComplete ? (
            <RefreshCw size={14} strokeWidth={1.8} className="text-zinc-200 animate-spin shrink-0" />
          ) : (
            <Sparkles size={14} strokeWidth={1.8} className="text-zinc-200 shrink-0" />
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
                    ? "bg-zinc-900 border-blue-500/60 text-blue-400"
                    : "bg-[#000000] border-zinc-800 text-zinc-300"
                }`}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  {isRunning ? (
                    <RefreshCw size={14} strokeWidth={1.8} className="text-zinc-200 animate-spin shrink-0" />
                  ) : (
                    <CircleCheck size={14} strokeWidth={1.8} className="text-zinc-200 shrink-0" />
                  )}
                  <span className="text-zinc-500 text-[10px] font-mono">
                    {String(step.step).padStart(2, '0')}
                  </span>
                  <span className="font-bold text-zinc-200 truncate font-mono">
                    {step.tool_name || step.agent_name}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className={`text-[10px] font-sans font-medium ${
                    isRunning ? "text-blue-400" : "text-zinc-400"
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
