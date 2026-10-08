# Whiteboard

An open canvas for clear thinking. Whiteboard uses Excalidraw to turn a ChatGPT conversation into editable diagrams and visual stories.

This is a **local development MVP**, not a deployed or published ChatGPT connector. It implements the MCP Apps interface; verification inside ChatGPT is still required.

## Run

Use Node 24 (minimum 22.12) and npm.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3174/**. The local preview calls the real MCP tools; it does not generate responses with a separate model or require an OpenAI API key. Try the flowchart, architecture, or story examples, or open a blank canvas.

- MCP endpoint: `http://127.0.0.1:3174/mcp`
- Health: `http://127.0.0.1:3174/health`
- Data: `.whiteboard/` (ignored by Git)
- Override `PORT`, `PUBLIC_ORIGIN`, or `WHITEBOARD_DATA_DIR` through environment variables.
- The HTTP server deliberately binds to loopback and validates Host and Origin headers.

For development, run `npm run dev` and `npm run dev:ui` in separate terminals after the first build. The Vite UI uses port 3175 and proxies MCP to 3174. Font assets are copied by the build.

## What works

- **Automatic diagrams:** nodes and relationships become a graph with automatic spacing and routed arrows.
- **Visual stories:** two to eight numbered panels with named frames and previous/next navigation.
- **Custom drawing:** Excalidraw skeleton elements for compositions that need explicit placement; partial custom drawing input can render while the host streams it.
- **Editing:** the actual Excalidraw editor, with manual saves and revision checks to prevent silent overwrites.
- **Exports:** SVG and editable `.excalidraw` files. No scene upload to excalidraw.com.
- **MCP Apps:** an inline canvas, host fullscreen requests, theme/safe-area handling, model context updates, and host-mediated downloads.

## Tools

| Tool | Purpose |
| --- | --- |
| `read_me` | Drawing formats, visual guidance, and editing workflow |
| `create_diagram` | Automatically lay out nodes and edges |
| `create_story` | Build an ordered visual explanation |
| `create_view` | Draw a custom Excalidraw composition |
| `read_board` | Get the latest scene and revision, including saved manual edits |
| `update_board` | Replace the scene with an expected revision |
| `save_board` | Save editor changes; visible only to the app |

`create_diagram` example:

```json
{
  "title": "From question to answer",
  "direction": "LR",
  "nodes": [
    { "id": "question", "label": "Ask a question", "tone": "amber" },
    { "id": "explore", "label": "Explore the idea", "tone": "blue" },
    { "id": "answer", "label": "See it clearly", "tone": "green" }
  ],
  "edges": [
    { "from": "question", "to": "explore" },
    { "from": "explore", "to": "answer" }
  ]
}
```

`create_story` takes `title` and `steps: [{title, body, tone}]`. Supported tones are blue, green, amber, rose, and neutral. For custom drawing, call `read_me` first. The low-level tool format is inspired by the official Excalidraw MCP, but this is not a drop-in replacement: use board IDs and revisions instead of upstream checkpoints, and named story frames instead of camera pseudo-elements.

Boards are persisted when tools create them. Manual edits require **Save changes**. ChatGPT should read the latest board before replacing a scene. A revision conflict leaves the user's draft on the canvas; download that draft before reloading and merging it with the current saved board.

## Connect to ChatGPT

The canvas follows the [OpenAI MCP Apps quickstart](https://developers.openai.com/plugins/build/app-quickstart) and the [MCP Apps standard](https://github.com/modelcontextprotocol/ext-apps). ChatGPT needs a reachable HTTPS MCP endpoint and a custom connection. A laptop's loopback preview is not such an endpoint.

See [ChatGPT integration](docs/chatgpt.md) for deployment prerequisites and an acceptance script. No public deployment, external account connection, authentication setup, or directory submission is performed by this repository.

Other local MCP clients can use stdio:

```json
{
  "mcpServers": {
    "whiteboard": {
      "command": "node",
      "args": ["/absolute/path/Whiteboard/dist/main.js", "--stdio"],
      "env": { "WHITEBOARD_DATA_DIR": "/absolute/path/Whiteboard/.whiteboard" }
    }
  }
}
```

The MCP tools work over stdio. For the embedded canvas, also run the HTTP server for fonts and set `PUBLIC_ORIGIN` to its reachable origin.

## Verify

```sh
npm run check
npm run qa:render
```

`check` runs the transport, validation, layout, persistence, and concurrency tests, then typechecks and builds the app. `qa:render` uses jsdom and native canvas to export three example scenes to `.whiteboard/qa/`. It verifies the Excalidraw export path, **not a real browser or ChatGPT host**.

## Boundaries before a public release

- No user accounts, OAuth, tenant ownership, collaboration, or per-user rate limiting. Board IDs are bearer capabilities, not identity checks. Keep this prototype private.
- The file store serializes updates inside one server process. Multi-instance hosting requires transactional shared storage and authenticated authorization.
- The current widget is roughly 8.5 MB before compression. Bundle splitting/self-hosted assets and load-time measurement remain release work.
- Image/file imports, embedded webpages, Mermaid input, and checkpoint-compatible animation are outside this version.
- There are remaining upstream/transitive npm audit advisories. See [verification notes](docs/verification.md); do not describe this prototype as production hardened.

## Contributing and credits

Use `npm ci` and `npm run check`. Keep the editor dependency separate from Whiteboard's branding, MCP tools, and layouts. Preserve upstream notices. Changes to tool contracts need transport tests; changes to layout need a rendered example review.

Built with [Excalidraw](https://github.com/excalidraw/excalidraw), informed by [Excalidraw MCP](https://github.com/excalidraw/excalidraw-mcp), with adapted helpers credited in source. Whiteboard is an independent project. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
