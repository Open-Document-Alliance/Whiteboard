# ChatGPT integration

## Implemented contract

Whiteboard exposes Streamable HTTP at `/mcp`. Tools that return a board reference `ui://whiteboard/canvas-v1.html`; the registered resource uses the MCP Apps HTML MIME type. Responses put a compact board summary in `structuredContent` and the full scene in `_meta.board`. `read_board` additionally returns the scene to the model for deliberate refinement.

The React widget registers tool-result/input/context handlers before its MCP Apps handshake. It uses `App.callServerTool`, `requestDisplayMode`, `updateModelContext`, and `downloadFile`. The standalone preview uses the MCP SDK HTTP client against exactly the same tools.

The widget bundles its JavaScript and CSS. Excalidraw font assets are served under the configured `PUBLIC_ORIGIN`. The resource CSP allows that origin for assets and no outbound data connections. User scenes are not sent to an Excalidraw hosted service.

## Hosting work still required

1. Choose an HTTPS host and a production origin for Whiteboard.
2. Add authentication and board ownership, then a shared transactional store if running more than one process. The present file store and bearer board IDs are for private development.
3. Adapt the explicit loopback bind and Host allowlist for the chosen reverse proxy. Set `PUBLIC_ORIGIN` to the actual HTTPS origin; make `/mcp` and `/fonts/` reachable.
4. Set a stable MCP Apps resource domain if the host/submission flow requires one. Review CSP against the deployed asset origin.
5. Resolve or assess dependency advisories, add quotas and retention, and provide privacy/support details and complete dependency notices.
6. Create a custom ChatGPT connection to `https://your-origin/mcp` and run the acceptance script below. Hosting and testing a connector is distinct from public directory publication.

Follow the current [OpenAI quickstart](https://developers.openai.com/plugins/build/app-quickstart), [UI guide](https://developers.openai.com/plugins/build/chatgpt-ui), and [connection/testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) rather than relying on old menu names.

## Acceptance script in ChatGPT

These are manual acceptance cases, not claims of completed ChatGPT verification.

1. “Use Whiteboard to draw a clear three-stage process from an idea to a shipped project.” Check tool discovery, correct canvas rendering, readable labels, and no clipping.
2. “Explain how a garden grows as a four-part visual story.” Navigate every frame, return to the overview, expand, collapse, and repeat on a narrow viewport.
3. Move a shape, change its label, and save. Ask “Add one more step, preserving my changes.” Confirm the model reads the latest revision and the manual changes survive.
4. Edit the same board from two views. Save one, then the other. Confirm the stale save is rejected and the unsaved draft remains downloadable.
5. Download SVG and `.excalidraw` from the host. Inspect the SVG and reopen the editable file in Excalidraw.
6. Test light/dark host themes, keyboard controls, reduced motion, cancelled tool calls, malformed drawing arguments, and reconnecting to a saved board.
7. Measure cold resource load and first drawing on a real laptop and inside ChatGPT. The standalone HTML size is not a performance measurement.

## Useful example prompts

- “Draw the architecture of a small web app, with the frontend, API, database, and background workers.”
- “Tell the story of this product change in four panels: the problem, the turning point, the new approach, and the outcome.”
- “Make the decision points amber and the successful outcomes green. Preserve my manual edits.”
- “Use a custom Whiteboard composition to explain a feedback loop with a short title and three annotations.”
