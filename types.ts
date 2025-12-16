export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string;
  val?: number; // Used by force-graph for size
  color?: string;
}

export interface GraphLink {
  source: string | GraphNode; // force-graph mutates this to object
  target: string | GraphNode; // force-graph mutates this to object
  relationship: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export enum AppState {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  VISUALIZING = 'VISUALIZING',
  ERROR = 'ERROR'
}

export interface ExtractionStats {
  nodeCount: number;
  linkCount: number;
  processingTimeMs: number;
}