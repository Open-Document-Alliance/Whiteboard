import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  Excalidraw,
  MainMenu,
  CaptureUpdateAction,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Board, Element } from "./model.js";
import { normalizeElements, parsePartialElements } from "./scene.js";
import { examples } from "./examples.js";
import "@excalidraw/excalidraw/index.css";
import "./style.css";

const embedded = window.self !== window.top;
const signature = (elements: readonly ExcalidrawElement[]) =>
  elements.map((el) => `${el.id}:${el.version}:${el.isDeleted}`).join("|");
const mark = (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect
      x="2"
      y="3"
      width="24"
      height="20"
      rx="5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <path
      d="m7 16 5-6 3 6 6-7M10 26h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function WhiteboardApp() {
  const [board, setBoard] = useState<Board | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [frame, setFrame] = useState(-1);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [fullscreen, setFullscreen] = useState(false);
  const [partial, setPartial] = useState<Element[] | null>(null);
  const host = useRef<App | null>(null);
  const local = useRef<Client | null>(null);
  const boardRef = useRef<Board | null>(null);
  const baseline = useRef("");
  const dirtyRef = useRef(false);
  const changing = useRef(false);
  const contextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accept = useCallback((result: CallToolResult) => {
    if (result.isError)
      throw new Error(
        result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n") || "Whiteboard could not complete the request.",
      );
    const next = result._meta?.board as Board | undefined;
    if (!next) return;
    if (dirtyRef.current) {
      setError(
        "A new board version is available. Your unsaved edits are still here. Download a copy before reloading the saved version.",
      );
      return;
    }
    boardRef.current = next;
    setBoard(next);
    setPartial(null);
    setFrame(-1);
    setError("");
    if (!embedded) window.history.replaceState(null, "", `#board=${next.id}`);
  }, []);
  const call = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const result = host.current
        ? await host.current.callServerTool({ name, arguments: args })
        : await local.current!.callTool({ name, arguments: args });
      if (result.isError)
        throw new Error(
          (result.content as CallToolResult["content"])
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"),
        );
      return result as CallToolResult;
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    if (embedded) {
      const app = new App({ name: "Whiteboard", version: "0.1.0" }, {});
      host.current = app;
      app.ontoolresult = (result) => {
        if (!disposed) {
          try {
            accept(result as CallToolResult);
          } catch (e) {
            setError((e as Error).message);
          }
        }
      };
      app.ontoolinputpartial = (input) => {
        if (!boardRef.current)
          setPartial(parsePartialElements(input.arguments?.elements));
      };
      app.ontoolinput = () => {};
      app.ontoolcancelled = () => {
        setPartial(null);
        setError("Drawing was cancelled.");
      };
      app.onhostcontextchanged = (context) => {
        if (context.theme) setTheme(context.theme);
        if (context.displayMode)
          setFullscreen(context.displayMode === "fullscreen");
        const insets = context.safeAreaInsets;
        if (insets)
          for (const [key, value] of Object.entries(insets))
            document.documentElement.style.setProperty(
              `--safe-${key}`,
              `${value}px`,
            );
      };
      app.onteardown = async () => ({});
      app
        .connect()
        .then(() => {
          if (!disposed) {
            setReady(true);
            setTheme(app.getHostContext()?.theme ?? "light");
          }
        })
        .catch((e) => setError(e.message));
      return () => {
        disposed = true;
        void app.close();
      };
    }
    const client = new Client({ name: "whiteboard-preview", version: "0.1.0" });
    local.current = client;
    client
      .connect(
        new StreamableHTTPClientTransport(
          new URL("/mcp", window.location.href),
        ),
      )
      .then(async () => {
        if (disposed) return;
        setReady(true);
        const id = new URLSearchParams(window.location.hash.slice(1)).get(
          "board",
        );
        if (id)
          accept(
            (await client.callTool({
              name: "read_board",
              arguments: { id },
            })) as CallToolResult,
          );
      })
      .catch((e) => {
        if (!disposed)
          setError(`Could not connect to Whiteboard: ${e.message}`);
      });
    return () => {
      disposed = true;
      void client.close();
    };
  }, [accept]);

  useEffect(() => {
    if (!api || !board) return;
    changing.current = true;
    try {
      const elements = normalizeElements(board.elements);
      baseline.current = signature(elements);
      dirtyRef.current = false;
      setDirty(false);
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      api.scrollToContent(elements, {
        fitToViewport: true,
        viewportZoomFactor: 0.8,
      });
    } catch (e) {
      setError(`Could not render this board: ${(e as Error).message}`);
    } finally {
      changing.current = false;
    }
  }, [board?.id, board?.elements, api]);
  useEffect(() => {
    if (!api || !partial?.length || board) return;
    try {
      const elements = normalizeElements(partial);
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      api.scrollToContent(elements, { fitToViewport: true });
    } catch {
      /* A partial drawing may refer to a shape still being streamed. */
    }
  }, [partial, api, board]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (contextTimer.current) clearTimeout(contextTimer.current);
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = (name: string, args: Record<string, unknown>) =>
    run(async () => {
      accept(await call(name, args));
    });
  const save = () =>
    run(async () => {
      if (!api || !board) return;
      const current = api.getSceneElements();
      const sent = signature(current);
      const result = await call("save_board", {
        id: board.id,
        expectedRevision: board.revision,
        elements: current,
      });
      const saved = result._meta?.board as Board;
      if (!saved)
        throw new Error(
          "Save was not confirmed. Your changes remain on the canvas.",
        );
      boardRef.current = saved;
      // Keep newer typing on screen if a user edits while the save is in flight.
      if (signature(api.getSceneElements()) === sent) {
        dirtyRef.current = false;
        setDirty(false);
        accept(result);
      } else
        setBoard((previous) =>
          previous ? { ...previous, revision: saved.revision } : previous,
        );
      await host.current
        ?.updateModelContext({
          content: [
            {
              type: "text",
              text: `User saved manual edits to board ${saved.id}, revision ${saved.revision}. Read this latest board before refining it.`,
            },
          ],
        })
        .catch(() => {});
    });
  const focusFrame = (index: number) => {
    setFrame(index);
    const elements = api?.getSceneElements() ?? [];
    const targets =
      index < 0
        ? elements
        : elements.filter((el) =>
            board?.frames[index]?.elementIds.includes(el.id),
          );
    if (targets.length)
      api?.scrollToContent(targets, {
        fitToViewport: true,
        viewportZoomFactor: 0.8,
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        duration: 350,
      });
  };
  const download = (format: "svg" | "excalidraw") =>
    run(async () => {
      if (!api || !board) return;
      const name =
        board.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 70) || "whiteboard";
      const contents =
        format === "svg"
          ? (
              await exportToSvg({
                elements: api.getSceneElements(),
                appState: {
                  ...api.getAppState(),
                  exportBackground: true,
                  viewBackgroundColor: "#ffffff",
                },
                files: api.getFiles(),
              })
            ).outerHTML
          : serializeAsJSON(
              api.getSceneElements(),
              api.getAppState(),
              api.getFiles(),
              "local",
            );
      const mimeType = format === "svg" ? "image/svg+xml" : "application/json";
      if (host.current) {
        const result = await host.current.downloadFile({
          contents: [
            {
              type: "resource",
              resource: {
                uri: `file:///${name}.${format}`,
                mimeType,
                text: contents,
              },
            },
          ],
        });
        if (result.isError)
          throw new Error("The host did not complete the download.");
      } else {
        const url = URL.createObjectURL(
          new Blob([contents], { type: mimeType }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `${name}.${format}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
  const expand = () =>
    run(async () => {
      if (!host.current) return;
      const result = await host.current.requestDisplayMode({
        mode: fullscreen ? "inline" : "fullscreen",
      });
      setFullscreen(result.mode === "fullscreen");
    });
  const hasCanvas = !!board || !!partial?.length;
  return (
    <main
      className={`whiteboard ${embedded ? "embedded" : "standalone"} ${fullscreen ? "fullscreen" : ""}`}
      data-theme={theme}
    >
      <header className="app-header">
        <div className="brand">
          {mark}
          <span>
            whiteboard<span className="brand-dot">.</span>
          </span>
        </div>
        <span className="header-note">
          {embedded
            ? "A little space to think"
            : "The open canvas for clear thinking"}
        </span>
        <span className="connection">
          <i className={ready ? "connected" : ""} />
          {ready ? (embedded ? "Connected" : "Local preview") : "Connecting"}
        </span>
      </header>
      {error && (
        <div className="notice" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {!hasCanvas ? (
        <section className="welcome">
          <div className="eyebrow">IDEAS LOOK BETTER OUT HERE</div>
          <h1>
            A little less explaining.
            <br />
            <em>A little more seeing.</em>
          </h1>
          <p>
            Turn a tangled thought into a clear diagram.
            <br />
            Give a good story room to unfold.
          </p>
          {!embedded ? (
            <>
              <div className="starter-heading">
                <span>Start with a spark</span>
                <button
                  className="text-button"
                  disabled={!ready || busy}
                  onClick={() =>
                    start("create_view", {
                      title: "Untitled whiteboard",
                      elements: "[]",
                    }).then(() => setEditing(true))
                  }
                >
                  Or a blank canvas ↗
                </button>
              </div>
              <div className="starters">
                {examples.map((example, i) => (
                  <button
                    className={`starter starter-${i}`}
                    key={example.name}
                    disabled={!ready || busy}
                    onClick={() => start(example.tool, example.args)}
                  >
                    <span className="starter-kind">{example.kind}</span>
                    <span className="mini-diagram" aria-hidden="true">
                      {i === 1
                        ? "01 — 02 — 03"
                        : i === 2
                          ? "○ ─ ◇ ─ □"
                          : "□ ⟶ □ ⟶ □"}
                    </span>
                    <strong>
                      {example.name}
                      <span>↗</span>
                    </strong>
                    <span className="starter-description">
                      {example.description}
                    </span>
                  </button>
                ))}
              </div>
              <p className="welcome-footnote">
                These examples use the real Whiteboard tools.
                <br />
                Connect Whiteboard to ChatGPT to draw from a conversation.
              </p>
            </>
          ) : (
            <p className="welcome-footnote">
              Your diagram will appear here when it is ready.
            </p>
          )}
        </section>
      ) : (
        <section className="workspace">
          <div className="board-toolbar">
            <div className="board-heading">
              <span className="eyebrow">
                {board?.frames.length ? "VISUAL STORY" : "ON THE CANVAS"}
              </span>
              <h1>{board?.title ?? "Drawing your idea…"}</h1>
            </div>
            <div className="board-actions">
              <span className="save-state" role="status">
                {dirty
                  ? "Unsaved changes"
                  : board
                    ? `Saved · v${board.revision}`
                    : "Drawing…"}
              </span>
              <button disabled={busy || !board} onClick={() => focusFrame(-1)}>
                Fit
              </button>
              <button
                disabled={busy || !board}
                aria-pressed={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Done editing" : "Edit"}
              </button>
              {dirty && (
                <button className="primary" disabled={busy} onClick={save}>
                  Save changes
                </button>
              )}
              <details className="export-menu">
                <summary>Download ↓</summary>
                <div>
                  <button
                    disabled={busy || !board}
                    onClick={() => download("svg")}
                  >
                    SVG image
                  </button>
                  <button
                    disabled={busy || !board}
                    onClick={() => download("excalidraw")}
                  >
                    Editable file
                  </button>
                </div>
              </details>
              {embedded && (
                <button disabled={busy} onClick={expand}>
                  {fullscreen ? "Collapse ↙" : "Expand ↗"}
                </button>
              )}
            </div>
          </div>
          <div className="canvas" aria-label="Whiteboard drawing canvas">
            <Excalidraw
              excalidrawAPI={(value) => {
                setApi(value);
              }}
              theme={theme}
              viewModeEnabled={!editing}
              zenModeEnabled={!editing}
              initialData={{
                appState: {
                  viewBackgroundColor: "#ffffff",
                  currentItemFontFamily: 2,
                },
              }}
              UIOptions={{
                tools: { image: false },
                canvasActions: {
                  loadScene: false,
                  export: false,
                  saveAsImage: false,
                  toggleTheme: false,
                },
              }}
              onChange={(elements) => {
                if (changing.current || !boardRef.current || !editing) return;
                const changed = signature(elements) !== baseline.current;
                dirtyRef.current = changed;
                setDirty(changed);
                if (changed && host.current) {
                  if (contextTimer.current) clearTimeout(contextTimer.current);
                  contextTimer.current = setTimeout(() => {
                    if (!dirtyRef.current) return;
                    void host.current
                      ?.updateModelContext({
                        content: [
                          {
                            type: "text",
                            text: `The user has unsaved manual edits on board ${boardRef.current?.id}. Ask them to save changes before changing this board.`,
                          },
                        ],
                      })
                      .catch(() => {});
                  }, 500);
                }
              }}
            >
              <MainMenu>
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
                <MainMenu.Item onSelect={() => download("excalidraw")}>
                  Download editable file
                </MainMenu.Item>
              </MainMenu>
            </Excalidraw>
          </div>
          {board && board.frames.length > 0 && (
            <nav className="story-controls" aria-label="Story frames">
              <button
                aria-label="Previous frame"
                disabled={frame < 0}
                onClick={() => focusFrame(frame - 1)}
              >
                ←
              </button>
              <div className="story-caption">
                <span>
                  {frame < 0
                    ? "THE WHOLE STORY"
                    : `${String(frame + 1).padStart(2, "0")} / ${String(board.frames.length).padStart(2, "0")}`}
                </span>
                <strong>
                  {frame < 0
                    ? "Every beginning leads somewhere."
                    : board.frames[frame]?.title}
                </strong>
                {frame >= 0 && <p>{board.frames[frame]?.caption}</p>}
              </div>
              <button
                aria-label="Next frame"
                disabled={frame >= board.frames.length - 1}
                onClick={() => focusFrame(frame + 1)}
              >
                →
              </button>
            </nav>
          )}
          <div className="workspace-footer">
            <span>
              {editing
                ? "Make it yours. Save your changes when you’re ready."
                : "Scroll to explore. Edit to make it yours."}
            </span>
            {!embedded && (
              <button
                disabled={dirty || busy}
                className="text-button"
                onClick={() => {
                  setBoard(null);
                  boardRef.current = null;
                  setPartial(null);
                  setEditing(false);
                  window.history.replaceState(null, "", "/");
                }}
              >
                Start another board ↗
              </button>
            )}
          </div>
        </section>
      )}
      <footer className="app-footer">
        <span>OPEN DOCUMENT ALLIANCE</span>
        <span>Built with Excalidraw · MIT</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<WhiteboardApp />);
