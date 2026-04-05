import { unzipSync } from "fflate";
import { buildZipballUrl, type GitHubRepoSpec } from "../github";

export type LocsChild = Locs | number;

export type Locs = {
  loc: number;
  locByLangs?: Record<string, number>;
  children?: Record<string, LocsChild>;
};

export type RepoLocsPayload = {
  locs: Locs;
  truncated: boolean;
  truncatedReason?: string;
};

type FileEntry = { type: "file"; loc: number; lang: string };
type DirEntry = { type: "dir"; children: Record<string, FileEntry | DirEntry> };

const MAX_ZIP_BYTES = 45 * 1024 * 1024;
const MAX_FILES_SCANNED = 8000;
const MAX_FILE_BYTES = 512 * 1024;
const CACHE_TTL_MS = 8 * 60 * 1000;

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".turbo",
  ".nuxt",
  ".output",
  ".cache",
  "Pods",
  ".gradle"
]);

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "wasm",
  "so",
  "dylib",
  "dll",
  "exe",
  "mp3",
  "mp4",
  "webm",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "lockb",
  "bin",
  "dat",
  "sqlite",
  "db",
  "parquet",
  "jar",
  "class",
  "pyc",
  "pyo",
  "o",
  "a",
  "lib"
]);

const EXT_TO_LANG: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JSX",
  mjs: "JavaScript",
  cjs: "JavaScript",
  vue: "Vue",
  svelte: "Svelte",
  json: "JSON",
  md: "Markdown",
  mdx: "MDX",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "LESS",
  html: "HTML",
  htm: "HTML",
  py: "Python",
  pyw: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  swift: "Swift",
  c: "C",
  h: "C Header",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++ Header",
  cs: "C#",
  fs: "F#",
  fsx: "F#",
  php: "PHP",
  ex: "Elixir",
  exs: "Elixir",
  erl: "Erlang",
  hs: "Haskell",
  lhs: "Haskell",
  ml: "OCaml",
  mli: "OCaml",
  zig: "Zig",
  nim: "Nim",
  dart: "Dart",
  lua: "Lua",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  ps1: "PowerShell",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  svg: "SVG",
  graphql: "GraphQL",
  gql: "GraphQL",
  proto: "Protocol Buffers",
  tf: "HCL",
  hcl: "HCL",
  dockerfile: "Dockerfile",
  rbw: "Ruby",
  rake: "Ruby",
  gemspec: "Ruby",
  r: "R",
  scala: "Scala",
  sc: "Scala",
  clj: "Clojure",
  cljs: "ClojureScript",
  edn: "Edn",
  vim: "Vim script",
  tex: "TeX",
  rst: "ReStructuredText",
  org: "Org",
  plist: "XML",
  xcconfig: "Xcode Config",
  pbxproj: "Xcode Project",
  sol: "Solidity",
  move: "Move"
};

type CacheEntry = { expiresAt: number; payload: RepoLocsPayload };

const locsCache = new Map<string, CacheEntry>();

export const getRepoLocsCacheKey = (parts: {
  owner: string;
  repo: string;
  ref: string;
  projectRoot: string;
  filter: string;
}): string =>
  [
    parts.owner.toLowerCase(),
    parts.repo.toLowerCase(),
    parts.ref,
    parts.projectRoot,
    parts.filter
  ].join("\0");

export const getCachedRepoLocs = (key: string): RepoLocsPayload | null => {
  const hit = locsCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) locsCache.delete(key);
    return null;
  }
  return hit.payload;
};

export const setCachedRepoLocs = (key: string, payload: RepoLocsPayload): void => {
  locsCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
};

const normalizeProjectRoot = (projectRoot: string): string => {
  const t = projectRoot.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return t === "." || t === "" ? "" : t;
};

const pathHasSkipSegment = (relPath: string): boolean => {
  const segments = relPath.split("/").filter(Boolean);
  return segments.some((s) => SKIP_DIR_NAMES.has(s));
};

const getExtension = (filename: string): string => {
  const i = filename.lastIndexOf(".");
  if (i <= 0 || i === filename.length - 1) return "";
  return filename.slice(i + 1).toLowerCase();
};

const languageForPath = (relPath: string): string => {
  const base = relPath.split("/").pop() ?? relPath;
  const lower = base.toLowerCase();
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "Dockerfile";
  const ext = getExtension(base);
  return EXT_TO_LANG[ext] ?? (ext ? ext.toUpperCase() : "Plain Text");
};

const isProbablyBinary = (bytes: Uint8Array): boolean => {
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
};

export const countLinesInBytes = (bytes: Uint8Array): number => {
  if (bytes.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 10) lines++;
  }
  const endsWithNl = bytes[bytes.length - 1] === 10;
  return lines + (endsWithNl ? 0 : 1);
};

const underProjectRoot = (
  repoRelPath: string,
  normRoot: string
): { treeRel: string } | null => {
  if (!normRoot) {
    return { treeRel: repoRelPath };
  }
  if (repoRelPath === normRoot) {
    return { treeRel: "" };
  }
  const prefix = `${normRoot}/`;
  if (repoRelPath.startsWith(prefix)) {
    return { treeRel: repoRelPath.slice(prefix.length) };
  }
  return null;
};

export type PathFilterParts = { includes: string[]; excludes: string[] };

export const parsePathFilter = (filter: string): PathFilterParts => {
  const tokens = filter
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const includes: string[] = [];
  const excludes: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("!")) {
      const e = t.slice(1).trim();
      if (e) excludes.push(e);
    } else {
      includes.push(t);
    }
  }
  return { includes, excludes };
};

const matchesFilterToken = (treeRel: string, token: string): boolean => {
  if (token.startsWith("^")) {
    return treeRel.startsWith(token.slice(1));
  }
  if (token.endsWith("$") && token.length > 1) {
    return treeRel.endsWith(token.slice(0, -1));
  }
  return treeRel.includes(token);
};

export const pathPassesFilter = (treeRel: string, parts: PathFilterParts): boolean => {
  for (const ex of parts.excludes) {
    if (matchesFilterToken(treeRel, ex)) return false;
  }
  if (parts.includes.length === 0) return true;
  return parts.includes.some((inc) => matchesFilterToken(treeRel, inc));
};

const setFileAtPath = (root: DirEntry, parts: string[], file: FileEntry): void => {
  let cur: DirEntry = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const existing = cur.children[p];
    if (!existing) {
      const d: DirEntry = { type: "dir", children: {} };
      cur.children[p] = d;
      cur = d;
    } else if (existing.type === "dir") {
      cur = existing;
    } else {
      return;
    }
  }
  const leaf = parts[parts.length - 1]!;
  cur.children[leaf] = file;
};

const addFileToTree = (root: DirEntry, treeRel: string, loc: number, lang: string): void => {
  const segments = treeRel.split("/").filter(Boolean);
  if (segments.length === 0) return;
  setFileAtPath(root, segments, { type: "file", loc, lang });
};

const dirEntryToLocs = (d: DirEntry): Locs => {
  let loc = 0;
  const locByLangs: Record<string, number> = {};
  const children: Record<string, LocsChild> = {};

  for (const [name, child] of Object.entries(d.children)) {
    if (child.type === "file") {
      children[name] = child.loc;
      loc += child.loc;
      locByLangs[child.lang] = (locByLangs[child.lang] ?? 0) + child.loc;
    } else {
      const sub = dirEntryToLocs(child);
      children[name] = sub;
      loc += sub.loc;
      for (const [lang, n] of Object.entries(sub.locByLangs ?? {})) {
        locByLangs[lang] = (locByLangs[lang] ?? 0) + n;
      }
    }
  }

  return {
    loc,
    locByLangs: Object.keys(locByLangs).length ? locByLangs : undefined,
    children: Object.keys(children).length ? children : undefined
  };
};

export type ComputeLocsFromZipOptions = {
  projectRoot: string;
  filter: string;
};

export const computeRepoLocsFromZipBuffer = (
  buffer: ArrayBuffer | Uint8Array,
  options: ComputeLocsFromZipOptions
): RepoLocsPayload => {
  const normRoot = normalizeProjectRoot(options.projectRoot);
  const filterParts = parsePathFilter(options.filter);

  let truncated = false;
  let truncatedReason: string | undefined;

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes.byteLength > MAX_ZIP_BYTES) {
    return {
      locs: { loc: 0, locByLangs: {}, children: {} },
      truncated: true,
      truncatedReason: `Archive exceeds ${MAX_ZIP_BYTES} byte limit`
    };
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return {
      locs: { loc: 0, locByLangs: {}, children: {} },
      truncated: true,
      truncatedReason: "Failed to unpack repository archive"
    };
  }

  const root: DirEntry = { type: "dir", children: {} };
  let scanned = 0;

  for (const [rawName, data] of Object.entries(entries)) {
    if (rawName.endsWith("/")) continue;
    const segments = rawName.split("/").filter(Boolean);
    if (segments.length < 2) continue;
    const repoRel = segments.slice(1).join("/");
    if (!repoRel) continue;

    if (pathHasSkipSegment(repoRel)) continue;

    const scoped = underProjectRoot(repoRel, normRoot);
    if (!scoped) continue;

    const { treeRel } = scoped;
    if (treeRel === "") continue;

    if (!pathPassesFilter(treeRel, filterParts)) continue;

    const baseName = treeRel.split("/").pop() ?? treeRel;
    const ext = getExtension(baseName);
    if (BINARY_EXTENSIONS.has(ext)) continue;

    if (data.length > MAX_FILE_BYTES) {
      continue;
    }

    if (isProbablyBinary(data)) continue;

    scanned++;
    if (scanned > MAX_FILES_SCANNED) {
      truncated = true;
      truncatedReason = `Stopped after ${MAX_FILES_SCANNED} files`;
      break;
    }

    const loc = countLinesInBytes(data);
    const lang = languageForPath(treeRel);
    addFileToTree(root, treeRel, loc, lang);
  }

  const locs = dirEntryToLocs(root);
  return { locs, truncated, truncatedReason };
};

export const fetchGitHubRepoZipball = async (
  spec: GitHubRepoSpec,
  ref: string,
  accessToken: string
): Promise<{ ok: true; buffer: ArrayBuffer } | { ok: false; status: number; message: string }> => {
  const zipUrl = buildZipballUrl(spec, ref);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "deployher",
    Authorization: `Bearer ${accessToken}`
  };
  const response = await fetch(zipUrl, { headers });
  if (response.status === 401) {
    return { ok: false, status: 401, message: "GitHub authentication failed" };
  }
  if (response.status === 404) {
    return { ok: false, status: 404, message: "Repository or ref not found" };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, message: `GitHub error ${response.status}` };
  }
  const len = response.headers.get("content-length");
  if (len) {
    const n = parseInt(len, 10);
    if (!Number.isNaN(n) && n > MAX_ZIP_BYTES) {
      return {
        ok: false,
        status: 413,
        message: `Archive too large (${n} bytes)`
      };
    }
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_ZIP_BYTES) {
    return { ok: false, status: 413, message: "Archive too large" };
  }
  return { ok: true, buffer };
};
