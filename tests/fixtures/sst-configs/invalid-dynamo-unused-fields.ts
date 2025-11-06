/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * INVALID: DynamoDB fields defined but not indexed
 * Should trigger SST-VAL-061
 */
export default $config({
  app(input) {
    return {
      name: "test-app",
      removal: input?.stage === "production" ? "retain" : "remove",  // ✅ Valid - input?.stage in app()
      home: "aws",
    };
  },
  async run() {
    const stage = $app.stage;  // ✅ Valid - $app.stage in run()

    // INVALID: createdAt and lastReadAt are defined but not indexed
    const table = new sst.aws.Dynamo("MyTable", {
      fields: {
        id: "string",
        createdAt: "number",     // ❌ WRONG - defined but not indexed
        lastReadAt: "number"     // ❌ WRONG - defined but not indexed
      },
      primaryIndex: { hashKey: "id" }
    });

    return {
      table: table.name,
    };
  },
});
