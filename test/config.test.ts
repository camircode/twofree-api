import { describe, expect, it } from "vitest";

import { loadApiConfig } from "@/config.js";

const baseEnv = {
  BETTER_AUTH_SECRET: "api-config-test-secret-with-more-than-32-bytes",
  APP_PROFILE: "ci",
} as const;

describe("API configuration", () => {
  // Guards the one value that a container cannot recover from being wrong: the
  // Service, the containerPort and both probes in manifests/twofree-api all
  // name 8080.
  it("listens on 8080 unless the environment says otherwise", () => {
    expect(loadApiConfig({ ...baseEnv }).apiPort).toBe(8080);
  });

  it("keeps the port and the bind address settable", () => {
    const config = loadApiConfig({ ...baseEnv, API_PORT: "9090", API_HOST: "0.0.0.0" });
    expect(config.apiPort).toBe(9090);
    expect(config.apiHost).toBe("0.0.0.0");
  });
});
