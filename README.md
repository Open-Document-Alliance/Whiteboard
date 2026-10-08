# Whiteboard

Plain, full-screen Excalidraw with MCP tools for ChatGPT and Codex. The editor opens directly: no landing page, branding frame, or separate edit mode.

This is a **local development MVP**, not a deployed or published ChatGPT connector. It implements the MCP Apps interface; verification inside ChatGPT is still required.

## Run

Use Node 24 (minimum 22.12) and npm.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3174/**. The local preview calls the real MCP tools; it does not generate responses with a separate model or require an OpenAI API key. Start drawing immediately, drop or paste an image, or use the native Open menu to load an existing `.excalidraw` file.

- MCP endpoint: `http://127.0.0.1:3174/mcp`
- Health: `http://127.0.0.1:3174/health`
- Data: `.whiteboard/` (ignored by Git)
- Override `PORT`, `PUBLIC_ORIGIN`, or `WHITEBOARD_DATA_DIR` through environment variables.
- The HTTP server deliberately binds to loopback and validates Host and Origin headers.

The preview accepts `localhost`, `127.0.0.1`, and `::1` on the configured ports. If a local preview proxy uses a different browser-facing port, set its exact origin before starting the server, for example `WHITEBOARD_PREVIEW_ORIGINS=http://localhost:55263 npm start`. Multiple origins can be comma-separated. Other ports and foreign origins remain blocked. Standalone font assets load from the same origin as the page; `PUBLIC_ORIGIN` supplies the asset origin for embedded MCP apps.

For development, run `npm run dev` and `npm run dev:ui` in separate terminals after the first build. The Vite UI uses port 3175 and proxies MCP to 3174. Font assets are copied by the build.

## What works

- **Automatic diagrams:** nodes and relationships become a graph with automatic spacing and routed arrows.
- **Visual stories:** two to eight numbered panels with named groups, editable on the native canvas.
- **Custom drawing:** Excalidraw skeleton elements for compositions that need explicit placement; partial custom drawing input can render while the host streams it.
- **Editing:** the native Excalidraw toolbar, undo/redo, frames, image insertion/paste/drop, and local file import. Changes autosave to the server with revision checks to prevent silent overwrites.
- **Theme:** follows the system or MCP host; the native theme control also offers light, dark, and system.
- **Images:** embedded file data persists with the scene and survives model refinements. The board limit is 20 MB including encoded images.
- **Local files:** native Save to / Export image, plus `.excalidraw` and SVG download actions. Pick your laptop project/Codex folder in the browser save dialog where supported; otherwise move the downloaded file there. Files are not silently written into the mini or a guessed workspace path.
- **Host actions:** fullscreen, model context, Discuss this board, host downloads, and optional ChatGPT file-library image import and board upload. The menu only shows actions advertised by the host.
- **MCP Apps:** an inline canvas, host fullscreen requests, theme/safe-area handling, model context updates, and host-mediated downloads.

## Tools

| Tool | Purpose |
| --- | --- |
| `open_board` | Open a blank or existing editor; declares sidebar and conversation entrypoints |
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

Boards are persisted when tools create them. Manual edits autosave after a short pause; the standalone URL receives the board ID for reopening. ChatGPT should read the latest board before replacing a scene. A revision conflict leaves the user's draft on the canvas; download that draft before reloading and merging it with the current saved board.

## Codex plugin source

The local Codex plugin bundle is tracked in [`plugins/whiteboard`](plugins/whiteboard): its manifest, MCP connection, and drawing skill. It connects to the existing Whiteboard service at `http://127.0.0.1:3174/mcp`; build and run the server on the Codex host before using it. The plugin does not start or deploy the server itself.

Register the bundle in your Codex marketplace to install it, then start a new chat to load its tools. The user-specific marketplace, installed cache, saved boards, runtime logs, and GitHub credentials are local state and are not included in the repository.

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
- Embedded webpages, arbitrary document rendering, native host file-viewer registration, Mermaid input, and checkpoint-compatible animation are outside this version.
- There are remaining upstream/transitive npm audit advisories. See [verification notes](docs/verification.md); do not describe this prototype as production hardened.

## Contributing and credits

Use `npm ci` and `npm run check`. Keep the editor dependency separate from Whiteboard's branding, MCP tools, and layouts. Preserve upstream notices. Changes to tool contracts need transport tests; changes to layout need a rendered example review.

Built with [Excalidraw](https://github.com/excalidraw/excalidraw), informed by [Excalidraw MCP](https://github.com/excalidraw/excalidraw-mcp), with adapted helpers credited in source. Whiteboard is an independent project. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
