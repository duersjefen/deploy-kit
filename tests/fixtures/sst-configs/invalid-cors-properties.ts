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
    // INVALID: Wrong property names (allowed* instead of allow*)
    // INVALID: maxAge should be string with units, not number
    const bucket = new sst.aws.Bucket("MawaveBucket", {
      cors: {
        allowedHeaders: ["*"],      // Should be allowHeaders
        allowedMethods: ["GET"],    // Should be allowMethods
        allowedOrigins: ["*"],      // Should be allowOrigins
        maxAge: 3000,               // Should be "3000 seconds"
      },
    });

    return {
      bucket: bucket.name,
    };
  },
});
