import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";

export const SIDEBAR_SESSION_SWIPE_REVEAL_THRESHOLD = 44;
export const SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD = 96;

export type SidebarSessionSwipeDecision = "ignore" | "reset" | "reveal" | "archive";

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
  revealThreshold?: number;
  archiveThreshold?: number;
}): SidebarSessionSwipeDecision {
  const revealThreshold = input.revealThreshold ?? SIDEBAR_SESSION_SWIPE_REVEAL_THRESHOLD;
  const archiveThreshold = input.archiveThreshold ?? SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD;
  const absX = Math.abs(input.translationX);
  const absY = Math.abs(input.translationY);

  if (input.translationX <= 0) {
    return "ignore";
  }
  if (absY > 12 && absY > absX) {
    return "ignore";
  }
  if (input.translationX >= archiveThreshold || (input.velocityX ?? 0) > 850) {
    return "archive";
  }
  if (input.translationX >= revealThreshold) {
    return "reveal";
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
