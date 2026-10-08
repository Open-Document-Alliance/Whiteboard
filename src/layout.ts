import { graphlib, layout } from "@dagrejs/dagre";
import { z } from "zod";
import {
  idSchema,
  titleSchema,
  type BoardContent,
  type Element,
} from "./model.js";

const toneSchema = z.enum(["blue", "green", "amber", "rose", "neutral"]);
export const palette = {
  blue: { stroke: "#285a79", fill: "#e2eff5" },
  green: { stroke: "#386353", fill: "#e4efe6" },
  amber: { stroke: "#865a23", fill: "#faf0d9" },
  rose: { stroke: "#87494d", fill: "#f6e5e4" },
  neutral: { stroke: "#565854", fill: "#f0efeb" },
};
export const diagramSchema = z.object({
  title: titleSchema,
  direction: z.enum(["LR", "TB"]).default("LR"),
  nodes: z
    .array(
      z.object({
        id: idSchema,
        label: z.string().trim().min(1).max(100),
        tone: toneSchema.default("blue"),
        shape: z.enum(["rectangle", "ellipse", "diamond"]).default("rectangle"),
      }),
    )
    .min(1)
    .max(30),
  edges: z
    .array(
      z.object({
        from: idSchema,
        to: idSchema,
        label: z.string().max(40).optional(),
      }),
    )
    .max(60)
    .default([]),
});
export const storySchema = z.object({
  title: titleSchema,
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(60),
        body: z.string().trim().min(1).max(220),
        tone: toneSchema.default("blue"),
      }),
    )
    .min(2)
    .max(8),
});
export type DiagramInput = z.input<typeof diagramSchema>;
export type StoryInput = z.input<typeof storySchema>;

export function wrap(text: string, columns: number): string {
  return text
    .split("\n")
    .map((line) => {
      const words = line.split(/\s+/);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        if (current && current.length + word.length + 1 > columns) {
          lines.push(current);
          current = "";
        }
        // Split long tokens too: URLs and identifiers must not overflow cards.
        let remaining = word;
        while (remaining.length > columns) {
          if (current) {
            lines.push(current);
            current = "";
          }
          lines.push(remaining.slice(0, columns));
          remaining = remaining.slice(columns);
        }
        current += (current ? " " : "") + remaining;
      }
      if (current) lines.push(current);
      return lines.join("\n");
    })
    .join("\n");
}
const style = {
  strokeWidth: 1.5,
  roughness: 0.7,
  fillStyle: "solid",
  fontFamily: 2,
};
const text = (
  id: string,
  x: number,
  y: number,
  value: string,
  fontSize = 24,
): Element => ({
  type: "text",
  id,
  x,
  y,
  text: value,
  fontSize,
  fontFamily: 2,
  strokeColor: "#25362f",
  roughness: 0,
});

export function compileDiagram(input: DiagramInput): BoardContent {
  const spec = diagramSchema.parse(input);
  const ids = new Set(spec.nodes.map((node) => node.id));
  if (ids.size !== spec.nodes.length)
    throw new Error("Node IDs must be unique.");
  for (const edge of spec.edges)
    if (!ids.has(edge.from) || !ids.has(edge.to))
      throw new Error(`Unknown edge endpoint: ${edge.from} → ${edge.to}`);
  const g = new graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: spec.direction,
    nodesep: 64,
    ranksep: 110,
    marginx: 48,
    marginy: wrap(spec.title, 45).split("\n").length * 38 + 55,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of spec.nodes) {
    const lines = wrap(node.label, 20).split("\n").length;
    g.setNode(node.id, {
      width: node.shape === "diamond" ? 270 : 230,
      height: Math.max(node.shape === "diamond" ? 160 : 96, lines * 26 + 48),
    });
  }
  spec.edges.forEach((edge, i) =>
    g.setEdge(
      edge.from,
      edge.to,
      { width: edge.label ? 130 : 0, height: edge.label ? 24 : 0 },
      String(i),
    ),
  );
  layout(g);
  const elements: Element[] = [
    text("wb-title", 48, 24, wrap(spec.title, 45), 30),
  ];
  for (const node of spec.nodes) {
    const pos = g.node(node.id);
    const color = palette[node.tone];
    elements.push({
      ...style,
      id: `node-${node.id}`,
      type: node.shape,
      x: pos.x - pos.width / 2,
      y: pos.y - pos.height / 2,
      width: pos.width,
      height: pos.height,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
      roundness: { type: 3 },
      label: {
        text: wrap(node.label, 20),
        fontSize: 20,
        fontFamily: 2,
        strokeColor: "#25362f",
      },
    });
  }
  spec.edges.forEach((edge, i) => {
    const route = g.edge({ v: edge.from, w: edge.to, name: String(i) });
    const first = route.points[0];
    const last = route.points.at(-1)!;
    elements.push({
      ...style,
      type: "arrow",
      id: `edge-${i}`,
      x: first.x,
      y: first.y,
      width: last.x - first.x,
      height: last.y - first.y,
      points: route.points.map((p: { x: number; y: number }) => [
        p.x - first.x,
        p.y - first.y,
      ]),
      strokeColor: "#79877e",
      endArrowhead: "arrow",
      start: { id: `node-${edge.from}` },
      end: { id: `node-${edge.to}` },
    });
    if (edge.label)
      elements.push(
        text(
          `edge-label-${i}`,
          route.x! - 60,
          route.y! - 12,
          wrap(edge.label, 18),
          16,
        ),
      );
  });
  return { title: spec.title, elements, frames: [] };
}

export function compileStory(input: StoryInput): BoardContent {
  const spec = storySchema.parse(input);
  const elements: Element[] = [
    text("wb-title", 40, 24, wrap(spec.title, 44), 32),
  ];
  const titleOffset =
    Math.max(
      ...spec.steps.map((step) => wrap(step.title, 22).split("\n").length * 29),
    ) + 82;
  const cardHeight = Math.max(
    310,
    titleOffset +
      Math.max(
        ...spec.steps.map(
          (step) => wrap(step.body, 32).split("\n").length * 22,
        ),
      ) +
      28,
  );
  const top = wrap(spec.title, 44).split("\n").length * 40 + 65;
  const columns = spec.steps.length <= 4 ? 2 : 3;
  const frames = spec.steps.map((step, i) => {
    const x = 40 + (i % columns) * 400,
      y = top + Math.floor(i / columns) * (cardHeight + 40);
    const color = palette[step.tone];
    const prefix = `step-${i + 1}`;
    const groupIds = [prefix];
    elements.push(
      {
        ...style,
        type: "rectangle",
        id: `${prefix}-card`,
        x,
        y,
        width: 360,
        height: cardHeight,
        backgroundColor: color.fill,
        strokeColor: color.stroke,
        roundness: { type: 3 },
        groupIds,
      },
      {
        ...text(
          `${prefix}-number`,
          x + 26,
          y + 22,
          String(i + 1).padStart(2, "0"),
          18,
        ),
        strokeColor: color.stroke,
        groupIds,
      },
      {
        ...text(`${prefix}-title`, x + 26, y + 63, wrap(step.title, 22), 23),
        groupIds,
      },
      {
        ...text(
          `${prefix}-body`,
          x + 26,
          y + titleOffset,
          wrap(step.body, 32),
          17,
        ),
        groupIds,
      },
    );
    return {
      title: step.title,
      caption: step.body,
      elementIds: [
        `${prefix}-card`,
        `${prefix}-number`,
        `${prefix}-title`,
        `${prefix}-body`,
      ],
    };
  });
  return { title: spec.title, elements, frames };
}
