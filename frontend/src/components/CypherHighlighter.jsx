// src/components/CypherHighlighter.jsx
import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

const KEYWORDS = new Set([
  'MATCH', 'OPTIONAL MATCH', 'WHERE', 'RETURN', 'WITH', 'MERGE',
  'ON CREATE SET', 'ON MATCH SET', 'SET', 'ORDER BY', 'LIMIT',
  'AS', 'AND', 'OR', 'NOT', 'IN', 'DISTINCT', 'DESC', 'ASC',
  'CALL', 'YIELD', 'shortestPath', 'length', 'nodes', 'labels',
  'properties', 'count'
]);

function highlightToken(token, idx) {
  // Check strings
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
    return <span key={idx} className="text-emerald-300">{token}</span>;
  }
  // Check parameters ($param)
  if (token.startsWith('$')) {
    return <span key={idx} className="text-amber-400 font-semibold">{token}</span>;
  }
  // Check node labels (:Function, :Commit, etc.)
  if (token.startsWith(':') && token.length > 1) {
    return <span key={idx} className="text-purple-400 font-medium">{token}</span>;
  }
  // Check keywords
  const cleanWord = token.replace(/[^a-zA-Z_]/g, '');
  if (KEYWORDS.has(token) || KEYWORDS.has(cleanWord)) {
    return <span key={idx} className="text-sky-400 font-bold">{token}</span>;
  }
  // Default token
  return <span key={idx}>{token}</span>;
}

function highlightLine(line) {
  if (line.trim().startsWith('//')) {
    return <span className="text-slate-500 italic">{line}</span>;
  }
  // Regex splitting by whitespace and special punctuation while preserving spaces
  const parts = line.split(/(\s+|[(),\[\]{}|])/);
  return parts.map((part, i) => highlightToken(part, i));
}

export default function CypherHighlighter({ cypher, title = "FalkorDB openCypher Query" }) {
  const [copied, setCopied] = useState(false);

  if (!cypher || !cypher.trim()) {
    return (
      <div className="text-slate-500 text-xs italic font-mono bg-slate-950/60 p-2.5 rounded border border-slate-800">
        // Direct FalkorDB memory accessor (no parameterized Cypher required)
      </div>
    );
  }

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cypher.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = cypher.trim().split('\n');

  return (
    <div className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-950/90 shadow-inner">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-400 font-mono">
        <div className="flex items-center space-x-1.5">
          <Terminal className="w-3 h-3 text-sky-400" />
          <span className="text-slate-300 font-semibold">{title}</span>
          <span className="text-[9px] px-1 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800/40">
            FalkorDB
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95"
          title="Copy Cypher to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-2.5 h-2.5 text-emerald-400" />
              <span className="text-emerald-400 font-bold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-2.5 h-2.5" />
              <span>Copy Cypher</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-[11px] font-mono leading-relaxed select-text">
        {lines.map((line, idx) => (
          <div key={idx} className="whitespace-pre">
            {highlightLine(line)}
          </div>
        ))}
      </div>
    </div>
  );
}
