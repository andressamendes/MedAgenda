/**
 * Reusable jsdom fixture — loads the REAL index.html so View tests exercise
 * the actual production markup instead of a hand-maintained copy that could
 * drift out of sync.
 */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.join(__dirname, "..", "..", "index.html");
const INDEX_HTML = fs.readFileSync(INDEX_HTML_PATH, "utf8");

// jsdom has no layout engine, so every element's offsetParent is always null
// — this breaks any code (like modalController.js's focusable-element scan)
// that uses offsetParent as a "is this visible?" check. Patch it with a
// hidden/display/visibility walk, which is all real browsers guarantee for
// elements without a fixed/absolute position anyway.
function patchOffsetParent(window) {
  Object.defineProperty(window.HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      let node = this;
      while (node && node.nodeType === 1) {
        if (node.hidden) return null;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return null;
        node = node.parentElement;
      }
      return window.document.body;
    },
  });
}

const GLOBALS = [
  "window", "document", "navigator", "localStorage", "sessionStorage",
  "HTMLElement", "Event", "KeyboardEvent", "MouseEvent", "CustomEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle",
];

/**
 * Installs a fresh jsdom document (from the real index.html) onto Node's
 * global scope so plain `import`-ed browser modules work unmodified.
 * Returns the JSDOM instance; call uninstallDom() afterwards to tear down.
 */
export function installDom({ url = "http://localhost/" } = {}) {
  const dom = new JSDOM(INDEX_HTML, { url, pretendToBeVisual: true });
  patchOffsetParent(dom.window);

  for (const name of GLOBALS) {
    // Plain assignment fails for globals Node itself defines as
    // getter-only accessors (e.g. the built-in `navigator`) — redefine
    // the property outright instead.
    Object.defineProperty(globalThis, name, {
      value: dom.window[name],
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }

  return dom;
}

export function uninstallDom() {
  for (const name of GLOBALS) {
    delete globalThis[name];
  }
}
