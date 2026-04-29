import {
  resolveProjectGlyphIconFaviconIcoFallback,
  resolveProjectGlyphIconSrc
} from "@/lib/previewSiteIcon";
import { useEffect, useMemo, useState } from "react";

export const useProjectGlyphImage = (
  name: string,
  siteIconUrl: string | null,
  previewUrl: string | null
) => {
  const primarySrc = useMemo(
    () => resolveProjectGlyphIconSrc(siteIconUrl, previewUrl),
    [siteIconUrl, previewUrl]
  );
  const secondarySrc = useMemo(
    () => resolveProjectGlyphIconFaviconIcoFallback(siteIconUrl, previewUrl),
    [siteIconUrl, previewUrl]
  );
  const [overrideSrc, setOverrideSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOverrideSrc(null);
    setFailed(false);
  }, [primarySrc, secondarySrc]);

  const activeSrc = overrideSrc ?? primarySrc;
  const showImg = Boolean(activeSrc) && !failed;
  const letter = name.trim()[0]?.toUpperCase() ?? "?";

  const handleImgError = () => {
    if (overrideSrc === null && secondarySrc && secondarySrc !== primarySrc) {
      setOverrideSrc(secondarySrc);
      return;
    }
    setFailed(true);
  };

  return { activeSrc, showImg, handleImgError, letter };
};
