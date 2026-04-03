import { describe, expect, it } from "bun:test";
import path from "path";
import { parseRepoRelativePath, resolveProjectRoots, sanitizeRelativeWorkdir } from "./projectPaths";

describe("project path helpers", () => {
  it("normalizes safe repo-relative paths", () => {
    expect(parseRepoRelativePath("./apps/web")).toBe("apps/web");
    expect(parseRepoRelativePath("")).toBe(".");
  });

  it("rejects escaping repo-relative paths", () => {
    expect(parseRepoRelativePath("../apps/web")).toBeNull();
    expect(parseRepoRelativePath("/tmp/app")).toBeNull();
  });

  it("resolves workspace roots that contain the project root", () => {
    const roots = resolveProjectRoots("/tmp/repo", ".", "apps/web");
    expect(roots.workspaceRelative).toBe(".");
    expect(roots.projectRelative).toBe("apps/web");
    expect(roots.projectDir).toBe(path.resolve("/tmp/repo", "apps/web"));
  });

  it("rejects a workspace root that is deeper than the project root", () => {
    expect(() => resolveProjectRoots("/tmp/repo", "apps/web", "apps")).toThrow(
      "Workspace root directory must be the same as or an ancestor of the project root directory"
    );
  });

  it("sanitizes workdirRelative values", () => {
    expect(sanitizeRelativeWorkdir("apps/web")).toBe("apps/web");
    expect(() => sanitizeRelativeWorkdir("../apps/web")).toThrow(
      "Working directory must be a relative repository path inside the workspace"
    );
  });
});
