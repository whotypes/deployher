import path from "path";

const EXT_TO_MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  eot: "application/vnd.ms-fontobject",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  pdf: "application/pdf",
  map: "application/json"
};

export const guessContentType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
};
