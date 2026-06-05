export interface CollapsedProjectsState {
  collapsedProjectKeysByServerId: Record<string, Set<string>>;
  /** Legacy unscoped project keys kept as a migration fallback. */
  collapsedProjectKeys: Set<string>;
  collapsedStatusGroupKeys: Set<string>;
}

export interface PersistedCollapsedProjects {
  collapsedProjectKeysByServerId?: unknown;
  collapsedProjectKeys?: unknown;
  collapsedStatusGroupKeys?: unknown;
}

export function getCollapsedProjectKeys(
  state: CollapsedProjectsState,
  serverId: string | null | undefined,
): Set<string> {
  const key = normalizeServerKey(serverId);
  if (!key) {
    return state.collapsedProjectKeys;
  }
  return state.collapsedProjectKeysByServerId[key] ?? state.collapsedProjectKeys;
}

export function toggleProjectCollapsed(
  state: CollapsedProjectsState,
  serverId: string | null | undefined,
  projectKey: string,
): CollapsedProjectsState {
  const key = normalizeServerKey(serverId);
  if (!key) {
    return state;
  }
  const next = new Set(getCollapsedProjectKeys(state, key));
  if (next.has(projectKey)) {
    next.delete(projectKey);
  } else {
    next.add(projectKey);
  }
  return setScopedProjectKeys(state, key, next);
}

export function toggleStatusGroupCollapsed(
  state: CollapsedProjectsState,
  statusGroupKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedStatusGroupKeys);
  if (next.has(statusGroupKey)) {
    next.delete(statusGroupKey);
  } else {
    next.add(statusGroupKey);
  }
  return { ...state, collapsedStatusGroupKeys: next };
}

export function setProjectCollapsed(
  state: CollapsedProjectsState,
  serverId: string | null | undefined,
  projectKey: string,
  collapsed: boolean,
): CollapsedProjectsState {
  const key = normalizeServerKey(serverId);
  if (!key) {
    return state;
  }
  const next = new Set(getCollapsedProjectKeys(state, key));
  if (collapsed) {
    next.add(projectKey);
  } else {
    next.delete(projectKey);
  }
  return setScopedProjectKeys(state, key, next);
}

export function serializeCollapsedProjects(state: CollapsedProjectsState): {
  collapsedProjectKeysByServerId: Record<string, string[]>;
  collapsedProjectKeys: string[];
  collapsedStatusGroupKeys: string[];
} {
  return {
    collapsedProjectKeysByServerId: serializeScopedProjectKeys(
      state.collapsedProjectKeysByServerId,
    ),
    collapsedProjectKeys: Array.from(state.collapsedProjectKeys),
    collapsedStatusGroupKeys: Array.from(state.collapsedStatusGroupKeys),
  };
}

export function mergePersistedCollapsedProjects<S extends CollapsedProjectsState>(
  persisted: PersistedCollapsedProjects | undefined,
  current: S,
): S {
  if (!persisted?.collapsedProjectKeysByServerId && !persisted?.collapsedProjectKeys) {
    if (!persisted?.collapsedStatusGroupKeys) return current;
  }
  const restoredProjectsByServerId = deserializeScopedProjectKeys(
    persisted.collapsedProjectKeysByServerId,
  );
  const restoredProjects = deserializeCollapsedKeys(persisted.collapsedProjectKeys);
  const restoredStatusGroups = deserializeCollapsedKeys(persisted.collapsedStatusGroupKeys);
  if (
    areScopedSetsEqual(current.collapsedProjectKeysByServerId, restoredProjectsByServerId) &&
    areSetsEqual(current.collapsedProjectKeys, restoredProjects) &&
    areSetsEqual(current.collapsedStatusGroupKeys, restoredStatusGroups)
  ) {
    return current;
  }
  return {
    ...current,
    collapsedProjectKeysByServerId: restoredProjectsByServerId,
    collapsedProjectKeys: restoredProjects,
    collapsedStatusGroupKeys: restoredStatusGroups,
  };
}

function normalizeServerKey(serverId: string | null | undefined): string | null {
  const trimmed = typeof serverId === "string" ? serverId.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function setScopedProjectKeys<S extends CollapsedProjectsState>(
  state: S,
  serverId: string,
  keys: Set<string>,
): S {
  return {
    ...state,
    collapsedProjectKeysByServerId: {
      ...state.collapsedProjectKeysByServerId,
      [serverId]: keys,
    },
  };
}

function serializeScopedProjectKeys(value: Record<string, Set<string>>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(value).map(([serverId, keys]) => [serverId, Array.from(keys)]),
  );
}

function deserializeScopedProjectKeys(value: unknown): Record<string, Set<string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, Set<string>> = {};
  for (const [serverId, keys] of Object.entries(value)) {
    const normalizedServerId = normalizeServerKey(serverId);
    if (!normalizedServerId) {
      continue;
    }
    result[normalizedServerId] = deserializeCollapsedKeys(keys);
  }
  return result;
}

function deserializeCollapsedKeys(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((key): key is string => typeof key === "string"));
}

function areSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}

function areScopedSetsEqual(
  left: Record<string, Set<string>>,
  right: Record<string, Set<string>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!areSetsEqual(left[key] ?? new Set(), right[key] ?? new Set())) {
      return false;
    }
  }
  return true;
}
