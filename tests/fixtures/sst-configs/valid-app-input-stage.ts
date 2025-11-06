/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * VALID: Using input?.stage in app() function is correct
 * This should NOT trigger SST-VAL-001
 */
export default $config({
  app(input) {
    return {
      name: "test-app",
      removal: input?.stage === "production" ? "retain" : "remove",  // ✅ VALID - input?.stage in app()
      home: "aws",
      providers: {
        aws: {
          profile: input?.stage === "production" ? "prod-profile" : "dev-profile"  // ✅ VALID
        }
      }
    };
  },
  async run() {
    const stage = $app.stage;  // ✅ VALID - $app.stage in run()

    const bucket = new sst.aws.Bucket("MyBucket");

    return {
      bucket: bucket.name,
    };
  },
});
