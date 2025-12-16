import { GoogleGenAI, Type } from "@google/genai";
import { GraphData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractGraphFromMarkdown = async (markdownText: string): Promise<GraphData> => {
  const modelId = "gemini-2.5-flash"; // Fast and efficient for extraction

  const systemInstruction = `
    You are an expert Knowledge Graph Architect. 
    Your task is to analyze the provided text (Markdown format) and extract a knowledge graph consisting of distinct entities (nodes) and their relationships (edges).
    
    Rules:
    1. Identify key entities: People, Organizations, Locations, Concepts, Technologies, Events, etc.
    2. Consolidate synonyms (e.g., "Google", "Google Inc.", "The search giant" should be the same node ID).
    3. Create meaningful relationships between entities.
    4. Provide a brief, concise description for each entity based on the text.
    5. Categorize each entity into a broad 'type' (e.g., Person, Organization, Concept).
    6. Ensure the output is strictly valid JSON conforming to the schema.
    7. Limit the extraction to the most important 30-50 nodes to keep the visualization clean, unless the text is very dense with critical info.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Here is the markdown content to analyze:\n\n${markdownText}`,
      config: {
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