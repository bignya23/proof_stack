// src/components/ActivityBar.jsx
import React from 'react';
import { 
  FolderTree, GitPullRequest, Network, Database, 
  FolderGit2, Terminal, PanelLeftClose, PanelLeft
} from 'lucide-react';

export default function ActivityBar({
  activeView,
  setActiveView,
  isSidebarOpen,
  setIsSidebarOpen,
  isConsoleOpen,
  setIsConsoleOpen,
  evidenceCount = 0,
  hasPatch = false
}) {
  const navItems = [
    { id: 'explorer', label: 'Explorer', icon: FolderTree },
    { id: 'git', label: 'Source Control', icon: GitPullRequest, badge: hasPatch },
    { id: 'graph', label: 'Graph Navigator', icon: Network },
    { id: 'evidence', label: 'Evidence Registry', icon: Database, count: evidenceCount },
    { id: 'ingest', label: 'Ingestion', icon: FolderGit2 },
  ];

  const handleItemClick = (id) => {
    if (activeView === id && isSidebarOpen) {
      // Toggle sidebar if clicking active view
      setIsSidebarOpen(false);
    } else {
      setActiveView(id);
      setIsSidebarOpen(true);
    }
  };

  return (
    <aside className="w-12 bg-[#09090b] border-r border-zinc-800 flex flex-col items-center justify-between py-2 select-none z-20 shrink-0 font-sans">
      
      {/* Top Activity Icons (20px, 1.8 stroke width) */}
      <div className="flex flex-col items-center space-y-1 w-full">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id && isSidebarOpen;

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={`relative w-10 h-10 rounded-md flex items-center justify-center transition group ${
                isActive 
                  ? "text-zinc-100 bg-zinc-900" 
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50"
              }`}
              title={item.label}
            >
              {/* Active left indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r"></div>
              )}
              
              <Icon size={20} strokeWidth={1.8} />

              {/* Badge indicators */}
              {item.badge && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400 ring-2 ring-[#09090b]"></span>
              )}
              {item.count > 0 && (
                <span className="absolute bottom-1 right-1 text-[9px] font-sans px-1 rounded-full bg-zinc-900 text-zinc-200 border border-zinc-700 leading-none">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Controls (18px, 1.8 stroke width) */}
      <div className="flex flex-col items-center space-y-1 w-full">
        {/* Toggle Terminal / Console Drawer */}
        <button
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className={`w-10 h-10 rounded-md flex items-center justify-center transition ${
            isConsoleOpen 
              ? "text-zinc-100 bg-zinc-900" 
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50"
          }`}
          title={isConsoleOpen ? "Hide Terminal" : "Show Terminal"}
        >
          <Terminal size={18} strokeWidth={1.8} />
        </button>

        {/* Toggle Sidebar Collapse */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="w-10 h-10 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 transition"
          title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {isSidebarOpen ? (
            <PanelLeftClose size={18} strokeWidth={1.8} />
          ) : (
            <PanelLeft size={18} strokeWidth={1.8} />
          )}
        </button>
      </div>

    </aside>
  );
}
