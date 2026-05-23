import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    effect: "src/effect.ts",
  },
  dts: true,
  format: ["esm"],
  sourcemap: true,
  clean: true,
  external: ["effect"],
});
