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
    // INVALID: cors should be object, not array
    const bucket = new sst.aws.Bucket("MawaveBucket", {
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: ["GET"],
          allowedOrigins: ["*"],
          maxAge: 3000,
        }
      ],
    });

    return {
      bucket: bucket.name,
    };
  },
});
