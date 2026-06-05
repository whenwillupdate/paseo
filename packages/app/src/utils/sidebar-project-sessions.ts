import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import { deriveProjectKey } from "@/utils/agent-grouping";

export type SidebarSessionProviderKind = "claude" | "codex" | "other";

export interface SidebarProjectSessionCounts {
  claude: number;
  codex: number;
  other: number;
}

export interface SidebarProjectSessionData {
  agents: AggregatedAgent[];
  counts: SidebarProjectSessionCounts;
}

const EMPTY_COUNTS: SidebarProjectSessionCounts = {
  claude: 0,
  codex: 0,
  other: 0,
};

export function classifySidebarSessionProvider(provider: string): SidebarSessionProviderKind {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "claude" || normalized.includes("claude")) return "claude";
  if (normalized === "codex" || normalized.includes("codex")) return "codex";
  return "other";
}

export function sidebarSessionProviderLabel(provider: string): string {
  const kind = classifySidebarSessionProvider(provider);
  if (kind === "claude") return "Claude";
  if (kind === "codex") return "Codex";
  const trimmed = provider.trim();
  return trimmed ? trimmed : "Agent";
}

function normalizePath(input: string | null | undefined): string {
  return (input ?? "").trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function isPathLike(input: string): boolean {
  return input.startsWith("/") || input.startsWith("~") || /^[A-Za-z]:[\\/]/.test(input);
}

function isSameOrChildPath(child: string, parent: string): boolean {
  const normalizedChild = normalizePath(child);
  const normalizedParent = normalizePath(parent);
  if (!normalizedChild || !normalizedParent) return false;
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function projectCandidatePaths(project: SidebarProjectEntry): string[] {
  const candidates = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = normalizePath(value);
    if (normalized) candidates.add(normalized);
  };

  add(project.iconWorkingDir);
  if (isPathLike(project.projectKey)) {
    add(project.projectKey);
  }

  for (const workspace of project.workspaces) {
    add(workspace.projectRootPath);
    add(workspace.workspaceDirectory);
  }

  return Array.from(candidates);
}

export function agentBelongsToSidebarProject(
  agent: AggregatedAgent,
  project: SidebarProjectEntry,
): boolean {
  const cwd = normalizePath(agent.cwd);
  if (!cwd) return false;

  const derivedProjectKey = normalizePath(deriveProjectKey(cwd));
  const normalizedProjectKey = normalizePath(project.projectKey);
  if (
    normalizedProjectKey &&
    derivedProjectKey &&
    (derivedProjectKey === normalizedProjectKey ||
      isSameOrChildPath(derivedProjectKey, normalizedProjectKey))
  ) {
    return true;
  }

  return projectCandidatePaths(project).some((candidate) => isSameOrChildPath(cwd, candidate));
}

function compareSidebarAgents(left: AggregatedAgent, right: AggregatedAgent): number {
  const leftPriority = sidebarAgentPriority(left);
  const rightPriority = sidebarAgentPriority(right);
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return right.lastActivityAt.getTime() - left.lastActivityAt.getTime();
}

function sidebarAgentPriority(agent: AggregatedAgent): number {
  if (agent.requiresAttention || (agent.pendingPermissionCount ?? 0) > 0) return 0;
  if (agent.status === "running" || agent.status === "initializing") return 1;
  if (agent.status === "error") return 2;
  return 3;
}

export function buildSidebarProjectSessionIndex(input: {
  projects: SidebarProjectEntry[];
  agents: AggregatedAgent[];
}): Map<string, SidebarProjectSessionData> {
  const result = new Map<string, SidebarProjectSessionData>();

  for (const project of input.projects) {
    const agents = input.agents
      .filter((agent) => agentBelongsToSidebarProject(agent, project))
      .sort(compareSidebarAgents);
    const counts = { ...EMPTY_COUNTS };
    for (const agent of agents) {
      counts[classifySidebarSessionProvider(agent.provider)] += 1;
    }
    result.set(project.projectKey, { agents, counts });
  }

  return result;
}
