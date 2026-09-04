import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [
    {
      // The source imports itself with the "@/name.js" specifiers that Node
      // resolves at runtime, so the extension has to be mapped back to .ts here.
      // Vite would otherwise look for a compiled dist/ that only exists after a
      // build, and the tests would run against yesterday's bundle.
      name: "source-alias",
      resolveId(source) {
        if (!source.startsWith("@/")) return null;
        return resolve(sourceRoot, source.slice(2).replace(/\.js$/u, ".ts"));
      },
    },
  ],
});
