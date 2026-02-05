import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./src/db/db";
import { accounts, sessions, users, verification } from "./src/db/schema";
import "dotenv/config";
import { createAuthClient } from "better-auth/client";

const githubClientId = Bun.env.GITHUB_CLIENT_ID;
const githubClientSecret = Bun.env.GITHUB_CLIENT_SECRET;
const devClientURL = `${Bun.env.DEV_PROTOCOL}://${Bun.env.DEV_DOMAIN}:${Bun.env.PORT}`;
const prodClientURL = `${Bun.env.PROD_PROTOCOL}://${Bun.env.PROD_DOMAIN}:${Bun.env.PORT}`;
const clientURL = Bun.env.APP_ENV === "development" ? devClientURL : prodClientURL;

if (!githubClientId || !githubClientSecret || !clientURL) {
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set");
}

export const auth = betterAuth({
    socialProviders: {
        github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
            scope: ["user:email", 'repo']
        },
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