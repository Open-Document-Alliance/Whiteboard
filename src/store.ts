import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { boardIdSchema, validateContent, type Board, type BoardContent } from './model.js';

/** Single-process local store. UUIDs are bearer capabilities, not user authentication. */
export class BoardStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string) {}
  private file(id: string) { return path.join(this.directory, `${boardIdSchema.parse(id)}.json`); }
  private async write(board: Board) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temp = `${this.file(board.id)}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(board), { mode: 0o600 });
    await rename(temp, this.file(board.id));
  }
  async create(content: BoardContent): Promise<Board> {
    const validated = validateContent(content), now = new Date().toISOString();
    const board = { ...validated, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now };
    await this.write(board); return board;
  }
  async read(id: string): Promise<Board> {
    try { return JSON.parse(await readFile(this.file(id), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Board not found. Create a new board or use an existing board ID.'); throw error; }
  }
  update(id: string, revision: number, transform: (board: Board) => BoardContent): Promise<Board> {
    const work = this.queue.then(async () => {
      const current = await this.read(id);
      if (current.revision !== revision) throw new Error(`Revision conflict: current revision is ${current.revision}. Read the board again before editing; preserve the user's changes.`);
      const content = validateContent(transform(current));
      const board = { ...current, ...content, revision: current.revision + 1, updatedAt: new Date().toISOString() };
      await this.write(board); return board;
    });
    this.queue = work.catch(() => {}); return work;
  }
}
