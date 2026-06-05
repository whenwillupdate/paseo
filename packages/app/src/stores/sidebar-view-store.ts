import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarGroupMode = "project" | "status";

interface SidebarViewStoreState {
  groupModeByServerId: Record<string, SidebarGroupMode>;
  showArchivedByServerId: Record<string, boolean>;
  getGroupMode: (serverId: string) => SidebarGroupMode;
  setGroupMode: (serverId: string, mode: SidebarGroupMode) => void;
  getShowArchived: (serverId: string) => boolean;
  setShowArchived: (serverId: string, showArchived: boolean) => void;
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set, get) => ({
      groupModeByServerId: {},
      showArchivedByServerId: {},
      getGroupMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "project";
        return get().groupModeByServerId[key] ?? "project";
      },
      setGroupMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          groupModeByServerId: {
            ...state.groupModeByServerId,
            [key]: mode,
          },
        }));
      },
      getShowArchived: (serverId) => {
        const key = serverId.trim();
        if (!key) return false;
        return get().showArchivedByServerId[key] ?? false;
      },
      setShowArchived: (serverId, showArchived) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          showArchivedByServerId: {
            ...state.showArchivedByServerId,
            [key]: showArchived,
          },
        }));
      },
    }),
    {
      name: "sidebar-group-mode",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        groupModeByServerId: state.groupModeByServerId,
        showArchivedByServerId: state.showArchivedByServerId,
      }),
    },
  ),
);
