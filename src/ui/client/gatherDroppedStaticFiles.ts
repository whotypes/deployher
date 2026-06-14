export type GatheredStaticFile = {
  relativePath: string;
  file: File;
};

const collectDirectoryEntries = async (
  dir: FileSystemDirectoryEntry,
  prefix: string
): Promise<GatheredStaticFile[]> => {
  const out: GatheredStaticFile[] = [];
  const reader = dir.createReader();

  const readBatch = (): Promise<FileSystemEntry[]> =>
    new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

  let batch: FileSystemEntry[] = [];
  do {
    batch = await readBatch();
    for (const ent of batch) {
      if (ent.isFile) {
        const fe = ent as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fe.file(resolve, reject);
        });
        const rel = prefix ? `${prefix}/${file.name}` : file.name;
        out.push({ relativePath: rel.replace(/\\/g, "/"), file });
      } else if (ent.isDirectory) {
        const sub = prefix ? `${prefix}/${ent.name}` : ent.name;
        const nested = await collectDirectoryEntries(ent as FileSystemDirectoryEntry, sub);
        out.push(...nested);
      }
    }
  } while (batch.length > 0);

  return out;
};

export const gatherDroppedStaticFiles = async (
  dataTransfer: DataTransfer
): Promise<GatheredStaticFile[]> => {
  const items = [...dataTransfer.items];
  const viaEntries: GatheredStaticFile[] = [];

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (!entry) continue;
    if (entry.isFile) {
      const fe = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fe.file(resolve, reject);
      });
      viaEntries.push({ relativePath: file.name, file });
    } else if (entry.isDirectory) {
      const nested = await collectDirectoryEntries(entry as FileSystemDirectoryEntry, entry.name);
      viaEntries.push(...nested);
    }
  }

  if (viaEntries.length > 0) {
    return viaEntries;
  }

  const fallback: GatheredStaticFile[] = [];
  for (const file of [...dataTransfer.files]) {
    const rel =
      typeof file.webkitRelativePath === "string" && file.webkitRelativePath.trim()
        ? file.webkitRelativePath.trim().replace(/\\/g, "/")
        : file.name;
    fallback.push({ relativePath: rel, file });
  }
  return fallback;
};
