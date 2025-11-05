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
    const stage = $app.stage;

    // VALID: cors is object with correct property names and string maxAge
    const bucket = new sst.aws.Bucket("MawaveBucket", {
      cors: {
        allowHeaders: ["*"],
        allowMethods: ["GET", "POST", "PUT"],
        allowOrigins: ["*"],
        maxAge: "3000 seconds",
      },
    });

    // VALID: timeout and memory are strings with units
    const func = new sst.aws.Function("MyFunc", {
      handler: "src/index.handler",
      timeout: "900 seconds",
      memory: "1024 MB",
    });

    // VALID: ttl is just the field name
    const table = new sst.aws.Dynamo("MyTable", {
      fields: {
        id: "string",
        expireAt: "number",
      },
      primaryIndex: { hashKey: "id" },
      ttl: "expireAt",
    });

    // VALID: NEXTAUTH_URL is defined
    const site = new sst.aws.Nextjs("Site", {
      environment: {
        NEXTAUTH_URL: stage === "production"
          ? "https://example.com"
          : "http://localhost:3000",
      },
    });

    return {
      bucket: bucket.name,
      function: func.name,
      table: table.name,
      site: site.url,
    };
  },
});
