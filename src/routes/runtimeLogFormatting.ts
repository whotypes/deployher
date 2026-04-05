import {
  formatPreviewStartupFailureText,
  isPreviewStartupFailure
} from "../preview-runner/core";

export const formatRunnerRuntimeLogError = async (upstream: Response): Promise<string> => {
  const body = await upstream.text();
  if (upstream.status === 404) {
    return "No active preview container. Open the preview URL to start the server. Logs only exist while the container is running (runner TTL).\n";
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isPreviewStartupFailure(parsed)) {
      return formatPreviewStartupFailureText(parsed);
    }
  } catch {
    // plain text fallback
  }
  return body.trim() || `Runner returned HTTP ${upstream.status}.\n`;
};
