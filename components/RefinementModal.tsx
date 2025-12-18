import React from 'react';
import { Activity, CheckCircle, Zap, X, Network, Share2, Layers } from 'lucide-react';

export type RefinementState = 'PREPARING' | 'REFINING' | 'COMPLETED';

interface Stats {
    nodes: number;
    links: number;
    clusters: number;
}

interface AfterStats extends Stats {
    addedLinks: number;
}

interface RefinementModalProps {
    isOpen: boolean;
    state: RefinementState;
    beforeStats: Stats | null;
    afterStats: AfterStats | null;
    onClose: () => void;
}

const RefinementModal: React.FC<RefinementModalProps> = ({
    isOpen,
    state,
    beforeStats,
    afterStats,
    onClose,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Decorative Background Element */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />

                {/* Header */}
                <div className="p-6 flex justify-between items-center border-b border-white/5">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-cyan-500/10 rounded-lg">
                            <Zap className="w-5 h-5 text-cyan-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Graph Expert System</h2>
                    </div>
                    {state === 'COMPLETED' && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-8">
                    {state !== 'COMPLETED' ? (
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
                                <Activity className="absolute inset-0 m-auto w-8 h-8 text-cyan-400 animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-semibold text-slate-100">
                                    {state === 'PREPARING' ? 'Analyzing Graph Structure...' : 'Weaving Semantic Bridges...'}
                                </h3>
                                <p className="text-sm text-slate-400 max-w-xs mx-auto">
                                    {state === 'PREPARING'
                                        ? 'Determining connectivity and identifying isolated entity clusters.'
                                        : 'Gemini is evaluating relationships between clusters to propose high-quality connections.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-2xl font-bold text-white">Refinement Complete</h3>
                                    <p className="text-emerald-400/80 font-medium">
                                        Added {afterStats?.addedLinks} new semantic connections
                                    </p>
                                </div>
                            </div>

                            {/* Stats Comparison */}
                            <div className="grid grid-cols-3 gap-4">
                                <StatCard
                                    label="Nodes"
                                    before={beforeStats?.nodes ?? 0}
                                    after={afterStats?.nodes ?? 0}
                                    icon={<Network className="w-4 h-4" />}
                                />
                                <StatCard
                                    label="Links"
                                    before={beforeStats?.links ?? 0}
                                    after={afterStats?.links ?? 0}
                                    icon={<Share2 className="w-4 h-4" />}
                                    highlight={true}
                                />
                                <StatCard
                                    label="Clusters"
                                    before={beforeStats?.clusters ?? 0}
                                    after={afterStats?.clusters ?? 0}
                                    icon={<Layers className="w-4 h-4" />}
                                    inverse={true}
                                />
                            </div>

                            <button
                                onClick={onClose}
                                className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 transition-all active:scale-95"
                            >
                                Return to Nexus
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

interface StatCardProps {
    label: string;
    before: number;
    after: number;
    icon: React.ReactNode;
    highlight?: boolean;
    inverse?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, before, after, icon, highlight, inverse }) => {
    const isImproved = inverse ? after < before : after > before;
    const isStable = after === before;

    return (
        <div className={`p-4 rounded-2xl border ${highlight ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-white/5 border-white/5'} flex flex-col items-center space-y-2`}>
            <div className={`p-1.5 rounded-lg ${highlight ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}>
                {icon}
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">{label}</span>
            <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-white leading-none">{after}</span>
                {!isStable && (
                    <span className={`text-[10px] font-bold mt-1 ${isImproved ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isImproved ? '↑' : '↓'} {Math.abs(after - before)}
                    </span>
                )}
            </div>
        </div>
    );
};

export default RefinementModal;
