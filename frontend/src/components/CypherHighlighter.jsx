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
    return <span key={idx} className="text-zinc-300">{token}</span>;
  }
  // Check parameters ($param)
  if (token.startsWith('$')) {
    return <span key={idx} className="text-blue-400 font-semibold">{token}</span>;
  }
  // Check node labels (:Function, :Commit, etc.)
  if (token.startsWith(':') && token.length > 1) {
    return <span key={idx} className="text-zinc-200 font-medium">{token}</span>;
  }
  // Check keywords
  const cleanWord = token.replace(/[^a-zA-Z_]/g, '');
  if (KEYWORDS.has(token) || KEYWORDS.has(cleanWord)) {
    return <span key={idx} className="text-blue-400 font-bold">{token}</span>;
  }
  // Default token
  return <span key={idx} className="text-zinc-400">{token}</span>;
}

function highlightLine(line) {
  if (line.trim().startsWith('//')) {
    return <span className="text-zinc-600 italic">{line}</span>;
  }
  // Regex splitting by whitespace and special punctuation while preserving spaces
  const parts = line.split(/(\s+|[(),\[\]{}|])/);
  return parts.map((part, i) => highlightToken(part, i));
}

export default function CypherHighlighter({ cypher, title = "Cypher Query" }) {
  const [copied, setCopied] = useState(false);

  if (!cypher || !cypher.trim()) {
    return (
      <div className="text-zinc-600 text-xs italic font-mono bg-[#000000] p-2.5 rounded border border-zinc-800">
        // Direct memory traversal (no cypher query required)
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
    <div className="relative group rounded-lg overflow-hidden border border-zinc-800 bg-[#000000] shadow-inner">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950 border-b border-zinc-800 text-[10px] text-zinc-400 font-mono">
        <div className="flex items-center space-x-1.5">
          <Terminal size={14} strokeWidth={1.8} className="text-zinc-200" />
          <span className="text-zinc-300 font-semibold">{title}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-blue-500/50 text-blue-400 transition"
          title="Copy Cypher to clipboard"
        >
          {copied ? (
            <>
              <Check size={14} strokeWidth={1.8} className="text-zinc-200" />
              <span className="font-bold">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} strokeWidth={1.8} className="text-zinc-200" />
              <span>Copy</span>
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
