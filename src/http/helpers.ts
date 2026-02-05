export const json = (data: unknown, init: ResponseInit = {}) =>
  Response.json(data, {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers ?? {})
    }
  });

export const badRequest = (message: string) => json({ error: message }, { status: 400 });
export const notFound = (message = "Not Found") => json({ error: message }, { status: 404 });

export const parseJson = async <T>(req: Request): Promise<T | null> => {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
};

export type RequestWithParams<P extends Record<string, string> = Record<string, string>> = Request & {
  params: P;
};
