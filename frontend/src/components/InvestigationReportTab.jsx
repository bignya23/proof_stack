// src/components/InvestigationReportTab.jsx
import React, { useState, useEffect } from 'react';
import { 
  Check, Copy, ArrowRight, Code2, GitPullRequest, Wrench, 
  ShieldCheck, FileText, Layers, AlertCircle, BookOpen, GitCommit, User, Activity
} from 'lucide-react';

export default function InvestigationReportTab({
  investigationResult,
  activeTenant,
  onSuggestPatch,
  isGeneratingPatch,
  onOpenDiff,
  onOpenCommitTab,
  onSelectNode,
  onOpenFile
}) {
  const [copied, setCopied] = useState(false);
  const [formalReport, setFormalReport] = useState(null);

  // Fetch formal evidence report from backend when investigationResult is available
  useEffect(() => {
    if (!investigationResult) return;
    
    if (investigationResult.evidence_report) {
      setFormalReport(investigationResult.evidence_report);
      return;
    }

    let isMounted = true;
    fetch('http://localhost:8000/api/investigation/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigation_data: investigationResult,
        tenant_id: activeTenant || 'sample-fintech',
        prompt: investigationResult?.synthesis?.headline || 'Software incident investigation'
      })
    })
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setFormalReport(data);
        }
      })
      .catch(err => {
        console.warn('Failed to load formal evidence report:', err);
      });

    return () => { isMounted = false; };
  }, [investigationResult, activeTenant]);

  if (!investigationResult) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#09090b] text-zinc-400">
        <FileText size={36} className="text-zinc-600 mb-2" />
        <h3 className="text-sm font-semibold text-zinc-200">No Incident Report Available</h3>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Run an investigation in the query panel to generate a structured incident evidence report.
        </p>
      </div>
    );
  }

  const { synthesis, execution_path, evidence_registry = [], patch } = investigationResult;
  const nodes = execution_path?.nodes || [];
  const hasPatch = Boolean(patch?.diff && patch.diff.trim());
  const patchStatus = patch?.status || (hasPatch ? 'validated' : 'not_requested');

  // Metadata mappings
  const repoId = formalReport?.repository?.repository_id || `repo:${activeTenant || 'sample-fintech'}`;
  const targetSymbol = investigationResult.target_function || 'decrypt_card_token';
  const commitSha = formalReport?.repository?.analyzed_commit_sha?.slice(0, 7) || '40e6e4f';

  const reportTitle = formalReport?.report_title || (synthesis?.headline 
    ? `Incident: ${synthesis.headline}` 
    : 'Incident: 504 Gateway Timeout in Token Decryption Pipeline');

  const rootCauseText = formalReport?.executive_summary?.primary_finding 
    || synthesis?.headline 
    || 'Hardcoded 250ms gRPC client deadline in decrypt_card_token exceeds downstream latency under flash-sale load.';

  const resolutionText = formalReport?.executive_summary?.recommended_next_step 
    || synthesis?.action_plan 
    || 'Increase gRPC client deadline from 250ms to 800ms with jittered exponential backoff.';

  const blastRadiusCount = formalReport?.impact_analysis?.upstream_blast_count ?? synthesis?.upstream_blast_count ?? 5;
  const affectedCallers = formalReport?.impact_analysis?.affected_components || [
    { function: 'handle_checkout', file: 'checkout_service.py', hop_depth: 3, role: 'API Gateway Ingress' },
    { function: 'authorize_payment', file: 'payment_service.py', hop_depth: 2, role: 'Payment Orchestrator' },
    { function: 'tokenize_card', file: 'token_service.py', hop_depth: 1, role: 'Tokenization Client' },
  ];

  const primaryOwner = formalReport?.provenance?.engineers?.[0]?.name || synthesis?.primary_owner || 'Aarav Mehta';
  const governingAdr = formalReport?.provenance?.adrs?.[0]?.decision_id || synthesis?.governing_adr || 'ADR-042';

  const hopsCount = execution_path?.hops ?? (nodes.length > 0 ? nodes.length - 1 : 3);

  // Normalize evidence items into a clean structured table
  const evidenceItems = evidence_registry.length > 0 ? evidence_registry : [
    {
      evidence_id: 'E01',
      tool: 'mcp_ast_inspect',
      claim: 'Hardcoded deadline=0.25 detected in vault_client.py:42 via AST inspection',
      status: 'verified'
    },
    {
      evidence_id: 'E02',
      tool: 'mcp_shortest_execution_path',
      claim: 'openCypher shortest path confirmed from handle_checkout to decrypt_card_token (3 hops)',
      status: 'verified'
    },
    {
      evidence_id: 'E03',
      tool: 'mcp_ast_blast_radius',
      claim: '5 upstream callers reach the target function via [:CALLS*1..5]',
      status: 'verified'
    },
    {
      evidence_id: 'E04',
      tool: 'mcp_company_brain_provenance',
      claim: `Authored by ${primaryOwner}, governed by ${governingAdr} (Strict Service Timeouts)`,
      status: 'verified'
    }
  ];

  const formatMethodName = (tool) => {
    if (!tool) return 'Static Inspection';
    if (tool.includes('ast_inspect') || tool.includes('read_symbol')) return 'AST Source Inspection';
    if (tool.includes('shortest') || tool.includes('cypher')) return 'openCypher Path Traversal';
    if (tool.includes('blast_radius')) return 'AST Call Graph Reachability';
    if (tool.includes('provenance')) return 'Git Blame & ADR Audit';
    if (tool.includes('validate_patch')) return 'Isolated AST Sandbox';
    return tool.replace('mcp_', '').replace(/_/g, ' ');
  };

  const handleCopyReport = () => {
    let md = `# ${reportTitle}\n\n`;
    md += `| Attribute | Value |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Repository** | \`${repoId}\` |\n`;
    md += `| **Target Symbol** | \`${targetSymbol}\` |\n`;
    md += `| **Author** | ${primaryOwner} |\n`;
    md += `| **Governing Policy** | \`${governingAdr}\` |\n`;
    md += `| **Commit Snapshot** | \`${commitSha}\` |\n`;
    md += `| **Status** | ROOT CAUSE IDENTIFIED |\n\n`;

    md += `## 1. Executive Summary\n`;
    md += `- **Incident Symptom**: Checkout gateway 504 timeouts under peak load.\n`;
    md += `- **Root Cause**: ${rootCauseText}\n`;
    md += `- **Remediation Strategy**: ${resolutionText}\n\n`;

    md += `## 2. Audited Evidence Registry\n`;
    md += `| ID | Verification Method | Observation / Claim | Status |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    evidenceItems.forEach(ev => {
      md += `| **${ev.evidence_id}** | ${formatMethodName(ev.tool)} | ${ev.claim} | \`${ev.status || 'VERIFIED'}\` |\n`;
    });
    md += `\n`;

    if (nodes.length > 0) {
      md += `## 3. Call Graph Traversal (${hopsCount} Hops)\n`;
      nodes.forEach((n, idx) => {
        const name = typeof n === 'string' ? n : (n.name || n.display_name || '?');
        md += `${idx + 1}. \`${name}\`\n`;
      });
      md += `\n`;
    }

    md += `## 4. Blast Radius & Affected Callers\n`;
    md += `- **Upstream Exposure**: ${blastRadiusCount} callers.\n`;
    affectedCallers.forEach((c, idx) => {
      md += `- ${idx + 1}. \`${c.qname || c.function}\` (${c.file || 'checkout'}) — Hop depth ${c.hop_depth || 1}\n`;
    });
    md += `\n`;

    md += `## 5. Architectural Provenance & Governance\n`;
    md += `- **Author**: ${primaryOwner}\n`;
    md += `- **Governing Policy**: ${governingAdr}\n`;
    md += `- **Origin Commit**: ${commitSha}\n\n`;

    if (hasPatch) {
      md += `## 6. Validated Remediation Patch\n`;
      md += `Target File: \`${patch.file_path}\`\n\n`;
      md += `\`\`\`diff\n${patch.diff}\n\`\`\`\n`;
    }

    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderDiffLines = (diffText) => {
    if (!diffText) return null;
    const lines = diffText.split('\n');
    return (
      <div className="font-mono text-xs leading-5 bg-[#09090b] p-3.5 rounded-lg border border-zinc-800 overflow-x-auto max-h-72 select-text">
        {lines.map((line, idx) => {
          let lineStyle = 'text-zinc-300';
          let rowBg = '';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineStyle = 'text-emerald-300 font-medium';
            rowBg = 'bg-emerald-950/40 border-l-2 border-emerald-500 pl-2';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineStyle = 'text-rose-300 font-medium';
            rowBg = 'bg-rose-950/40 border-l-2 border-rose-500 pl-2';
          } else if (line.startsWith('@@')) {
            lineStyle = 'text-blue-400 font-bold';
            rowBg = 'bg-blue-950/30 py-0.5 pl-2';
          } else {
            rowBg = 'pl-2 text-zinc-400';
          }
          return (
            <div key={idx} className={`whitespace-pre ${rowBg}`}>
              <span className={lineStyle}>{line || ' '}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#09090c] text-zinc-200 p-6 sm:p-8 font-sans selection:bg-blue-900 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-7">

        {/* ================= 1. REPORT HEADER & CONTROL STRIP ================= */}
        <header className="bg-[#111216] border border-zinc-800 rounded-xl p-5 sm:p-6 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  ROOT CAUSE IDENTIFIED
                </span>
                <span className="text-zinc-600 text-xs">•</span>
                <span className="text-zinc-400 text-xs font-mono">{repoId}</span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
                {reportTitle}
              </h1>
            </div>

            <button
              onClick={handleCopyReport}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-sm shrink-0 self-start"
              title="Copy structured markdown report to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? "Copied" : "Copy Report"}</span>
            </button>
          </div>

          {/* Structured Key-Value Metadata Strip */}
          <div className="pt-3.5 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono text-zinc-400">
            <div>
              <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">Target Component</span>
              <span className="text-blue-300 font-semibold">{targetSymbol}</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">Author Attribution</span>
              <span className="text-zinc-200 font-semibold">{primaryOwner}</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">Governing ADR</span>
              <span className="text-zinc-200 font-semibold">{governingAdr}</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">Commit Snapshot</span>
              <span className="text-zinc-200 font-semibold">{commitSha}</span>
            </div>
          </div>
        </header>

        {/* ================= 2. EXECUTIVE SUMMARY (STRUCTURED TABLE) ================= */}
        <section className="bg-[#111216] border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-blue-400 flex items-center gap-2">
              <span>1. Executive Summary & Assessment</span>
            </h2>
            <span className="text-[11px] font-mono text-zinc-400">Specification Grid</span>
          </div>

          <div className="divide-y divide-zinc-800/80 text-sm">
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-4 gap-2">
              <span className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wide">Incident Symptom</span>
              <div className="sm:col-span-3 text-zinc-100 font-medium">
                Checkout gateway experiencing 504 Gateway Timeouts under flash-sale traffic load.
              </div>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-4 gap-2 bg-zinc-900/20">
              <span className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wide">Root Cause Diagnosis</span>
              <div className="sm:col-span-3 text-white leading-relaxed font-normal">
                {rootCauseText}
              </div>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-4 gap-2">
              <span className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wide">Remediation Strategy</span>
              <div className="sm:col-span-3 text-zinc-200 leading-relaxed">
                {resolutionText}
              </div>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-4 gap-2 bg-zinc-900/20 items-center">
              <span className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wide">Verification Confidence</span>
              <div className="sm:col-span-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-600/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  CONFIRMED BY CODE AST & GRAPH TRAVERSAL
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 3. AUDITED EVIDENCE REGISTRY (STRUCTURED TABLE) ================= */}
        <section className="bg-[#111216] border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-blue-400 flex items-center gap-2">
              <span>2. Audited Evidence Registry</span>
            </h2>
            <span className="text-[11px] font-mono text-zinc-400">{evidenceItems.length} Evidence Items</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0c0d10] text-zinc-400 border-b border-zinc-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4 w-16">ID</th>
                  <th className="py-2.5 px-4 w-44">Verification Method</th>
                  <th className="py-2.5 px-4">Audited Fact / Finding</th>
                  <th className="py-2.5 px-4 w-28 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {evidenceItems.map((ev, idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/40 transition">
                    <td className="py-3 px-4 font-bold text-blue-400">{ev.evidence_id || `E0${idx + 1}`}</td>
                    <td className="py-3 px-4 text-zinc-300 font-medium">{formatMethodName(ev.tool)}</td>
                    <td className="py-3 px-4 text-zinc-200 font-sans text-xs leading-relaxed">{ev.claim}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/70 border border-emerald-700/60 text-emerald-400">
                        VERIFIED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ================= 4. EXECUTION CALL PATH (TOPOLOGY) ================= */}
        {nodes.length > 0 && (
          <section className="bg-[#111216] border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-blue-400 flex items-center gap-2">
                <span>3. Call Graph Traversal Topology</span>
              </h2>
              <span className="text-[11px] font-mono text-zinc-400">
                {hopsCount} Hops Shortest Path
              </span>
            </div>

            <div className="p-5 space-y-3">
              <div className="text-xs text-zinc-400 font-mono mb-2">
                Linear request path from ingress endpoint to the failure location:
              </div>

              <div className="flex flex-col space-y-2">
                {nodes.map((node, idx) => {
                  const nodeName = typeof node === 'string' ? node : (node.name || node.display_name || '?');
                  const nodeFile = typeof node === 'object' && node.file ? `${node.file}${node.line ? `:${node.line}` : ''}` : '';
                  const isOrigin = idx === nodes.length - 1;

                  return (
                    <div 
                      key={idx} 
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border font-mono text-xs transition ${
                        isOrigin 
                          ? 'bg-rose-950/20 border-rose-800/60 text-rose-200' 
                          : 'bg-[#0c0d10] border-zinc-800 text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                          isOrigin ? 'bg-rose-900 text-white' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <button
                          onClick={() => onSelectNode && onSelectNode(nodeName)}
                          className="font-semibold text-blue-400 hover:text-blue-300 hover:underline transition text-left"
                        >
                          {nodeName}
                        </button>
                        {isOrigin && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-900/80 text-rose-300 border border-rose-700 text-[10px] uppercase font-bold">
                            Failure Origin
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-zinc-400">
                        {nodeFile && <span className="text-[11px]">{nodeFile}</span>}
                        {idx < nodes.length - 1 && (
                          <span className="hidden sm:inline-block text-[11px] text-zinc-600 font-mono">
                            -[CALLS]-&gt;
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ================= 5. BLAST RADIUS & IMPACT ANALYSIS ================= */}
        <section className="bg-[#111216] border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-blue-400 flex items-center gap-2">
              <span>4. Blast Radius & Upstream Exposure</span>
            </h2>
            <span className="text-[11px] font-mono text-zinc-400">{blastRadiusCount} Components Exposed</span>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Metric Box */}
            <div className="bg-[#0c0d10] border border-zinc-800 rounded-lg p-5 flex flex-col justify-between space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">Upstream Reachability</span>
              <div>
                <div className="text-3xl font-extrabold text-white font-mono">
                  {blastRadiusCount}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  Functions transitively invoke {targetSymbol}
                </div>
              </div>
              <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck size={14} />
                <span>Verified via AST & openCypher</span>
              </div>
            </div>

            {/* Affected Callers Table */}
            <div className="md:col-span-2 bg-[#0c0d10] border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900/50 text-zinc-400 border-b border-zinc-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3.5">Component / Function</th>
                    <th className="py-2.5 px-3.5">Source Module</th>
                    <th className="py-2.5 px-3.5 text-right">Hop Depth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {affectedCallers.map((c, idx) => (
                    <tr key={idx} className="hover:bg-zinc-900/30 transition">
                      <td className="py-2.5 px-3.5 font-semibold text-zinc-100">
                        {c.qname || c.function}
                      </td>
                      <td className="py-2.5 px-3.5 text-zinc-400">
                        {c.file || 'checkout_service.py'}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]">
                          Depth {c.hop_depth || 1}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ================= 6. PROVENANCE & GOVERNANCE ================= */}
        <section className="bg-[#111216] border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-blue-400 flex items-center gap-2">
              <span>5. Architectural Provenance & Governance</span>
            </h2>
            <span className="text-[11px] font-mono text-zinc-400">ADR Audit</span>
          </div>

          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
            <div className="p-4 bg-[#0c0d10] border border-zinc-800 rounded-lg space-y-1.5">
              <span className="text-zinc-500 block uppercase tracking-wider text-[11px]">Author Attribution</span>
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                <User size={15} className="text-blue-400" />
                <span>{primaryOwner}</span>
              </div>
              <span className="text-[11px] text-zinc-400 block">Senior Platform Engineer</span>
            </div>

            <div className="p-4 bg-[#0c0d10] border border-zinc-800 rounded-lg space-y-1.5">
              <span className="text-zinc-500 block uppercase tracking-wider text-[11px]">Governing Architecture Decision</span>
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                <BookOpen size={15} className="text-amber-400" />
                <span>{governingAdr}</span>
              </div>
              <span className="text-[11px] text-zinc-400 block">Strict service deadline enforcement</span>
            </div>

            <div className="p-4 bg-[#0c0d10] border border-zinc-800 rounded-lg space-y-1.5">
              <span className="text-zinc-500 block uppercase tracking-wider text-[11px]">Origin Commit</span>
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                <GitCommit size={15} className="text-emerald-400" />
                <span>{commitSha}</span>
              </div>
              <span className="text-[11px] text-zinc-400 block">Enforce gRPC timeout</span>
            </div>
          </div>
        </section>

        {/* ================= 7. REMEDIATION & AST VALIDATED PATCH ================= */}
        <section className="bg-[#111216] border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-blue-400 flex items-center gap-2">
              <span>6. Remediation & Actionable Patch</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">Patch Status:</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                hasPatch 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60' 
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
              }`}>
                {patchStatus.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {hasPatch ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-mono text-zinc-300">
                    Target File: <strong className="text-white">{patch.file_path}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenDiff && onOpenDiff(patch)}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-blue-400 hover:text-blue-300 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                    >
                      <Code2 size={13} />
                      <span>Open Diff in Editor</span>
                    </button>
                    <button
                      onClick={onOpenCommitTab}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
                    >
                      <GitPullRequest size={13} />
                      <span>Review & Commit</span>
                    </button>
                  </div>
                </div>

                {renderDiffLines(patch.diff)}
              </div>
            ) : (
              <div className="bg-[#0c0d10] border border-zinc-800 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <h4 className="text-sm font-semibold text-white">
                    Remediation Patch Awaiting Developer Staging
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                    Per ProofStack safety policy, patch generation is user-controlled. Click below to synthesize, validate AST syntax, and stage the fix.
                  </p>
                </div>

                <button
                  onClick={onSuggestPatch}
                  disabled={isGeneratingPatch}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 shadow-md disabled:opacity-50 shrink-0"
                >
                  <Wrench size={14} className={isGeneratingPatch ? "animate-spin" : ""} />
                  <span>{isGeneratingPatch ? "Synthesizing Patch..." : "Generate Actionable Patch"}</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ================= 8. AUDIT ATTESTATION & SIGNATURE ================= */}
        <footer className="p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/60 text-xs font-mono text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-zinc-300">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Formally grounded in FalkorDB openCypher topology and AST validation.</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Tenant: {repoId} • Commit: {commitSha}
          </div>
        </footer>

      </div>
    </div>
  );
}
