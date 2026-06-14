/** Shared config module stub for unit tests that mock `../config`. */
export const unitTestConfigMock = (configOverrides: Record<string, unknown> = {}) => ({
  config: {
    env: "development",
    devDomain: "localhost",
    prodDomain: "deployher.example.com",
    devProtocol: "http",
    prodProtocol: "https",
    port: 3001,
    auth: { url: undefined as string | undefined },
    build: {
      workers: 2,
      accountMaxConcurrent: 1,
      accountSlotTtlSeconds: 21600,
      repoCredentialTtlSeconds: 3600,
      reclaimIdleMs: 5000,
      pendingHeartbeatMs: 30000
    },
    preview: { assetBaseUrl: undefined },
    runner: { previewEnabled: false, url: undefined, sharedSecret: undefined },
    redis: { url: undefined },
    observability: { trustProxy: false, previewTrafficSampleRate: 0 },
    deployher: {
      primaryDomain: "deployher.example.com",
      landingHostnames: ["deployher.example.com"],
      dashHostname: "dash.deployher.example.com",
      apiHostname: "api.deployher.example.com",
      cookieDomain: ".deployher.example.com",
      extraTrustedOrigins: []
    },
    ...configOverrides
  },
  getDevBaseUrl: () => "http://localhost:3001",
  getProdBaseUrl: () => "https://deployher.example.com",
  getAuthBaseUrl: () => "http://localhost:3001",
  getTrustedAppOrigins: () => [
    "http://localhost:3001",
    "https://deployher.example.com",
    "https://dash.deployher.example.com",
    "https://api.deployher.example.com"
  ],
  getDevProjectUrlPattern: () => "http://{project}.localhost:3001",
  getProdProjectUrlPattern: () => "https://{project}.deployher.example.com",
  buildDevSubdomainUrl: (label: string) => `http://${label}.localhost:3001`,
  buildPublicPreviewUrl: (label: string) => `http://${label}.localhost:3001`,
  resolveProjectDomains: (project: { id: string; name: string }) => ({
    dev: `http://${project.id}.localhost:3001`,
    prod: `https://${project.id}.deployher.example.com`
  })
});
