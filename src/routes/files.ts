import { renderFilesPage, type FilesPageData } from "../files/FilesPage";
import { badRequest, json, type RequestWithParams } from "../http/helpers";
import { isStorageConfigured, listObjects, presign, upload } from "../storage";

const FILES_UPLOAD_PREFIX = "uploads/";

const sanitizeFileKey = (name: string): string => {
  const base = name.replace(/^.*[/\\]/, "").trim() || "file";
  return base.replace(/\0/g, "").slice(0, 255);
};

export const filesPage = async () => {
  const storageConfigured = isStorageConfigured();
  let files: FilesPageData["files"] = [];
  if (storageConfigured) {
    try {
      files = await listObjects("");
    } catch {
      files = [];
    }
  }
  const data: FilesPageData = { files, storageConfigured };
  const stream = await renderFilesPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const filesUpload = async (req: RequestWithParams) => {
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }
  let formData: Awaited<ReturnType<Request["formData"]>>;
  try {
    formData = await req.formData();
  } catch {
    return badRequest("Invalid form data");
  }
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return badRequest("Missing file in form (field name: file)");
  }
  const key = FILES_UPLOAD_PREFIX + sanitizeFileKey(file.name);
  const contentType = file.type || "application/octet-stream";
  try {
    const buffer = await file.arrayBuffer();
    await upload(key, Buffer.from(buffer), { contentType });
  } catch (err) {
    console.error("Upload failed:", err);
    return json({ error: "Upload failed" }, { status: 500 });
  }
  return Response.redirect(new URL("/files", req.url).toString(), 303);
};

export const filesDownload = async (req: RequestWithParams) => {
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return badRequest("Missing key query parameter");
  }
  const signed = presign(key, { method: "GET", expiresIn: 3600 });
  return Response.redirect(signed, 302);
};
