import { posix as posixPath } from "path";
import { DetectorFilesystem } from "@vercel/fs-detectors";

type DetectorFilesystemStat = {
  name: string;
  path: string;
  type: "file" | "dir";
};

const toBuffer = (content: string | Buffer): Buffer =>
  typeof content === "string" ? Buffer.from(content, "utf8") : content;

const normalizeRepoKey = (key: string): string => {
  let k = key.trim().replace(/\\/g, "/");
  while (k.startsWith("./")) {
    k = k.slice(2);
  }
  return k.replace(/\/+$/, "");
};

const buildFileMap = (entries: Record<string, string | Buffer>): Map<string, Buffer> => {
  const m = new Map<string, Buffer>();
  for (const [raw, content] of Object.entries(entries)) {
    const key = normalizeRepoKey(raw);
    if (key.length > 0) {
      m.set(key, toBuffer(content));
    }
  }
  return m;
};

export class MemoryDetectorFilesystem extends DetectorFilesystem {
  private readonly files: ReadonlyMap<string, Buffer>;
  private readonly rootOffset: string;

  constructor(files: Map<string, Buffer> | Record<string, string | Buffer>, rootOffset = "") {
    super();
    this.files =
      files instanceof Map
        ? new Map(files)
        : buildFileMap(files);
    this.rootOffset = normalizeRepoKey(rootOffset);
  }

  private resolve(name: string): string {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === ".") {
      return this.rootOffset;
    }
    const joined =
      this.rootOffset === "" ? posixPath.normalize(trimmed) : posixPath.join(this.rootOffset, trimmed);
    return normalizeRepoKey(joined);
  }

  private dirPrefixForContents(fullDir: string): string {
    if (fullDir === "") {
      return "";
    }
    return `${fullDir}/`;
  }

  protected async _hasPath(name: string): Promise<boolean> {
    const full = this.resolve(name);
    if (this.files.has(full)) {
      return true;
    }
    if (full === "") {
      return this.files.size > 0;
    }
    const prefix = `${full}/`;
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  protected _readFile(name: string): Promise<Buffer> {
    const full = this.resolve(name);
    const buf = this.files.get(full);
    if (!buf) {
      return Promise.reject(new Error(`ENOENT: no such file ${full}`));
    }
    return Promise.resolve(Buffer.from(buf));
  }

  protected async _isFile(name: string): Promise<boolean> {
    const full = this.resolve(name);
    return this.files.has(full);
  }

  protected async _readdir(dirPath: string): Promise<DetectorFilesystemStat[]> {
    const fullDir = this.resolve(dirPath === "" ? "." : dirPath);
    const prefix = this.dirPrefixForContents(fullDir);
    const childNames = new Map<string, "file" | "dir">();

    for (const key of this.files.keys()) {
      if (prefix !== "" && !key.startsWith(prefix)) {
        continue;
      }
      const rest = prefix === "" ? key : key.slice(prefix.length);
      if (rest === "") {
        continue;
      }
      const slash = rest.indexOf("/");
      if (slash === -1) {
        childNames.set(rest, "file");
      } else {
        childNames.set(rest.slice(0, slash), "dir");
      }
    }

    const relBase = fullDir === "" ? "." : fullDir;
    const result: DetectorFilesystemStat[] = [];
    for (const [entryName, type] of childNames.entries()) {
      const pathField = relBase === "." ? entryName : posixPath.join(relBase, entryName);
      result.push({
        name: entryName,
        path: pathField,
        type
      });
    }
    return result;
  }

  protected _chdir(name: string): DetectorFilesystem {
    const nextRoot =
      name === "" || name === "."
        ? this.rootOffset
        : this.rootOffset === ""
          ? normalizeRepoKey(name)
          : posixPath.join(this.rootOffset, name).replace(/\\/g, "/");
    return new MemoryDetectorFilesystem(new Map(this.files), normalizeRepoKey(nextRoot));
  }
}
