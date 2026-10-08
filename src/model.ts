import { z } from 'zod';

export const titleSchema = z.string().trim().min(1).max(160);
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const coordinate = z.number().finite().min(-100_000).max(100_000);
export const elementSchema = z.object({
  id: idSchema,
  type: z.enum(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'freedraw', 'frame']),
  x: coordinate, y: coordinate,
  width: coordinate.optional(), height: coordinate.optional(),
  text: z.string().max(5000).optional(),
  label: z.object({ text: z.string().max(5000) }).passthrough().optional(),
  points: z.array(z.tuple([coordinate, coordinate])).max(10_000).optional(),
}).passthrough().superRefine((el, ctx) => {
  if (el.type === 'text' && typeof el.text !== 'string') ctx.addIssue({ code: 'custom', message: 'Text elements need text' });
  if (['arrow', 'line', 'freedraw', 'frame'].includes(el.type) && (!el.points || el.points.length < 2)) ctx.addIssue({ code: 'custom', message: 'Lines need at least two points' });
});
export const elementsSchema = z.array(elementSchema).max(1000).superRefine((els, ctx) => {
  if (new Set(els.map(el => el.id)).size !== els.length) ctx.addIssue({ code: 'custom', message: 'Element IDs must be unique' });
});
export type Element = z.infer<typeof elementSchema>;
export const frameSchema = z.object({ title: titleSchema, caption: z.string().max(600), elementIds: z.array(idSchema).min(1).max(1000) });
export const framesSchema = z.array(frameSchema).max(12);
export type Frame = z.infer<typeof frameSchema>;
export const boardContentSchema = z.object({ title: titleSchema, elements: elementsSchema, frames: framesSchema.default([]) });
export type BoardContent = z.infer<typeof boardContentSchema>;
export type Board = BoardContent & { id: string; revision: number; createdAt: string; updatedAt: string };
export const boardIdSchema = z.string().uuid();

export function validateContent(input: unknown): BoardContent {
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 2 * 1024 * 1024) throw new Error('Board exceeds the 2 MB limit. Split it into smaller boards.');
  const board = boardContentSchema.parse(input);
  const ids = new Set(board.elements.map(el => el.id));
  for (const frame of board.frames) for (const id of frame.elementIds) {
    if (!ids.has(id)) throw new Error(`Story frame references missing element: ${id}`);
  }
  return board;
}
