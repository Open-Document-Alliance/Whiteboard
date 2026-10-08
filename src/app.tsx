import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  CaptureUpdateAction,
  serializeAsJSON,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Board } from "./model.js";
import { normalizeElements, parsePartialElements } from "./scene.js";
import "@excalidraw/excalidraw/index.css";
import "./style.css";
import { fileHost, importHostImages } from "./file-import.js";

const embedded = window.self !== window.top;
type Theme = "light" | "dark";
type ThemeChoice = Theme | "system";
const signature = (
  elements: readonly ExcalidrawElement[],
  state: Pick<AppState, "viewBackgroundColor" | "name">,
  files: BinaryFiles,
) =>
  JSON.stringify([
    elements
      .filter((el) => !el.isDeleted)
      .map((el) => [el.id, el.version, el.versionNonce]),
    state.viewBackgroundColor,
    state.name,
    Object.values(files).map((file) => [
      file.id,
      file.version,
      file.dataURL.length,
    ]),
  ]);
function scene(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  const state = api.getAppState();
  const ids = new Set(
    elements.flatMap((el) =>
      el.type === "image" && el.fileId ? [el.fileId] : [],
    ),
  );
  const files = Object.fromEntries(
    Object.entries(api.getFiles()).filter(([id]) => ids.has(id as never)),
  );
  return {
    elements,
    files,
    appState: { viewBackgroundColor: state.viewBackgroundColor },
    title: state.name || "Untitled whiteboard",
  };
}
function WhiteboardApp() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [systemTheme, setSystemTheme] = useState<Theme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
  const [hostTheme, setHostTheme] = useState<Theme>();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => {
    try {
      const value = localStorage.getItem("whiteboard-theme");
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  });
  const [capabilities, setCapabilities] = useState({
    download: false,
    message: false,
    fullscreen: false,
    upload: false,
    importImages: false,
  });
  const host = useRef<App | null>(null);
  const local = useRef<Client | null>(null);
  const board = useRef<Board | null>(null);
  const pending = useRef<Board | null>(null);
  const dirty = useRef(false);
  const baseline = useRef("");
  const loading = useRef(true);
  const saving = useRef<Promise<void> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const apiRef = useRef(api);
  apiRef.current = api;
  const theme =
    themeChoice === "system" ? (hostTheme ?? systemTheme) : themeChoice;

  const report = (e: unknown) => {
    if ((e as Error).name !== "AbortError") setError((e as Error).message);
  };
  const applyBoard = useCallback((next: Board) => {
    const canvas = apiRef.current;
    if (!canvas) {
      pending.current = next;
      return;
    }
    const elements = normalizeElements(next.elements);
    const appState = {
      ...canvas.getAppState(),
      ...next.appState,
      name: next.title,
    };
    canvas.addFiles(
      Object.values(next.files ?? {}) as unknown as Parameters<
        typeof canvas.addFiles
      >[0],
    );
    baseline.current = signature(elements, appState, canvas.getFiles());
    dirty.current = false;
    board.current = next;
    canvas.updateScene({
      elements,
      appState,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    canvas.scrollToContent(elements, {
      fitToViewport: true,
      viewportZoomFactor: 0.9,
    });
    if (!embedded) window.history.replaceState(null, "", `#board=${next.id}`);
  }, []);
  const accept = useCallback(
    (result: CallToolResult) => {
      if (result.isError)
        throw new Error(
          result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"),
        );
      const next = result._meta?.board as Board | undefined;
      if (!next) return;
      if (dirty.current || saving.current) {
        setError(
          "A newer board is available. Your edits are still here. Save a local copy from the menu before reloading.",
        );
        return;
      }
      applyBoard(next);
    },
    [applyBoard],
  );
  const call = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const result = (
        host.current
          ? await host.current.callServerTool({ name, arguments: args })
          : await local.current!.callTool({ name, arguments: args })
      ) as CallToolResult;
      if (result.isError)
        throw new Error(
          result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"),
        );
      return result;
    },
    [],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let disposed = false;
    if (embedded) {
      const app = new App(
        { name: "Whiteboard", version: "0.1.0" },
        { availableDisplayModes: ["inline", "fullscreen"] },
      );
      host.current = app;
      app.ontoolresult = (result) => {
        if (!disposed) {
          try {
            accept(result as CallToolResult);
          } catch (e) {
            report(e);
          }
        }
      };
      app.ontoolinput = () => {};
      app.ontoolinputpartial = (input) => {
        if (board.current || dirty.current || !apiRef.current) return;
        const elements = parsePartialElements(input.arguments?.elements);
        if (!elements.length) return;
        try {
          const canvas = apiRef.current;
          const normalized = normalizeElements(elements);
          baseline.current = signature(
            normalized,
            canvas.getAppState(),
            canvas.getFiles(),
          );
          canvas.updateScene({
            elements: normalized,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          canvas.scrollToContent(normalized, { fitToViewport: true });
        } catch {
          /* Wait for the complete shape. */
        }
      };
      app.onhostcontextchanged = (context) => {
        if (context.theme) setHostTheme(context.theme);
        if (context.safeAreaInsets)
          for (const [edge, value] of Object.entries(context.safeAreaInsets))
            document.documentElement.style.setProperty(
              `--safe-${edge}`,
              `${value}px`,
            );
      };
      app.onteardown = async () => {
        await saveRef.current();
        return {};
      };
      app
        .connect()
        .then(() => {
          if (disposed) return;
          setHostTheme(app.getHostContext()?.theme);
          const caps = app.getHostCapabilities();
          setCapabilities({
            download: !!caps?.downloadFile,
            message: !!caps?.message?.text,
            fullscreen: !!app
              .getHostContext()
              ?.availableDisplayModes?.includes("fullscreen"),
            upload: !!fileHost()?.uploadFile,
            importImages:
              !!fileHost()?.selectFiles && !!fileHost()?.getFileDownloadUrl,
          });
          loading.current = false;
          setReady(true);
        })
        .catch(report);
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
        loading.current = false;
        setReady(true);
      })
      .catch((e) => {
        loading.current = false;
        setError(
          `Server unavailable. You can still draw and save a local file. ${e.message}`,
        );
      });
    return () => {
      disposed = true;
      void client.close();
    };
  }, [accept]);
  useEffect(() => {
    if (api && pending.current) {
      const next = pending.current;
      pending.current = null;
      applyBoard(next);
    }
  }, [api, applyBoard]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(saveTimer.current);
    };
  }, []);

  const save = async () => {
    if (saving.current) return saving.current;
    if (!api || !ready || !dirty.current) return;
    const work = async () => {
      const payload = scene(api);
      const sent = signature(
        api.getSceneElements(),
        api.getAppState(),
        api.getFiles(),
      );
      const result = board.current
        ? await call("save_board", {
            id: board.current.id,
            expectedRevision: board.current.revision,
            ...payload,
          })
        : await call("create_view", {
            ...payload,
            elements: JSON.stringify(payload.elements),
          });
      const saved = result._meta?.board as Board | undefined;
      if (!saved)
        throw new Error(
          "Save was not confirmed. Your edits remain on the canvas.",
        );
      board.current = saved;
      baseline.current = sent;
      dirty.current =
        signature(api.getSceneElements(), api.getAppState(), api.getFiles()) !==
        sent;
      if (!embedded)
        window.history.replaceState(null, "", `#board=${saved.id}`);
      if (host.current?.getHostCapabilities()?.updateModelContext)
        void host.current
          .updateModelContext({
            content: [
              {
                type: "text",
                text: `Whiteboard ${saved.id}, revision ${saved.revision}, has the user's latest edits. Call read_board before changing it. Image files are preserved by update_board when omitted.`,
              },
            ],
          })
          .catch(() => {});
      setError("");
    };
    saving.current = work();
    try {
      await saving.current;
    } finally {
      saving.current = null;
    }
    if (dirty.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(
        () => void saveRef.current().catch(report),
        750,
      );
    }
  };
  saveRef.current = save;
  const run = (action: () => Promise<unknown>) => {
    void action().catch(report);
  };
  const fileContents = () => {
    if (!api) throw new Error("Canvas is still loading.");
    return serializeAsJSON(
      api.getSceneElements(),
      api.getAppState(),
      api.getFiles(),
      "local",
    );
  };
  const download = async (format: "excalidraw" | "svg") => {
    if (!api) return;
    const text =
      format === "svg"
        ? (
            await exportToSvg({
              elements: api.getSceneElements(),
              appState: api.getAppState(),
              files: api.getFiles(),
            })
          ).outerHTML
        : fileContents();
    const mimeType =
      format === "svg" ? "image/svg+xml" : "application/vnd.excalidraw+json";
    const name = `${(api.getAppState().name || "whiteboard").replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 80)}.${format}`;
    if (host.current && capabilities.download) {
      const result = await host.current.downloadFile({
        contents: [
          {
            type: "resource",
            resource: {
              uri: `file:///${encodeURIComponent(name)}`,
              mimeType,
              text,
            },
          },
        ],
      });
      if (result.isError)
        throw new Error(
          "The host could not save the file. Try Export image or Save to in the menu.",
        );
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  return (
    <main className="whiteboard" data-theme={theme}>
      <Excalidraw
        excalidrawAPI={setApi}
        theme={theme}
        UIOptions={{ canvasActions: { toggleTheme: true } }}
        initialData={{ appState: { name: "Untitled whiteboard" } }}
        onChange={(elements, state, files) => {
          if (loading.current) return;
          const value = signature(elements, state, files);
          if (!baseline.current && !elements.length) {
            baseline.current = value;
            return;
          }
          dirty.current = value !== baseline.current;
          clearTimeout(saveTimer.current);
          if (dirty.current)
            saveTimer.current = setTimeout(
              () => void saveRef.current().catch(report),
              750,
            );
        }}
      >
        <WelcomeScreen>
          <></>
        </WelcomeScreen>
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          {capabilities.importImages && (
            <MainMenu.Item
              onSelect={() => api && run(() => importHostImages(api))}
            >
              Insert image from ChatGPT files
            </MainMenu.Item>
          )}
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Item onSelect={() => run(() => download("excalidraw"))}>
            Download .excalidraw
          </MainMenu.Item>
          <MainMenu.Item onSelect={() => run(() => download("svg"))}>
            Download SVG
          </MainMenu.Item>
          {embedded && (
            <MainMenu.Item
              disabled={!ready}
              onSelect={() =>
                run(async () => {
                  await save();
                  api?.setToast({ message: "Board saved" });
                })
              }
            >
              Save board
            </MainMenu.Item>
          )}
          {capabilities.upload && (
            <MainMenu.Item
              onSelect={() =>
                run(async () => {
                  await fileHost()!.uploadFile!(
                    new File(
                      [fileContents()],
                      `${api?.getAppState().name || "whiteboard"}.excalidraw`,
                      { type: "application/json" },
                    ),
                    { library: true },
                  );
                  api?.setToast({ message: "File saved to ChatGPT" });
                })
              }
            >
              Save to ChatGPT files
            </MainMenu.Item>
          )}
          {capabilities.message && (
            <MainMenu.Item
              onSelect={() =>
                run(async () => {
                  await save();
                  if (!board.current) throw new Error("Draw something first.");
                  const result = await host.current!.sendMessage({
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: `Help me refine Whiteboard ${board.current.id}. Read its latest revision before changing it and preserve my edits and images.`,
                      },
                    ],
                  });
                  if (result.isError)
                    throw new Error("The host could not send the message.");
                })
              }
            >
              Discuss this board
            </MainMenu.Item>
          )}
          {capabilities.fullscreen && (
            <MainMenu.Item
              onSelect={() =>
                run(() =>
                  host.current!.requestDisplayMode({
                    mode:
                      host.current!.getHostContext()?.displayMode ===
                      "fullscreen"
                        ? "inline"
                        : "fullscreen",
                  }),
                )
              }
            >
              Toggle fullscreen
            </MainMenu.Item>
          )}
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme
            allowSystemTheme
            theme={themeChoice}
            onSelect={(choice) => {
              setThemeChoice(choice);
              try {
                localStorage.setItem("whiteboard-theme", choice);
              } catch {
                /* Private iframe storage may be unavailable. */
              }
            }}
          />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
      {error && (
        <div className="notice" role="alert">
          <span>{error}</span>
          <button onClick={() => run(() => download("excalidraw"))}>
            Save a copy
          </button>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<WhiteboardApp />);
