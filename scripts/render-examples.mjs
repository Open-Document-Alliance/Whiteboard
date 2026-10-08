import { JSDOM } from "jsdom";
import { createCanvas, loadImage } from "@napi-rs/canvas";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://127.0.0.1:3174/",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLCanvasElement",
  "Element",
  "DOMParser",
  "XMLSerializer",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom.window[key],
  });
window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
window.devicePixelRatio = globalThis.devicePixelRatio = 1;
HTMLCanvasElement.prototype.getContext = function (type) {
  this._canvas ??= createCanvas(this.width || 300, this.height || 150);
  return this._canvas.getContext(type);
};
document.fonts = {
  ready: Promise.resolve(),
  check: () => true,
  load: async () => [],
  add() {},
};
window.FontFace = globalThis.FontFace = class {
  constructor() {}
  load() {
    return Promise.resolve(this);
  }
};
globalThis.ResizeObserver = window.ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
const { normalizeElements } = await import("../src/scene.ts");
const { compileDiagram, compileStory } = await import("../src/layout.ts");
const { examples } = await import("../src/examples.ts");
const { exportToSvg } = await import("@excalidraw/excalidraw");
const { writeFile, mkdir } = await import("node:fs/promises");
await mkdir(".whiteboard/qa", { recursive: true });
for (let i = 0; i < examples.length; i++) {
  const board =
    i === 1 ? compileStory(examples[i].args) : compileDiagram(examples[i].args);
  const elements = normalizeElements(board.elements);
  const svg = await exportToSvg({
    elements,
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
    files: null,
    skipInliningFonts: true,
  });
  await writeFile(`./.whiteboard/qa/example-${i}.svg`, svg.outerHTML);
  const image = await loadImage(Buffer.from(svg.outerHTML));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  await writeFile(
    `./.whiteboard/qa/example-${i}.png`,
    canvas.toBuffer("image/png"),
  );
  console.log(
    `Example ${i}: ${elements.length} elements; viewBox ${svg.getAttribute("viewBox")}`,
  );
}
process.exit(0);
