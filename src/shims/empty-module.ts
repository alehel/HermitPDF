// Empty shim for Node.js "module" built-in in browser context.
// mupdf-wasm.js conditionally imports "module" for Node.js but never uses it in browsers.
export function createRequire() {
  throw new Error("createRequire is not available in browser");
}
