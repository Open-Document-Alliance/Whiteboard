# Third-party notices

Whiteboard is an independent project, built with Excalidraw. It is not an official Excalidraw or OpenAI product.

## Excalidraw

- Source: https://github.com/excalidraw/excalidraw
- Package: `@excalidraw/excalidraw`, version 0.18.1
- The editor is consumed as a dependency, rather than a fork of the entire Excalidraw website.
- Original license follows in full.

```text
MIT License

Copyright (c) 2020 Excalidraw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Excalidraw MCP

- Source: https://github.com/excalidraw/excalidraw-mcp
- Reference commit: `157aa23ceb1976008aadc89eb05e3444060f09d6`
- Upstream declares MIT in `package.json` and its README. There is no standalone LICENSE file or copyright line in that checkout; no upstream copyright line has been removed.
- `src/scene.ts` adapts its partial-element parsing and skeleton-conversion helpers. Its element-string tool format and MCP Apps resource pattern informed this implementation. The Whiteboard server, storage, graph/story layouts, and application shell are new code.
- Credit: Excalidraw MCP contributors, including the original `antonpk1/excalidraw-mcp-app` project linked in the upstream README.
- MIT permission and warranty terms above apply to the adapted MIT code. Keep this attribution with distributions.

## Other dependencies

The MCP SDK, MCP Apps SDK, React, Dagre, and other dependencies retain their own licenses. Exact installed versions are recorded in `package-lock.json`; their notices remain in their package distributions. The bundled client preserves license comments. A public release should generate and review a complete dependency/font notice inventory.
