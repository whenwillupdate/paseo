import {
  View,
  Text,
  Pressable,
  Platform,
  ActionSheetIOS,
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  StatusBar,
  ScrollView,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type PressableStateCallbackType,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ProjectIconView } from "@/components/project-icon-view";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactElement,
  type MutableRefObject,
  type Ref,
} from "react";
import { router, usePathname, type Href } from "expo-router";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
  type ActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { StyleSheet, useUnistyles, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { type GestureType } from "react-native-gesture-handler";
import {
  CircleAlert,
  Archive,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderPlus,
  GitPullRequest,
  Inbox,
  Settings,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { DraggableList, type DraggableRenderItemInfo } from "./draggable-list";
import type { DraggableListDragHandleProps } from "./draggable-list.types";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useProjectIconDataByProjectKey } from "@/projects/project-icons";
import {
  buildHostNewWorkspaceRoute,
  buildHostAgentDetailRoute,
  buildProjectSettingsRoute,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";
import {
  createSidebarWorkspaceEntry,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useShowShortcutBadges } from "@/hooks/use-show-shortcut-badges";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  useContextMenu,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { SyncedLoader } from "@/components/synced-loader";
import { useToast } from "@/contexts/toast-context";
import { hasVisibleOrderChanged, mergeWithRemainder } from "@/utils/sidebar-reorder";
import { decideLongPressMove } from "@/utils/sidebar-gesture-arbitration";
import { confirmDialog } from "@/utils/confirm-dialog";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { shouldRenderSyncedStatusLoader } from "@/utils/status-loader";
import { isEmphasizedStatusDotBucket } from "@/utils/status-dot-color";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { SidebarStatusWorkspaceList } from "@/components/sidebar/sidebar-status-list";
import { SidebarWorkspaceShortcutBadge } from "@/components/sidebar/sidebar-workspace-row-content";
import {
  useHydratedWorkspaceEntries,
  useProjectNamesMap,
} from "@/hooks/use-status-mode-workspaces";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shortcut } from "@/components/ui/shortcut";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import type { PrHint } from "@/git/use-pr-status-query";
import { buildSidebarProjectRowModel } from "@/utils/sidebar-project-row-model";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  archiveWorkspaceOptimistically,
  archiveWorkspacesOptimistically,
} from "@/workspace/workspace-archive";
import { isWeb as platformIsWeb, isNative as platformIsNative } from "@/constants/platform";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { getProviderIcon } from "@/components/provider-icons";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { formatTimeAgo } from "@/utils/time";
import { ImportSessionSheet } from "@/components/import-session-sheet";
import { useOpenProject } from "@/hooks/use-open-project";
import {
  buildSidebarProjectSessionIndex,
  classifySidebarSessionProvider,
  sidebarSessionProviderLabel,
  type SidebarProjectSessionCounts,
  type SidebarProjectSessionData,
  type SidebarSessionProviderKind,
} from "@/utils/sidebar-project-sessions";
import {
  buildSidebarSessionArchiveConfirmation,
  canArchiveSidebarSession,
  isRiskySidebarSessionArchive,
  resolveSidebarSessionSwipeDecision,
  SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD,
} from "@/utils/sidebar-project-session-archive";
import { useArchiveAgent } from "@/hooks/use-archive-agent";

const projectKeyExtractor = (project: SidebarProjectEntry) => project.projectKey;

const WORKSPACE_STATUS_DOT_WIDTH = 14;
const DEFAULT_STATUS_DOT_SIZE = 7;
const EMPHASIZED_STATUS_DOT_SIZE = 9;
const DEFAULT_STATUS_DOT_OFFSET = 0;
const EMPHASIZED_STATUS_DOT_OFFSET = -1;
const EMPTY_SESSION_COUNTS: SidebarProjectSessionCounts = { claude: 0, codex: 0, other: 0 };
const EMPTY_PROJECT_SESSION_DATA: SidebarProjectSessionData = {
  agents: [],
  counts: EMPTY_SESSION_COUNTS,
};
const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedSyncedLoader = withUnistyles(SyncedLoader);
const ThemedFolderPlus = withUnistyles(FolderPlus);
const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedTrash2 = withUnistyles(Trash2);
const ThemedSettings = withUnistyles(Settings);
const ThemedInbox = withUnistyles(Inbox);
const ThemedPlus = withUnistyles(Plus);
const ThemedArchive = withUnistyles(Archive);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const redColorMapping = (theme: Theme) => ({ color: theme.colors.palette.red[500] });
const amberColorMapping = (theme: Theme) => ({ color: theme.colors.palette.amber[500] });
const greenColorMapping = (theme: Theme) => ({ color: theme.colors.palette.green[500] });
const purpleColorMapping = (theme: Theme) => ({ color: theme.colors.palette.purple[500] });
const syncedLoaderColorMapping = (theme: Theme) => ({
  color:
    theme.colorScheme === "light"
      ? theme.colors.palette.amber[700]
      : theme.colors.palette.amber[500],
});

function getPrIconUniMapping(state: PrHint["state"]) {
  switch (state) {
    case "merged":
      return purpleColorMapping;
    case "open":
      return greenColorMapping;
    case "closed":
      return redColorMapping;
  }
}

function isWorkspaceSelected(input: {
  selection: ActiveWorkspaceSelection | null;
  serverId: string | null;
  workspaceId: string;
  enabled: boolean;
}): boolean {
  return (
    input.enabled &&
    input.selection?.serverId === input.serverId &&
    input.selection.workspaceId === input.workspaceId
  );
}

function isProjectSelectedByRoute(input: {
  selection: ActiveWorkspaceSelection | null;
  project: SidebarProjectEntry;
  serverId: string | null;
  enabled: boolean;
}): boolean {
  return (
    input.enabled &&
    input.selection?.serverId === input.serverId &&
    input.project.workspaces.some(
      (workspace) => workspace.workspaceId === input.selection?.workspaceId,
    )
  );
}

function activeWorkspaceSelectionKey(selection: ActiveWorkspaceSelection | null): string {
  return selection ? `${selection.serverId}:${selection.workspaceId}` : "";
}

function selectionForSelectedWorkspace(
  selected: boolean,
  workspace: SidebarWorkspaceEntry,
): ActiveWorkspaceSelection | null {
  return selected ? { serverId: workspace.serverId, workspaceId: workspace.workspaceId } : null;
}

interface SidebarWorkspaceListProps {
  projects: SidebarProjectEntry[];
  agents?: AggregatedAgent[];
  serverId: string | null;
  collapsedProjectKeys: ReadonlySet<string>;
  onToggleProjectCollapsed: (projectKey: string) => void;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  groupMode: "project" | "status";
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onWorkspacePress?: () => void;
  onAddProject?: () => void;
  listFooterComponent?: ReactElement | null;
  /** Gesture ref for coordinating with parent gestures (e.g., sidebar close) */
  parentGestureRef?: MutableRefObject<GestureType | undefined>;
}

interface ProjectHeaderRowProps {
  project: SidebarProjectEntry;
  displayName: string;
  iconDataUri: string | null;
  workspace: SidebarWorkspaceEntry | null;
  sessionCounts: SidebarProjectSessionCounts;
  selected?: boolean;
  chevron: "expand" | "collapse" | null;
  onPress: () => void;
  serverId: string | null;
  canCreateWorktree: boolean;
  isProjectActive?: boolean;
  onWorkspacePress?: () => void;
  shortcutNumber?: number | null;
  showShortcutBadge?: boolean;
  drag: () => void;
  isDragging: boolean;
  isArchiving?: boolean;
  menuController: ReturnType<typeof useContextMenu> | null;
  onRemoveProject?: () => void;
  removeProjectStatus?: "idle" | "pending";
  dragHandleProps?: DraggableListDragHandleProps;
}

export function useSidebarWorkspaceEntry(
  serverId: string | null,
  workspaceId: string | null,
): SidebarWorkspaceEntry | null {
  const projectWorkspaceEntry = useCallback(
    (workspace: WorkspaceDescriptor): SidebarWorkspaceEntry =>
      createSidebarWorkspaceEntry({ serverId: serverId ?? "", workspace }),
    [serverId],
  );

  return useWorkspaceFields(serverId, workspaceId, projectWorkspaceEntry);
}

export function PrBadge({ hint }: { hint: PrHint }) {
  const [isHovered, setIsHovered] = useState(false);

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      void openExternalUrl(hint.url);
    },
    [hint.url],
  );

  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

  const textStyle = isHovered ? prBadgeTextHoveredCombined : prBadgeStyles.text;
  const iconUniProps = isHovered ? foregroundColorMapping : getPrIconUniMapping(hint.state);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Pull request #${hint.number}`}
      hitSlop={4}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={prBadgePressableStyle}
    >
      {isHovered ? (
        <ThemedExternalLink size={12} uniProps={iconUniProps} />
      ) : (
        <ThemedGitPullRequest size={12} uniProps={iconUniProps} />
      )}
      <Text style={textStyle} numberOfLines={1}>
        #{hint.number}
      </Text>
    </Pressable>
  );
}

function prBadgePressableStyle({ pressed }: PressableStateCallbackType) {
  return [prBadgeStyles.badge, pressed && prBadgeStyles.badgePressed];
}

function projectKebabStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.projectKebabButton, hovered && styles.projectKebabButtonHovered];
}

const prBadgeStyles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  badgePressed: {
    opacity: 0.82,
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 14,
    color: theme.colors.foregroundMuted,
  },
  textHovered: {
    color: theme.colors.foreground,
  },
}));

const prBadgeTextHoveredCombined = [prBadgeStyles.text, prBadgeStyles.textHovered];

function StatusDotOverlay({
  dotColorStyle,
  size,
  offset,
}: {
  dotColorStyle: ViewStyle;
  size: number;
  offset: number;
}) {
  const overlayStyle = useMemo(
    () => [
      styles.statusDotOverlay,
      dotColorStyle,
      {
        width: size,
        height: size,
        right: offset,
        bottom: offset,
      },
    ],
    [dotColorStyle, size, offset],
  );
  return <View style={overlayStyle} />;
}

function ProjectLeadingVisual({
  displayName,
  iconDataUri,
  workspace,
  projectKey,
  chevron = null,
  showChevron = false,
  isArchiving = false,
}: {
  displayName: string;
  iconDataUri: string | null;
  workspace: SidebarWorkspaceEntry | null;
  projectKey: string;
  chevron?: "expand" | "collapse" | null;
  showChevron?: boolean;
  isArchiving?: boolean;
}) {
  const placeholderLabel = projectIconPlaceholderLabelFromDisplayName(displayName);
  const placeholderInitial = placeholderLabel.charAt(0).toUpperCase();
  const activeWorkspace = workspace;
  const shouldShowWorkspaceStatus =
    activeWorkspace !== null && (isArchiving || activeWorkspace.statusBucket !== "done");
  const shouldShowSyncedLoader = activeWorkspace
    ? shouldRenderSyncedStatusLoader({ bucket: activeWorkspace.statusBucket })
    : false;

  if (showChevron && chevron !== null) {
    return (
      <View style={styles.projectLeadingVisualSlot}>
        <ProjectInlineChevron chevron={chevron} />
      </View>
    );
  }

  if (!shouldShowWorkspaceStatus || !activeWorkspace) {
    return (
      <View style={styles.projectLeadingVisualSlot}>
        <ProjectIcon
          iconDataUri={iconDataUri}
          placeholderInitial={placeholderInitial}
          projectKey={projectKey}
        />
      </View>
    );
  }

  return (
    <ProjectLeadingVisualStatus
      iconDataUri={iconDataUri}
      placeholderInitial={placeholderInitial}
      projectKey={projectKey}
      isArchiving={isArchiving}
      shouldShowSyncedLoader={shouldShowSyncedLoader}
      activeWorkspace={activeWorkspace}
    />
  );
}

function ProjectRowTrailingActions({
  project,
  displayName,
  serverId,
  canCreateWorktree,
  isHovered,
  isMobileBreakpoint,
  isProjectActive,
  onBeginWorkspaceSetup,
  onWorkspacePress,
  onRemoveProject,
  removeProjectStatus,
}: {
  project: SidebarProjectEntry;
  displayName: string;
  serverId: string | null;
  canCreateWorktree: boolean;
  isHovered: boolean;
  isMobileBreakpoint: boolean;
  isProjectActive: boolean;
  onBeginWorkspaceSetup: () => void;
  onWorkspacePress?: () => void;
  onRemoveProject?: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
}) {
  const [isImportSheetOpen, setIsImportSheetOpen] = useState(false);
  const openProject = useOpenProject(serverId);
  const client = useHostRuntimeClient(serverId ?? "");
  const actionsVisible = isHovered || platformIsNative || isMobileBreakpoint;
  const showMobileProjectActions = platformIsNative || isMobileBreakpoint;
  const showWorktreeAction = canCreateWorktree && !showMobileProjectActions;
  const handleOpenNewAgent = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (!serverId) return;
      void (async () => {
        const didOpen = await openProject(project.iconWorkingDir || project.projectKey);
        if (didOpen) {
          onWorkspacePress?.();
        }
      })();
    },
    [onWorkspacePress, openProject, project.iconWorkingDir, project.projectKey, serverId],
  );
  const handleOpenImportSheet = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
    setIsImportSheetOpen(true);
  }, []);
  const handleCloseImportSheet = useCallback(() => setIsImportSheetOpen(false), []);
  const handleImported = useCallback(
    (agent: { id: string; cwd: string }) => {
      if (!serverId) return;
      void (async () => {
        await openProject(agent.cwd);
        onWorkspacePress?.();
        router.push(buildHostAgentDetailRoute(serverId, agent.id) as Href);
      })();
    },
    [onWorkspacePress, openProject, serverId],
  );
  return (
    <View style={styles.projectTrailingActions}>
      {showMobileProjectActions ? (
        <>
          <ProjectIconActionButton
            label={`New agent for ${displayName}`}
            testID={`sidebar-project-new-agent-${project.projectKey}`}
            visible={actionsVisible}
            onPress={handleOpenNewAgent}
            icon="plus"
          />
          <ProjectIconActionButton
            label={`Import sessions for ${displayName}`}
            testID={`sidebar-project-import-sessions-${project.projectKey}`}
            visible={actionsVisible}
            onPress={handleOpenImportSheet}
            icon="inbox"
          />
          <ImportSessionSheet
            visible={isImportSheetOpen}
            client={client}
            serverId={serverId}
            cwd={project.iconWorkingDir || project.projectKey}
            onClose={handleCloseImportSheet}
            onImported={handleImported}
          />
        </>
      ) : null}
      {showWorktreeAction ? (
        <NewWorktreeButton
          displayName={displayName}
          onPress={onBeginWorkspaceSetup}
          visible={actionsVisible}
          showShortcutHint={isProjectActive}
          testID={`sidebar-project-new-worktree-${project.projectKey}`}
        />
      ) : null}
      {onRemoveProject ? (
        <View
          style={!actionsVisible && styles.projectKebabButtonHidden}
          pointerEvents={actionsVisible ? "auto" : "none"}
        >
          <ProjectKebabMenu
            projectKey={project.projectKey}
            onRemoveProject={onRemoveProject}
            removeProjectStatus={removeProjectStatus}
          />
        </View>
      ) : null}
    </View>
  );
}

const trash2LeadingIcon = <ThemedTrash2 size={14} uniProps={foregroundMutedColorMapping} />;
const settingsLeadingIcon = <ThemedSettings size={14} uniProps={foregroundMutedColorMapping} />;
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;

function renderKebabTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function ProjectKebabMenu({
  projectKey,
  onRemoveProject,
  removeProjectStatus,
}: {
  projectKey: string;
  onRemoveProject: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
}) {
  const handleOpenProjectSettings = useCallback(() => {
    if (projectKey.trim().length === 0) return;
    router.navigate(buildProjectSettingsRoute(projectKey));
  }, [projectKey]);
  const canOpenProjectSettings = projectKey.trim().length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={projectKebabStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel="Project actions"
        testID={`sidebar-project-kebab-${projectKey}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        {canOpenProjectSettings ? (
          <DropdownMenuItem
            testID={`sidebar-project-menu-open-settings-${projectKey}`}
            leading={settingsLeadingIcon}
            onSelect={handleOpenProjectSettings}
          >
            Open project settings
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID={`sidebar-project-menu-remove-${projectKey}`}
          leading={trash2LeadingIcon}
          status={removeProjectStatus}
          pendingLabel="Removing..."
          onSelect={onRemoveProject}
        >
          Remove project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectIcon({
  iconDataUri,
  placeholderInitial,
  projectKey,
}: {
  iconDataUri: string | null;
  placeholderInitial: string;
  projectKey: string;
}) {
  return (
    <ProjectIconView
      iconDataUri={iconDataUri}
      initial={placeholderInitial}
      projectKey={projectKey}
      imageStyle={styles.projectIcon}
      fallbackStyle={styles.projectIconFallback}
      textStyle={styles.projectIconFallbackText}
    />
  );
}

function ProjectLeadingVisualStatus({
  iconDataUri,
  placeholderInitial,
  projectKey,
  isArchiving,
  shouldShowSyncedLoader,
  activeWorkspace,
}: {
  iconDataUri: string | null;
  placeholderInitial: string;
  projectKey: string;
  isArchiving: boolean;
  shouldShowSyncedLoader: boolean;
  activeWorkspace: SidebarWorkspaceEntry;
}) {
  if (isArchiving) {
    return (
      <View style={styles.projectLeadingVisualSlot}>
        <ThemedActivityIndicator size={8} uniProps={foregroundMutedColorMapping} />
      </View>
    );
  }

  if (shouldShowSyncedLoader) {
    return (
      <View style={styles.projectLeadingVisualSlot}>
        <ThemedSyncedLoader size={11} uniProps={syncedLoaderColorMapping} />
      </View>
    );
  }

  if (activeWorkspace.statusBucket === "needs_input") {
    return (
      <View style={styles.projectLeadingVisualSlot}>
        <ThemedCircleAlert size={14} uniProps={amberColorMapping} />
      </View>
    );
  }

  const dotColorStyle = getStatusDotColorStyle(activeWorkspace.statusBucket);
  const statusDotSize = isEmphasizedStatusDotBucket(activeWorkspace.statusBucket)
    ? EMPHASIZED_STATUS_DOT_SIZE
    : DEFAULT_STATUS_DOT_SIZE;
  const statusDotOffset =
    statusDotSize === EMPHASIZED_STATUS_DOT_SIZE
      ? EMPHASIZED_STATUS_DOT_OFFSET
      : DEFAULT_STATUS_DOT_OFFSET;

  return (
    <View style={styles.projectLeadingVisualSlot}>
      <ProjectIcon
        iconDataUri={iconDataUri}
        placeholderInitial={placeholderInitial}
        projectKey={projectKey}
      />
      {dotColorStyle ? (
        <StatusDotOverlay
          dotColorStyle={dotColorStyle}
          size={statusDotSize}
          offset={statusDotOffset}
        />
      ) : null}
    </View>
  );
}

function ProjectInlineChevron({ chevron }: { chevron: "expand" | "collapse" | null }) {
  if (chevron === null) {
    return null;
  }
  if (chevron === "collapse") {
    return <ChevronDown size={14} color="#9ca3af" />;
  }
  return <ChevronRight size={14} color="#9ca3af" />;
}

function ProjectIconActionButton({
  label,
  testID,
  visible,
  onPress,
  icon,
}: {
  label: string;
  testID: string;
  visible: boolean;
  onPress: (event: GestureResponderEvent) => void;
  icon: "plus" | "inbox";
}) {
  const isMobileBreakpoint = useIsCompactFormFactor();
  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.projectIconActionButton,
      isMobileBreakpoint && styles.projectIconActionButtonMobile,
      !visible && styles.projectIconActionButtonHidden,
      (Boolean(hovered) || pressed) && styles.projectIconActionButtonHovered,
    ],
    [isMobileBreakpoint, visible],
  );

  const renderIcon = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => {
      const iconProps = {
        size: isMobileBreakpoint ? 18 : 15,
        uniProps: hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping,
      };
      return icon === "plus" ? <ThemedPlus {...iconProps} /> : <ThemedInbox {...iconProps} />;
    },
    [icon, isMobileBreakpoint],
  );
  const slotStyle = useMemo(
    () => [
      styles.projectTrailingControlSlot,
      isMobileBreakpoint && styles.projectTrailingControlSlotMobile,
    ],
    [isMobileBreakpoint],
  );

  return (
    <View style={slotStyle} pointerEvents={visible ? "auto" : "none"}>
      <Pressable
        style={pressableStyle}
        onPress={onPress}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={label}
        testID={testID}
        hitSlop={8}
      >
        {renderIcon}
      </Pressable>
    </View>
  );
}

function NewWorktreeButton({
  displayName,
  onPress,
  visible,
  loading = false,
  testID,
  showShortcutHint = false,
}: {
  displayName: string;
  onPress: () => void;
  visible: boolean;
  loading?: boolean;
  testID: string;
  showShortcutHint?: boolean;
}) {
  const newWorktreeKeys = useShortcutKeys("new-worktree");

  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.projectIconActionButton,
      !visible && styles.projectIconActionButtonHidden,
      (Boolean(hovered) || pressed) && !loading && styles.projectIconActionButtonHovered,
    ],
    [visible, loading],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onPress();
    },
    [onPress],
  );

  return (
    <View style={styles.projectTrailingControlSlot} pointerEvents={visible ? "auto" : "none"}>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild disabled={!visible}>
          <Pressable
            style={pressableStyle}
            onPress={handlePress}
            disabled={loading}
            accessibilityRole={platformIsWeb ? undefined : "button"}
            accessibilityLabel={`Create a new workspace for ${displayName}`}
            testID={testID}
          >
            {({ hovered, pressed }) =>
              loading ? (
                <ThemedActivityIndicator size={14} uniProps={foregroundMutedColorMapping} />
              ) : (
                <ThemedFolderPlus
                  size={15}
                  uniProps={
                    hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping
                  }
                />
              )
            }
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <View style={styles.projectActionTooltipRow}>
            <Text style={styles.projectActionTooltipText}>New workspace</Text>
            {showShortcutHint && newWorktreeKeys ? (
              <Shortcut chord={newWorktreeKeys} style={styles.projectActionTooltipShortcut} />
            ) : null}
          </View>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

function useLongPressDragInteraction(input: {
  drag: () => void;
  menuController: ReturnType<typeof useContextMenu> | null;
}) {
  const didLongPressRef = useRef(false);
  const dragArmedRef = useRef(false);
  const dragActivatedRef = useRef(false);
  const didStartDragRef = useRef(false);
  const scrollIntentRef = useRef(false);
  const menuOpenedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const dragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (dragArmTimerRef.current) {
      clearTimeout(dragArmTimerRef.current);
      dragArmTimerRef.current = null;
    }
    if (contextMenuTimerRef.current) {
      clearTimeout(contextMenuTimerRef.current);
      contextMenuTimerRef.current = null;
    }
  }, []);

  const openContextMenuAtStartPoint = useCallback(() => {
    if (!input.menuController || !touchStartRef.current) {
      return;
    }
    const statusBarHeight = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
    input.menuController.setAnchorRect({
      x: touchStartRef.current.x,
      y: touchStartRef.current.y + statusBarHeight,
      width: 0,
      height: 0,
    });
    input.menuController.setOpen(true);
    menuOpenedRef.current = true;
    didLongPressRef.current = true;
  }, [input.menuController]);

  const handleLongPress = useCallback(() => {
    // Manual timers own long-press behavior on mobile.
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const armTimers = useCallback(() => {
    clearTimers();

    const DRAG_ARM_DELAY_MS = 180;
    const DRAG_ARM_STATIONARY_SLOP_PX = 4;
    const CONTEXT_MENU_DELAY_MS = 450;
    const CONTEXT_MENU_STATIONARY_SLOP_PX = 6;

    dragArmTimerRef.current = setTimeout(() => {
      if (scrollIntentRef.current || didStartDragRef.current || menuOpenedRef.current) {
        return;
      }
      const start = touchStartRef.current;
      const current = touchCurrentRef.current ?? start;
      if (!start || !current) {
        return;
      }
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > DRAG_ARM_STATIONARY_SLOP_PX) {
        return;
      }
      dragArmedRef.current = true;
      dragActivatedRef.current = true;
      didLongPressRef.current = true;
      void Haptics.selectionAsync().catch(() => {});
      input.drag();
    }, DRAG_ARM_DELAY_MS);

    if (!input.menuController || platformIsWeb) {
      return;
    }

    contextMenuTimerRef.current = setTimeout(() => {
      if (scrollIntentRef.current || didStartDragRef.current || menuOpenedRef.current) {
        return;
      }
      const start = touchStartRef.current;
      const current = touchCurrentRef.current ?? start;
      if (!start || !current) {
        return;
      }
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > CONTEXT_MENU_STATIONARY_SLOP_PX) {
        return;
      }
      void Haptics.selectionAsync().catch(() => {});
      openContextMenuAtStartPoint();
    }, CONTEXT_MENU_DELAY_MS);
  }, [clearTimers, input, openContextMenuAtStartPoint]);

  const handleDragIntent = useCallback(
    (_details: { dx: number; dy: number; distance: number }) => {
      if (!dragActivatedRef.current) {
        return;
      }
      didStartDragRef.current = true;
      didLongPressRef.current = true;
      clearTimers();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    [clearTimers],
  );

  const handleScrollIntent = useCallback(
    (_details: { dx: number; dy: number; distance: number }) => {
      scrollIntentRef.current = true;
      didLongPressRef.current = true;
      clearTimers();
    },
    [clearTimers],
  );

  const handleSwipeIntent = useCallback(
    (_details: { dx: number; dy: number; distance: number }) => {
      didLongPressRef.current = true;
      clearTimers();
    },
    [clearTimers],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      didLongPressRef.current = false;
      dragArmedRef.current = false;
      dragActivatedRef.current = false;
      didStartDragRef.current = false;
      scrollIntentRef.current = false;
      menuOpenedRef.current = false;
      touchStartRef.current = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };
      touchCurrentRef.current = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };
      armTimers();
    },
    [armTimers],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const start = touchStartRef.current;
      if (!start || didStartDragRef.current || menuOpenedRef.current) {
        return;
      }

      const touch = event?.nativeEvent?.touches?.[0] ?? event?.nativeEvent;
      const x = touch?.pageX;
      const y = touch?.pageY;
      if (typeof x !== "number" || typeof y !== "number") {
        return;
      }

      const current = { x, y };
      touchCurrentRef.current = current;
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const decision = decideLongPressMove({
        dragArmed: dragArmedRef.current,
        didStartDrag: didStartDragRef.current,
        startPoint: start,
        currentPoint: current,
      });

      if (decision === "vertical_scroll") {
        handleScrollIntent({ dx, dy, distance });
        return;
      }

      if (decision === "horizontal_swipe" || decision === "cancel_long_press") {
        handleSwipeIntent({ dx, dy, distance });
        return;
      }

      if (decision === "start_drag") {
        handleDragIntent({ dx, dy, distance });
      }
    },
    [handleDragIntent, handleScrollIntent, handleSwipeIntent],
  );

  const handlePressOut = useCallback(() => {
    clearTimers();
    dragArmedRef.current = false;
    dragActivatedRef.current = false;
    touchStartRef.current = null;
    touchCurrentRef.current = null;
  }, [clearTimers]);

  return {
    didLongPressRef,
    handleLongPress,
    handlePressIn,
    handleTouchMove,
    handlePressOut,
  };
}

function providerCountColor(kind: SidebarSessionProviderKind, theme: Theme): string {
  if (kind === "claude") return theme.colors.palette.orange[500];
  if (kind === "codex") return theme.colors.palette.blue[500];
  return theme.colors.foregroundMuted;
}

function ProjectProviderCountBadges({ counts }: { counts: SidebarProjectSessionCounts }) {
  const allEntries: Array<{ kind: SidebarSessionProviderKind; count: number; label: string }> = [
    { kind: "claude", count: counts.claude, label: "Claude sessions" },
    { kind: "codex", count: counts.codex, label: "Codex sessions" },
    { kind: "other", count: counts.other, label: "Other sessions" },
  ];
  const entries = allEntries.filter((entry) => entry.count > 0);

  if (entries.length === 0) return null;

  return (
    <View style={styles.projectProviderCountGroup} pointerEvents="none">
      {entries.map((entry) => (
        <ProjectProviderCountBadge key={entry.kind} entry={entry} />
      ))}
    </View>
  );
}

function ProjectProviderCountBadge({
  entry,
}: {
  entry: { kind: SidebarSessionProviderKind; count: number; label: string };
}) {
  const { theme } = useUnistyles();
  const color = providerCountColor(entry.kind, theme);
  const dotStyle = useMemo(
    () => [styles.projectProviderCountDot, { backgroundColor: color }],
    [color],
  );
  const textStyle = useMemo(() => [styles.projectProviderCountText, { color }], [color]);

  return (
    <View
      style={styles.projectProviderCountBadge}
      accessibilityLabel={`${entry.count} ${entry.label}`}
    >
      <View style={dotStyle} />
      <Text style={textStyle}>{entry.count}</Text>
    </View>
  );
}

async function confirmSidebarSessionArchiveIfNeeded(agents: AggregatedAgent[]): Promise<boolean> {
  const riskyCount = agents.filter(isRiskySidebarSessionArchive).length;
  if (riskyCount === 0) {
    return true;
  }

  const confirmation = buildSidebarSessionArchiveConfirmation({
    totalCount: agents.length,
    riskyCount,
  });

  if (Platform.OS === "ios" && platformIsNative) {
    return await new Promise<boolean>((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: confirmation.title,
          message: confirmation.message,
          options: ["Cancel", "Archive"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
        },
        (buttonIndex) => resolve(buttonIndex === 1),
      );
    });
  }

  return await confirmDialog({
    title: confirmation.title,
    message: confirmation.message,
    confirmLabel: "Archive",
    cancelLabel: "Cancel",
    destructive: true,
  });
}

function clampSidebarSessionSwipeOffset(value: number, rowWidth: number): number {
  const maxOffset = Math.max(rowWidth + 48, SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD + 48);
  return Math.max(0, Math.min(maxOffset, value));
}

function startSidebarSessionAnimation(animation: Animated.CompositeAnimation): Promise<boolean> {
  return new Promise((resolve) => {
    animation.start(({ finished }) => resolve(finished));
  });
}

function ProjectSessionRow({
  agent,
  onPress,
  onArchive,
  onUnarchive,
  isArchiving,
}: {
  agent: AggregatedAgent;
  onPress: (agent: AggregatedAgent) => void;
  onArchive: (agent: AggregatedAgent) => Promise<boolean>;
  onUnarchive: (agent: AggregatedAgent) => Promise<boolean>;
  isArchiving: boolean;
}) {
  const { theme } = useUnistyles();
  const isCompactFormFactor = useIsCompactFormFactor();
  const ProviderIcon = getProviderIcon(agent.provider);
  const providerKind = classifySidebarSessionProvider(agent.provider);
  const providerColor = providerCountColor(providerKind, theme);
  const title = agent.title || "New session";
  const timeAgo = formatTimeAgo(agent.lastActivityAt);
  const canArchive = canArchiveSidebarSession(agent);
  const canUnarchive = Boolean(agent.archivedAt);
  const swipeOffset = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(0)).current;
  const rowMargin = useRef(new Animated.Value(theme.spacing[1])).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;
  const swipeStartOffsetRef = useRef(0);
  const rowWidthRef = useRef(0);
  const measuredHeightRef = useRef(0);
  const isCommittingRef = useRef(false);
  const hapticFiredRef = useRef(false);
  const iconScale = useRef(new Animated.Value(1)).current;
  const [hasMeasuredRow, setHasMeasuredRow] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const swipeEnabled =
    Platform.OS === "ios" &&
    isCompactFormFactor &&
    (canArchive || canUnarchive) &&
    !isArchiving &&
    !isCommitting;
  let statusLabel: string = agent.status;
  if (agent.requiresAttention) {
    statusLabel = "Attention";
  } else if (agent.status === "initializing") {
    statusLabel = "Starting";
  }

  const restoreExpandedRow = useCallback(
    (animated = true) => {
      const measuredHeight = measuredHeightRef.current;
      const resetValues = () => {
        swipeOffset.setValue(0);
        rowOpacity.setValue(1);
        rowMargin.setValue(theme.spacing[1]);
        iconScale.setValue(1);
        if (measuredHeight > 0) {
          rowHeight.setValue(measuredHeight);
        }
      };

      if (!animated) {
        resetValues();
        return;
      }

      Animated.parallel([
        Animated.spring(swipeOffset, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 18,
        }),
        Animated.timing(rowOpacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rowMargin, {
          toValue: theme.spacing[1],
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        ...(measuredHeight > 0
          ? [
              Animated.timing(rowHeight, {
                toValue: measuredHeight,
                duration: 180,
                easing: Easing.out(Easing.quad),
                useNativeDriver: false,
              }),
            ]
          : []),
      ]).start();
    },
    [rowHeight, rowMargin, rowOpacity, swipeOffset, theme.spacing],
  );

  useEffect(() => {
    if (!isCommitting) {
      restoreExpandedRow(false);
    }
  }, [agent.archivedAt, isCommitting, restoreExpandedRow]);

  const resetSwipe = useCallback(() => {
    restoreExpandedRow(true);
  }, [restoreExpandedRow]);

  const handleRowLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number; width: number } } }) => {
      const { height, width } = event.nativeEvent.layout;
      rowWidthRef.current = width;
      if (height <= 0 || isCommittingRef.current) {
        return;
      }
      measuredHeightRef.current = height;
      if (!hasMeasuredRow) {
        rowHeight.setValue(height);
        setHasMeasuredRow(true);
      }
    },
    [hasMeasuredRow, rowHeight],
  );

  const runCommittedSwipe = useCallback(
    async (action: "archive" | "unarchive") => {
      if (isCommittingRef.current) {
        return;
      }

      if (action === "archive") {
        const confirmed = await confirmSidebarSessionArchiveIfNeeded([agent]);
        if (!confirmed) {
          resetSwipe();
          return;
        }
      }

      isCommittingRef.current = true;
      setIsCommitting(true);

      const slideDistance = Math.max(
        rowWidthRef.current + 48,
        SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD + 48,
      );
      const slideFinished = await startSidebarSessionAnimation(
        Animated.parallel([
          Animated.timing(swipeOffset, {
            toValue: slideDistance,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rowOpacity, {
            toValue: 0,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );

      if (!slideFinished) {
        isCommittingRef.current = false;
        setIsCommitting(false);
        resetSwipe();
        return;
      }

      await startSidebarSessionAnimation(
        Animated.parallel([
          Animated.timing(rowHeight, {
            toValue: 0,
            duration: 170,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(rowMargin, {
            toValue: 0,
            duration: 170,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
      );

      const didComplete = action === "archive" ? await onArchive(agent) : await onUnarchive(agent);
      isCommittingRef.current = false;
      setIsCommitting(false);

      if (!didComplete) {
        resetSwipe();
      }
    },
    [agent, onArchive, onUnarchive, resetSwipe, rowHeight, rowMargin, rowOpacity, swipeOffset],
  );

  const handleArchive = useCallback(async () => {
    if (!canArchive || isArchiving) {
      return;
    }
    const confirmed = await confirmSidebarSessionArchiveIfNeeded([agent]);
    if (!confirmed) {
      resetSwipe();
      return;
    }
    const didArchive = await onArchive(agent);
    if (!didArchive) {
      resetSwipe();
    }
  }, [agent, canArchive, isArchiving, onArchive, resetSwipe]);

  const handlePress = useCallback(() => {
    if (isCommittingRef.current) {
      return;
    }
    onPress(agent);
  }, [agent, onPress]);

  const handleArchiveMenuSelect = useCallback(() => {
    void handleArchive();
  }, [handleArchive]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          swipeEnabled &&
          gestureState.dx > 14 &&
          resolveSidebarSessionSwipeDecision({
            translationX: gestureState.dx,
            translationY: gestureState.dy,
          }) !== "ignore",
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          swipeOffset.stopAnimation((value) => {
            swipeStartOffsetRef.current = typeof value === "number" ? value : 0;
          });
          hapticFiredRef.current = false;
          iconScale.setValue(1);
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextOffset = clampSidebarSessionSwipeOffset(
            swipeStartOffsetRef.current + gestureState.dx,
            rowWidthRef.current,
          );
          swipeOffset.setValue(nextOffset);

          const crossedThreshold = nextOffset >= SIDEBAR_SESSION_SWIPE_ARCHIVE_THRESHOLD;
          if (crossedThreshold && !hapticFiredRef.current) {
            hapticFiredRef.current = true;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            Animated.spring(iconScale, {
              toValue: 1.3,
              useNativeDriver: true,
              bounciness: 8,
              speed: 12,
            }).start();
          } else if (!crossedThreshold && hapticFiredRef.current) {
            hapticFiredRef.current = false;
            Animated.spring(iconScale, {
              toValue: 1,
              useNativeDriver: true,
              bounciness: 0,
              speed: 12,
            }).start();
          }
        },
        onPanResponderRelease: (_event, gestureState: PanResponderGestureState) => {
          hapticFiredRef.current = false;
          iconScale.setValue(1);
          const decision = resolveSidebarSessionSwipeDecision({
            translationX: swipeStartOffsetRef.current + gestureState.dx,
            translationY: gestureState.dy,
            velocityX: gestureState.vx,
            archived: canUnarchive,
          });
          if (decision === "archive") {
            void runCommittedSwipe("archive");
            return;
          }
          if (decision === "unarchive") {
            void runCommittedSwipe("unarchive");
            return;
          }
          resetSwipe();
        },
        onPanResponderTerminate: () => {
          hapticFiredRef.current = false;
          iconScale.setValue(1);
          resetSwipe();
        },
      }),
    [canUnarchive, resetSwipe, runCommittedSwipe, swipeEnabled, swipeOffset],
  );

  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.projectSessionRow,
      (hovered || pressed) && styles.projectSessionRowHovered,
      isArchiving && styles.projectSessionRowArchiving,
    ],
    [isArchiving],
  );

  const animatedRowStyle = useMemo(
    () => [
      {
        backgroundColor: theme.colors.surfaceSidebar,
        opacity: rowOpacity,
        transform: [{ translateX: swipeOffset }],
      },
    ],
    [rowOpacity, swipeOffset, theme.colors.surfaceSidebar],
  );
  const animatedContainerStyle = useMemo(
    () => [
      styles.projectSessionSwipeContainer,
      hasMeasuredRow
        ? {
            height: rowHeight,
            marginBottom: rowMargin,
          }
        : null,
    ],
    [hasMeasuredRow, rowHeight, rowMargin],
  );
  const swipeBackgroundStyle = useMemo(
    () => [
      styles.projectSessionSwipeBackground,
      canUnarchive && styles.projectSessionSwipeBackgroundUnarchive,
    ],
    [canUnarchive],
  );
  const swipeBackgroundIcon = canUnarchive ? (
    <Inbox size={17} color={theme.colors.foregroundMuted} />
  ) : (
    <Archive size={17} color={theme.colors.foregroundMuted} />
  );
  const accessibilityState = useMemo(
    () => ({
      disabled: isCommitting || isArchiving ? true : undefined,
    }),
    [isArchiving, isCommitting],
  );

  return (
    <ContextMenu>
      <Animated.View style={animatedContainerStyle}>
        {swipeEnabled ? (
          <View style={swipeBackgroundStyle} pointerEvents="none">
            <Animated.View
              style={[styles.projectSessionSwipeIconSlot, { transform: [{ scale: iconScale }] }]}
            >
              {swipeBackgroundIcon}
            </Animated.View>
          </View>
        ) : null}
        <Animated.View
          {...panResponder.panHandlers}
          style={animatedRowStyle}
          onLayout={handleRowLayout}
          testID={`sidebar-project-session-swipe-${agent.serverId}-${agent.id}`}
        >
          <ContextMenuTrigger
            enabled={canArchive}
            enabledOnMobile={false}
            enabledOnWeb
            longPressDelayMs={350}
            style={rowStyle}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityState={accessibilityState}
            accessibilityLabel={`${sidebarSessionProviderLabel(agent.provider)} session ${title}`}
            testID={`sidebar-project-session-${agent.serverId}-${agent.id}`}
          >
            <View style={styles.projectSessionIconSlot}>
              <ProviderIcon size={14} color={providerColor} />
            </View>
            <View style={styles.projectSessionContent}>
              <View style={styles.projectSessionTitleRow}>
                <Text style={styles.projectSessionTitle} numberOfLines={1}>
                  {title}
                </Text>
                {agent.archivedAt ? (
                  <Text style={styles.projectSessionArchivedBadge}>Archived</Text>
                ) : null}
              </View>
              <Text style={styles.projectSessionMeta} numberOfLines={1}>
                {statusLabel} · {timeAgo}
              </Text>
            </View>
            {isArchiving ? (
              <ThemedActivityIndicator size={14} uniProps={foregroundMutedColorMapping} />
            ) : null}
          </ContextMenuTrigger>
        </Animated.View>
      </Animated.View>
      <ContextMenuContent
        align="start"
        width={220}
        mobileMode="sheet"
        testID={`sidebar-project-session-context-${agent.serverId}-${agent.id}`}
      >
        <ContextMenuItem
          testID={`sidebar-project-session-context-${agent.serverId}-${agent.id}-archive`}
          leading={archiveLeadingIcon}
          destructive
          disabled={!canArchive}
          status={isArchiving ? "pending" : "idle"}
          pendingLabel="Archiving..."
          onSelect={handleArchiveMenuSelect}
        >
          Archive session
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ProjectSessionList({
  data,
  onAgentPress,
  onArchiveAgent,
  onUnarchiveAgent,
  isAgentArchiving,
}: {
  data: SidebarProjectSessionData;
  onAgentPress: (agent: AggregatedAgent) => void;
  onArchiveAgent: (agent: AggregatedAgent) => Promise<boolean>;
  onUnarchiveAgent: (agent: AggregatedAgent) => Promise<boolean>;
  isAgentArchiving: (agent: AggregatedAgent) => boolean;
}) {
  if (data.agents.length === 0) {
    return (
      <View style={styles.projectSessionEmptyRow}>
        <Text style={styles.projectSessionEmptyText}>No sessions</Text>
      </View>
    );
  }

  return (
    <View style={styles.projectSessionList}>
      {data.agents.map((agent) => (
        <ProjectSessionRow
          key={`${agent.serverId}:${agent.id}`}
          agent={agent}
          onPress={onAgentPress}
          onArchive={onArchiveAgent}
          onUnarchive={onUnarchiveAgent}
          isArchiving={isAgentArchiving(agent)}
        />
      ))}
    </View>
  );
}

function ProjectHeaderRow({
  project,
  displayName,
  iconDataUri,
  workspace,
  sessionCounts,
  selected = false,
  chevron,
  onPress,
  serverId,
  canCreateWorktree,
  isProjectActive = false,
  onWorkspacePress,
  shortcutNumber = null,
  showShortcutBadge = false,
  drag,
  isDragging,
  isArchiving = false,
  menuController,
  onRemoveProject,
  removeProjectStatus = "idle",
  dragHandleProps,
}: ProjectHeaderRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isMobileBreakpoint = useIsCompactFormFactor();
  const handleBeginWorkspaceSetup = useCallback(() => {
    if (!serverId) {
      return;
    }
    router.navigate(
      buildHostNewWorkspaceRoute(serverId, project.iconWorkingDir, {
        displayName,
        projectId: project.projectKey,
      }) as Href,
    );
    onWorkspacePress?.();
  }, [displayName, onWorkspacePress, project.iconWorkingDir, project.projectKey, serverId]);
  const _mergeWorkspaces = useSessionStore((state) => state.mergeWorkspaces);
  const _toast = useToast();

  const interaction = useLongPressDragInteraction({
    drag,
    menuController,
  });
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false;
      return;
    }
    onPress();
  }, [interaction.didLongPressRef, onPress]);

  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);

  const projectRowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.projectRow,
      isMobileBreakpoint && styles.projectRowMobile,
      isDragging && styles.projectRowDragging,
      selected && styles.sidebarRowSelected,
      isHovered && styles.projectRowHovered,
      pressed && styles.projectRowPressed,
    ],
    [isDragging, isMobileBreakpoint, selected, isHovered],
  );

  const rowChildren = (
    <>
      <View style={styles.projectRowLeft}>
        <ProjectLeadingVisual
          displayName={displayName}
          iconDataUri={iconDataUri}
          workspace={workspace}
          projectKey={project.projectKey}
          chevron={chevron}
          showChevron={isHovered && chevron !== null}
          isArchiving={isArchiving}
        />

        <View style={styles.projectTitleGroup}>
          <Text style={styles.projectTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <ProjectProviderCountBadges counts={sessionCounts} />
        </View>
      </View>
      <ProjectRowTrailingActions
        project={project}
        displayName={displayName}
        serverId={serverId}
        canCreateWorktree={canCreateWorktree}
        isHovered={isHovered}
        isMobileBreakpoint={isMobileBreakpoint}
        isProjectActive={isProjectActive}
        onBeginWorkspaceSetup={handleBeginWorkspaceSetup}
        onWorkspacePress={onWorkspacePress}
        onRemoveProject={onRemoveProject}
        removeProjectStatus={removeProjectStatus}
      />
      {showShortcutBadge && shortcutNumber !== null ? (
        <View style={styles.projectShortcutBadgeOverlay} pointerEvents="none">
          <SidebarWorkspaceShortcutBadge number={shortcutNumber} />
        </View>
      ) : null}
    </>
  );

  if (menuController) {
    return (
      <View
        {...dragAttributes}
        {...dragHandleProps?.listeners}
        ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <ContextMenuTrigger
          enabledOnMobile={false}
          accessibilityRole="button"
          style={projectRowStyle}
          onPressIn={interaction.handlePressIn}
          onTouchMove={interaction.handleTouchMove}
          onPressOut={interaction.handlePressOut}
          onPress={handlePress}
          testID={`sidebar-project-row-${project.projectKey}`}
        >
          {rowChildren}
        </ContextMenuTrigger>
      </View>
    );
  }

  return (
    <View
      {...dragAttributes}
      {...dragHandleProps?.listeners}
      ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        accessibilityRole="button"
        style={projectRowStyle}
        onPressIn={interaction.handlePressIn}
        onTouchMove={interaction.handleTouchMove}
        onPressOut={interaction.handlePressOut}
        onPress={handlePress}
        testID={`sidebar-project-row-${project.projectKey}`}
      >
        {rowChildren}
      </Pressable>
    </View>
  );
}

function NonGitProjectRowWithMenuContent({
  project,
  displayName,
  iconDataUri,
  workspace,
  selected,
  onPress,
  shortcutNumber,
  showShortcutBadge,
  drag,
  isDragging,
  dragHandleProps,
}: {
  project: SidebarProjectEntry;
  displayName: string;
  iconDataUri: string | null;
  workspace: SidebarWorkspaceEntry;
  selected: boolean;
  onPress: () => void;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
}) {
  const toast = useToast();
  const contextMenu = useContextMenu();
  const [isArchivingWorkspace, setIsArchivingWorkspace] = useState(false);
  const redirectAfterArchive = useCallback(() => {
    redirectIfArchivingActiveWorkspace({
      serverId: workspace.serverId,
      workspaceId: workspace.workspaceId,
      activeWorkspaceSelection: selectionForSelectedWorkspace(selected, workspace),
    });
  }, [selected, workspace]);

  const handleArchiveWorkspace = useCallback(() => {
    if (isArchivingWorkspace) {
      return;
    }

    void (async () => {
      const confirmed = await confirmDialog({
        title: "Hide workspace?",
        message: `Hide "${workspace.name}" from the sidebar?\n\nFiles on disk will not be changed.`,
        confirmLabel: "Hide",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      const client = getHostRuntimeStore().getClient(workspace.serverId);
      if (!client) {
        toast.error("Host is not connected");
        return;
      }

      setIsArchivingWorkspace(true);
      void (async () => {
        try {
          await archiveWorkspaceOptimistically({
            client,
            workspace,
            afterHide: redirectAfterArchive,
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to hide workspace");
        } finally {
          setIsArchivingWorkspace(false);
        }
      })();
    })();
  }, [isArchivingWorkspace, redirectAfterArchive, toast, workspace]);

  return (
    <>
      <ProjectHeaderRow
        project={project}
        displayName={displayName}
        iconDataUri={iconDataUri}
        workspace={workspace}
        sessionCounts={EMPTY_SESSION_COUNTS}
        selected={selected}
        chevron={null}
        onPress={onPress}
        serverId={null}
        canCreateWorktree={false}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        drag={drag}
        isDragging={isDragging}
        isArchiving={isArchivingWorkspace}
        menuController={contextMenu}
        dragHandleProps={dragHandleProps}
      />
      <ContextMenuContent
        align="start"
        width={220}
        mobileMode="sheet"
        testID={`sidebar-workspace-context-${workspace.workspaceKey}`}
      >
        <ContextMenuItem
          testID={`sidebar-workspace-context-${workspace.workspaceKey}-archive`}
          status={isArchivingWorkspace ? "pending" : "idle"}
          pendingLabel="Hiding..."
          destructive
          onSelect={handleArchiveWorkspace}
        >
          Hide from sidebar
        </ContextMenuItem>
      </ContextMenuContent>
    </>
  );
}

function NonGitProjectRowWithMenu(props: {
  project: SidebarProjectEntry;
  displayName: string;
  iconDataUri: string | null;
  workspace: SidebarWorkspaceEntry;
  selected: boolean;
  onPress: () => void;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
}) {
  return (
    <ContextMenu>
      <NonGitProjectRowWithMenuContent {...props} />
    </ContextMenu>
  );
}

function FlattenedProjectRow({
  project,
  displayName,
  iconDataUri,
  rowModel,
  onPress,
  serverId,
  onWorkspacePress,
  shortcutNumber,
  showShortcutBadge,
  drag,
  isDragging,
  dragHandleProps,
  isProjectActive = false,
  onRemoveProject,
  removeProjectStatus,
  selectionEnabled,
  activeWorkspaceSelection,
}: {
  project: SidebarProjectEntry;
  displayName: string;
  iconDataUri: string | null;
  rowModel: Extract<ReturnType<typeof buildSidebarProjectRowModel>, { kind: "workspace_link" }>;
  onPress: () => void;
  serverId: string | null;
  onWorkspacePress?: () => void;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  isProjectActive?: boolean;
  onRemoveProject?: () => void;
  removeProjectStatus?: "idle" | "pending";
  selectionEnabled: boolean;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
}) {
  const workspace = useSidebarWorkspaceEntry(serverId, rowModel.workspace.workspaceId);
  const selected = isWorkspaceSelected({
    selection: activeWorkspaceSelection,
    serverId,
    workspaceId: rowModel.workspace.workspaceId,
    enabled: selectionEnabled,
  });

  if (!workspace) {
    return null;
  }

  if (project.projectKind === "directory") {
    return (
      <NonGitProjectRowWithMenu
        project={project}
        displayName={displayName}
        iconDataUri={iconDataUri}
        workspace={workspace}
        selected={selected}
        onPress={onPress}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
      />
    );
  }

  return (
    <ProjectHeaderRow
      project={project}
      displayName={displayName}
      iconDataUri={iconDataUri}
      workspace={workspace}
      sessionCounts={EMPTY_SESSION_COUNTS}
      selected={selected}
      chevron={rowModel.chevron}
      onPress={onPress}
      serverId={serverId}
      canCreateWorktree={rowModel.trailingAction === "new_worktree"}
      isProjectActive={isProjectActive}
      onWorkspacePress={onWorkspacePress}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      drag={drag}
      isDragging={isDragging}
      menuController={null}
      onRemoveProject={onRemoveProject}
      removeProjectStatus={removeProjectStatus}
      dragHandleProps={dragHandleProps}
    />
  );
}

function ProjectBlock({
  project,
  projectSessions,
  collapsed,
  displayName,
  iconDataUri,
  serverId,
  selectionEnabled,
  showShortcutBadges,
  shortcutIndexByWorkspaceKey,
  onToggleCollapsed,
  onWorkspacePress,
  drag,
  isDragging,
  dragHandleProps,
  activeWorkspaceSelection,
}: {
  project: SidebarProjectEntry;
  projectSessions: SidebarProjectSessionData;
  collapsed: boolean;
  displayName: string;
  iconDataUri: string | null;
  serverId: string | null;
  selectionEnabled: boolean;
  showShortcutBadges: boolean;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  onToggleCollapsed: (projectKey: string) => void;
  onWorkspacePress?: () => void;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
}) {
  const rowModel = useMemo(
    () =>
      buildSidebarProjectRowModel({
        project,
        collapsed,
        forceSection: true,
      }),
    [collapsed, project],
  );

  const active = isProjectSelectedByRoute({
    selection: activeWorkspaceSelection,
    serverId,
    project,
    enabled: selectionEnabled,
  });

  const toast = useToast();
  const { archiveAgent, unarchiveAgent, isArchivingAgent } = useArchiveAgent();
  const [isRemovingProject, setIsRemovingProject] = useState(false);

  const handleArchiveAgent = useCallback(
    async (agent: AggregatedAgent) => {
      if (!canArchiveSidebarSession(agent)) {
        return false;
      }
      try {
        await archiveAgent({ serverId: agent.serverId, agentId: agent.id });
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to archive session");
        return false;
      }
    },
    [archiveAgent, toast],
  );

  const handleUnarchiveAgent = useCallback(
    async (agent: AggregatedAgent) => {
      if (!agent.archivedAt) {
        return false;
      }
      try {
        await unarchiveAgent({ serverId: agent.serverId, agentId: agent.id });
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to unarchive session");
        return false;
      }
    },
    [toast, unarchiveAgent],
  );

  const isProjectSessionArchiving = useCallback(
    (agent: AggregatedAgent) =>
      isArchivingAgent({
        serverId: agent.serverId,
        agentId: agent.id,
      }),
    [isArchivingAgent],
  );

  const handleRemoveProject = useCallback(() => {
    if (isRemovingProject || !serverId) {
      return;
    }

    void (async () => {
      const confirmed = await confirmDialog({
        title: "Remove project?",
        message: `Remove "${displayName}" from the sidebar?\n\nFiles on disk will not be changed.`,
        confirmLabel: "Remove",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toast.error("Host is not connected");
        return;
      }

      setIsRemovingProject(true);
      void archiveWorkspacesOptimistically({
        client,
        workspaces: project.workspaces,
      }).then((failures) => {
        if (failures.length > 0) {
          toast.error("Failed to remove some workspaces");
        }
        setIsRemovingProject(false);
        return;
      });
    })();
  }, [isRemovingProject, serverId, displayName, toast, project.workspaces]);

  const flattenedRowWorkspaceId =
    rowModel.kind === "workspace_link" ? rowModel.workspace.workspaceId : null;
  const handleFlattenedRowPress = useCallback(() => {
    if (!serverId || !flattenedRowWorkspaceId) {
      return;
    }
    onWorkspacePress?.();
    navigateToWorkspace(serverId, flattenedRowWorkspaceId);
  }, [serverId, flattenedRowWorkspaceId, onWorkspacePress]);

  const handleToggleCollapsed = useCallback(() => {
    onToggleCollapsed(project.projectKey);
  }, [onToggleCollapsed, project.projectKey]);
  const handleAgentPress = useCallback(
    (agent: AggregatedAgent) => {
      onWorkspacePress?.();
      navigateToAgent({
        serverId: agent.serverId,
        agentId: agent.id,
        pin: Boolean(agent.archivedAt),
      });
    },
    [onWorkspacePress],
  );

  return (
    <View style={styles.projectBlock}>
      {rowModel.kind === "workspace_link" ? (
        <FlattenedProjectRow
          project={project}
          displayName={displayName}
          iconDataUri={iconDataUri}
          rowModel={rowModel}
          onPress={handleFlattenedRowPress}
          serverId={serverId}
          onWorkspacePress={onWorkspacePress}
          shortcutNumber={shortcutIndexByWorkspaceKey.get(rowModel.workspace.workspaceKey) ?? null}
          showShortcutBadge={showShortcutBadges}
          drag={drag}
          isDragging={isDragging}
          dragHandleProps={dragHandleProps}
          isProjectActive={active}
          onRemoveProject={handleRemoveProject}
          removeProjectStatus={isRemovingProject ? "pending" : "idle"}
          selectionEnabled={selectionEnabled}
          activeWorkspaceSelection={activeWorkspaceSelection}
        />
      ) : (
        <>
          <ProjectHeaderRow
            project={project}
            displayName={displayName}
            iconDataUri={iconDataUri}
            workspace={null}
            sessionCounts={projectSessions.counts}
            selected={false}
            chevron={rowModel.chevron}
            onPress={handleToggleCollapsed}
            serverId={serverId}
            canCreateWorktree={rowModel.trailingAction === "new_worktree"}
            isProjectActive={active}
            onWorkspacePress={onWorkspacePress}
            drag={drag}
            isDragging={isDragging}
            isArchiving={isRemovingProject}
            menuController={null}
            onRemoveProject={handleRemoveProject}
            removeProjectStatus={isRemovingProject ? "pending" : "idle"}
            dragHandleProps={dragHandleProps}
          />

          {!collapsed ? (
            <ProjectSessionList
              data={projectSessions}
              onAgentPress={handleAgentPress}
              onArchiveAgent={handleArchiveAgent}
              onUnarchiveAgent={handleUnarchiveAgent}
              isAgentArchiving={isProjectSessionArchiving}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

type ProjectBlockProps = Parameters<typeof ProjectBlock>[0];

function areProjectBlockPropsEqual(previous: ProjectBlockProps, next: ProjectBlockProps): boolean {
  return (
    previous.project === next.project &&
    previous.projectSessions === next.projectSessions &&
    previous.collapsed === next.collapsed &&
    previous.displayName === next.displayName &&
    previous.iconDataUri === next.iconDataUri &&
    previous.serverId === next.serverId &&
    previous.selectionEnabled === next.selectionEnabled &&
    previous.showShortcutBadges === next.showShortcutBadges &&
    previous.shortcutIndexByWorkspaceKey === next.shortcutIndexByWorkspaceKey &&
    previous.onToggleCollapsed === next.onToggleCollapsed &&
    previous.onWorkspacePress === next.onWorkspacePress &&
    previous.drag === next.drag &&
    previous.isDragging === next.isDragging &&
    previous.dragHandleProps === next.dragHandleProps &&
    areProjectBlockSelectionsEqual(previous, next)
  );
}

function areProjectBlockSelectionsEqual(
  previous: ProjectBlockProps,
  next: ProjectBlockProps,
): boolean {
  const previousActive = isProjectSelectedByRoute({
    selection: previous.activeWorkspaceSelection,
    project: previous.project,
    serverId: previous.serverId,
    enabled: previous.selectionEnabled,
  });
  const nextActive = isProjectSelectedByRoute({
    selection: next.activeWorkspaceSelection,
    project: next.project,
    serverId: next.serverId,
    enabled: next.selectionEnabled,
  });
  if (previousActive !== nextActive) {
    return false;
  }
  if (!previousActive) {
    return true;
  }
  return (
    activeWorkspaceSelectionKey(previous.activeWorkspaceSelection) ===
    activeWorkspaceSelectionKey(next.activeWorkspaceSelection)
  );
}

const MemoProjectBlock = memo(ProjectBlock, areProjectBlockPropsEqual);

export function SidebarWorkspaceList({
  projects,
  agents,
  serverId,
  collapsedProjectKeys,
  onToggleProjectCollapsed,
  shortcutIndexByWorkspaceKey,
  groupMode,
  isRefreshing: _isRefreshing = false,
  onRefresh: _onRefresh,
  onWorkspacePress,
  onAddProject,
  listFooterComponent,
  parentGestureRef,
}: SidebarWorkspaceListProps) {
  const pathname = usePathname();

  if (groupMode === "status") {
    return (
      <SidebarStatusModeWrapper
        serverId={serverId}
        shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
        onWorkspacePress={onWorkspacePress}
      />
    );
  }

  return (
    <ProjectModeList
      projects={projects}
      agents={agents}
      serverId={serverId}
      collapsedProjectKeys={collapsedProjectKeys}
      onToggleProjectCollapsed={onToggleProjectCollapsed}
      shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
      onWorkspacePress={onWorkspacePress}
      onAddProject={onAddProject}
      listFooterComponent={listFooterComponent}
      parentGestureRef={parentGestureRef}
      pathname={pathname}
    />
  );
}

function SidebarStatusModeWrapper({
  serverId,
  shortcutIndexByWorkspaceKey: _projectShortcutIndex,
  onWorkspacePress,
}: {
  serverId: string | null;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  onWorkspacePress?: () => void;
}) {
  const hydratedWorkspaces = useHydratedWorkspaceEntries(serverId);
  const projectNamesByKey = useProjectNamesMap(serverId);
  const showShortcutBadges = useShowShortcutBadges();

  return (
    <SidebarStatusWorkspaceList
      workspaces={hydratedWorkspaces}
      projectNamesByKey={projectNamesByKey}
      serverId={serverId}
      shortcutIndexByWorkspaceKey={_projectShortcutIndex}
      showShortcutBadges={showShortcutBadges}
      onWorkspacePress={onWorkspacePress}
    />
  );
}

function ProjectModeList({
  projects,
  agents = [],
  serverId,
  collapsedProjectKeys,
  onToggleProjectCollapsed,
  shortcutIndexByWorkspaceKey,
  onWorkspacePress,
  onAddProject,
  listFooterComponent,
  parentGestureRef,
  pathname,
}: Omit<SidebarWorkspaceListProps, "groupMode" | "isRefreshing" | "onRefresh"> & {
  pathname: string;
}) {
  const showShortcutBadges = useShowShortcutBadges();

  const getProjectOrder = useSidebarOrderStore((state) => state.getProjectOrder);
  const setProjectOrder = useSidebarOrderStore((state) => state.setProjectOrder);

  const isWorkspaceRoute = useMemo(
    () => Boolean(pathname && parseHostWorkspaceRouteFromPathname(pathname)),
    [pathname],
  );
  const selectionEnabled = isWorkspaceRoute;
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const nativeScrollGestureProps = useMemo(
    () =>
      parentGestureRef
        ? ({
            // NestableScrollContainer forwards props to RNGH ScrollView. Keep
            // vertical scroll and sidebar close pan simultaneous: vertical
            // intent scrolls immediately, clear horizontal intent can still
            // activate close from inside the list.
            simultaneousHandlers: parentGestureRef,
          } as object)
        : undefined,
    [parentGestureRef],
  );

  const projectIconByProjectKey = useProjectIconDataByProjectKey({ serverId, projects });
  const projectSessionIndex = useMemo(
    () => buildSidebarProjectSessionIndex({ projects, agents }),
    [agents, projects],
  );

  const handleProjectDragEnd = useCallback(
    (reorderedProjects: SidebarProjectEntry[]) => {
      if (!serverId) {
        return;
      }

      const reorderedProjectKeys = reorderedProjects.map((project) => project.projectKey);
      const currentProjectOrder = getProjectOrder(serverId);
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        })
      ) {
        return;
      }

      setProjectOrder(
        serverId,
        mergeWithRemainder({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        }),
      );
    },
    [getProjectOrder, serverId, setProjectOrder],
  );

  const renderProject = useCallback(
    ({ item, drag, isActive, dragHandleProps }: DraggableRenderItemInfo<SidebarProjectEntry>) => {
      return (
        <MemoProjectBlock
          project={item}
          projectSessions={projectSessionIndex.get(item.projectKey) ?? EMPTY_PROJECT_SESSION_DATA}
          collapsed={collapsedProjectKeys.has(item.projectKey)}
          displayName={item.projectName}
          iconDataUri={projectIconByProjectKey.get(item.projectKey) ?? null}
          serverId={serverId}
          selectionEnabled={selectionEnabled}
          showShortcutBadges={showShortcutBadges}
          shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
          onToggleCollapsed={onToggleProjectCollapsed}
          onWorkspacePress={onWorkspacePress}
          drag={drag}
          isDragging={isActive}
          dragHandleProps={dragHandleProps}
          activeWorkspaceSelection={activeWorkspaceSelection}
        />
      );
    },
    [
      collapsedProjectKeys,
      activeWorkspaceSelection,
      onWorkspacePress,
      onToggleProjectCollapsed,
      projectIconByProjectKey,
      projectSessionIndex,
      selectionEnabled,
      serverId,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
    ],
  );

  const content = (
    <>
      {projects.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No projects yet</Text>
          <Text style={styles.emptyText}>Add a project to get started</Text>
          <Button variant="ghost" size="sm" leftIcon={Plus} onPress={onAddProject}>
            Add project
          </Button>
        </View>
      ) : (
        <DraggableList
          testID="sidebar-project-list"
          data={projects}
          keyExtractor={projectKeyExtractor}
          renderItem={renderProject}
          onDragEnd={handleProjectDragEnd}
          extraData={activeWorkspaceSelectionKey(activeWorkspaceSelection)}
          scrollEnabled={false}
          useDragHandle
          nestable={platformIsNative}
          simultaneousGestureRef={parentGestureRef}
          containerStyle={styles.projectListContainer}
        />
      )}
      {listFooterComponent}
    </>
  );

  return (
    <View style={styles.container}>
      {platformIsNative ? (
        <NestableScrollContainer
          {...nativeScrollGestureProps}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </NestableScrollContainer>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  projectListContainer: {
    width: "100%",
  },
  projectBlock: {
    marginBottom: theme.spacing[1],
  },
  workspaceListContainer: {},
  emptyContainer: {
    marginHorizontal: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    gap: theme.spacing[3],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  projectRow: {
    position: "relative",
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[1],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  projectRowMobile: {
    minHeight: 48,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  projectRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  projectRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  projectRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  projectTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  projectProviderCountGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  projectProviderCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
    minHeight: theme.fontSize.sm + 4,
  },
  projectProviderCountDot: {
    width: 5,
    height: 5,
    borderRadius: theme.borderRadius.full,
  },
  projectProviderCountText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    lineHeight: theme.fontSize.sm + 4,
    includeFontPadding: false,
  },
  projectSessionList: {
    marginBottom: theme.spacing[1],
  },
  projectSessionSwipeContainer: {
    position: "relative",
    overflow: "hidden",
    borderRadius: theme.borderRadius.lg,
  },
  projectSessionSwipeBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  projectSessionSwipeBackgroundUnarchive: {
    backgroundColor: theme.colors.surface1,
  },
  projectSessionSwipeIconSlot: {
    width: theme.spacing[3] + theme.spacing[3] + 36,
    alignItems: "center",
    justifyContent: "center",
  },
  projectSessionRow: {
    minHeight: 38,
    marginLeft: theme.spacing[3] + theme.spacing[3],
    paddingVertical: theme.spacing[2],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  projectSessionRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectSessionRowArchiving: {
    opacity: 0.62,
  },
  projectSessionIconSlot: {
    width: 16,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectSessionContent: {
    flex: 1,
    minWidth: 0,
  },
  projectSessionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  projectSessionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "400",
    flexShrink: 1,
    minWidth: 0,
  },
  projectSessionArchivedBadge: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    fontWeight: "600",
    flexShrink: 0,
  },
  projectSessionMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  projectSessionEmptyRow: {
    marginLeft: theme.spacing[3] + theme.spacing[3],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  projectSessionEmptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  projectIcon: {
    width: "100%",
    height: "100%",
    borderRadius: theme.borderRadius.sm,
  },
  projectLeadingVisualSlot: {
    position: "relative",
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconFallback: {
    width: "100%",
    height: "100%",
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconFallbackText: {
    fontSize: 9,
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "400",
    minWidth: 0,
    flexShrink: 1,
  },
  projectActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  projectActionButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectActionButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  projectIconActionButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectIconActionButtonMobile: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.lg,
  },
  projectIconActionButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectIconActionButtonHidden: {
    opacity: 0,
  },
  projectTrailingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  projectKebabButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectKebabButtonHidden: {
    opacity: 0,
  },
  projectKebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  projectTrailingControlSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectTrailingControlSlotMobile: {
    width: 40,
    height: 40,
  },
  projectActionTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  projectActionTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  projectActionTooltipShortcut: {},
  projectShortcutBadgeOverlay: {
    position: "absolute",
    top: theme.spacing[2] + 1,
    right: theme.spacing[2],
  },
  workspaceRow: {
    minHeight: 36,
    marginBottom: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingLeft: theme.spacing[3] + theme.spacing[3],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  workspaceRowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    width: "100%",
  },
  workspaceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  workspaceRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  workspaceRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  sidebarRowSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowContainer: {
    position: "relative",
  },
  workspaceStatusDot: {
    position: "relative",
    width: WORKSPACE_STATUS_DOT_WIDTH,
    height: 16,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOverlay: {
    position: "absolute",
    right: DEFAULT_STATUS_DOT_OFFSET,
    bottom: DEFAULT_STATUS_DOT_OFFSET,
    width: DEFAULT_STATUS_DOT_SIZE,
    height: DEFAULT_STATUS_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  workspaceArchivingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: `${theme.colors.surface0}cc`,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    zIndex: 1,
  },
  workspaceArchivingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  workspaceBranchText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "400",
    lineHeight: 20,
    opacity: 0.76,
    flex: 1,
    minWidth: 0,
  },
  workspaceBranchTextCreating: {
    opacity: 0.92,
  },
  workspaceBranchTextHovered: {
    opacity: 1,
  },
  workspacePrBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingLeft: WORKSPACE_STATUS_DOT_WIDTH + theme.spacing[2],
  },
  workspaceCreatingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
  },
  kebabButton: {
    padding: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  kebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  statusDotNeedsInput: {
    backgroundColor: theme.colors.palette.amber[500],
    borderColor: theme.colors.surface0,
  },
  statusDotFailed: {
    backgroundColor: theme.colors.palette.red[500],
    borderColor: theme.colors.surface0,
  },
  statusDotRunning: {
    backgroundColor: theme.colors.palette.blue[500],
    borderColor: theme.colors.surface0,
  },
  statusDotAttention: {
    backgroundColor: theme.colors.palette.green[500],
    borderColor: theme.colors.surface0,
  },
}));

function getStatusDotColorStyle(bucket: SidebarStateBucket): ViewStyle | null {
  switch (bucket) {
    case "needs_input":
      return styles.statusDotNeedsInput;
    case "failed":
      return styles.statusDotFailed;
    case "running":
      return styles.statusDotRunning;
    case "attention":
      return styles.statusDotAttention;
    case "done":
      return null;
  }
}
