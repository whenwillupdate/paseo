import { describe, expect, it } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import {
  agentBelongsToSidebarProject,
  buildSidebarProjectSessionIndex,
  classifySidebarSessionProvider,
} from "./sidebar-project-sessions";

function makeAgent(overrides: Partial<AggregatedAgent> = {}): AggregatedAgent {
  return {
    id: overrides.id ?? "agent-1",
    serverId: "srv",
    serverLabel: "srv",
    title: null,
    status: overrides.status ?? "idle",
    lastActivityAt: overrides.lastActivityAt ?? new Date("2026-04-01T00:00:00.000Z"),
    cwd: overrides.cwd ?? "/repo/paseo",
    provider: overrides.provider ?? "codex",
    pendingPermissionCount: overrides.pendingPermissionCount ?? 0,
    requiresAttention: overrides.requiresAttention ?? false,
    attentionReason: null,
    attentionTimestamp: null,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-04-01T00:00:00.000Z"),
    labels: overrides.labels ?? {},
  };
}

function workspace(overrides: Partial<SidebarWorkspaceEntry> = {}): SidebarWorkspaceEntry {
  return {
    workspaceKey: "srv:main",
    serverId: "srv",
    workspaceId: "main",
    projectKey: "project-1",
    projectRootPath: "/repo/paseo",
    workspaceDirectory: "/repo/paseo",
    projectKind: "git",
    workspaceKind: "local_checkout",
    name: "main",
    statusBucket: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
    ...overrides,
  };
}

function project(overrides: Partial<SidebarProjectEntry> = {}): SidebarProjectEntry {
  return {
    projectKey: "project-1",
    projectName: "Paseo",
    projectKind: "git",
    iconWorkingDir: "/repo/paseo",
    canCreateWorktree: true,
    workspaces: [workspace()],
    ...overrides,
  };
}

describe("classifySidebarSessionProvider", () => {
  it("groups built-in and customized Claude/Codex provider ids", () => {
    expect(classifySidebarSessionProvider("claude")).toBe("claude");
    expect(classifySidebarSessionProvider("my-claude")).toBe("claude");
    expect(classifySidebarSessionProvider("codex")).toBe("codex");
    expect(classifySidebarSessionProvider("custom-codex")).toBe("codex");
    expect(classifySidebarSessionProvider("opencode")).toBe("other");
  });
});

describe("agentBelongsToSidebarProject", () => {
  it("matches agents by project root or child cwd", () => {
    const entry = project();
    expect(agentBelongsToSidebarProject(makeAgent({ cwd: "/repo/paseo" }), entry)).toBe(true);
    expect(agentBelongsToSidebarProject(makeAgent({ cwd: "/repo/paseo/subdir" }), entry)).toBe(
      true,
    );
    expect(agentBelongsToSidebarProject(makeAgent({ cwd: "/repo/paseo-other" }), entry)).toBe(
      false,
    );
  });

  it("matches Paseo worktree cwd to its parent project", () => {
    const entry = project({ iconWorkingDir: "/repo/paseo" });
    expect(
      agentBelongsToSidebarProject(
        makeAgent({ cwd: "/repo/paseo/.paseo/worktrees/abc/feature" }),
        entry,
      ),
    ).toBe(true);
  });
});

describe("buildSidebarProjectSessionIndex", () => {
  it("sorts attention and running sessions before recent idle sessions and counts providers", () => {
    const agents = [
      makeAgent({
        id: "idle-new",
        provider: "opencode",
        lastActivityAt: new Date("2026-04-01T03:00:00.000Z"),
      }),
      makeAgent({
        id: "running-old",
        provider: "codex",
        status: "running",
        lastActivityAt: new Date("2026-04-01T01:00:00.000Z"),
      }),
      makeAgent({
        id: "attention",
        provider: "claude",
        requiresAttention: true,
        lastActivityAt: new Date("2026-04-01T02:00:00.000Z"),
      }),
    ];

    const index = buildSidebarProjectSessionIndex({ projects: [project()], agents });
    const data = index.get("project-1");
    expect(data?.agents.map((agent) => agent.id)).toEqual(["attention", "running-old", "idle-new"]);
    expect(data?.counts).toEqual({ claude: 1, codex: 1, other: 1 });
  });
});
