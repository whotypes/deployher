export type ServerLike = {
  hostname?: string;
  port?: number;
  pendingRequests?: number;
  pendingWebSockets?: number;
};

let serverRef: ServerLike | undefined;
let startedAtRef: number;

export const setStartedAt = (t: number) => {
  startedAtRef = t;
};

export const getStartedAt = (): number => startedAtRef;

export const setServer = (s: ServerLike | undefined) => {
  serverRef = s;
};

export const getServer = (): ServerLike | undefined => serverRef;
