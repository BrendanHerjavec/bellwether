import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Needed for the component tests: Next sets jsx "preserve", so esbuild alone
  // leaves JSX untransformed.
  plugins: [react()],
  test: {
    // Pure logic runs in node; the component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock, so the fast suite stays fast.
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
