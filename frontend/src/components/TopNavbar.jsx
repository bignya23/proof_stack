// src/components/TopNavbar.jsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Network, Database, PanelRightOpen, PanelRightClose,
  ChevronDown, Check, Plus, FolderGit2, GitBranch,
  Folder, X, Link2, RefreshCw, AlertCircle, ArrowRight
} from 'lucide-react';

export default function TopNavbar({
  activeTenant,
  tenants = ["sample-fintech"],
  setActiveTenant,
  isRightPanelOpen,
  setIsRightPanelOpen,
  onIngestRepo,
  fetchTenants
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addMode, setAddMode] = useState('url'); // 'url' or 'local'
  const [repoUrl, setRepoUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Auto-generate a clean tenant name from URL or local path
  const handleUrlChange = (val) => {
    setRepoUrl(val);
    setErrorMsg('');
    if (val.trim()) {
      try {
        const clean = val.replace(/\.git\/?$/, '').split('/').filter(Boolean).pop();
        if (clean) {
          setTenantName(clean.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const handleLocalPathChange = (val) => {
    setLocalPath(val);
    setErrorMsg('');
    if (val.trim()) {
      const clean = val.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop();
      if (clean) {
        setTenantName(clean.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
      }
    }
  };

  const handleOpenModal = () => {
    setIsDropdownOpen(false);
    setIsModalOpen(true);
    setRepoUrl('');
    setLocalPath('');
    setTenantName('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSubmitIngest = async (e) => {
    e.preventDefault();
    const target = addMode === 'url' ? repoUrl.trim() : localPath.trim();
    const cleanTenant = tenantName.trim().replace(/^repo:/, '') || 'custom-repo';

    if (!target) {
      setErrorMsg(addMode === 'url' ? "Please provide a valid Git repository URL" : "Please provide a valid local folder path");
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (onIngestRepo) {
        await onIngestRepo(target, cleanTenant);
      } else {
        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repo_path_or_url: target,
            tenant_id: cleanTenant
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Failed to clone and ingest repository");
        }
      }

      setSuccessMsg(`Repository ingested successfully into repo:${cleanTenant}!`);
      if (fetchTenants) fetchTenants();
      if (setActiveTenant) setActiveTenant(cleanTenant);

      setTimeout(() => {
        setIsModalOpen(false);
        setLoading(false);
      }, 1000);

    } catch (err) {
      setErrorMsg(err.message || "Failed to ingest repository. Please check URL/path.");
      setLoading(false);
    }
  };

  return (
    <>
      <header className="h-11 bg-[#09090b] border-b border-zinc-800 px-3.5 flex items-center justify-between select-none z-30 shrink-0 relative font-sans">
        
        {/* Left Spacer to keep middle items centered */}
        <div className="flex-1" />

        {/* Middle: Brand Identity & Repo Breadcrumb */}
        <div className="flex items-center space-x-3 shrink-0 relative" ref={dropdownRef}>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 shadow-sm">
              <Network size={16} strokeWidth={1.8} />
            </div>
            <span className="font-bold text-xs tracking-tight text-zinc-100 font-sans">
              ProofStack
            </span>
          </div>

          <span className="text-zinc-700">/</span>

          {/* Multigraph Tenant Selector Trigger Button */}
          <button 
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-xs font-mono font-medium text-zinc-300 hover:text-white"
            title="Switch or add repository"
          >
            <Database size={14} strokeWidth={1.8} className="text-zinc-400" />
            <span>repo:{activeTenant}</span>
            <ChevronDown size={13} strokeWidth={1.8} className={`text-zinc-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Custom Repo Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 mt-1 w-64 bg-[#121214] border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 text-xs font-sans animate-in fade-in duration-100">
              
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">
                Repositories ({tenants.length})
              </div>

              <div className="space-y-0.5 my-1 max-h-48 overflow-y-auto">
                {tenants.map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setActiveTenant(t);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
                      t === activeTenant
                        ? 'bg-zinc-850 text-blue-400 font-bold'
                        : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Database size={13} strokeWidth={1.8} className={t === activeTenant ? 'text-blue-400' : 'text-zinc-500'} />
                      <span className="truncate font-mono">repo:{t}</span>
                    </div>
                    {t === activeTenant && (
                      <Check size={13} strokeWidth={2} className="text-blue-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="border-t border-zinc-800/80 my-1 pt-1">
                <button
                  onClick={handleOpenModal}
                  className="w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg text-left bg-zinc-900/60 hover:bg-zinc-850 text-zinc-200 hover:text-white transition group border border-zinc-800 hover:border-zinc-700"
                >
                  <div className="w-5 h-5 rounded-md bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition">
                    <Plus size={12} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="font-medium text-xs text-zinc-100 flex items-center space-x-1">
                      <span>Add Repository</span>
                      <ArrowRight size={10} className="text-zinc-400 group-hover:translate-x-0.5 transition" />
                    </div>
                    <div className="text-[10px] text-zinc-500 leading-tight">
                      Clone Git link or load from PC
                    </div>
                  </div>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Complete Right: Panel Drawer Toggle Button */}
        <div className="flex-1 flex items-center justify-end">
          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className={`h-7 w-7 rounded border transition flex items-center justify-center text-zinc-300 hover:text-white ${
              isRightPanelOpen
                ? "bg-zinc-900 border-zinc-700"
                : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850"
            }`}
            title={isRightPanelOpen ? "Close panel" : "Open panel"}
          >
            {isRightPanelOpen ? (
              <PanelRightClose size={15} strokeWidth={1.8} className="text-zinc-200" />
            ) : (
              <PanelRightOpen size={15} strokeWidth={1.8} className="text-zinc-200" />
            )}
          </button>
        </div>

      </header>

      {/* ================= ADD REPOSITORY MODAL ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 select-text font-sans">
          <div className="bg-[#121214] border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <FolderGit2 size={17} strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Add & Ingest Repository
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Clones into <span className="font-mono text-zinc-300">./repos/</span> and indexes AST into FalkorDB
                  </p>
                </div>
              </div>
              <button 
                onClick={() => !loading && setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
                disabled={loading}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>

            {/* Mode Switcher Tabs (Git Link vs Local PC) */}
            <div className="grid grid-cols-2 gap-1 bg-[#18181b] p-1 rounded-xl border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => { setAddMode('url'); setErrorMsg(''); }}
                className={`py-1.5 px-3 rounded-lg flex items-center justify-center space-x-1.5 font-medium transition ${
                  addMode === 'url'
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Link2 size={13} strokeWidth={1.8} />
                <span>Clone from Link</span>
              </button>
              <button
                type="button"
                onClick={() => { setAddMode('local'); setErrorMsg(''); }}
                className={`py-1.5 px-3 rounded-lg flex items-center justify-center space-x-1.5 font-medium transition ${
                  addMode === 'local'
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Folder size={13} strokeWidth={1.8} />
                <span>Local PC Folder</span>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitIngest} className="space-y-3.5 pt-1">
              {addMode === 'url' ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-zinc-300">
                    Git Repository URL
                  </label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://github.com/organization/repository.git"
                    required
                    disabled={loading}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-blue-500 font-mono transition"
                  />
                  <div className="text-[10px] text-zinc-500">
                    Supports any public GitHub, GitLab, or Git repository URL.
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-zinc-300">
                    Local Folder Path on PC
                  </label>
                  <input
                    type="text"
                    value={localPath}
                    onChange={(e) => handleLocalPathChange(e.target.value)}
                    placeholder="/Users/username/projects/my-repo or ./sample_fintech_repo"
                    required
                    disabled={loading}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-blue-500 font-mono transition"
                  />
                  <div className="text-[10px] text-zinc-500">
                    Absolute or relative path to an existing codebase on your machine.
                  </div>
                </div>
              )}

              {/* Repository / Tenant Identifier */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-300 flex items-center justify-between">
                  <span>Repository Identifier (FalkorDB Graph)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">repo:{tenantName || '...'}</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="e.g. my-service"
                    required
                    disabled={loading}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-blue-500 font-mono transition"
                  />
                </div>
                <div className="text-[10px] text-zinc-500">
                  Folder will be created at <code className="text-zinc-300 font-mono">./repos/{tenantName || 'your-repo'}</code>
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-xl text-[11px] text-red-300 flex items-center space-x-2 animate-in fade-in duration-100">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <span className="truncate">{errorMsg}</span>
                </div>
              )}

              {/* Success Message */}
              {successMsg && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-[11px] text-emerald-300 flex items-center space-x-2 animate-in fade-in duration-100">
                  <Check size={14} className="text-emerald-400 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !(addMode === 'url' ? repoUrl.trim() : localPath.trim())}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium text-white transition flex items-center space-x-1.5 shadow-sm ${
                    loading || !(addMode === 'url' ? repoUrl.trim() : localPath.trim())
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
                      : 'bg-blue-600 hover:bg-blue-500 active:scale-95 cursor-pointer'
                  }`}
                >
                  {loading ? (
                    <>
                      <RefreshCw size={12} className="animate-spin text-white" />
                      <span>Cloning & Indexing...</span>
                    </>
                  ) : (
                    <>
                      <GitBranch size={13} strokeWidth={1.8} />
                      <span>Clone & Index</span>
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </>
  );
}
