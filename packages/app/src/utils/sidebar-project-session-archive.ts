import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";

export const SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD = 96;

export type SidebarSessionSwipeDecision = "ignore" | "reset" | "archive" | "unarchive";

export function canArchiveSidebarSession(agent: Pick<AggregatedAgent, "archivedAt">): boolean {
  return !agent.archivedAt;
}

export function isRiskySidebarSessionArchive(
  agent: Pick<AggregatedAgent, "status" | "requiresAttention">,
): boolean {
  return agent.status === "running" || agent.requiresAttention === true;
}

export function resolveSidebarSessionSwipeDecision(input: {
  translationX: number;
  translationY: number;
  velocityX?: number;
  archiveThreshold?: number;
  archived?: boolean;
}): SidebarSessionSwipeDecision {
  const archiveThreshold = input.archiveThreshold ?? SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD;
  const absX = Math.abs(input.translationX);
  const absY = Math.abs(input.translationY);

  if (input.translationX <= 0) {
    return "ignore";
  }
  if (absY > 16 && absY > absX * 1.3) {
    return "ignore";
  }
  if (input.translationX >= archiveThreshold || (input.velocityX ?? 0) > 850) {
    return input.archived ? "unarchive" : "archive";
  }
  return "reset";
}

export function buildSidebarSessionArchiveConfirmation(input: {
  totalCount: number;
  riskyCount: number;
}): { title: string; message: string } {
  if (input.totalCount <= 1) {
    return {
      title: "Archive running agent?",
      message: "This agent is still running. Archiving it will stop the agent.",
    };
  }

  const riskyLabel = input.riskyCount === 1 ? "1 is" : `${input.riskyCount} are`;
  const sessionLabel = input.totalCount === 1 ? "session" : "sessions";
  return {
    title: `Archive ${input.totalCount} ${sessionLabel}?`,
    message: `${riskyLabel} still running or needs attention and will be stopped.`,
  };
}
