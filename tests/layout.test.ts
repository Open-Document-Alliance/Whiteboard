import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDiagram, compileStory, wrap } from '../src/layout.js';
import { validateContent } from '../src/model.js';

test('branching diagrams have distinct nodes, routed edges, and no overlapping boxes', () => {
  const board = compileDiagram({ title: 'A branching system', nodes: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'API' }, { id: 'c', label: 'Database' }, { id: 'd', label: 'Jobs' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'b', to: 'd' }] });
  validateContent(board);
  const boxes = board.elements.filter(el => el.type === 'rectangle');
  assert.equal(boxes.length, 4);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x + a.width! <= b.x || b.x + b.width! <= a.x || a.y + a.height! <= b.y || b.y + b.height! <= a.y);
  }
  assert.equal(board.elements.filter(el => el.type === 'arrow').length, 3);
});
test('invalid graph references and duplicate node IDs give actionable errors', () => {
  assert.throws(() => compileDiagram({ title: 'Invalid', nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'missing' }] }), /Unknown edge/);
  assert.throws(() => compileDiagram({ title: 'Invalid', nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }), /unique/);
});
test('story frames point at real grouped elements and all long text fits within cards', () => {
  const board = compileStory({ title: 'A story', steps: Array.from({ length: 8 }, (_, i) => ({ title: `Step ${i}: ${'long title '.repeat(4)}`, body: 'substantial word '.repeat(12) })) });
  validateContent(board);
  assert.equal(board.frames.length, 8);
  for (const frame of board.frames) {
    const card = board.elements.find(el => el.id === frame.elementIds[0])!;
    for (const id of frame.elementIds.slice(1)) {
      const text = board.elements.find(el => el.id === id)!;
      const estimatedHeight = text.text!.split('\n').length * Number(text.fontSize) * 1.25;
      assert.ok(text.y + estimatedHeight < card.y + card.height!, `${id} must fit`);
    }
  }
});
test('long tokens wrap and foreign frame IDs are rejected', () => {
  assert.ok(wrap('a'.repeat(100), 20).split('\n').every(line => line.length <= 20));
  assert.throws(() => validateContent({ title: 'Invalid', elements: [], frames: [{ title: 'Step', caption: '', elementIds: ['missing'] }] }), /missing element/);
});
