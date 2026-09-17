#!/usr/bin/env node
/**
 * Benign weather MCP server fixture — network fetch only, no shell/fs write.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "weather-demo", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_weather",
      description: "Get the current weather for a city by name.",
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
        },
        required: ["city"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const city = String(request.params.arguments?.city ?? "");
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ city, tempC: 18, condition: "cloudy" }),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
