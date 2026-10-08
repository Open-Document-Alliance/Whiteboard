import test, { type TestContext } from "node:test";
import { request } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer, RESOURCE_URI } from "../src/server.js";
import { createHttpApp } from "../src/http.js";
import { BoardStore } from "../src/store.js";
import type { Board } from "../src/model.js";

const options = {
  distDir: path.resolve("dist"),
  publicOrigin: "http://127.0.0.1:3174",
};
async function setup(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "whiteboard-test-"));
  const store = new BoardStore(directory);
  const server = createServer(store, options);
  const client = new Client({ name: "whiteboard-tests", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  t.after(async () => {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { client, store };
}
test("MCP create, read, manual save, model refinement, and conflict protection", async (t) => {
  const { client, store } = await setup(t);
  const list = await client.listTools();
  assert.deepEqual(list.tools.map((tool) => tool.name).sort(), [
    "create_diagram",
    "create_story",
    "create_view",
    "open_board",
    "read_board",
    "read_me",
    "save_board",
    "update_board",
  ]);
  const draw = list.tools.find((tool) => tool.name === "create_diagram")!;
  assert.equal(
    (draw._meta?.ui as { resourceUri: string }).resourceUri,
    RESOURCE_URI,
  );
  assert.deepEqual(
    (
      list.tools.find((tool) => tool.name === "save_board")!._meta?.ui as {
        visibility: string[];
      }
    ).visibility,
    ["app"],
  );
  const created = await client.callTool({
    name: "create_diagram",
    arguments: { title: "Our idea", nodes: [{ id: "idea", label: "Idea" }] },
  });
  assert.ok(!created.isError);
  const board = created._meta?.board as Board;
  assert.equal(board.revision, 1);
  const manuallyEdited = board.elements.map((el) =>
    el.type === "rectangle" ? { ...el, x: el.x + 100 } : el,
  );
  const saved = await client.callTool({
    name: "save_board",
    arguments: { id: board.id, expectedRevision: 1, elements: manuallyEdited },
  });
  assert.equal((saved._meta?.board as Board).revision, 2);
  const conflict = await client.callTool({
    name: "update_board",
    arguments: { id: board.id, expectedRevision: 1, elements: board.elements },
  });
  assert.equal(conflict.isError, true);
  assert.match(JSON.stringify(conflict.content), /Revision conflict/);
  const read = await client.callTool({
    name: "read_board",
    arguments: { id: board.id },
  });
  const latest = read._meta?.board as Board;
  assert.deepEqual(latest.elements, manuallyEdited);
  const changed = await client.callTool({
    name: "update_board",
    arguments: {
      id: latest.id,
      expectedRevision: latest.revision,
      title: "Our better idea",
      elements: latest.elements,
    },
  });
  assert.equal((changed._meta?.board as Board).revision, 3);
  assert.equal(
    (await new BoardStore(store.directory).read(board.id)).title,
    "Our better idea",
  );
});
test("malformed custom drawing inputs cannot crash the MCP server", async (t) => {
  const { client } = await setup(t);
  for (const elements of [
    "null",
    "{}",
    "[null]",
    "not json",
    '[{"id":"a","type":"script","x":0,"y":0}]',
  ]) {
    const result = await client.callTool({
      name: "create_view",
      arguments: { title: "Invalid", elements },
    });
    assert.equal(result.isError, true, elements);
  }
  const result = await client.callTool({ name: "read_me", arguments: {} });
  assert.ok(!result.isError);
});
test("concurrent writes cannot overwrite a saved revision", async (t) => {
  const { store } = await setup(t);
  const board = await store.create({ title: "One", elements: [], frames: [] });
  const writes = await Promise.allSettled([
    store.update(board.id, 1, (b) => ({ ...b, title: "Two" })),
    store.update(board.id, 1, (b) => ({ ...b, title: "Three" })),
  ]);
  assert.equal(
    writes.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal((await store.read(board.id)).revision, 2);
  await assert.rejects(() => store.read("../../secret"));
});
test("HTTP MCP transport works and blocks foreign origins and hostnames", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "whiteboard-http-test-"));
  await writeFile(
    path.join(directory, "index.html"),
    "<script>window.EXCALIDRAW_ASSET_PATH = '__WHITEBOARD_ORIGIN__/';</script>",
  );
  const http = createHttpApp(new BoardStore(directory), {
    ...options,
    distDir: directory,
    previewOrigins: ["http://127.0.0.1:3175", "http://localhost:55263"],
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => http.on("listening", resolve));
  const address = http.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: "http-test", version: "1" });
  t.after(async () => {
    await client.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.match(await (await fetch(url)).text(), /EXCALIDRAW_ASSET_PATH = '\/'/);
  for (const origin of [
    "https://unrelated.example",
    "null",
    "http://localhost:55264",
    "https://localhost:3174",
    "http://localhost.evil.example:3174",
    "http://127.0.0.2:3174",
  ]) {
    assert.equal(
      (
        await fetch(`${url}/mcp`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
      origin,
    );
  }
  for (const origin of [
    "http://127.0.0.1:3174",
    "http://localhost:3174",
    "http://[::1]:3174",
    "http://localhost:3175",
    "http://localhost:55263",
  ]) {
    const browserClient = new Client({
      name: "browser-origin-test",
      version: "1",
    });
    try {
      await browserClient.connect(
        new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
          requestInit: { headers: { Origin: origin } },
        }),
      );
      assert.ok(
        (await browserClient.listTools()).tools.some(
          (tool) => tool.name === "create_diagram",
        ),
        origin,
      );
    } finally {
      await browserClient.close();
    }
  }
  const foreignHost = await new Promise<number | undefined>(
    (resolve, reject) => {
      const req = request(
        `${url}/health`,
        { headers: { Host: "unrelated.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    },
  );
  assert.equal(foreignHost, 403);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`)),
  );
  const result = await client.callTool({
    name: "create_story",
    arguments: {
      title: "A journey",
      steps: [
        { title: "Start", body: "A beginning." },
        { title: "Finish", body: "An outcome." },
      ],
    },
  });
  assert.equal((result._meta?.board as Board).frames.length, 2);
});

test("image files and native frames survive save, model refinement, and reopening", async (t) => {
  const { client, store } = await setup(t);
  const opened = await client.callTool({ name: "open_board", arguments: {} });
  const board = opened._meta?.board as Board;
  const files = {
    picture: {
      id: "picture",
      mimeType: "image/png",
      dataURL:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      created: 1,
    },
  };
  const elements = [
    {
      id: "image",
      type: "image",
      fileId: "picture",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
    { id: "frame", type: "frame", x: -10, y: -10, width: 120, height: 120 },
  ];
  const saved = await client.callTool({
    name: "save_board",
    arguments: {
      id: board.id,
      expectedRevision: 1,
      elements,
      files,
      appState: { viewBackgroundColor: "#fffce8" },
    },
  });
  assert.equal(saved.isError, undefined, JSON.stringify(saved.content));
  const refined = await client.callTool({
    name: "update_board",
    arguments: {
      id: board.id,
      expectedRevision: 2,
      elements,
      title: "With an image",
    },
  });
  assert.equal(refined.isError, undefined);
  const reopened = await new BoardStore(store.directory).read(board.id);
  assert.deepEqual(reopened.files, files);
  assert.equal(reopened.appState?.viewBackgroundColor, "#fffce8");
  const read = await client.callTool({
    name: "read_board",
    arguments: { id: board.id },
  });
  assert.doesNotMatch(JSON.stringify(read.content), /base64/);
  assert.deepEqual((read._meta?.board as Board).files, files);
  const missing = await client.callTool({
    name: "save_board",
    arguments: { id: board.id, expectedRevision: 3, elements, files: {} },
  });
  assert.equal(missing.isError, true);
  const remote = await client.callTool({
    name: "save_board",
    arguments: {
      id: board.id,
      expectedRevision: 3,
      elements,
      files: {
        picture: {
          ...files.picture,
          dataURL: "https://unrelated.example/image.png",
        },
      },
    },
  });
  assert.equal(remote.isError, true);
  assert.equal((await store.read(board.id)).revision, 3);
});
