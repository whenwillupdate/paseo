import { useCallback, useEffect, useMemo } from "react";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import { buildSidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";

export function useSidebarShortcutModel(input: {
  serverId: string | null;
  projects: SidebarProjectEntry[];
  isInitialLoad: boolean;
}) {
  const { serverId, projects, isInitialLoad } = input;
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore((state) =>
    state.getCollapsedProjectKeys(serverId),
  );
  const setProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setProjectCollapsed,
  );
  const toggleScopedProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleProjectCollapsed,
  );

  const shortcutModel = useMemo(
    () =>
      buildSidebarShortcutModel({
        projects,
        collapsedProjectKeys,
      }),
    [collapsedProjectKeys, projects],
  );

  useEffect(() => {
    if (isInitialLoad || projects.length === 0) {
      return;
    }

    const collapsibleProjectKeys = new Set(projects.map((project) => project.projectKey));
    for (const key of collapsedProjectKeys) {
      if (!collapsibleProjectKeys.has(key)) {
        setProjectCollapsed(serverId, key, false);
      }
    }
  }, [collapsedProjectKeys, isInitialLoad, projects, serverId, setProjectCollapsed]);

  const setScopedProjectCollapsed = useCallback(
    (projectKey: string, collapsed: boolean) => {
      setProjectCollapsed(serverId, projectKey, collapsed);
    },
    [serverId, setProjectCollapsed],
  );
  const toggleProjectCollapsed = useCallback(
    (projectKey: string) => {
      toggleScopedProjectCollapsed(serverId, projectKey);
    },
    [serverId, toggleScopedProjectCollapsed],
  );

  return {
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey: shortcutModel.shortcutIndexByWorkspaceKey,
    setProjectCollapsed: setScopedProjectCollapsed,
    toggleProjectCollapsed,
  };
}
