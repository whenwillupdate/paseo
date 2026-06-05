import { describe, expect, it } from "vitest";
import {
  buildSidebarSessionArchiveConfirmation,
  canArchiveSidebarSession,
  isRiskySidebarSessionArchive,
  resolveSidebarSessionSwipeDecision,
} from "./sidebar-project-session-archive";

describe("sidebar project session archive helpers", () => {
  it("claims only rightward horizontal session swipes", () => {
    expect(resolveSidebarSessionSwipeDecision({ translationX: -60, translationY: 0 })).toBe(
      "ignore",
    );
    expect(resolveSidebarSessionSwipeDecision({ translationX: 24, translationY: 60 })).toBe(
      "ignore",
    );
    expect(resolveSidebarSessionSwipeDecision({ translationX: 24, translationY: 2 })).toBe("reset");
    expect(resolveSidebarSessionSwipeDecision({ translationX: 120, translationY: 2 })).toBe(
      "archive",
    );
  });

  it("resolves archived session swipes as unarchive", () => {
    expect(
      resolveSidebarSessionSwipeDecision({
        translationX: 120,
        translationY: 2,
        archived: true,
      }),
    ).toBe("unarchive");
  });

  it("treats archived sessions as non-archivable", () => {
    expect(canArchiveSidebarSession({ archivedAt: null })).toBe(true);
    expect(canArchiveSidebarSession({ archivedAt: new Date("2026-04-01T00:00:00.000Z") })).toBe(
      false,
    );
  });

  it("requires confirmation for running or attention sessions", () => {
    expect(isRiskySidebarSessionArchive({ status: "running", requiresAttention: false })).toBe(
      true,
    );
    expect(isRiskySidebarSessionArchive({ status: "idle", requiresAttention: true })).toBe(true);
    expect(isRiskySidebarSessionArchive({ status: "closed", requiresAttention: false })).toBe(
      false,
    );
  });

  it("builds batch confirmation copy with risky session count", () => {
    expect(buildSidebarSessionArchiveConfirmation({ totalCount: 3, riskyCount: 1 })).toEqual({
      title: "Archive 3 sessions?",
      message: "1 is still running or needs attention and will be stopped.",
    });
  });
});
