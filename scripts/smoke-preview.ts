import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writeFile } from "node:fs/promises";
import { examples } from "../src/examples.js";
const client = new Client({
  name: "whiteboard-preview-smoke",
  version: "0.1.0",
});
const origin = process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:3174";
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)),
  );
  const resources = await client.listResources();
  const resource = await client.readResource({
    uri: resources.resources[0].uri,
  });
  if (
    !("text" in resource.contents[0]) ||
    !resource.contents[0].text.includes("<title>Whiteboard</title>")
  )
    throw new Error("Missing widget");
  const boards = [];
  for (const example of examples) {
    const result = await client.callTool({
      name: example.tool,
      arguments: example.args,
    });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    const summary = result.structuredContent as {
      boardId: string;
      revision: number;
    };
    boards.push({
      name: example.name,
      url: `${origin}/#board=${summary.boardId}`,
      revision: summary.revision,
    });
  }
  await writeFile(
    ".whiteboard/qa/preview-boards.json",
    JSON.stringify(boards, null, 2),
  );
  console.log(JSON.stringify(boards, null, 2));
} finally {
  await client.close();
}
