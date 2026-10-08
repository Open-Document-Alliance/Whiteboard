/** Partial JSON parsing and skeleton conversion adapted from excalidraw/excalidraw-mcp
 * src/mcp-app.tsx at 157aa23ceb1976008aadc89eb05e3444060f09d6 (MIT). See THIRD_PARTY_NOTICES.md. */
import { convertToExcalidrawElements, restore } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { Element } from './model.js';

export function parsePartialElements(str: unknown): Element[] {
  if (typeof str !== 'string' || !str.trim().startsWith('[')) return [];
  try { const value = JSON.parse(str); return Array.isArray(value) ? value : []; } catch { /* incomplete stream */ }
  // Find complete top-level objects, including quoted braces and escaped quotes.
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') { depth--; if (depth === 1 && char === '}') end = i; }
  }
  if (end < 0) return [];
  try { return JSON.parse(str.slice(0, end + 1) + ']'); } catch { return []; }
}
export function normalizeElements(elements: Element[]): readonly ExcalidrawElement[] {
  if (elements.every(el => typeof el.version === 'number' && typeof el.seed === 'number')) {
    return restore({ elements: elements as unknown as ExcalidrawElement[] }, null, null).elements;
  }
  const defaults = elements.map(el => ({ strokeColor: '#25362f', backgroundColor: 'transparent', fillStyle: 'solid', roughness: 0.7, ...el,
    ...(el.label ? { label: { textAlign: 'center', verticalAlign: 'middle', fontFamily: 2, ...el.label } } : {}),
  }));
  return convertToExcalidrawElements(defaults as Parameters<typeof convertToExcalidrawElements>[0], { regenerateIds: false });
}
