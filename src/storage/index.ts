import { S3Client } from "bun";
import { config } from "../config";

export type StorageUploadInput =
  | string
  | Buffer
  | Blob
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | Response
  | Request;

export type StorageUploadOptions = {
  contentType?: string;
  contentEncoding?: string;
  contentDisposition?: string;
};

function getClient(): S3Client | null {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = config.s3;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    virtualHostedStyle: false
  });
}

let clientInstance: S3Client | null | undefined = undefined;

export function getStorageClient(): S3Client | null {
  if (clientInstance === undefined) clientInstance = getClient();
  return clientInstance;
}

export function isStorageConfigured(): boolean {
  return getStorageClient() !== null;
}

export async function checkStorageConnectivity(): Promise<{ ok: boolean; message?: string }> {
  const client = getStorageClient();
  if (!client) return { ok: true };
  try {
    await client.list({ maxKeys: 1 });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (msg.includes("ConnectionRefused") || msg.includes("ECONNREFUSED") || code === "ConnectionRefused") {
      return {
        ok: false,
        message: `S3 endpoint (${config.s3.endpoint}) is not reachable. Start the stack with: cd backend && ./infra/dev.sh start`
      };
    }
    return { ok: false, message: msg || "S3 connectivity check failed" };
  }
}

async function pipeStreamToWriter(
  stream: ReadableStream<Uint8Array>,
  writer: { write: (chunk: string | Uint8Array) => void; end: () => void | number | Promise<void | number> }
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) writer.write(value);
    }
  } finally {
    reader.releaseLock();
  }
  await Promise.resolve(writer.end());
}

export async function upload(
  key: string,
  data: StorageUploadInput,
  options: StorageUploadOptions = {}
): Promise<void> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  const file = client.file(key);
  const { contentType = "application/octet-stream", contentEncoding, contentDisposition } = options;

  if (data instanceof ReadableStream) {
    const writer = file.writer({
      type: contentType,
      ...(contentEncoding && { contentEncoding }),
      ...(contentDisposition && { contentDisposition }),
      partSize: 5 * 1024 * 1024,
      queueSize: 5,
      retry: 3
    });
    await pipeStreamToWriter(data, writer);
    return;
  }

  if (data instanceof Request) {
    const body = data.body;
    if (body && typeof body.getReader === "function") {
      const writer = file.writer({
        type: contentType,
        ...(contentEncoding && { contentEncoding }),
        ...(contentDisposition && { contentDisposition }),
        partSize: 5 * 1024 * 1024,
        queueSize: 5,
        retry: 3
      });
      await pipeStreamToWriter(body as ReadableStream<Uint8Array>, writer);
      return;
    }
  }

  if (data instanceof Response) {
    const body = data.body;
    if (body && typeof body.getReader === "function") {
      const writer = file.writer({
        type: contentType,
        ...(contentEncoding && { contentEncoding }),
        ...(contentDisposition && { contentDisposition }),
        partSize: 5 * 1024 * 1024,
        queueSize: 5,
        retry: 3
      });
      await pipeStreamToWriter(body as ReadableStream<Uint8Array>, writer);
      return;
    }
  }

  await file.write(data, {
    type: contentType,
    ...(contentEncoding && { contentEncoding }),
    ...(contentDisposition && { contentDisposition })
  });
}

export function getStream(key: string): ReadableStream<Uint8Array> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  return client.file(key).stream();
}

export async function getBytes(key: string): Promise<Uint8Array> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  return client.file(key).bytes();
}

export async function getText(key: string): Promise<string> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  return client.file(key).text();
}

export async function getTextFromOffset(
  key: string,
  byteOffset: number
): Promise<{ text: string; bytesRead: number }> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  const file = client.file(key).slice(byteOffset);
  const bytes = await file.bytes();
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return { text, bytesRead: bytes.length };
}

export async function getJson<T = unknown>(key: string): Promise<T> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  return client.file(key).json() as Promise<T>;
}

export async function deleteObject(key: string): Promise<void> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  await client.file(key).delete();
}

export async function exists(key: string): Promise<boolean> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  return client.file(key).exists();
}

export type ListObjectItem = {
  key: string;
  size: number;
  lastModified: string;
};

export async function listObjects(prefix = ""): Promise<ListObjectItem[]> {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  const result = await client.list(prefix ? { prefix, maxKeys: 1000 } : { maxKeys: 1000 });
  const contents = result.contents ?? [];
  return contents.map((c) => ({
    key: c.key,
    size: c.size ?? 0,
    lastModified: c.lastModified ?? ""
  }));
}

const S3_ACL_VALUES = [
  "private",
  "public-read",
  "public-read-write",
  "aws-exec-read",
  "authenticated-read",
  "bucket-owner-read",
  "bucket-owner-full-control",
  "log-delivery-write"
] as const;

export type S3PresignAcl = (typeof S3_ACL_VALUES)[number];

export function presign(
  key: string,
  options: {
    method?: "GET" | "PUT" | "DELETE";
    expiresIn?: number;
    acl?: S3PresignAcl;
  } = {}
): string {
  const client = getStorageClient();
  if (!client) throw new Error("S3 storage is not configured");
  return client.presign(key, {
    ...(options.method && { method: options.method }),
    ...(options.expiresIn !== undefined && { expiresIn: options.expiresIn }),
    ...(options.acl && { acl: options.acl })
  });
}
