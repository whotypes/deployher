import { auth } from "../../auth";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { json, type RequestWithParams } from "../http/helpers";
import { eq } from "drizzle-orm";

type RawSession = Awaited<ReturnType<typeof auth.api.getSession>>;
type LoadedSession = Exclude<RawSession, null>;
export type Session = (LoadedSession & {
  user: LoadedSession["user"] & {
    role: typeof schema.users.$inferSelect.role;
  };
}) | null;

export type RequestWithParamsAndSession<P extends Record<string, string> = Record<string, string>> = RequestWithParams<P> & {
  session: NonNullable<Session>;
  csrfToken?: string;
};

export type PublicRouteHandler = (req: RequestWithParams) => Response | Promise<Response>;

export type ProtectedRouteHandler = (req: RequestWithParamsAndSession) => Response | Promise<Response>;

const getUserRole = async (userId: string): Promise<typeof schema.users.$inferSelect.role> => {
  const [user] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return user?.role ?? "user";
};

export const getSession = async (req: Request): Promise<Session> => {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return null;
  }

  const role = await getUserRole(session.user.id);
  return {
    ...session,
    user: {
      ...session.user,
      role
    }
  };
};

const LOGIN_PATH = "/login";

const isApiPath = (pathname: string): boolean =>
  pathname.startsWith("/api/") && !pathname.startsWith("/api/auth");

export const requireSession = async (
  req: Request,
  pathname: string
): Promise<{ response: Response } | { session: NonNullable<Session> }> => {
  const session = await getSession(req);
  if (session) {
    return { session };
  }
  if (isApiPath(pathname)) {
    return { response: json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const url = new URL(req.url);
  const redirectUrl = url.pathname && url.pathname !== "/" ? `?redirect=${encodeURIComponent(url.pathname)}` : "";
  return {
    response: Response.redirect(new URL(LOGIN_PATH + redirectUrl, url.origin).toString(), 302)
  };
};
