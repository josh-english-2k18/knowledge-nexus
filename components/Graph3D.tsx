import React, { useMemo, useRef, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { GraphData, GraphNode } from '../types';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { buildLinkKey } from '../utils/graph';

interface Graph3DProps {
  data: GraphData;
  onNodeClick: (node: GraphNode) => void;
  highlightedNodeIds?: Set<string>;
  highlightedLinkKeys?: Set<string>;
  selectedNodeId?: string | null;
}

const Graph3D: React.FC<Graph3DProps> = ({
  data,
  onNodeClick,
  highlightedNodeIds = new Set<string>(),
  highlightedLinkKeys = new Set<string>(),
  selectedNodeId = null,
}) => {
  const graphRef = useRef<any>(null);
  const labelCache = useRef<Map<string, SpriteText>>(new Map());
  const lastFocusedNodeIdRef = useRef<string | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);

  // Auto-color generation based on node types
  const typeColorMap = useMemo(() => {
    const types = new Set(data.nodes.map((n) => n.type));
    const colors = [
      '#22d3ee', // Cyan
      '#a855f7', // Purple
      '#f472b6', // Pink
      '#34d399', // Emerald
      '#fbbf24', // Amber
      '#f87171', // Red
      '#60a5fa', // Blue
    ];
    const map = new Map<string, string>();
    Array.from(types).forEach((t, i) => {
      map.set(t as string, colors[i % colors.length]);
    });
    return map;
  }, [data]);

  const disposeLabel = (label: SpriteText) => {
    const material = label.material as THREE.Material;
    material.dispose?.();
    label.geometry?.dispose?.();
  };

  useEffect(() => {
    // Initial force tuning
    if (graphRef.current) {
      const chargeForce = graphRef.current.d3Force('charge');
      if (chargeForce && typeof chargeForce.strength === 'function') {
        chargeForce.strength(-140);
      }
      const linkForce = graphRef.current.d3Force('link');
      if (linkForce && typeof linkForce.distance === 'function') {
        linkForce.distance(() => 55);
      }
    }
  }, []);

  useEffect(() => {
    if (!graphRef.current || data.nodes.length === 0) {
      return;
    }
    const graph = graphRef.current;
    const timeout = setTimeout(() => {
      try {
        graph.zoomToFit(1000, 100);
      } catch {
        // zoomToFit can throw if the scene isn't ready yet; ignore
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [data.nodes.length]);

  useEffect(() => {
    const validIds = new Set(data.nodes.map((node) => node.id));
    labelCache.current.forEach((label, nodeId) => {
      if (!validIds.has(nodeId)) {
        disposeLabel(label);
        labelCache.current.delete(nodeId);
      }
    });
  }, [data.nodes]);

  useEffect(() => {
    return () => {
      labelCache.current.forEach((label) => disposeLabel(label));
      labelCache.current.clear();
    };
  }, []);

  const hasLinkHighlight = highlightedLinkKeys.size > 0;

  const updateLabelAppearance = (node: GraphNode, label: SpriteText) => {
    const isHighlighted = highlightedNodeIds.has(node.id);
    label.text = node.name || '';
    label.textHeight = isHighlighted ? 5 : 3.6;
    label.color = isHighlighted ? '#fbbf24' : '#f8fafc';
    const spriteMaterial = label.material as THREE.SpriteMaterial;
    spriteMaterial.opacity = isHighlighted ? 1 : 0.9;
    const base = (node.val || 1) * 1.5;
    const nodeScale = isHighlighted ? base * 1.3 : base;
    const offset = Math.cbrt(nodeScale) * 5.5;
    label.position.set(0, offset, 0);
  };

  const getNodeLabel = (node: GraphNode) => {
    let label = labelCache.current.get(node.id);
    if (!label) {
      label = new SpriteText(node.name || '');
      label.center.set(0.5, 0);
      const material = label.material as THREE.SpriteMaterial;
      material.depthTest = false;
      material.depthWrite = false;
      material.transparent = true;
      material.opacity = 0.9;
      label.onBeforeRender = () => {
        const fg = graphRef.current;
        if (!fg) return;
        const camera = typeof fg.camera === 'function' ? fg.camera() : fg.camera;
        if (camera?.quaternion) {
          label!.quaternion.copy(camera.quaternion);
        }
      };
      labelCache.current.set(node.id, label);
    }
    updateLabelAppearance(node, label);
    return label;
  };

  useEffect(() => {
    data.nodes.forEach((node) => {
      const label = labelCache.current.get(node.id);
      if (label) {
        updateLabelAppearance(node, label);
      }
    });
  }, [data.nodes, highlightedNodeIds]);

  useEffect(() => {
    if (!selectedNodeId) {
      pendingFocusIdRef.current = null;
      lastFocusedNodeIdRef.current = null;
      return;
    }
    if (!graphRef.current || lastFocusedNodeIdRef.current === selectedNodeId) {
      return;
    }

    pendingFocusIdRef.current = selectedNodeId;
    let rafId: number | null = null;

    const attemptFocus = () => {
      if (!graphRef.current || pendingFocusIdRef.current !== selectedNodeId) {
        return;
      }

      const graphInstance = graphRef.current;
      const graphData =
        typeof graphInstance.graphData === 'function' ? graphInstance.graphData() : graphInstance.graphData;
      const nodes: Array<GraphNode & { x?: number; y?: number; z?: number }> = graphData?.nodes || [];
      const targetNode = nodes.find((node) => node.id === selectedNodeId);
      if (!targetNode) {
        pendingFocusIdRef.current = null;
        return;
      }

      const hasCoords =
        typeof targetNode.x === 'number' &&
        typeof targetNode.y === 'number' &&
        typeof targetNode.z === 'number' &&
        Number.isFinite(targetNode.x) &&
        Number.isFinite(targetNode.y) &&
        Number.isFinite(targetNode.z);

      if (!hasCoords) {
        rafId = requestAnimationFrame(attemptFocus);
        return;
      }

      const x = targetNode.x as number;
      const y = targetNode.y as number;
      const z = targetNode.z as number;
      const distance = 40;
      const magnitude = Math.max(Math.hypot(x, y, z), 1);
      const distRatio = 1 + distance / magnitude;

      try {
        graphInstance.cameraPosition(
          { x: x * distRatio, y: y * distRatio, z: z * distRatio },
          { x, y, z },
          2000
        );
        lastFocusedNodeIdRef.current = selectedNodeId;
        pendingFocusIdRef.current = null;
      } catch (error) {
        console.warn('graph: unable to focus node', error);
      }
    };

    attemptFocus();

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [selectedNodeId]);

  return (
    <div className="w-full h-full absolute inset-0 bg-slate-950 cursor-move">
      <ForceGraph3D
        ref={graphRef}
        graphData={data}
        nodeLabel={(node: GraphNode) => `${node.name}\n${node.type}`}
        nodeColor={(node: any) => (highlightedNodeIds.has(node.id) ? '#fbbf24' : typeColorMap.get(node.type) || '#cbd5e1')}
        nodeVal={(node: any) => {
          const base = (node.val || 1) * 1.5;
          return highlightedNodeIds.has(node.id) ? base * 1.3 : base;
        }} // Scale node size
        nodeResolution={16}
        nodeOpacity={0.95}
        nodeThreeObject={(node: any) => getNodeLabel(node as GraphNode)}
        nodeThreeObjectExtend
        
        linkColor={(link: any) => {
          const key = buildLinkKey(link);
          if (hasLinkHighlight) {
            return highlightedLinkKeys.has(key) ? '#fbbf24' : '#1f2937';
          }
          return '#475569';
        }}
        linkWidth={(link: any) => (hasLinkHighlight && highlightedLinkKeys.has(buildLinkKey(link)) ? 2 : 0.5)}
        linkOpacity={(link: any) => {
          if (!hasLinkHighlight) return 0.3;
          return highlightedLinkKeys.has(buildLinkKey(link)) ? 0.9 : 0.05;
        }}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.005}
        
        backgroundColor="#020617"
        showNavInfo={false}
        
        onNodeClick={(node) => {
          // Aim at node from outside it
          const distance = 40;
          const magnitude = Math.max(Math.hypot(node.x, node.y, node.z), 1);
          const distRatio = 1 + distance / magnitude;

          if (graphRef.current) {
            graphRef.current.cameraPosition(
              { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
              { x: node.x, y: node.y, z: node.z }, // lookAt ({ x, y, z })
              3000  // ms transition duration
            );
            lastFocusedNodeIdRef.current = node.id;
          }
          onNodeClick(node as GraphNode);
        }}
        
        onBackgroundClick={() => {
            // Optional: Deselect or reset view
        }}
      />
      
      <div className="absolute bottom-6 left-6 pointer-events-none">
         <div className="flex flex-col space-y-2">
            {Array.from(typeColorMap.entries()).map(([type, color]) => (
                <div key={type} className="flex items-center space-x-2 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-full border border-white/5">
                    <span className="w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: color, color: color }}></span>
                    <span className="text-xs text-slate-300 font-medium">{type}</span>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
};

const propsAreEqual = (prev: Graph3DProps, next: Graph3DProps) =>
  prev.data === next.data &&
  prev.onNodeClick === next.onNodeClick &&
  prev.highlightedNodeIds === next.highlightedNodeIds &&
  prev.highlightedLinkKeys === next.highlightedLinkKeys &&
  prev.selectedNodeId === next.selectedNodeId;

export default React.memo(Graph3D, propsAreEqual);
