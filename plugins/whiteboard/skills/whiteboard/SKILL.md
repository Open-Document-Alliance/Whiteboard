---
name: whiteboard
description: Create, open, and refine editable Excalidraw diagrams or visual stories with the Whiteboard MCP tools. Use when the user asks to draw on a whiteboard, create a diagram, or edit a Whiteboard board.
---

# Whiteboard

Use the Whiteboard MCP tools supplied by this plugin. The private local service must be running on the Codex host at `http://127.0.0.1:3174/mcp`.

- Use `open_board` for a blank canvas or an existing board ID.
- Use `create_diagram` for flowcharts, systems, relationships, and architecture. Prefer concise labels, generous spacing, and a clear reading direction.
- Use `create_story` for numbered visual explanations.
- Read `read_me` before using `create_view` for a custom composition.
- Before editing, call `read_board` and use its current revision in `update_board`. Preserve user edits and stable element IDs. On conflict, read again and reconcile; do not blindly retry an overwrite.
- Preserve existing image files by omitting `files` from model updates unless replacing actual image data. `read_board` exposes file metadata to the model, not the image bytes.

The canvas autosaves edits on the server, including pasted/dropped images. A local server save is not a save to the user's laptop workspace. For a laptop file, use the editor's native Save to / Export image or Download .excalidraw action; the browser or host controls the destination. Do not claim you wrote into a Codex folder without checking the file there.

Return the tool's inline UI when supported. If this Codex surface only exposes tools, link the editable board at `http://127.0.0.1:3174/#board=BOARD_ID`, substituting the returned ID. For remote Codex hosts, use the configured browser-facing forwarded address rather than assuming loopback reaches that host.

Never describe a diagram as visually verified until it has been inspected in the canvas. Keep board IDs private unless the user requests sharing. No public hosting or authentication is configured by this plugin.
