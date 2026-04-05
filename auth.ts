import "./src/env/bootstrap";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./src/db/db";
import { accounts, sessions, users, verification } from "./src/db/schema";
import { config, getAuthBaseUrl, getTrustedAppOrigins } from "./src/config";

const githubClientId = process.env.GITHUB_CLIENT_ID ?? Bun.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? Bun.env.GITHUB_CLIENT_SECRET;
const clientURL = getAuthBaseUrl();

if (!githubClientId || !githubClientSecret || !clientURL) {
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set");
}

export const auth = betterAuth({
    baseURL: clientURL,
    trustedOrigins: getTrustedAppOrigins(),
    socialProviders: {
        github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
            scope: ["user:email", "repo"]
        }
    },
    user: {
        additionalFields: {
            role: {
                type: "string",
                defaultValue: "user"
            }
        }
    },
    account: {
        encryptOAuthTokens: true
    },
    advanced: {
        useSecureCookies: config.env === "production" && new URL(clientURL).protocol === "https:",
        disableCSRFCheck: false,
        disableOriginCheck: false,
        defaultCookieAttributes: {
            sameSite: "lax",
            secure: config.env === "production" && new URL(clientURL).protocol === "https:"
        }
    },
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            users,
            sessions,
            accounts,
            verifications: verification
        },
        usePlural: true,
        camelCase: true
    })
});
