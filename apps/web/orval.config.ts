import { defineConfig } from "orval";

export default defineConfig({
  runningMan: {
    input: {
      target: "../../contracts/v1/openapi.json",
    },
    output: {
      target: "./shared/api/generated/clients.ts",
      schemas: {
        path: "./shared/api/generated/model",
        type: "zod",
      },
      client: "fetch",
      baseUrl: "",
      override: {
        fetch: {
          runtimeValidation: true,
          useRuntimeFetcher: true,
        },
      },
    },
  },
});
