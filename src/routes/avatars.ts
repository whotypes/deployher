import { eq } from "drizzle-orm";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { badRequest, json, notFound, type RequestWithParams } from "../http/helpers";
import type { RequestWithParamsAndSession } from "../auth/session";
import { avatarExists, getAvatarStream, uploadAvatar } from "../storage";

const maxAvatarBytes = 5 * 1024 * 1024;

const extensionForType = (type: string): string | null => {
  const contentType = type.toLowerCase().split(";")[0]?.trim();
  if (contentType === "image/jpeg" || contentType === "image/jpg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return null;
};

const avatarKey = (filename: string): string => `avatars/${filename}`;

export const uploadCurrentUserAvatar = async (req: RequestWithParamsAndSession): Promise<Response> => {
  const contentType = req.headers.get("content-type") ?? "";
  const ext = extensionForType(contentType);
  if (!ext) return badRequest("Upload a JPG, PNG, WebP, or GIF image.");

  const contentLength = Number.parseInt(req.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxAvatarBytes) {
    return badRequest("Profile photos must be 5 MB or smaller.");
  }

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) return badRequest("Upload an image file.");
  if (bytes.byteLength > maxAvatarBytes) return badRequest("Profile photos must be 5 MB or smaller.");

  const opaque = crypto.randomUUID().replace(/-/g, "");
  const filename = `${opaque}.${ext}`;
  const publicUrl = `/api/public/avatars/${filename}`;
  await uploadAvatar(avatarKey(filename), bytes, {
    contentType,
    contentDisposition: `inline; filename="${filename}"`
  });

  await db
    .update(schema.users)
    .set({ image: publicUrl, updatedAt: new Date() })
    .where(eq(schema.users.id, req.session.user.id));

  return json({ image: publicUrl });
};

export const getPublicAvatar = async (
  req: RequestWithParams
): Promise<Response> => {
  const filename = req.params["filename"] ?? "";
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(filename)) {
    return notFound("Avatar not found");
  }
  const key = avatarKey(filename);
  if (!(await avatarExists(key))) return notFound("Avatar not found");

  const ext = filename.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/gif";
  return new Response(getAvatarStream(key), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
};
