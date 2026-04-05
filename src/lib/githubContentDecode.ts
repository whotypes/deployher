export type GitHubContentFile = {
  type: string;
  encoding?: string;
  content?: string;
  message?: string;
};

export const decodeGitHubFileContent = (file: GitHubContentFile): string | null => {
  if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") {
    return null;
  }
  try {
    return Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
  } catch {
    return null;
  }
};
