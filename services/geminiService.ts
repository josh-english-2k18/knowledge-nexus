import { GoogleGenAI, Type } from "@google/genai";
import { GraphData, GraphLink } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractGraphFromMarkdown = async (markdownText: string): Promise<GraphData> => {
  const modelId = "gemini-3-flash-preview"; // Using the search-identified ID

  const systemInstruction = `
    You are a visionary Knowledge Graph Architect and Expert Data Scientist.
    Your task is to conduct a deep, sophisticated analysis of the provided text (Markdown format) to construct a brilliant and comprehensive knowledge graph.
    
    The goal is NOT just to extract surface-level nouns, but to map the *intellectual structure* of the specific domain.
    
    Rules for Execution:
    1. **Deep Extraction**: Identify ALL relevant entities including People, Organizations, Locations, but also abstract Concepts, Philosophies, Technologies, Events, and mental models.
    2. **Latent Relationships**: Look for indirect links, thematic connections, and causal chains. If A influences B which implies C, capture those nuances.
    3. **No Artificial Limits**: Do NOT limit the graph to a small number of nodes. The graph should be as large and detailed as necessary to fully represent the richness of the text. Biased towards high granularity and completeness.
    4. **Smart Consolidation**: Intelligently merge synonyms and pronouns (e.g., "The Giant" referring to "Google" contextually) but preserve distinct nuances where appropriate.
    5. **Categorical Precision**: Use precise node types. Instead of just 'Concept', use 'Algorithm', 'Paradigm', 'Metric', etc. where possible.
    6. **Strict JSON**: The output must be strictly valid JSON conforming to the schema.
    7. **QUANTITY TARGET**: Aim for 50-100+ nodes for any text of reasonable length. Do NOT summarize or simplify. Be EXHAUSTIVE.
    
    Reasoning Level: HIGH.
    Biases: Completeness, Connectivity, Insight.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Here is the markdown content to analyze:\n\n${markdownText}`,
      config: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: "HIGH" as any },
        maxOutputTokens: 65536,
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              description: "List of unique entities identified in the text.",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Unique identifier for the node (snake_case)." },
                  name: { type: Type.STRING, description: "Display name of the entity." },
                  type: { type: Type.STRING, description: "Category of the entity (Person, Location, Concept, etc.)." },
                  description: { type: Type.STRING, description: "Short description of the entity context." },
                  importance: { type: Type.NUMBER, description: "A number 1-10 indicating importance, used for visualization sizing." }
                },
                required: ["id", "name", "type", "description", "importance"]
              }
            },
            links: {
              type: Type.ARRAY,
              description: "List of relationships between entities.",
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING, description: "ID of the source node." },
                  target: { type: Type.STRING, description: "ID of the target node." },
                  relationship: { type: Type.STRING, description: "Label of the relationship (e.g., 'founded', 'located_in')." }
                },
                required: ["source", "target", "relationship"]
              }
            }
          },
          required: ["nodes", "links"]
        }
      }
    });

    if (!response.text) {
      throw new Error("No response from Gemini.");
    }

    const rawData = JSON.parse(response.text);

    // Map to our internal types and ensure numeric values for visualization
    const nodes = rawData.nodes.map((n: any) => ({
      ...n,
      val: n.importance || 1 // Map importance to val for force-graph node size
    }));

    return {
      nodes: nodes,
      links: rawData.links
    };

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw new Error("Failed to extract graph data from the provided text.");
  }
};

export const chatWithGraph = async (message: string, graphData: GraphData): Promise<string> => {
  const modelId = "gemini-3-flash-preview";

  // Optimize graph context to be more token-efficient
  const nodesContext = graphData.nodes.map(n =>
    `${n.id}|${n.name}|${n.type}|${n.description?.slice(0, 100) || ''}`
  ).join('\n');

  const linksContext = graphData.links.map(l =>
    `${l.source}->${l.target}|${l.relationship}`
  ).join('\n');

  // We move the heavyweight context to the user message to avoid system instruction limits
  // and better manage token usage.
  const contextPrompt = `
    Context Data:
    [Nodes format: id|name|type|description]
    ${nodesContext}
    
    [Links format: source->target|relationship]
    ${linksContext}
    
    User Query: ${message}
  `;

  const systemInstruction = `
    You are an intelligent Graph Analyst. 
    Use the provided "Context Data" (nodes and links) to answer the "User Query".
    - Nodes are listed as: id|name|type|description
    - Links are listed as: source->target|relationship
    - Answer based ONLY on the provided graph context.
    - Be concise and conversational.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: contextPrompt,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { includeThoughts: false, thinkingLevel: "HIGH" as any },
      }
    });

    return response.text || "I was unable to generate a response.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw new Error("Failed to communicate with the graph intelligence.");
  }
};

export const findBridgesBetweenClusters = async (graphData: GraphData, clusters: string[][]): Promise<GraphLink[]> => {
  const modelId = "gemini-3-flash-preview";

  // Prepare a condensed version of the graph for context
  const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));

  // We'll describe the clusters to Gemini
  const clusterDecriptions = clusters.map((ids, index) => {
    const nodesInCluster = ids.map(id => {
      const n = nodeMap.get(id);
      return n ? `${n.id} (${n.name}: ${n.type})` : id;
    }).join(', ');
    return `Cluster ${index + 1}: [${nodesInCluster}]`;
  }).join('\n\n');

  const systemInstruction = `
    You are an Expert Graph Architect. Your task is to analyze multiple "Clusters" of nodes from a knowledge graph and propose logical, semantic "Links" to connect them into a unified, professional-quality graph.
    
    Rules:
    1. **Semantic Relevance**: Only propose links that make sense based on the entity names and types.
    2. **Strategic Bridging**: Aim to connect smaller clusters or orphaned nodes to the main cluster(s).
    3. **Relationship Quality**: Use descriptive relationship labels (e.g., "collaborates_with", "part_of", "influenced_by").
    4. **Format**: Return a JSON array of links. Each link must have "source", "target", and "relationship".
    5. **Source/Target**: Use the EXACT "id" strings provided in the clusters.
    6. **Minimize Fluff**: Do not add redundant links. Only provide the most impactul connections to achieve graph unity.
  `;

  const prompt = `
    Here are the clusters of nodes that are currently disconnected in my graph:
    
    ${clusterDecriptions}
    
    Please provide the bridging links as a JSON array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              source: { type: Type.STRING },
              target: { type: Type.STRING },
              relationship: { type: Type.STRING }
            },
            required: ["source", "target", "relationship"]
          }
        }
      }
    });

    if (!response.text) return [];
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Gemini Bridging Error:", error);
    return []; // Return empty on error to fail gracefully
  }
};