import { GraphData, GraphLink } from '../types';
import { findBridgesBetweenClusters } from './geminiService';
import { getNodeId } from '../utils/graph';

export interface ValidationReport {
    isValid: boolean;
    issues: string[];
}

export class GraphExpertSystem {
    /**
     * Performs structural validation on the graph.
     */
    static validateGraph(data: GraphData): ValidationReport {
        const issues: string[] = [];
        const nodeIds = new Set(data.nodes.map(n => n.id));

        data.links.forEach((link, index) => {
            const sourceId = getNodeId(link.source);
            const targetId = getNodeId(link.target);

            if (!nodeIds.has(sourceId)) {
                issues.push(`Link ${index} references non-existent source: ${sourceId}`);
            }
            if (!nodeIds.has(targetId)) {
                issues.push(`Link ${index} references non-existent target: ${targetId}`);
            }
        });

        return {
            isValid: issues.length === 0,
            issues
        };
    }

    /**
     * Finds sets of connected node IDs (clusters).
     */
    static findDisconnectedComponents(data: GraphData): string[][] {
        const parent = new Map<string, string>();

        const find = (id: string): string => {
            if (!parent.has(id)) {
                parent.set(id, id);
                return id;
            }
            if (parent.get(id) === id) return id;
            const root = find(parent.get(id)!);
            parent.set(id, root);
            return root;
        };

        const union = (id1: string, id2: string) => {
            const root1 = find(id1);
            const root2 = find(id2);
            if (root1 !== root2) {
                parent.set(root1, root2);
            }
        };

        // Initialize all nodes
        data.nodes.forEach(n => find(n.id));

        // Perform unions based on links
        data.links.forEach(link => {
            union(getNodeId(link.source), getNodeId(link.target));
        });

        // Group by root
        const clustersMap = new Map<string, string[]>();
        data.nodes.forEach(n => {
            const root = find(n.id);
            if (!clustersMap.has(root)) {
                clustersMap.set(root, []);
            }
            clustersMap.get(root)!.push(n.id);
        });

        return Array.from(clustersMap.values());
    }

    /**
     * Orchestrates the unification of the graph.
     */
    static async unifyGraph(data: GraphData): Promise<{
        unifiedData: GraphData;
        addedLinksCount: number;
        clustersCount: number;
        validation: ValidationReport;
    }> {
        const validation = this.validateGraph(data);
        const clusters = this.findDisconnectedComponents(data);

        if (clusters.length <= 1) {
            return {
                unifiedData: data,
                addedLinksCount: 0,
                clustersCount: clusters.length,
                validation
            };
        }

        // Call Gemini to find bridges
        const newLinks = await findBridgesBetweenClusters(data, clusters);

        // Merge new links, ensuring we don't duplicate existing ones
        const existingLinkKeys = new Set(data.links.map(l =>
            `${getNodeId(l.source)}|${getNodeId(l.target)}|${l.relationship}`
        ));

        const finalLinks = [...data.links];
        let addedCount = 0;

        newLinks.forEach(link => {
            const key = `${link.source}|${link.target}|${link.relationship}`;
            if (!existingLinkKeys.has(key)) {
                finalLinks.push(link);
                addedCount++;
            }
        });

        return {
            unifiedData: {
                ...data,
                links: finalLinks
            },
            addedLinksCount: addedCount,
            clustersCount: clusters.length,
            validation
        };
    }
}
