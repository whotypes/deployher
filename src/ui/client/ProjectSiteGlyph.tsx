"use client";

import { cn } from "@/lib/utils";
import { useProjectGlyphImage } from "@/ui/client/useProjectGlyphImage";
import { type ReactElement } from "react";

export const ProjectSiteGlyph = ({
  name,
  siteIconUrl,
  previewUrl,
  className,
  imgClassName = "size-5 object-cover",
  letterClassName = "flex size-5 items-center justify-center bg-muted text-[10px] font-semibold text-muted-foreground"
}: {
  name: string;
  siteIconUrl: string | null;
  previewUrl: string | null;
  className?: string;
  imgClassName?: string;
  letterClassName?: string;
}): ReactElement => {
  const { activeSrc, showImg, handleImgError, letter } = useProjectGlyphImage(
    name,
    siteIconUrl,
    previewUrl
  );
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm ring-1 ring-border/60",
        className
      )}
    >
      {showImg ? (
        <img
          src={activeSrc ?? ""}
          alt=""
          className={imgClassName}
          loading="lazy"
          decoding="async"
          onError={handleImgError}
        />
      ) : (
        <span className={letterClassName}>{letter}</span>
      )}
    </span>
  );
};
