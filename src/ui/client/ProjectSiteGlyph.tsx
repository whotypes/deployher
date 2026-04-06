"use client";

import { cn } from "@/lib/utils";
import { useState, type ReactElement } from "react";

export const ProjectSiteGlyph = ({
  name,
  siteIconUrl,
  className
}: {
  name: string;
  siteIconUrl: string | null;
  className?: string;
}): ReactElement => {
  const [failed, setFailed] = useState(false);
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  const showImg = Boolean(siteIconUrl) && !failed;
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm ring-1 ring-border/60",
        className
      )}
    >
      {showImg ? (
        <img
          src={siteIconUrl ?? ""}
          alt=""
          className="size-5 object-cover"
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex size-5 items-center justify-center bg-muted text-[10px] font-semibold text-muted-foreground">
          {letter}
        </span>
      )}
    </span>
  );
};
