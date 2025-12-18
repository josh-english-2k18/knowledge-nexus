import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Activity, Plus, Info, Download, UploadCloud, Search, Sparkles } from 'lucide-react';
import UploadZone from './components/UploadZone';
import Graph3D from './components/Graph3D';
import Sidebar from './components/Sidebar';
import AnalysisChat, { Message } from './components/AnalysisChat';
import { extractGraphFromMarkdown } from './services/geminiService';
import { GraphData, GraphNode, GraphLink, AppState, ExtractionStats } from './types';
import {
  buildLinkKey,
  createGraphExportSnapshot,
  normalizeGraphPayload,
  isGraphDataShape,
  getNodeId,
} from './utils/graph';
import { GraphExpertSystem } from './services/graphOptimizerService';
import RefinementModal, { RefinementState } from './components/RefinementModal';

type QueryResult =
  | { kind: 'node'; node: GraphNode }
  | { kind: 'relationship'; link: GraphLink; source: GraphNode; target: GraphNode };

type ToastState = {
  type: 'success' | 'error' | 'info';
  message: string;
};

const MIN_QUERY_LENGTH = 2;

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState<ExtractionStats | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(() => new Set());
  const [highlightedLinkKeys, setHighlightedLinkKeys] = useState<Set<string>>(() => new Set());
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I analyzed your knowledge graph. Ask me about the connections, themes, or hidden patterns I found.' }
  ]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementModal, setRefinementModal] = useState<{
    isOpen: boolean;
    state: RefinementState;
    before: { nodes: number; links: number; clusters: number } | null;
    after: { nodes: number; links: number; clusters: number; addedLinks: number } | null;
  }>({
    isOpen: false,
    state: 'PREPARING',
    before: null,
    after: null,
  });
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeMap = useMemo(() => new Map(graphData.nodes.map((node) => [node.id, node])), [graphData]);
  const hasGraph = graphData.nodes.length > 0;

  const resetQueryState = () => {
    setQuery('');
    setQueryResults([]);
    setHighlightedNodeIds(new Set());
    setHighlightedLinkKeys(new Set());
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (selectedNode) {
      setSelectedNode(null);
    }
    if (highlightedNodeIds.size > 0) {
      setHighlightedNodeIds(new Set());
    }
    if (highlightedLinkKeys.size > 0) {
      setHighlightedLinkKeys(new Set());
    }
  };

  const applyGraphData = (rawData: GraphData, sourceLabel: string, processingTimeMs = 0) => {
    const normalized = normalizeGraphPayload(rawData);
    setGraphData(normalized);
    setStats({
      nodeCount: normalized.nodes.length,
      linkCount: normalized.links.length,
      processingTimeMs,
    });
    setCurrentFileName(sourceLabel);
    setSelectedNode(null);
    resetQueryState();
    setAppState(AppState.VISUALIZING);
  };

  const triggerToast = (type: ToastState['type'], message: string) => {
    setToast({ type, message });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const term = query.trim().toLowerCase();
    if (!term || term.length < MIN_QUERY_LENGTH || graphData.nodes.length === 0) {
      setQueryResults([]);
      return;
    }

    const nodeMatches = graphData.nodes.filter((node) =>
      [node.name, node.description, node.type, node.id].some((value) => value.toLowerCase().includes(term))
    );

    const relationshipMatches: Array<{ link: GraphLink; source: GraphNode; target: GraphNode }> = [];

    graphData.links.forEach((link) => {
      const sourceId = getNodeId(link.source);
      const targetId = getNodeId(link.target);
      const sourceNode = nodeMap.get(sourceId);
      const targetNode = nodeMap.get(targetId);
      if (!sourceNode || !targetNode) return;

      const relationshipText = link.relationship?.toLowerCase() || '';
      const sourceText = `${sourceNode.name} ${sourceNode.description}`.toLowerCase();
      const targetText = `${targetNode.name} ${targetNode.description}`.toLowerCase();

      if (relationshipText.includes(term) || sourceText.includes(term) || targetText.includes(term)) {
        relationshipMatches.push({
          link: {
            relationship: link.relationship,
            source: sourceId,
            target: targetId,
          },
          source: sourceNode,
          target: targetNode,
        });
      }
    });

    const limitedNodeMatches = nodeMatches.slice(0, 6);
    const limitedRelationshipMatches = relationshipMatches.slice(0, 6);

    const nextResults: QueryResult[] = [
      ...limitedNodeMatches.map((node) => ({ kind: 'node' as const, node })),
      ...limitedRelationshipMatches.map(({ link, source, target }) => ({
        kind: 'relationship' as const,
        link,
        source,
        target,
      })),
    ];

    setQueryResults(nextResults);
  }, [query, graphData, nodeMap]);

  const handleFileLoad = async (content: string, fileName: string) => {
    setAppState(AppState.PARSING);
    const startTime = performance.now();

    try {
      const data = await extractGraphFromMarkdown(content);
      const endTime = performance.now();
      applyGraphData(data, fileName, Math.round(endTime - startTime));
      triggerToast('success', `Graph extracted from ${fileName}`);
    } catch (e) {
      console.error(e);
      triggerToast('error', 'Unable to extract graph from the provided file.');
      setAppState(AppState.ERROR);
    }
  };

  const handleRefineGraph = async () => {
    if (!hasGraph || isRefining) return;

    setIsRefining(true);

    // Initial stats before refinement
    const initialClusters = GraphExpertSystem.findDisconnectedComponents(graphData);
    const before = {
      nodes: graphData.nodes.length,
      links: graphData.links.length,
      clusters: initialClusters.length,
    };

    setRefinementModal({
      isOpen: true,
      state: 'PREPARING',
      before,
      after: null,
    });

    let refiningTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      // Transition to refining state shortly after
      refiningTimeout = setTimeout(() => {
        setRefinementModal(prev => {
          if (prev.state === 'PREPARING') {
            return { ...prev, state: 'REFINING' };
          }
          return prev;
        });
      }, 800);

      const result = await GraphExpertSystem.unifyGraph(graphData);

      const after = {
        nodes: result.unifiedData.nodes.length,
        links: result.unifiedData.links.length,
        clusters: result.clustersCount,
        addedLinks: result.addedLinksCount,
      };

      if (result.addedLinksCount > 0) {
        setGraphData(result.unifiedData);
        // Issue 4: Node/link counters never update after refinement
        setStats(prev => prev ? {
          ...prev,
          nodeCount: result.unifiedData.nodes.length,
          linkCount: result.unifiedData.links.length,
        } : null);
      }

      if (refiningTimeout) clearTimeout(refiningTimeout);

      setRefinementModal(prev => ({
        ...prev,
        state: 'COMPLETED',
        after,
      }));

    } catch (error) {
      if (refiningTimeout) clearTimeout(refiningTimeout);
      console.error('Refinement failed', error);
      triggerToast('error', 'Failed to refine the graph.');
      setRefinementModal(prev => ({ ...prev, isOpen: false }));
    } finally {
      setIsRefining(false);
    }
  };

  const handleReset = () => {
    setAppState(AppState.IDLE);
    setGraphData({ nodes: [], links: [] });
    setSelectedNode(null);
    setStats(null);
    setCurrentFileName('');
    resetQueryState();
    setChatMessages([
      { role: 'model', text: 'Hello! I analyzed your knowledge graph. Ask me about the connections, themes, or hidden patterns I found.' }
    ]);
  };

  const handleExportGraph = () => {
    if (!graphData.nodes.length) {
      triggerToast('error', 'No graph data available to export.');
      return;
    }

    const snapshot = createGraphExportSnapshot(graphData);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = currentFileName?.trim().replace(/\s+/g, '-') || 'knowledge-nexus-graph';
    const downloadName = `${safeName}-${timestamp}.json`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(link.href);
    triggerToast('success', 'Graph saved as JSON.');
  };

  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result;
        if (typeof text !== 'string') {
          throw new Error('Unable to read file contents.');
        }
        const parsed = JSON.parse(text);
        if (!isGraphDataShape(parsed)) {
          throw new Error('Invalid graph schema.');
        }
        applyGraphData(parsed, file.name.replace(/\.[^/.]+$/, ''), 0);
        triggerToast('success', `Loaded graph from ${file.name}`);
      } catch (error) {
        console.error('Graph import failed', error);
        triggerToast('error', 'Unable to load the selected JSON graph.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleJsonPicker = () => {
    jsonInputRef.current?.click();
  };

  const handleQuerySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (queryResults.length === 0) {
      return;
    }
    handleResultSelect(queryResults[0]);
  };

  const handleResultSelect = (result: QueryResult) => {
    if (result.kind === 'node') {
      setSelectedNode(result.node);
      setHighlightedNodeIds(new Set([result.node.id]));
      setHighlightedLinkKeys(new Set());
    } else {
      setSelectedNode(result.source);
      const nodeHighlights = new Set<string>([result.source.id, result.target.id]);
      setHighlightedNodeIds(nodeHighlights);
      setHighlightedLinkKeys(new Set([buildLinkKey(result.link)]));
    }
  };

  const handleQueryClear = () => {
    handleQueryChange('');
    setQueryResults([]);
  };

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden text-slate-100">

      {/* Background Ambience */}
      {appState === AppState.IDLE && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px]" />
          <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[100px]" />
        </div>
      )}

      {/* Navigation Header */}
      <nav className="absolute top-0 left-0 right-0 z-30 p-6 flex justify-between items-center pointer-events-none">
        <div className="flex items-center space-x-3 pointer-events-auto group">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full group-hover:bg-cyan-500/40 transition-all duration-500" />
            <div className="relative bg-slate-900/80 backdrop-blur-xl border border-white/10 p-2 rounded-xl shadow-2xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
                <path d="M12 2L4 7V17L12 22L20 17V7L12 2Z" stroke="url(#logo-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" fill="url(#logo-grad)" />
                <path d="M12 2V7M12 22V17M4 7L8.5 9.5M20 7L15.5 9.5M4 17L8.5 14.5M20 17L15.5 14.5" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" />
                <defs>
                  <linearGradient id="logo-grad" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#22d3ee" />
                    <stop offset="1" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight flex items-center leading-none">
              <span className="text-slate-100">Knowledge</span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 ml-1 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">Nexus</span>
            </h1>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1 opacity-70 group-hover:opacity-100 group-hover:text-cyan-400 transition-all duration-300">
              AI Graph Reasoning
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-4 pointer-events-auto">
          {appState === AppState.VISUALIZING && (
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-xs text-slate-400 font-medium tracking-wide">
                {stats?.nodeCount} NODES • {stats?.linkCount} LINKS
              </span>
              <span className="text-[10px] text-slate-500 uppercase truncate max-w-[200px]">
                {currentFileName || 'Session'}
              </span>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <button
              onClick={handleJsonPicker}
              className="flex items-center space-x-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-4 py-2 rounded-lg border border-white/10 transition-all"
            >
              <UploadCloud className="w-4 h-4" />
              <span className="text-sm font-medium">Load JSON</span>
            </button>
            <button
              onClick={handleExportGraph}
              disabled={!hasGraph}
              className="flex items-center space-x-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-4 py-2 rounded-lg border border-white/10 transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium">Save JSON</span>
            </button>
            {appState === AppState.VISUALIZING && (
              <>
                <button
                  onClick={() => setIsChatOpen(true)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all border ${isChatOpen
                    ? 'bg-cyan-500 text-white border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-white/10'
                    }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-medium">AI Chat</span>
                </button>
                <button
                  onClick={handleRefineGraph}
                  disabled={isRefining}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all border ${isRefining
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-white/10'
                    } disabled:opacity-50`}
                >
                  <Activity className={`w-4 h-4 ${isRefining ? 'animate-spin' : ''}`} />
                  <span className="text-sm font-medium">{isRefining ? 'Refining...' : 'Refine Graph'}</span>
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg transition-all border border-slate-700 hover:border-slate-500"
                >
                  <Plus className="w-4 h-4 rotate-45" />
                  <span className="text-sm font-medium">New Graph</span>
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleJsonFileChange}
      />

      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg text-sm font-medium shadow-xl ${toast.type === 'error'
            ? 'bg-red-500/90 text-white'
            : toast.type === 'success'
              ? 'bg-emerald-500/90 text-white'
              : 'bg-slate-700/90 text-slate-100'
            }`}
        >
          {toast.message}
        </div>
      )}

      {/* Main Content Area */}
      <main className="w-full h-full relative flex items-center justify-center">

        {/* State: IDLE / PARSING */}
        {(appState === AppState.IDLE || appState === AppState.PARSING) && (
          <div className="z-20 w-full px-4 animate-in fade-in zoom-in duration-500">
            <div className="text-center mb-10">
              <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
                Visualize Your Knowledge
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                Transform flat markdown files into deep, interactive 3D constellations of entities and relationships using advanced AI.
              </p>
            </div>
            <UploadZone
              onFileLoaded={handleFileLoad}
              isLoading={appState === AppState.PARSING}
            />
          </div>
        )}

        {/* State: ERROR */}
        {appState === AppState.ERROR && (
          <div className="z-20 text-center p-8 bg-red-950/20 border border-red-500/30 rounded-2xl backdrop-blur-sm animate-in fade-in zoom-in">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold text-red-400 mb-2">Extraction Failed</h3>
            <p className="text-red-200/60 max-w-md mx-auto">
              We encountered an issue processing your file. Please check if the file is valid markdown and try again.
            </p>
          </div>
        )}

        {/* State: VISUALIZING */}
        {appState === AppState.VISUALIZING && (
          <div className="absolute inset-0 animate-in fade-in duration-1000">
            <Graph3D
              data={graphData}
              onNodeClick={setSelectedNode}
              highlightedNodeIds={highlightedNodeIds}
              highlightedLinkKeys={highlightedLinkKeys}
              selectedNodeId={selectedNode?.id ?? null}
            />

            {/* Overlay Info Tip */}
            {!selectedNode && (
              <div className="absolute bottom-10 right-10 max-w-xs bg-slate-900/50 backdrop-blur-md p-4 rounded-xl border border-white/5 text-sm text-slate-400 pointer-events-none hidden md:block">
                <div className="flex items-center space-x-2 mb-2 text-cyan-400">
                  <Info className="w-4 h-4" />
                  <span className="font-bold uppercase text-xs">Navigation</span>
                </div>
                <ul className="space-y-1 text-xs">
                  <li>• Left Click + Drag to Rotate</li>
                  <li>• Right Click + Drag to Pan</li>
                  <li>• Scroll to Zoom</li>
                  <li>• Click Node for Details</li>
                </ul>
              </div>
            )}

            <div className="absolute bottom-4 left-0 right-0 px-4 md:px-16 z-30">
              <div className="max-w-4xl mx-auto bg-slate-900/85 backdrop-blur-xl border border-white/5 rounded-2xl p-4 shadow-2xl">
                <form onSubmit={handleQuerySubmit} className="flex items-center space-x-3">
                  <div className="flex items-center flex-1 bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2">
                    <Search className="w-4 h-4 text-slate-500 mr-3" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => handleQueryChange(e.target.value)}
                      placeholder="Search nodes or relationships (e.g., Apollo, founded, San Francisco)..."
                      className="bg-transparent flex-1 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
                    />
                  </div>
                  {query && (
                    <button
                      type="button"
                      onClick={handleQueryClear}
                      className="text-xs uppercase tracking-wide text-slate-400 hover:text-slate-100 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="submit"
                    className="hidden"
                    aria-hidden="true"
                  >
                    Search
                  </button>
                </form>

                {query && (
                  <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-white/5">
                    {queryResults.length === 0 && (
                      <div className="py-3 text-sm text-slate-500 text-center">No matches found.</div>
                    )}
                    {queryResults.map((result, index) => (
                      <button
                        key={`${result.kind}-${result.kind === 'node' ? result.node.id : buildLinkKey(result.link)}-${index}`}
                        type="button"
                        onClick={() => handleResultSelect(result)}
                        className="w-full text-left py-2 flex items-center justify-between hover:bg-white/5 px-3 rounded-lg transition-colors"
                      >
                        {result.kind === 'node' ? (
                          <>
                            <div>
                              <p className="text-sm font-semibold text-slate-100">{result.node.name}</p>
                              <p className="text-xs uppercase tracking-wide text-slate-500">{result.node.type}</p>
                            </div>
                            <span className="text-[10px] text-slate-500">Node</span>
                          </>
                        ) : (
                          <>
                            <div>
                              <p className="text-sm font-semibold text-slate-100">
                                {result.source.name}
                                <span className="text-slate-500"> — {result.link.relationship} → </span>
                                {result.target.name}
                              </p>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Relationship</p>
                            </div>
                            <span className="text-[10px] text-slate-500">Link</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sidebar for Node Details */}
        <Sidebar
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />

        {/* AI Chat Interface */}
        {isChatOpen && appState === AppState.VISUALIZING && (
          <AnalysisChat
            graphData={graphData}
            messages={chatMessages}
            onMessagesChange={setChatMessages}
            onClose={() => setIsChatOpen(false)}
          />
        )}

        <RefinementModal
          isOpen={refinementModal.isOpen}
          state={refinementModal.state}
          beforeStats={refinementModal.before}
          afterStats={refinementModal.after}
          onClose={() => setRefinementModal(prev => ({ ...prev, isOpen: false }))}
        />

      </main>
    </div>
  );
};

export default App;
