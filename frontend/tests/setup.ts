import "@testing-library/jest-dom/vitest";

// jsdom implements no scrolling, and the chat drawer scrolls its transcript to
// the newest message on mount. Stub it so component tests can render the panel.
// Guarded: some suites opt into the node environment, where there is no DOM.
if (typeof Element !== "undefined")
  Element.prototype.scrollIntoView = () => {};
