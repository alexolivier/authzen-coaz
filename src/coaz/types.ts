export interface CoazMapping {
  subject: Record<string, unknown>[];
  action?: Record<string, unknown>[];
  resource: Record<string, unknown>[];
  context: Record<string, unknown>[];
}

export interface CoazToolDefinition {
  name: string;
  coaz: true;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    "x-coaz-mapping": CoazMapping;
  };
}

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

export interface RegisteredTool {
  definition: CoazToolDefinition;
  handler: ToolHandler;
}
