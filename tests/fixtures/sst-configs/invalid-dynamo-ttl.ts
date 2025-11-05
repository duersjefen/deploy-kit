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
    // INVALID: ttl should be just the field name string, not an object
    const table = new sst.aws.Dynamo("MyTable", {
      fields: {
        id: "string",
        expireAt: "number",
      },
      primaryIndex: { hashKey: "id" },
      ttl: { enabled: true, attribute: "expireAt" },  // Should be: ttl: "expireAt"
    });

    return {
      table: table.name,
    };
  },
});
