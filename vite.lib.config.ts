import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/video2ascii/standalone.ts"),
      name: "AsciiRenderer",
      fileName: (format) => `ascii-renderer.${format}.js`,
      formats: ["es", "umd"],
    },
    outDir: "dist/lib",
  },
});
