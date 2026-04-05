import * as React from "react";

export const LazyRepoCodeExplorer = React.lazy(async () => {
  const m = await import("./RepoCodeExplorer");
  return { default: m.RepoCodeExplorer };
});
