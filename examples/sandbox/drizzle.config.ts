import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://querykit:querykit@127.0.0.1:3307/querykit_sandbox",
  },
});
