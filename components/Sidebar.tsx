import React from 'react';
import { GraphNode } from '../types';
import { X, Network, FileText, Tag, Hash } from 'lucide-react';

interface SidebarProps {
  node: GraphNode | null;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ node, onClose }) => {
  if (!node) return null;

  return (
    <div className="absolute inset-x-0 sm:inset-auto sm:right-8 bottom-8 z-30 flex justify-center sm:justify-end pointer-events-none">
      <div className="w-full max-w-md bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-6 pointer-events-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="inline-flex items-center gap-1 text-xs font-bold tracking-widest uppercase text-cyan-400 mb-1">
              <Tag className="w-3 h-3" />
              {node.type}
            </div>
            <h2 className="text-2xl font-semibold text-white leading-tight">{node.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-800/60 rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400 mb-2">
              <FileText className="w-4 h-4" />
              Description
            </div>
            <p className="text-slate-100 text-sm leading-relaxed">{node.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/60 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-[11px] uppercase font-semibold text-slate-400 mb-1">
                <Hash className="w-3 h-3" />
                Node ID
              </div>
              <p className="text-slate-200 text-xs font-mono truncate" title={node.id}>
                {node.id}
              </p>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-[11px] uppercase font-semibold text-slate-400 mb-2">
                <Network className="w-3 h-3" />
                Importance
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className={`h-1.5 flex-1 rounded-full ${
                      index < (node.val || 1) / 2 ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.7)]' : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
