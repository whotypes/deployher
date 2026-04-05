const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|[01]?\d\d?)(\.(25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;

const isPlausibleIp = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (IPV4_REGEX.test(trimmed)) return true;
  if (trimmed.includes(":")) return true;
  return false;
};

export const getClientIpFromRequest = (req: Request, trustProxy: boolean): string => {
  if (trustProxy) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first && isPlausibleIp(first)) {
        return first;
      }
    }
  }
  return "unknown";
};
