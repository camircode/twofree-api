import { loadRuntimeConfig, type RuntimeConfig } from "@camircode/twofree-application";

// The shared loader still defaults API_PORT to 3001, which is the port the
// monorepo dev server used. Every manifest on this platform — the Service, the
// Deployment's containerPort and both probes — names 8080, so an image left on
// 3001 answers nothing the cluster ever asks it and reports itself as an
// application that never started. The default is overridden here rather than in
// the published package because 8080 is a deployment convention of this
// repository, not a property of the configuration contract.
const apiDefaults = {
  API_PORT: "8080",
} as const;

// The caller's environment is spread last so API_PORT and API_HOST stay
// settable: containers need API_HOST=0.0.0.0, because a process bound to
// 127.0.0.1 inside a pod is unreachable from the kubelet and from the Service.
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return loadRuntimeConfig({ ...apiDefaults, ...env });
}
