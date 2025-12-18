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
      setTimeout(() => setAppState(AppState.IDLE), 4000);
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
        <div className="flex items-center space-x-3 pointer-events-auto">
          <div className="bg-gradient-to-br from-cyan-400 to-blue-600 p-2 rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.4)]">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Knowledge<span className="text-cyan-400">Nexus</span>
          </h1>
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

      </main>
    </div>
  );
};

export default App;
