import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BoardStore } from "./store.js";
import {
  boardIdSchema,
  elementsSchema,
  framesSchema,
  titleSchema,
  type Board,
  type Element,
} from "./model.js";
import {
  compileDiagram,
  compileStory,
  diagramSchema,
  storySchema,
} from "./layout.js";

export const RESOURCE_URI = "ui://whiteboard/canvas-v1.html";
export const GUIDE = `Whiteboard turns ideas into editable diagrams and visual stories.
Choose create_diagram for flowcharts, architecture, relationships, and processes. Supply nodes and edges; automatic layout handles spacing and routing. Use 3–8 nodes per board where possible, short labels, and LR for a process or TB for a hierarchy.
Choose create_story for explanations, journeys, timelines, before/after narratives. Use 2–8 steps, one idea per step: setup, change, consequence, takeaway. Users can step through frames and edit everything.
Choose create_view for custom visual compositions. It accepts a JSON array string of Excalidraw skeletons, following the excalidraw/excalidraw-mcp convention. Supported types: rectangle, ellipse, diamond, text, arrow, line, freedraw. Each needs unique id, type, x, y; shapes need width/height. Text needs text/fontSize. Lines need points [[dx,dy],...]. Labels: {text,fontSize:20,fontFamily:2}. Arrow connections: start:{id:'source'}, end:{id:'target'}, endArrowhead:'arrow'. Use backgroundColor, strokeColor, fillStyle:'solid', roughness:0.7. Camera pseudo-elements/checkpoints are not supported here; use optional named frames with elementIds instead.
Example: [{"id":"idea","type":"rectangle","x":60,"y":80,"width":220,"height":100,"backgroundColor":"#e2eff5","label":{"text":"An idea","fontSize":20}}]
Visual craft: establish a clear reading order, generous whitespace, dark readable text, 18–24px labels, and at most 3 semantic colors. Blue=input, green=outcome, amber=decision, rose=problem. Favor explanation over decoration. Never invent factual claims to fill a diagram.
Refinement: read_board FIRST to obtain the latest revision and user's edits. Then update_board with the complete revised elements and expectedRevision. A conflict means read again and merge, never overwrite blindly. Keep stable IDs. Frames must reference existing element IDs. The widget lets users save manual edits, download SVG or .excalidraw, and present stories.
Boards are stored locally by this server. Board IDs are secret bearer capabilities. Do not claim a board is publicly shared or that a diagram has rendered before the client has displayed it.`;

export function boardResult(board: Board): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `Whiteboard “${board.title}” is ready for the canvas. Board ID: ${board.id}; revision: ${board.revision}. Read this board before refining it to preserve manual edits.`,
      },
    ],
    structuredContent: {
      boardId: board.id,
      title: board.title,
      revision: board.revision,
      elementCount: board.elements.length,
      frameCount: board.frames.length,
    },
    _meta: { board },
  };
}
function protect<T extends unknown[]>(
  fn: (...args: T) => Promise<CallToolResult>,
) {
  return async (...args: T): Promise<CallToolResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              error instanceof z.ZodError
                ? z.prettifyError(error)
                : (error as Error).message,
          },
        ],
      };
    }
  };
}
export function createServer(
  store: BoardStore,
  options: { distDir: string; publicOrigin: string },
) {
  const server = new McpServer(
    { name: "Whiteboard", version: "0.1.0" },
    {
      instructions:
        "Use Whiteboard to draw clear, editable diagrams and visual stories. Prefer create_diagram or create_story for consistent layout. Read read_me for custom drawing. Read the latest board revision before edits.",
    },
  );
  const ui = {
    ui: { resourceUri: RESOURCE_URI },
    "openai/outputTemplate": RESOURCE_URI,
  };
  const writeHints = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  server.registerTool(
    "read_me",
    {
      description:
        "Read Whiteboard visual design guidance, supported drawing formats, and editing workflow.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({ content: [{ type: "text", text: GUIDE }] }),
  );
  registerAppTool(
    server,
    "create_diagram",
    {
      title: "Draw a diagram",
      description:
        "Create an editable Whiteboard flowchart or architecture diagram. Automatic layout and a curated palette keep nodes and labels readable. Use for relationships and processes.",
      inputSchema: diagramSchema,
      annotations: writeHints,
      _meta: ui,
    },
    protect(async (input) =>
      boardResult(
        await store.create(compileDiagram(diagramSchema.parse(input))),
      ),
    ),
  );
  registerAppTool(
    server,
    "create_story",
    {
      title: "Tell a visual story",
      description:
        "Create an editable visual explanation with 2–8 numbered panels and presentation frames. Use for journeys, timelines, before/after narratives, and step-by-step storytelling.",
      inputSchema: storySchema,
      annotations: writeHints,
      _meta: ui,
    },
    protect(async (input) =>
      boardResult(await store.create(compileStory(storySchema.parse(input)))),
    ),
  );
  registerAppTool(
    server,
    "create_view",
    {
      title: "Draw on Whiteboard",
      description:
        "Create a custom composition using Excalidraw skeleton elements, supplied as a JSON array string. Read read_me first. Use create_diagram or create_story when automatic layout fits.",
      inputSchema: {
        title: titleSchema,
        elements: z.string().max(2 * 1024 * 1024),
        frames: framesSchema.default([]),
      },
      annotations: writeHints,
      _meta: ui,
    },
    protect(async ({ title, elements, frames }) =>
      boardResult(
        await store.create({
          title,
          elements: elementsSchema.parse(JSON.parse(elements)),
          frames,
        }),
      ),
    ),
  );
  registerAppTool(
    server,
    "read_board",
    {
      title: "Read a Whiteboard",
      description:
        "Read the current scene, including saved manual edits, before making changes. Returns the revision required for updates. The board ID is a private bearer capability.",
      inputSchema: { id: boardIdSchema },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: ui,
    },
    protect(async ({ id }) => {
      const board = await store.read(id);
      return {
        ...boardResult(board),
        content: [{ type: "text", text: JSON.stringify(board) }],
      };
    }),
  );
  registerAppTool(
    server,
    "update_board",
    {
      title: "Refine a Whiteboard",
      description:
        "Replace a board scene using the latest read_board revision. Send all elements to keep, with stable IDs. Preserve manual edits. Stale revisions are rejected.",
      inputSchema: {
        id: boardIdSchema,
        expectedRevision: z.number().int().positive(),
        title: titleSchema.optional(),
        elements: elementsSchema,
        frames: framesSchema.optional(),
      },
      annotations: { ...writeHints, destructiveHint: true },
      _meta: ui,
    },
    protect(async ({ id, expectedRevision, title, elements, frames }) =>
      boardResult(
        await store.update(id, expectedRevision, (current) => ({
          title: title ?? current.title,
          elements,
          frames: frames ?? current.frames,
        })),
      ),
    ),
  );
  registerAppTool(
    server,
    "save_board",
    {
      description:
        "Save manual canvas edits without overwriting a newer revision.",
      inputSchema: {
        id: boardIdSchema,
        expectedRevision: z.number().int().positive(),
        elements: elementsSchema,
      },
      annotations: { ...writeHints, destructiveHint: true },
      _meta: { ui: { visibility: ["app"] } },
    },
    protect(async ({ id, expectedRevision, elements }) =>
      boardResult(
        await store.update(id, expectedRevision, (current) => {
          const ids = new Set(elements.map((el: Element) => el.id));
          return {
            ...current,
            elements,
            frames: current.frames
              .map((frame) => ({
                ...frame,
                elementIds: frame.elementIds.filter((id) => ids.has(id)),
              }))
              .filter((frame) => frame.elementIds.length > 0),
          };
        }),
      ),
    ),
  );
  registerAppResource(
    server,
    "whiteboard-canvas",
    RESOURCE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: (
            await readFile(path.join(options.distDir, "index.html"), "utf8")
          ).replaceAll("__WHITEBOARD_ORIGIN__", options.publicOrigin),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                resourceDomains: [options.publicOrigin],
                connectDomains: [],
              },
            },
            "openai/widgetDescription":
              "An editable Whiteboard canvas with diagrams, story frames, and local file exports.",
          },
        },
      ],
    }),
  );
  return server;
}
