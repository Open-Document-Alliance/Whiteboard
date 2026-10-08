import {
  convertToExcalidrawElements,
  CaptureUpdateAction,
  getDataURL,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  BinaryFileData,
} from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";

export interface ChatGPTFiles {
  uploadFile?: (
    file: File,
    options?: { library?: boolean },
  ) => Promise<{ fileId: string }>;
  selectFiles?: () => Promise<
    { fileId: string; fileName: string; mimeType: string }[]
  >;
  getFileDownloadUrl?: (input: {
    fileId: string;
  }) => Promise<{ downloadUrl: string }>;
}
export const fileHost = () =>
  (window as Window & { openai?: ChatGPTFiles }).openai;

/** Only downloads files explicitly selected in the host's authorized picker. */
export async function importHostImages(api: ExcalidrawImperativeAPI) {
  const host = fileHost();
  if (!host?.selectFiles || !host.getFileDownloadUrl) return;
  for (const selected of await host.selectFiles()) {
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        selected.mimeType,
      )
    )
      throw new Error(
        "Select a PNG, JPEG, WebP, or GIF image. Use Open for local .excalidraw files.",
      );
    const { downloadUrl } = await host.getFileDownloadUrl({
      fileId: selected.fileId,
    });
    if (new URL(downloadUrl).protocol !== "https:")
      throw new Error("The host returned an invalid file URL.");
    const response = await fetch(downloadUrl, { credentials: "omit" });
    if (!response.ok) throw new Error("Could not download the selected image.");
    const blob = await response.blob();
    if (blob.size > 10 * 1024 * 1024)
      throw new Error("Use an image smaller than 10 MB.");
    const dataURL = await getDataURL(
      new Blob([blob], { type: selected.mimeType }),
    );
    const bitmap = await createImageBitmap(blob);
    const width = Math.min(bitmap.width, 800),
      height = (bitmap.height * width) / bitmap.width;
    bitmap.close();
    const id = crypto.randomUUID() as FileId;
    const state = api.getAppState();
    const elements = convertToExcalidrawElements([
      {
        type: "image",
        fileId: id,
        x: -state.scrollX + 80,
        y: -state.scrollY + 80,
        width,
        height,
      },
    ]);
    api.addFiles([
      {
        id,
        mimeType: selected.mimeType as BinaryFileData["mimeType"],
        dataURL,
        created: Date.now(),
      },
    ]);
    api.updateScene({
      elements: [...api.getSceneElements(), ...elements],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(elements);
  }
}
