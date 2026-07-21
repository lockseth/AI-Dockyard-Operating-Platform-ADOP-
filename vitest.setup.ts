import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Applies to every test file (jsdom or node) — a no-op for pure-logic
// *.test.ts files, but without it every *.test.tsx file would need its own
// afterEach(cleanup)/beforeEach(cleanup) or component output from one test
// leaks into the next test's DOM within the same file.
afterEach(() => {
  cleanup();
});
