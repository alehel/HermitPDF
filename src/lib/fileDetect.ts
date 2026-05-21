export const ACCEPT_ATTRIBUTE =
  ".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png,.heic,.heif,image/heic,image/heif";

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isImageFile(file: File): boolean {
  return IMAGE_MIMES.has(file.type) || IMAGE_EXTENSIONS.has(extensionOf(file.name));
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || extensionOf(file.name) === ".pdf";
}

export function isAcceptedFile(file: File): boolean {
  return isPdfFile(file) || isImageFile(file);
}

function isHeic(file: File): boolean {
  const ext = extensionOf(file.name);
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    ext === ".heic" ||
    ext === ".heif"
  );
}

async function heicToJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

export interface DetectedFile {
  data: Blob;
  magic: string;
}

export async function detectFile(file: File): Promise<DetectedFile> {
  if (isPdfFile(file)) {
    return { data: file, magic: "application/pdf" };
  }

  if (isHeic(file)) {
    const jpeg = await heicToJpeg(file);
    return { data: jpeg, magic: "image/jpeg" };
  }

  if (file.type === "image/png" || extensionOf(file.name) === ".png") {
    return { data: file, magic: "image/png" };
  }

  // Default remaining accepted images (JPEG) to image/jpeg
  if (isImageFile(file)) {
    return { data: file, magic: "image/jpeg" };
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}
