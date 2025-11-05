/// <reference path="../../../.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "test-app",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // INVALID: timeout and memory should be strings with units, not numbers
    const func = new sst.aws.Function("MyFunc", {
      handler: "src/index.handler",
      timeout: 900,        // Should be "900 seconds"
      memory: 1024,        // Should be "1024 MB"
    });

    return {
      function: func.name,
    };
  },
});
