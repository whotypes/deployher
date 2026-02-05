import { auth } from "../../auth";
import { json, type RequestWithParams } from "../http/helpers";

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export type RequestWithParamsAndSession<P extends Record<string, string> = Record<string, string>> = RequestWithParams<P> & {
  session: NonNullable<Session>;
};

export type PublicRouteHandler = (req: RequestWithParams) => Response | Promise<Response>;

export type ProtectedRouteHandler = (req: RequestWithParamsAndSession) => Response | Promise<Response>;

export const getSession = (req: Request): Promise<Session> =>
  auth.api.getSession({ headers: req.headers });

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
