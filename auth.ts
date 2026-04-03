import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./src/db/db";
import { accounts, sessions, users, verification } from "./src/db/schema";
import { config, getDevBaseUrl, getProdBaseUrl, getTrustedAppOrigins } from "./src/config";
import "dotenv/config";
import { createAuthClient } from "better-auth/client";

const githubClientId = Bun.env.GITHUB_CLIENT_ID;
const githubClientSecret = Bun.env.GITHUB_CLIENT_SECRET;
const clientURL = config.env === "development" ? getDevBaseUrl() : getProdBaseUrl();

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
            scope: ["user:email"]
        },
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
        camelCase: true,
    })
});

export const { signIn, signUp, useSession } = createAuthClient({
  baseURL: clientURL,
});
