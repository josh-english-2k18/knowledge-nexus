import { GraphData, GraphLink, GraphNode } from '../types';

export const getNodeId = (node: string | GraphNode): string => {
  if (typeof node === 'string') {
    return node;
  }
  return node.id;
};

export const buildLinkKey = (
  link: GraphLink | { source: string | GraphNode; target: string | GraphNode; relationship: string }
): string => {
  const sourceId = getNodeId(link.source);
  const targetId = getNodeId(link.target);
  return `${sourceId}__${link.relationship || ''}__${targetId}`;
};

export const createGraphExportSnapshot = (data: GraphData): GraphData => ({
  nodes: data.nodes.map(({ id, name, type, description, val, color }) => ({
    id,
    name,
    type,
    description,
    val,
    color,
  })),
  links: data.links.map((link) => ({
    relationship: link.relationship,
    source: getNodeId(link.source),
    target: getNodeId(link.target),
  })),
});

export const normalizeGraphPayload = (data: GraphData): GraphData => {
  const nodes = data.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    description: node.description,
    val: node.val ?? 1,
    color: node.color,
  }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const invalidLinks: Array<{ relationship: string; source: string; target: string }> = [];

  const links = data.links.reduce<GraphLink[]>((acc, link) => {
    const source = getNodeId(link.source);
    const target = getNodeId(link.target);
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      invalidLinks.push({
        relationship: link.relationship,
        source,
        target,
      });
      return acc;
    }

    acc.push({
      relationship: link.relationship,
      source,
      target,
    });
    return acc;
  }, []);

  if (invalidLinks.length) {
    console.warn(
      `[graph] Dropped ${invalidLinks.length} link${invalidLinks.length === 1 ? '' : 's'} referencing missing nodes.`,
      invalidLinks
    );
  }

  return { nodes, links };
};

export const isGraphDataShape = (payload: unknown): payload is GraphData => {
  if (!payload || typeof payload !== 'object') return false;
  const graph = payload as Partial<GraphData>;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.links)) return false;

  const nodesValid = graph.nodes.every(
    (node: any) =>
      node &&
      typeof node.id === 'string' &&
      typeof node.name === 'string' &&
      typeof node.type === 'string' &&
      typeof node.description === 'string'
  );

  const linksValid = graph.links.every(
    (link: any) =>
      link &&
      typeof link.relationship === 'string' &&
      (typeof link.source === 'string' || (link.source && typeof link.source.id === 'string')) &&
      (typeof link.target === 'string' || (link.target && typeof link.target.id === 'string'))
  );

  return nodesValid && linksValid;
};
