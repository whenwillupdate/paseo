import { describe, expect, it } from "vitest";
import {
  type CollapsedProjectsState,
  getCollapsedProjectKeys,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setProjectCollapsed,
  toggleProjectCollapsed,
  toggleStatusGroupCollapsed,
} from "@/stores/sidebar-collapsed-sections-store/state";

function emptyState(): CollapsedProjectsState {
  return {
    collapsedProjectKeysByServerId: {},
    collapsedProjectKeys: new Set(),
    collapsedStatusGroupKeys: new Set(),
  };
}

describe("sidebar collapsed projects transitions", () => {
  it("tracks collapsed project keys as a Set", () => {
    let state = emptyState();

    state = setProjectCollapsed(state, "srv-a", "project-a", true);
    state = toggleProjectCollapsed(state, "srv-a", "project-b");
    state = toggleProjectCollapsed(state, "srv-a", "project-a");
    state = toggleStatusGroupCollapsed(state, "running");

    expect(Array.from(getCollapsedProjectKeys(state, "srv-a"))).toEqual(["project-b"]);
    expect(Array.from(state.collapsedStatusGroupKeys)).toEqual(["running"]);
  });

  it("scopes collapsed project keys by server", () => {
    let state = emptyState();

    state = setProjectCollapsed(state, "srv-a", "project-a", true);
    state = setProjectCollapsed(state, "srv-b", "project-a", false);
    state = toggleProjectCollapsed(state, "srv-b", "project-b");

    expect(Array.from(getCollapsedProjectKeys(state, "srv-a"))).toEqual(["project-a"]);
    expect(Array.from(getCollapsedProjectKeys(state, "srv-b"))).toEqual(["project-b"]);
  });

  it("serializes collapsed project keys for preference storage", () => {
    const state: CollapsedProjectsState = {
      collapsedProjectKeysByServerId: {
        "srv-a": new Set(["project-a"]),
      },
      collapsedProjectKeys: new Set(["project-a", "project-b"]),
      collapsedStatusGroupKeys: new Set(["running"]),
    };

    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeysByServerId: {
        "srv-a": ["project-a"],
      },
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedStatusGroupKeys: ["running"],
    });
  });

  it("restores collapsed project keys from persisted preferences", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a", "project-b", 42] },
      emptyState(),
    );

    expect(Array.from(restored.collapsedProjectKeys)).toEqual(["project-a", "project-b"]);
    expect(Array.from(getCollapsedProjectKeys(restored, "srv-a"))).toEqual([
      "project-a",
      "project-b",
    ]);
    expect(Array.from(restored.collapsedStatusGroupKeys)).toEqual([]);
  });

  it("restores scoped collapsed project keys from persisted preferences", () => {
    const restored = mergePersistedCollapsedProjects(
      {
        collapsedProjectKeysByServerId: {
          "srv-a": ["project-a", 42],
          "srv-b": ["project-a"],
        },
      },
      emptyState(),
    );

    expect(Array.from(getCollapsedProjectKeys(restored, "srv-a"))).toEqual(["project-a"]);
    expect(Array.from(getCollapsedProjectKeys(restored, "srv-b"))).toEqual(["project-a"]);
  });

  it("keeps the existing state object when persisted preferences do not change collapsed keys", () => {
    const currentState = emptyState();

    expect(mergePersistedCollapsedProjects(undefined, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({}, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({ collapsedProjectKeys: [] }, currentState)).toBe(
      currentState,
    );
  });
});
