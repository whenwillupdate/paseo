import { router, usePathname } from "expo-router";
import { Archive, FolderPlus, Home, Plus, Search, Settings } from "lucide-react-native";
import {
  type Dispatch,
  memo,
  type ReactElement,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet as RNStyleSheet,
  Text,
  useWindowDimensions,
  View,
  type PressableStateCallbackType,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { SidebarGroupingSelector } from "@/components/sidebar/sidebar-grouping-selector";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { Shortcut } from "@/components/ui/shortcut";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import {
  MOBILE_VISUAL_PANEL_AGENT,
  MOBILE_VISUAL_PANEL_AGENT_LIST,
  useSidebarAnimation,
} from "@/contexts/sidebar-animation-context";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import { useAllAgentsList } from "@/hooks/use-all-agents-list";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useSidebarShortcutModel } from "@/hooks/use-sidebar-shortcut-model";
import {
  type SidebarProjectEntry,
  useSidebarWorkspacesList,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarViewStore, type SidebarGroupMode } from "@/stores/sidebar-view-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useHostMutations, useHostRuntimeSnapshot, useHosts } from "@/runtime/host-runtime";
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  selectIsAgentListOpen,
  usePanelStore,
} from "@/stores/panel-store";
import { resolveActiveHost } from "@/utils/active-host";
import { formatConnectionStatus } from "@/utils/daemons";
import { useWindowControlsPadding } from "@/utils/desktop-window";
import {
  buildHostOpenProjectRoute,
  buildHostNewWorkspaceRoute,
  buildSettingsRoute,
  mapPathnameToServer,
} from "@/utils/host-routes";
import { SidebarAgentListSkeleton } from "./sidebar-agent-list-skeleton";
import { SidebarCalloutSlot } from "./sidebar-callout-slot";
import { SidebarWorkspaceList } from "./sidebar-workspace-list";
import { DraggableList, type DraggableRenderItemInfo } from "./draggable-list";

const MIN_CHAT_WIDTH = 400;

type SidebarShortcutModel = ReturnType<typeof useSidebarShortcutModel>;
type SidebarTheme = ReturnType<typeof useUnistyles>["theme"];

interface LeftSidebarProps {
  selectedAgentId?: string;
}

interface SidebarSharedProps {
  theme: SidebarTheme;
  activeServerId: string | null;
  activeHostLabel: string;
  activeHostStatusColor: string;
  hostOptions: ComboboxOption[];
  hostTriggerRef: RefObject<View | null>;
  isHostPickerOpen: boolean;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  projects: SidebarProjectEntry[];
  isInitialLoad: boolean;
  isRevalidating: boolean;
  isManualRefresh: boolean;
  groupMode: SidebarGroupMode;
  collapsedProjectKeys: SidebarShortcutModel["collapsedProjectKeys"];
  shortcutIndexByWorkspaceKey: SidebarShortcutModel["shortcutIndexByWorkspaceKey"];
  toggleProjectCollapsed: SidebarShortcutModel["toggleProjectCollapsed"];
  handleRefresh: () => void;
  handleHostSelect: (nextServerId: string) => void;
  handleOpenProject: () => void;
  handleHome: () => void;
  handleSettings: () => void;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  agents: ReturnType<typeof useAllAgentsList>["agents"];
  renderHostOption: (input: {
    option: ComboboxOption;
    selected: boolean;
    active: boolean;
    onPress: () => void;
  }) => ReactElement;
}

interface MobileSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  insetsBottom: number;
  isOpen: boolean;
  closeToAgent: () => void;
}

interface DesktopSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  isOpen: boolean;
}

export const LeftSidebar = memo(function LeftSidebar({
  selectedAgentId: _selectedAgentId,
}: LeftSidebarProps) {
  void _selectedAgentId;

  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const isCompactLayout = useIsCompactFormFactor();
  const isOpen = usePanelStore((state) =>
    selectIsAgentListOpen(state, { isCompact: isCompactLayout }),
  );
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);
  const pathname = usePathname();
  const daemons = useHosts();
  const activeDaemon = useMemo(
    () => resolveActiveHost({ hosts: daemons, pathname }),
    [daemons, pathname],
  );
  const activeServerId = activeDaemon?.serverId ?? null;
  const activeHostLabel = useMemo(() => {
    if (!activeDaemon) return "No host";
    const trimmed = activeDaemon.label?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : activeDaemon.serverId;
  }, [activeDaemon]);
  const activeHostSnapshot = useHostRuntimeSnapshot(activeServerId ?? "");
  const activeHostStatus = activeServerId
    ? (activeHostSnapshot?.connectionStatus ?? "connecting")
    : "idle";
  let activeHostStatusColor: string;
  if (activeHostStatus === "online") activeHostStatusColor = theme.colors.palette.green[400];
  else if (activeHostStatus === "connecting")
    activeHostStatusColor = theme.colors.palette.amber[500];
  else activeHostStatusColor = theme.colors.palette.red[500];
  const hostOptions = useMemo(
    () =>
      daemons.map((daemon) => ({
        id: daemon.serverId,
        label: daemon.label?.trim() || daemon.serverId,
      })),
    [daemons],
  );
  const renderHostOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => (
      <HostSwitchOption
        serverId={option.id}
        label={option.label}
        selected={selected}
        active={active}
        onPress={onPress}
      />
    ),
    [],
  );
  const hostTriggerRef = useRef<View | null>(null);
  const [isHostPickerOpen, setIsHostPickerOpen] = useState(false);

  const { projects, isInitialLoad, isRevalidating, refreshAll } = useSidebarWorkspacesList({
    serverId: activeServerId,
    enabled: isCompactLayout || isOpen,
  });
  const { collapsedProjectKeys, shortcutIndexByWorkspaceKey, toggleProjectCollapsed } =
    useSidebarShortcutModel({ serverId: activeServerId, projects, isInitialLoad });

  const groupMode = useSidebarViewStore((state) =>
    activeServerId ? state.getGroupMode(activeServerId) : "project",
  );
  const showArchived = useSidebarViewStore((state) =>
    activeServerId ? state.getShowArchived(activeServerId) : false,
  );
  const setSidebarShowArchived = useSidebarViewStore((state) => state.setShowArchived);
  const { agents, refreshAll: refreshAgents } = useAllAgentsList({
    serverId: activeServerId,
    includeArchived: showArchived,
  });
  const setShowArchived = useCallback(
    (value: boolean) => {
      if (!activeServerId) return;
      setSidebarShowArchived(activeServerId, value);
    },
    [activeServerId, setSidebarShowArchived],
  );

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
    refreshAgents();
  }, [refreshAgents, refreshAll]);

  useEffect(() => {
    if (showArchived) {
      refreshAgents();
    }
  }, [refreshAgents, showArchived]);

  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const openProjectPicker = useOpenProjectPicker(activeServerId);

  const handleOpenProjectMobile = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleOpenProjectDesktop = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleSettingsMobile = useCallback(() => {
    if (!activeServerId) {
      router.push(buildSettingsRoute());
      return;
    }
    router.push({
      pathname: buildSettingsRoute(),
      params: { returnTo: buildHostOpenProjectRoute(activeServerId) },
    });
  }, [activeServerId]);

  const handleSettingsDesktop = useCallback(() => {
    router.push(buildSettingsRoute());
  }, []);

  const handleHomeMobile = useCallback(() => {
    if (!activeServerId) return;
    showMobileAgent();
    router.push(buildHostOpenProjectRoute(activeServerId));
  }, [activeServerId, showMobileAgent]);

  const handleHomeDesktop = useCallback(() => {
    if (!activeServerId) return;
    router.push(buildHostOpenProjectRoute(activeServerId));
  }, [activeServerId]);

  const handleHostSelect = useCallback(
    (nextServerId: string) => {
      if (!nextServerId) {
        return;
      }
      const nextPath = mapPathnameToServer(pathname, nextServerId);
      setIsHostPickerOpen(false);
      router.push(nextPath);
    },
    [pathname],
  );

  const sharedProps = {
    theme,
    activeServerId,
    activeHostLabel,
    activeHostStatusColor,
    hostOptions,
    hostTriggerRef,
    isHostPickerOpen,
    setIsHostPickerOpen,
    projects,
    isInitialLoad,
    isRevalidating,
    isManualRefresh,
    groupMode,
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey,
    toggleProjectCollapsed,
    handleRefresh,
    handleHostSelect,
    showArchived,
    setShowArchived,
    agents,
    renderHostOption,
  };

  if (isCompactLayout) {
    return (
      <MobileSidebar
        {...sharedProps}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        isOpen={isOpen}
        closeToAgent={showMobileAgent}
        handleOpenProject={handleOpenProjectMobile}
        handleHome={handleHomeMobile}
        handleSettings={handleSettingsMobile}
      />
    );
  }

  return (
    <DesktopSidebar
      {...sharedProps}
      insetsTop={insets.top}
      isOpen={isOpen}
      handleOpenProject={handleOpenProjectDesktop}
      handleHome={handleHomeDesktop}
      handleSettings={handleSettingsDesktop}
    />
  );
});

interface HostPickerTriggerProps {
  triggerRef: React.Ref<View>;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  hostOptionsEmpty: boolean;
  hostStatusDotStyle: StyleProp<ViewStyle>;
  activeHostLabel: string;
}

function HostPickerTrigger({
  triggerRef,
  setIsHostPickerOpen,
  hostOptionsEmpty,
  hostStatusDotStyle,
  activeHostLabel,
}: HostPickerTriggerProps) {
  const pressableStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.hostTrigger,
      hovered && styles.hostTriggerHovered,
    ],
    [],
  );
  const handlePress = useCallback(() => setIsHostPickerOpen(true), [setIsHostPickerOpen]);
  return (
    <Pressable
      ref={triggerRef}
      style={pressableStyle}
      onPress={handlePress}
      disabled={hostOptionsEmpty}
    >
      <View style={hostStatusDotStyle} />
      <Text style={styles.hostTriggerText} numberOfLines={1}>
        {activeHostLabel}
      </Text>
    </Pressable>
  );
}

function HostSwitchOption({
  serverId,
  label,
  selected,
  active,
  onPress,
}: {
  serverId: string;
  label: string;
  selected: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const snapshot = useHostRuntimeSnapshot(serverId);
  const connectionStatus = snapshot?.connectionStatus ?? "connecting";

  return (
    <ComboboxItem
      label={label}
      description={formatConnectionStatus(connectionStatus)}
      selected={selected}
      active={active}
      onPress={onPress}
    />
  );
}

function getHostStatusColor(theme: SidebarTheme, status: string): string {
  if (status === "online") return theme.colors.palette.green[400];
  if (status === "connecting") return theme.colors.palette.amber[500];
  return theme.colors.palette.red[500];
}

function FooterIconButton({
  onPress,
  testID,
  accessibilityLabel,
  icon: Icon,
  theme,
  size = "sm",
}: {
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
  icon: typeof FolderPlus;
  theme: SidebarTheme;
  size?: "sm" | "ios";
}) {
  const buttonStyle = useMemo(
    () => [styles.footerIconButton, size === "ios" && styles.footerIconButtonIos],
    [size],
  );
  return (
    <Pressable
      style={buttonStyle}
      testID={testID}
      nativeID={testID}
      collapsable={false}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
    >
      {({ hovered }) => (
        <Icon
          size={size === "ios" ? theme.iconSize.lg : theme.iconSize.md}
          color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
        />
      )}
    </Pressable>
  );
}

function SidebarArchiveToggleRow({
  showArchived,
  setShowArchived,
  compact = false,
}: {
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <SidebarArchiveCompactSwitch showArchived={showArchived} setShowArchived={setShowArchived} />
    );
  }

  return (
    <SidebarArchiveToggleButton showArchived={showArchived} setShowArchived={setShowArchived} />
  );
}

function SidebarArchiveCompactSwitch({
  showArchived,
  setShowArchived,
}: {
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
}) {
  return (
    <View style={styles.archiveToggleCapsuleContainer}>
      <Switch
        value={showArchived}
        onValueChange={setShowArchived}
        accessibilityLabel="Show archived sessions"
        accessibilityHint="Toggles archived sessions in the project list."
        testID="sidebar-show-archived"
        size="ios"
        style={styles.archiveToggleCompactSwitch}
      />
    </View>
  );
}

function SidebarArchiveToggleButton({
  showArchived,
  setShowArchived,
}: {
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
}) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => {
    setShowArchived(!showArchived);
  }, [setShowArchived, showArchived]);
  const buttonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.archiveToggleButton,
      (hovered || pressed || showArchived) && styles.archiveToggleButtonActive,
    ],
    [showArchived],
  );
  const accessibilityState = useMemo(() => ({ checked: showArchived }), [showArchived]);
  const labelStyle = useMemo(
    () => [styles.archiveToggleLabel, showArchived && styles.archiveToggleLabelActive],
    [showArchived],
  );
  return (
    <View style={styles.archiveToggleContainer}>
      <Pressable
        onPress={handlePress}
        testID="sidebar-show-archived"
        nativeID="sidebar-show-archived"
        accessible
        accessibilityRole="switch"
        accessibilityState={accessibilityState}
        accessibilityLabel="Show archived sessions"
        style={buttonStyle}
      >
        <View style={styles.archiveToggleLeft}>
          <Archive
            size={theme.iconSize.md}
            color={showArchived ? theme.colors.foreground : theme.colors.foregroundMuted}
          />
          <Text style={labelStyle} numberOfLines={1}>
            Show archived
          </Text>
        </View>
        <Switch
          value={showArchived}
          onValueChange={setShowArchived}
          accessibilityLabel="Show archived sessions"
          testID="sidebar-show-archived-switch"
        />
      </Pressable>
    </View>
  );
}

function AddProjectTooltipContent({
  newAgentKeys,
}: {
  newAgentKeys: ReturnType<typeof useShortcutKeys>;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>Add project</Text>
      {newAgentKeys ? <Shortcut chord={newAgentKeys} /> : null}
    </View>
  );
}

function HeaderIconTooltipContent({
  label,
  shortcutKeys,
}: {
  label: string;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
    </View>
  );
}

function MobileSidebarTopBar({
  theme,
  showArchived,
  setShowArchived,
  handleOpenProject,
  handleSettings,
}: {
  theme: SidebarTheme;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  handleOpenProject: () => void;
  handleSettings: () => void;
}) {
  return (
    <View style={styles.mobileTopBar}>
      <View style={styles.mobileTopLeadingActions}>
        <FooterIconButton
          onPress={handleSettings}
          testID="sidebar-settings"
          accessibilityLabel="Settings"
          icon={Settings}
          theme={theme}
          size="ios"
        />
        <SidebarArchiveToggleRow
          showArchived={showArchived}
          setShowArchived={setShowArchived}
          compact
        />
      </View>
      <View style={styles.mobileTopActions}>
        <FooterIconButton
          onPress={handleOpenProject}
          testID="sidebar-add-project"
          accessibilityLabel="Add project"
          icon={FolderPlus}
          theme={theme}
          size="ios"
        />
      </View>
    </View>
  );
}

function MobileHostStrip({
  activeServerId,
  hostOptions,
  handleHostSelect,
}: {
  activeServerId: string | null;
  hostOptions: ComboboxOption[];
  handleHostSelect: (nextServerId: string) => void;
}) {
  const { reorderHosts } = useHostMutations();
  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);
  const hostKeyExtractor = useCallback((host: ComboboxOption) => host.id, []);
  const disabledPillStyle = useMemo(
    () => [styles.mobileHostPill, styles.mobileHostPillDisabled],
    [],
  );
  const handleDragEnd = useCallback(
    (nextHosts: ComboboxOption[]) => {
      void reorderHosts(nextHosts.map((host) => host.id));
    },
    [reorderHosts],
  );
  const renderHostPill = useCallback(
    ({ item: host, drag, isActive }: DraggableRenderItemInfo<ComboboxOption>) => (
      <MobileHostPill
        serverId={host.id}
        label={host.label}
        selected={host.id === activeServerId}
        dragging={isActive}
        onSelect={handleHostSelect}
        onLongPress={drag}
      />
    ),
    [activeServerId, handleHostSelect],
  );

  if (hostOptions.length === 0) {
    return (
      <View style={styles.mobileHostStrip}>
        <View style={styles.mobileHostScrollContent}>
          <View style={disabledPillStyle}>
            <View style={styles.mobileHostStatusDotDisabled} />
            <Text style={styles.mobileHostPillText} numberOfLines={1}>
              No host
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mobileHostStrip} onTouchStart={handleTouchStart}>
      <DraggableList
        data={hostOptions}
        keyExtractor={hostKeyExtractor}
        renderItem={renderHostPill}
        onDragEnd={handleDragEnd}
        horizontal
        showsHorizontalScrollIndicator
        showsVerticalScrollIndicator={false}
        containerStyle={styles.mobileHostListContainer}
        style={styles.mobileHostList}
        contentContainerStyle={styles.mobileHostScrollContent}
      />
    </View>
  );
}

function MobileHostPill({
  serverId,
  label,
  selected,
  dragging = false,
  onSelect,
  onLongPress,
}: {
  serverId: string;
  label: string;
  selected: boolean;
  dragging?: boolean;
  onSelect: (serverId: string) => void;
  onLongPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const snapshot = useHostRuntimeSnapshot(serverId);
  const connectionStatus = snapshot?.connectionStatus ?? "connecting";
  const statusDotStyle = useMemo(
    () => [
      styles.mobileHostStatusDot,
      { backgroundColor: getHostStatusColor(theme, connectionStatus) },
    ],
    [connectionStatus, theme],
  );
  const pillStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.mobileHostPill,
      selected && styles.mobileHostPillSelected,
      dragging && styles.mobileHostPillDragging,
      pressed && styles.mobileHostPillPressed,
    ],
    [dragging, selected],
  );
  const textStyle = useMemo(
    () => [styles.mobileHostPillText, selected && styles.mobileHostPillTextSelected],
    [selected],
  );
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => onSelect(serverId), [onSelect, serverId]);

  return (
    <Pressable
      style={pillStyle}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={250}
      accessibilityRole="button"
      accessibilityLabel={`Switch host to ${label}`}
      accessibilityState={accessibilityState}
      testID={`sidebar-host-pill-${serverId}`}
    >
      <View style={statusDotStyle} />
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SidebarFooter({
  theme,
  activeServerId,
  activeHostLabel,
  hostStatusDotStyle,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  handleHostSelect,
  renderHostOption,
  handleOpenProject,
  handleHome,
  handleSettings,
}: {
  theme: SidebarTheme;
  activeServerId: string | null;
  activeHostLabel: string;
  hostStatusDotStyle: StyleProp<ViewStyle>;
  hostOptions: ComboboxOption[];
  hostTriggerRef: RefObject<View | null>;
  isHostPickerOpen: boolean;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  handleHostSelect: (nextServerId: string) => void;
  renderHostOption: SidebarSharedProps["renderHostOption"];
  handleOpenProject: () => void;
  handleHome: () => void;
  handleSettings: () => void;
}) {
  const newAgentKeys = useShortcutKeys("new-agent");
  return (
    <View style={styles.sidebarFooter}>
      <View style={styles.footerHostSlot}>
        <HostPickerTrigger
          triggerRef={hostTriggerRef}
          setIsHostPickerOpen={setIsHostPickerOpen}
          hostOptionsEmpty={hostOptions.length === 0}
          hostStatusDotStyle={hostStatusDotStyle}
          activeHostLabel={activeHostLabel}
        />
      </View>
      <View style={styles.footerIconRow}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <FooterIconButton
              onPress={handleOpenProject}
              testID="sidebar-add-project"
              accessibilityLabel="Add project"
              icon={FolderPlus}
              theme={theme}
            />
          </TooltipTrigger>
          <TooltipContent side="top" align="center" offset={8}>
            <AddProjectTooltipContent newAgentKeys={newAgentKeys} />
          </TooltipContent>
        </Tooltip>
        <FooterIconButton
          onPress={handleHome}
          testID="sidebar-home"
          accessibilityLabel="Home"
          icon={Home}
          theme={theme}
        />
        <FooterIconButton
          onPress={handleSettings}
          testID="sidebar-settings"
          accessibilityLabel="Settings"
          icon={Settings}
          theme={theme}
        />
      </View>
      <Combobox
        options={hostOptions}
        value={activeServerId ?? ""}
        onSelect={handleHostSelect}
        renderOption={renderHostOption}
        searchable={false}
        title="Switch host"
        searchPlaceholder="Search hosts..."
        desktopMinWidth={280}
        open={isHostPickerOpen}
        onOpenChange={setIsHostPickerOpen}
        anchorRef={hostTriggerRef}
      />
    </View>
  );
}

function MobileSidebar({
  theme,
  activeServerId,
  hostOptions,
  projects,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleHostSelect,
  handleOpenProject,
  handleSettings,
  showArchived,
  setShowArchived,
  agents,
  insetsTop,
  insetsBottom,
  isOpen,
  closeToAgent,
}: MobileSidebarProps) {
  const {
    translateX,
    backdropOpacity,
    windowWidth,
    animateToOpen,
    animateToClose,
    isGesturing,
    mobileVisualPanel,
    gestureAnimatingRef,
    closeGestureRef,
  } = useSidebarAnimation();
  const closeTouchStartX = useSharedValue(0);
  const closeTouchStartY = useSharedValue(0);

  const handleCloseFromGesture = useCallback(() => {
    gestureAnimatingRef.current = true;
    closeToAgent();
  }, [closeToAgent, gestureAnimatingRef]);

  const handleWorkspacePress = useCallback(() => {
    closeToAgent();
  }, [closeToAgent]);

  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .withRef(closeGestureRef)
        .enabled(true)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (!touch) {
            return;
          }
          closeTouchStartX.value = touch.absoluteX;
          closeTouchStartY.value = touch.absoluteY;
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }

          const deltaX = touch.absoluteX - closeTouchStartX.value;
          const deltaY = touch.absoluteY - closeTouchStartY.value;
          const absDeltaX = Math.abs(deltaX);
          const absDeltaY = Math.abs(deltaY);

          if (mobileVisualPanel.value !== MOBILE_VISUAL_PANEL_AGENT_LIST) {
            stateManager.fail();
            return;
          }

          if (deltaX >= 10) {
            stateManager.fail();
            return;
          }
          if (absDeltaY > 10 && absDeltaY > absDeltaX) {
            stateManager.fail();
            return;
          }
          if (deltaX <= -15 && absDeltaX > absDeltaY) {
            stateManager.activate();
          }
        })
        .onStart(() => {
          isGesturing.value = true;
        })
        .onUpdate((event) => {
          const newTranslateX = Math.min(0, Math.max(-windowWidth, event.translationX));
          translateX.value = newTranslateX;
          backdropOpacity.value = interpolate(
            newTranslateX,
            [-windowWidth, 0],
            [0, 1],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((event) => {
          isGesturing.value = false;
          const shouldClose = event.translationX < -windowWidth / 3 || event.velocityX < -500;
          if (shouldClose) {
            mobileVisualPanel.value = MOBILE_VISUAL_PANEL_AGENT;
            animateToClose();
            runOnJS(handleCloseFromGesture)();
          } else {
            mobileVisualPanel.value = MOBILE_VISUAL_PANEL_AGENT_LIST;
            animateToOpen();
          }
        })
        .onFinalize(() => {
          isGesturing.value = false;
        }),
    [
      closeGestureRef,
      closeTouchStartX,
      closeTouchStartY,
      isGesturing,
      mobileVisualPanel,
      windowWidth,
      translateX,
      backdropOpacity,
      animateToClose,
      animateToOpen,
      handleCloseFromGesture,
    ],
  );

  const mobileSidebarInsetStyle = useMemo(
    () => ({ width: windowWidth, paddingTop: insetsTop, paddingBottom: insetsBottom }),
    [windowWidth, insetsTop, insetsBottom],
  );

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0.01 ? "auto" : "none",
  }));

  let overlayPointerEvents: "auto" | "none" | "box-none";
  if (!isWeb) overlayPointerEvents = "box-none";
  else if (isOpen) overlayPointerEvents = "auto";
  else overlayPointerEvents = "none";

  const backdropStyle = useMemo(
    () => [staticStyles.backdrop, backdropAnimatedStyle],
    [backdropAnimatedStyle],
  );
  const mobileSidebarStyle = useMemo(
    () => [
      staticStyles.mobileSidebar,
      mobileSidebarInsetStyle,
      sidebarAnimatedStyle,
      { backgroundColor: theme.colors.surfaceSidebar },
    ],
    [mobileSidebarInsetStyle, sidebarAnimatedStyle, theme.colors.surfaceSidebar],
  );

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents={overlayPointerEvents}>
      <Animated.View style={backdropStyle} />

      <GestureDetector gesture={closeGesture} touchAction="pan-y">
        <Animated.View style={mobileSidebarStyle} pointerEvents="auto">
          <View style={styles.sidebarContent} pointerEvents="auto">
            <MobileSidebarTopBar
              theme={theme}
              showArchived={showArchived}
              setShowArchived={setShowArchived}
              handleOpenProject={handleOpenProject}
              handleSettings={handleSettings}
            />
            <MobileHostStrip
              activeServerId={activeServerId}
              hostOptions={hostOptions}
              handleHostSelect={handleHostSelect}
            />
            <WorkspacesSectionHeader
              serverId={activeServerId}
              showNewWorkspaceAction={false}
              showSearchAction={false}
            />

            {isInitialLoad ? (
              <SidebarAgentListSkeleton />
            ) : (
              <SidebarWorkspaceList
                serverId={activeServerId}
                collapsedProjectKeys={collapsedProjectKeys}
                onToggleProjectCollapsed={toggleProjectCollapsed}
                shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
                groupMode={groupMode}
                projects={projects}
                agents={agents}
                isRefreshing={isManualRefresh && isRevalidating}
                onRefresh={handleRefresh}
                onWorkspacePress={handleWorkspacePress}
                onAddProject={handleOpenProject}
                parentGestureRef={closeGestureRef}
                showArchived={showArchived}
              />
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function DesktopSidebar({
  theme,
  activeServerId,
  activeHostLabel,
  activeHostStatusColor,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  projects,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleHostSelect,
  renderHostOption,
  handleOpenProject,
  handleHome,
  handleSettings,
  showArchived,
  setShowArchived,
  agents,
  insetsTop,
  isOpen,
}: DesktopSidebarProps) {
  const padding = useWindowControlsPadding("sidebar");
  const sidebarWidth = usePanelStore((state) => state.sidebarWidth);
  const setSidebarWidth = usePanelStore((state) => state.setSidebarWidth);
  const { width: viewportWidth } = useWindowDimensions();
  const hostStatusDotStyle = useMemo(
    () => [styles.hostStatusDot, { backgroundColor: activeHostStatusColor }],
    [activeHostStatusColor],
  );

  const startWidthRef = useRef(sidebarWidth);
  const resizeWidth = useSharedValue(sidebarWidth);

  useEffect(() => {
    resizeWidth.value = sidebarWidth;
  }, [sidebarWidth, resizeWidth]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 8, right: 8, top: 0, bottom: 0 })
        .onStart(() => {
          startWidthRef.current = sidebarWidth;
          resizeWidth.value = sidebarWidth;
        })
        .onUpdate((event) => {
          // Dragging right (positive translationX) increases width
          const newWidth = startWidthRef.current + event.translationX;
          const maxWidth = Math.max(
            MIN_SIDEBAR_WIDTH,
            Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - MIN_CHAT_WIDTH),
          );
          const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, newWidth));
          resizeWidth.value = clampedWidth;
        })
        .onEnd(() => {
          runOnJS(setSidebarWidth)(resizeWidth.value);
        }),
    [sidebarWidth, resizeWidth, setSidebarWidth, viewportWidth],
  );

  const resizeAnimatedStyle = useAnimatedStyle(() => ({
    width: resizeWidth.value,
  }));

  const paddingTopSpacerStyle = useMemo(() => ({ height: padding.top }), [padding.top]);
  const desktopSidebarStyle = useMemo(
    () => [staticStyles.desktopSidebar, resizeAnimatedStyle],
    [resizeAnimatedStyle],
  );
  const desktopSidebarBorderStyle = useMemo(
    () => [styles.desktopSidebarBorder, { flex: 1, paddingTop: insetsTop }],
    [insetsTop],
  );
  const resizeHandleStyle = useMemo(
    () => [styles.resizeHandle, isWeb && ({ cursor: "col-resize" } as object)],
    [],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Animated.View style={desktopSidebarStyle}>
      <View style={desktopSidebarBorderStyle}>
        <View style={styles.sidebarDragArea}>
          <TitlebarDragRegion />
          {padding.top > 0 ? <View style={paddingTopSpacerStyle} /> : null}
          <View style={styles.sidebarHeaderRow}>
            <SidebarArchiveToggleRow
              showArchived={showArchived}
              setShowArchived={setShowArchived}
            />
          </View>
        </View>
        <WorkspacesSectionHeader serverId={activeServerId} />

        {isInitialLoad ? (
          <SidebarAgentListSkeleton />
        ) : (
          <SidebarWorkspaceList
            serverId={activeServerId}
            collapsedProjectKeys={collapsedProjectKeys}
            onToggleProjectCollapsed={toggleProjectCollapsed}
            shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
            groupMode={groupMode}
            projects={projects}
            agents={agents}
            isRefreshing={isManualRefresh && isRevalidating}
            onRefresh={handleRefresh}
            onAddProject={handleOpenProject}
          />
        )}

        <SidebarCalloutSlot />

        <SidebarFooter
          theme={theme}
          activeServerId={activeServerId}
          activeHostLabel={activeHostLabel}
          hostStatusDotStyle={hostStatusDotStyle}
          hostOptions={hostOptions}
          hostTriggerRef={hostTriggerRef}
          isHostPickerOpen={isHostPickerOpen}
          setIsHostPickerOpen={setIsHostPickerOpen}
          handleHostSelect={handleHostSelect}
          renderHostOption={renderHostOption}
          handleOpenProject={handleOpenProject}
          handleHome={handleHome}
          handleSettings={handleSettings}
        />

        {/* Resize handle - absolutely positioned over right border */}
        <GestureDetector gesture={resizeGesture}>
          <View style={resizeHandleStyle} />
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

function WorkspacesSectionHeader({
  serverId,
  showNewWorkspaceAction = true,
  showSearchAction = true,
}: {
  serverId: string | null;
  showNewWorkspaceAction?: boolean;
  showSearchAction?: boolean;
}) {
  const { theme } = useUnistyles();
  const isMobileBreakpoint = useIsCompactFormFactor();
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const commandCenterKeys = useShortcutKeys("toggle-command-center");
  const handleSearchPress = useCallback(() => setCommandCenterOpen(true), [setCommandCenterOpen]);
  const handleNewWorkspacePress = useCallback(() => {
    if (!serverId) {
      return;
    }
    router.push(buildHostNewWorkspaceRoute(serverId));
  }, [serverId]);
  const searchButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.workspacesHeaderIconButton,
      isMobileBreakpoint && styles.workspacesHeaderIconButtonMobile,
      (hovered || pressed) && styles.workspacesHeaderIconButtonHovered,
    ],
    [isMobileBreakpoint],
  );
  const headerIconSize = isMobileBreakpoint ? 18 : 14;

  return (
    <View style={styles.workspacesSectionHeader}>
      <Text style={styles.workspacesSectionTitle}>Projects</Text>
      <View style={styles.workspacesSectionActions}>
        {showNewWorkspaceAction ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New workspace"
                testID="sidebar-new-workspace"
                style={searchButtonStyle}
                onPress={handleNewWorkspacePress}
              >
                {({ hovered, pressed }) => (
                  <Plus
                    size={headerIconSize}
                    color={
                      hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                    }
                  />
                )}
              </Pressable>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" offset={8}>
              <HeaderIconTooltipContent label="New workspace" />
            </TooltipContent>
          </Tooltip>
        ) : null}
        {showSearchAction ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open command center"
                testID="sidebar-command-center-search"
                style={searchButtonStyle}
                onPress={handleSearchPress}
              >
                {({ hovered, pressed }) => (
                  <Search
                    size={headerIconSize}
                    color={
                      hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                    }
                  />
                )}
              </Pressable>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" offset={8}>
              <HeaderIconTooltipContent label="Search" shortcutKeys={commandCenterKeys} />
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <View>
              <SidebarGroupingSelector serverId={serverId} />
            </View>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <HeaderIconTooltipContent label="Display preferences" />
          </TooltipContent>
        </Tooltip>
      </View>
    </View>
  );
}

// Static styles for Animated.Views — must NOT use Unistyles dynamic theme to
// avoid the "Unable to find node on an unmounted component" crash when Unistyles
// tries to patch the native node that Reanimated also manages.
const staticStyles = RNStyleSheet.create({
  backdrop: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  mobileSidebar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    overflow: "hidden" as const,
  },
  desktopSidebar: {
    position: "relative" as const,
  },
});

const styles = StyleSheet.create((theme) => ({
  sidebarHeaderRow: {
    position: "relative",
  },
  mobileTopBar: {
    minHeight: 56,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[1],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  mobileTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  mobileTopLeadingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 1,
    minWidth: 0,
  },
  archiveToggleContainer: {
    height: 48,
    paddingHorizontal: theme.spacing[2],
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    userSelect: "none",
  },
  archiveToggleCapsuleContainer: {
    width: 59,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  archiveToggleCompactSwitch: {
    minWidth: 51,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
  },
  archiveToggleCapsule: {
    minWidth: 122,
    maxWidth: 132,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  archiveToggleCapsulePressed: {
    opacity: 0.82,
  },
  archiveToggleButtonActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  archiveToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  archiveToggleLeftCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 1,
    minWidth: 0,
  },
  archiveToggleLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  archiveToggleLabelCompact: {
    fontSize: theme.fontSize.sm,
  },
  archiveToggleLabelActive: {
    color: theme.colors.foreground,
  },
  archiveToggleSwitchTrack: {
    width: 46,
    height: 28,
    borderRadius: theme.borderRadius.full,
    padding: 2,
    justifyContent: "center",
    flexShrink: 0,
  },
  archiveToggleSwitchTrackOff: {
    backgroundColor: theme.colors.surface3,
  },
  archiveToggleSwitchTrackOn: {
    backgroundColor: theme.colors.palette.green[500],
  },
  archiveToggleSwitchThumb: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.palette.white,
    shadowColor: "rgba(0, 0, 0, 0.25)",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 1,
    elevation: 2,
  },
  archiveToggleSwitchThumbOn: {
    transform: [{ translateX: 18 }],
  },
  workspacesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingLeft: theme.spacing[2] + theme.spacing[3],
    paddingRight: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  workspacesSectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  workspacesSectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  workspacesHeaderIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  workspacesHeaderIconButtonMobile: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.lg,
  },
  workspacesHeaderIconButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  mobileHostStrip: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing[1],
  },
  mobileHostListContainer: {
    height: 48,
  },
  mobileHostList: {
    minHeight: 48,
  },
  mobileHostScrollContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
    gap: theme.spacing[2],
    alignItems: "center",
  },
  mobileHostPill: {
    maxWidth: 190,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  mobileHostPillSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  mobileHostPillPressed: {
    opacity: 0.82,
  },
  mobileHostPillDragging: {
    opacity: 0.9,
    transform: [{ scale: 1.02 }],
    zIndex: 5,
  },
  mobileHostPillDisabled: {
    opacity: theme.opacity[50],
  },
  mobileHostStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
  },
  mobileHostStatusDotDisabled: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    backgroundColor: theme.colors.foregroundMuted,
  },
  mobileHostPillText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  mobileHostPillTextSelected: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  sidebarContent: {
    flex: 1,
    minHeight: 0,
  },
  mobileCloseButton: {
    position: "absolute",
    top: theme.spacing[3],
    right: theme.spacing[4],
    zIndex: 2,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  desktopSidebarBorder: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  resizeHandle: {
    position: "absolute",
    right: -5,
    top: 0,
    bottom: 0,
    width: 10,
    zIndex: 10,
  },
  sidebarDragArea: {
    position: "relative",
  },
  hostTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[2],
    minWidth: 0,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  hostTriggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  hostStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  hostTriggerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerHostSlot: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    marginRight: theme.spacing[2],
  },
  footerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  footerIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  footerIconButtonIos: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
  },
  hostPickerList: {
    gap: theme.spacing[2],
  },
  hostPickerOption: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  hostPickerOptionText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  hostPickerCancel: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  hostPickerCancelText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
  },
}));
