import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type CollapsedProjectsState,
  getCollapsedProjectKeys,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setProjectCollapsed,
  toggleProjectCollapsed,
  toggleStatusGroupCollapsed,
} from "./state";

interface SidebarCollapsedSectionsState extends CollapsedProjectsState {
  getCollapsedProjectKeys: (serverId: string | null | undefined) => Set<string>;
  toggleProjectCollapsed: (serverId: string | null | undefined, projectKey: string) => void;
  setProjectCollapsed: (
    serverId: string | null | undefined,
    projectKey: string,
    collapsed: boolean,
  ) => void;
  toggleStatusGroupCollapsed: (statusGroupKey: string) => void;
}

export const useSidebarCollapsedSectionsStore = create<SidebarCollapsedSectionsState>()(
  persist(
    (set, get) => ({
      collapsedProjectKeysByServerId: {},
      collapsedProjectKeys: new Set(),
      collapsedStatusGroupKeys: new Set(),
      getCollapsedProjectKeys: (serverId) => getCollapsedProjectKeys(get(), serverId),
      toggleProjectCollapsed: (serverId, projectKey) =>
        set((state) => toggleProjectCollapsed(state, serverId, projectKey)),
      setProjectCollapsed: (serverId, projectKey, collapsed) =>
        set((state) => setProjectCollapsed(state, serverId, projectKey, collapsed)),
      toggleStatusGroupCollapsed: (statusGroupKey) =>
        set((state) => toggleStatusGroupCollapsed(state, statusGroupKey)),
    }),
    {
      name: "sidebar-collapsed-sections",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => serializeCollapsedProjects(state),
      merge: (persistedState, currentState) =>
        mergePersistedCollapsedProjects(
          persistedState as
            | { collapsedProjectKeysByServerId?: unknown; collapsedProjectKeys?: unknown }
            | undefined,
          currentState,
        ),
    },
  ),
);
