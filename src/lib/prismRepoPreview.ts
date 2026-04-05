import { toHtml } from "hast-util-to-html";
import { refractor } from "refractor/all";

const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: "docker",
  makefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  podfile: "ruby",
  vagrantfile: "ruby",
  brewfile: "ruby",
  cargo: "toml",
  "cargo.lock": "toml",
  "go.mod": "go",
  "go.sum": "plaintext",
  "go.work": "go"
};

const EXT_MAP: Record<string, string> = {
  ts: "typescript",
  cts: "typescript",
  mts: "typescript",
  tsx: "tsx",
  js: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  json5: "json",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  styl: "stylus",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  svelte: "markup",
  mdx: "markdown",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  py: "python",
  pyw: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  h: "c",
  c: "c",
  rb: "ruby",
  toml: "toml",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  sql: "sql",
  swift: "swift",
  scala: "scala",
  sc: "scala",
  sbt: "scala",
  r: "r",
  ini: "ini",
  env: "properties",
  properties: "properties",
  gitignore: "ignore",
  dockerignore: "ignore",
  zig: "zig",
  nim: "nim",
  dart: "dart",
  lua: "lua",
  hs: "haskell",
  lhs: "haskell",
  ml: "ocaml",
  mli: "ocaml",
  pas: "pascal",
  pp: "pascal",
  pl: "perl",
  pm: "perl",
  t: "perl",
  ps1: "powershell",
  psm1: "powershell",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  fs: "fsharp",
  fsx: "fsharp",
  fsproj: "markup",
  vb: "vbnet",
  sol: "solidity",
  wat: "wasm",
  wasm: "wasm",
  tf: "hcl",
  tfvars: "hcl",
  hcl: "hcl",
  nginx: "nginx",
  conf: "nginx"
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const hasGrammar = (id: string): boolean => {
  const grammar = refractor.languages[id];
  return typeof grammar === "object" && grammar !== null;
};

export const resolvePrismLang = (relPath: string): string => {
  const base = relPath.split("/").pop() ?? "";
  const lower = base.toLowerCase();

  const special = SPECIAL_FILENAMES[lower];
  if (special !== undefined && (special === "plaintext" || hasGrammar(special))) {
    return special;
  }

  if (hasGrammar(lower)) {
    return lower;
  }

  const noDot = lower.startsWith(".") ? lower.slice(1) : lower;
  if (noDot !== lower && hasGrammar(noDot)) {
    return noDot;
  }

  if (lower.endsWith(".d.ts") || lower.endsWith(".d.mts") || lower.endsWith(".d.cts")) {
    return "typescript";
  }

  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot >= base.length - 1) {
    return "plaintext";
  }

  const ext = base.slice(dot + 1).toLowerCase();
  const mapped = EXT_MAP[ext];
  if (mapped !== undefined) {
    if (mapped === "plaintext") return "plaintext";
    if (mapped === "ignore") return "plaintext";
    if (hasGrammar(mapped)) return mapped;
  }

  if (hasGrammar(ext)) {
    return ext;
  }

  return "plaintext";
};

export type PrismHighlightResult = {
  html: string;
  lang: string;
};

export const highlightRepoFilePreview = (code: string, relPath: string): PrismHighlightResult => {
  const lang = resolvePrismLang(relPath);
  if (lang === "plaintext") {
    return { html: escapeHtml(code), lang: "plaintext" };
  }
  if (!hasGrammar(lang)) {
    return { html: escapeHtml(code), lang: "plaintext" };
  }
  const tree = refractor.highlight(code, lang);
  return { html: toHtml(tree), lang };
};
