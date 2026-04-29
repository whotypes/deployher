const raw = (process.env.DEPLOYHER_CLI_CLIENT_ID ?? Bun.env.DEPLOYHER_CLI_CLIENT_ID ?? "").trim();

export const DEPLOYHER_CLI_CLIENT_ID = raw.length > 0 ? raw : "deployher-cli";
