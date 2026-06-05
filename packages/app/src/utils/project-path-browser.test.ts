import { describe, expect, it } from "vitest";
import {
  buildPathBreadcrumbs,
  joinBrowserPath,
  normalizeBrowserPath,
  parentBrowserPath,
  uniquedDirectoryPaths,
} from "./project-path-browser";

describe("project path browser", () => {
  it("defaults blank paths to home", () => {
    expect(normalizeBrowserPath("")).toBe("~");
    expect(normalizeBrowserPath("   ")).toBe("~");
  });

  it("builds breadcrumbs for home and absolute paths", () => {
    expect(buildPathBreadcrumbs("~")).toEqual([{ label: "~", path: "~" }]);
    expect(buildPathBreadcrumbs("~/Documents/Code")).toEqual([
      { label: "~", path: "~" },
      { label: "Documents", path: "~/Documents" },
      { label: "Code", path: "~/Documents/Code" },
    ]);
    expect(buildPathBreadcrumbs("/Users/me/Code")).toEqual([
      { label: "/", path: "/" },
      { label: "Users", path: "/Users" },
      { label: "me", path: "/Users/me" },
      { label: "Code", path: "/Users/me/Code" },
    ]);
  });

  it("joins relative suggestion paths against the current directory", () => {
    expect(joinBrowserPath("~", "Documents")).toBe("~/Documents");
    expect(joinBrowserPath("/Users/me", "Code")).toBe("/Users/me/Code");
    expect(joinBrowserPath("/Users/me", "/Volumes/Data")).toBe("/Volumes/Data");
  });

  it("resolves parent paths without leaving home or filesystem root", () => {
    expect(parentBrowserPath("~")).toBe("~");
    expect(parentBrowserPath("~/Documents")).toBe("~");
    expect(parentBrowserPath("~/Documents/Code")).toBe("~/Documents");
    expect(parentBrowserPath("/")).toBe("/");
    expect(parentBrowserPath("/Users")).toBe("/");
    expect(parentBrowserPath("/Users/me")).toBe("/Users");
  });

  it("normalizes and de-duplicates directory suggestions", () => {
    expect(
      uniquedDirectoryPaths({
        cwd: "/Users/me",
        paths: ["Code", "/Users/me/Code", "Desktop"],
      }),
    ).toEqual(["/Users/me/Code", "/Users/me/Desktop"]);
  });
});
