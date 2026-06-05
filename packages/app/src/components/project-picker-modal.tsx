import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { ChevronRight, Folder, FolderOpen } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useQuery } from "@tanstack/react-query";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { shortenPath } from "@/utils/shorten-path";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useOpenProject } from "@/hooks/use-open-project";
import { buildWorkingDirectorySuggestions } from "@/utils/working-directory-suggestions";
import { isNative } from "@/constants/platform";
import { useActiveServerId } from "@/hooks/use-active-server-id";
import {
  buildPathBreadcrumbs,
  normalizeBrowserPath,
  parentBrowserPath,
  uniquedDirectoryPaths,
} from "@/utils/project-path-browser";

interface PathRowProps {
  path: string;
  label?: string;
  active: boolean;
  onSelect: (path: string) => void;
  variant?: "directory" | "open";
}

function lastPathSegment(path: string): string {
  const normalized = normalizeBrowserPath(path);
  if (normalized === "/" || normalized === "~") return normalized;
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function PathRow({ path, label, active, onSelect, variant = "directory" }: PathRowProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => {
    onSelect(path);
  }, [onSelect, path]);
  const pressableStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed || active) && {
        backgroundColor: theme.colors.surface1,
      },
    ],
    [active, theme.colors.surface1],
  );
  const rowTextStyle = useMemo(
    () => [styles.rowText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  return (
    <Pressable style={pressableStyle} onPress={handlePress}>
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          {variant === "open" ? (
            <FolderOpen size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
          ) : (
            <Folder size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
          )}
        </View>
        <Text style={rowTextStyle} numberOfLines={1}>
          {label ?? shortenPath(path)}
        </Text>
      </View>
    </Pressable>
  );
}

function BreadcrumbItem({
  path,
  label,
  isLast,
  onSelect,
}: {
  path: string;
  label: string;
  isLast: boolean;
  onSelect: (path: string) => void;
}) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => {
    onSelect(path);
  }, [onSelect, path]);
  const crumbStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.breadcrumb,
      (hovered || pressed) && styles.breadcrumbHovered,
    ],
    [],
  );
  const textStyle = useMemo(
    () => [
      styles.breadcrumbText,
      { color: isLast ? theme.colors.foreground : theme.colors.foregroundMuted },
    ],
    [isLast, theme.colors.foreground, theme.colors.foregroundMuted],
  );

  return (
    <View style={styles.breadcrumbItem}>
      <Pressable
        style={crumbStyle}
        onPress={handlePress}
        disabled={isLast}
        accessibilityRole="button"
        accessibilityLabel={`Go to ${label}`}
      >
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {!isLast ? <ChevronRight size={12} color={theme.colors.foregroundMuted} /> : null}
    </View>
  );
}

function Breadcrumbs({ path, onSelect }: { path: string; onSelect: (path: string) => void }) {
  const breadcrumbs = useMemo(() => buildPathBreadcrumbs(path), [path]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.breadcrumbsContent}
      style={styles.breadcrumbs}
    >
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <BreadcrumbItem
            key={crumb.path}
            path={crumb.path}
            label={crumb.label}
            isLast={isLast}
            onSelect={onSelect}
          />
        );
      })}
    </ScrollView>
  );
}

export function ProjectPickerModal() {
  const { theme } = useUnistyles();
  const serverId = useActiveServerId();

  const open = useKeyboardShortcutsStore((s) => s.projectPickerOpen);
  const setOpen = useKeyboardShortcutsStore((s) => s.setProjectPickerOpen);

  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const recommendedPaths = useRecommendedProjectPaths(serverId);

  const inputRef = useRef<TextInput>(null);
  const [currentDirectory, setCurrentDirectory] = useState("~");
  const [query, setQuery] = useState("~");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const openProject = useOpenProject(serverId);
  const normalizedQuery = useMemo(() => normalizeBrowserPath(query), [query]);
  const normalizedCurrentDirectory = useMemo(
    () => normalizeBrowserPath(currentDirectory),
    [currentDirectory],
  );
  const isBrowsingCurrentDirectory = normalizedQuery === normalizedCurrentDirectory;

  const directorySuggestionsQuery = useQuery({
    queryKey: [
      "project-picker-directory-suggestions",
      serverId,
      normalizedCurrentDirectory,
      normalizedQuery,
      isBrowsingCurrentDirectory,
    ],
    queryFn: async () => {
      if (!client) return [];
      const options =
        isBrowsingCurrentDirectory && normalizedCurrentDirectory !== "~"
          ? {
              cwd: normalizedCurrentDirectory,
              query: "",
              includeDirectories: true,
              includeFiles: false,
              limit: 100,
            }
          : {
              query: normalizedQuery === "~" ? "~" : query,
              includeDirectories: true,
              includeFiles: false,
              limit: 100,
            };
      const result = await client.getDirectorySuggestions({
        ...options,
      });
      const paths =
        result.entries?.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : [])) ?? [];
      return uniquedDirectoryPaths({
        cwd: normalizedCurrentDirectory,
        paths,
      });
    },
    enabled: Boolean(client) && isConnected && open,
    staleTime: 15_000,
    retry: false,
  });

  const options = useMemo(() => {
    if (isBrowsingCurrentDirectory) {
      return directorySuggestionsQuery.data ?? [];
    }

    const suggestedPaths = buildWorkingDirectorySuggestions({
      recommendedPaths,
      serverPaths: directorySuggestionsQuery.data ?? [],
      query,
    });
    const trimmedQuery = query.trim();
    if (!trimmedQuery || suggestedPaths.includes(trimmedQuery)) {
      return suggestedPaths;
    }
    return [trimmedQuery, ...suggestedPaths];
  }, [directorySuggestionsQuery.data, isBrowsingCurrentDirectory, query, recommendedPaths]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleSelectPath = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed || !client || !serverId) return;

      setIsSubmitting(true);
      try {
        const didOpenProject = await openProject(trimmed);
        if (didOpenProject) {
          setOpen(false);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, openProject, serverId, setOpen],
  );

  const handleSubmitCustom = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    void handleSelectPath(trimmed);
  }, [handleSelectPath, query]);

  const handleChangeQuery = useCallback((text: string) => {
    setQuery(text);
    setActiveIndex(0);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    const normalized = normalizeBrowserPath(path);
    setCurrentDirectory(normalized);
    setQuery(normalized);
    setActiveIndex(0);
  }, []);

  const handleParentDirectory = useCallback(() => {
    handleNavigate(parentBrowserPath(normalizedCurrentDirectory));
  }, [handleNavigate, normalizedCurrentDirectory]);

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setCurrentDirectory("~");
      setQuery("~");
      setActiveIndex(0);
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Clamp active index
  useEffect(() => {
    if (!open) return;
    const keyboardRowCount = options.length + (isBrowsingCurrentDirectory ? 1 : 0);
    if (activeIndex >= keyboardRowCount) {
      setActiveIndex(keyboardRowCount > 0 ? keyboardRowCount - 1 : 0);
    }
  }, [activeIndex, isBrowsingCurrentDirectory, options.length, open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || isNative) return;

    function handler(event: KeyboardEvent) {
      const key = event.key;
      if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Escape") return;

      if (key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        if (isBrowsingCurrentDirectory && activeIndex === 0) {
          void handleSelectPath(normalizedCurrentDirectory);
        } else if (isBrowsingCurrentDirectory && options.length > 0) {
          const selectedPath = options[activeIndex - 1];
          if (selectedPath) handleNavigate(selectedPath);
        } else if (options.length > 0 && activeIndex < options.length) {
          void handleSelectPath(options[activeIndex]);
        } else if (query.trim()) {
          handleSubmitCustom();
        }
        return;
      }

      if (key === "ArrowDown" || key === "ArrowUp") {
        const keyboardRowCount = options.length + (isBrowsingCurrentDirectory ? 1 : 0);
        if (keyboardRowCount === 0) return;
        event.preventDefault();
        setActiveIndex((current) => {
          const delta = key === "ArrowDown" ? 1 : -1;
          const next = current + delta;
          if (next < 0) return keyboardRowCount - 1;
          if (next >= keyboardRowCount) return 0;
          return next;
        });
      }
    }

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    activeIndex,
    handleNavigate,
    handleSelectPath,
    handleSubmitCustom,
    isBrowsingCurrentDirectory,
    normalizedCurrentDirectory,
    open,
    options,
    query,
    setOpen,
  ]);

  const panelStyle = useMemo(
    () => [
      styles.panel,
      {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
      },
    ],
    [theme.colors.border, theme.colors.surface0],
  );
  const headerStyle = useMemo(
    () => [styles.header, { borderBottomColor: theme.colors.border }],
    [theme.colors.border],
  );
  const inputStyle = useMemo(
    () => [styles.input, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const emptyTextStyle = useMemo(
    () => [styles.emptyText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const helperTextStyle = useMemo(
    () => [styles.helperText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );

  if (!serverId) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={panelStyle}>
          <View style={headerStyle}>
            <Breadcrumbs path={normalizedCurrentDirectory} onSelect={handleNavigate} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleChangeQuery}
              placeholder="Type or paste a directory path..."
              placeholderTextColor={theme.colors.foregroundMuted}
              style={inputStyle}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!isSubmitting}
              returnKeyType="go"
              onSubmitEditing={handleSubmitCustom}
            />
            <Text style={helperTextStyle} numberOfLines={1}>
              Browse from ~, pick a folder below, or paste a full path.
            </Text>
          </View>

          <ScrollView
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {isSubmitting ? <Text style={emptyTextStyle}>Opening project...</Text> : null}
            {!isSubmitting && isBrowsingCurrentDirectory ? (
              <PathRow
                path={normalizedCurrentDirectory}
                label={`Open ${normalizedCurrentDirectory}`}
                active={activeIndex === 0}
                onSelect={handleSelectPath}
                variant="open"
              />
            ) : null}
            {!isSubmitting && isBrowsingCurrentDirectory && normalizedCurrentDirectory !== "~" ? (
              <PathRow
                path={parentBrowserPath(normalizedCurrentDirectory)}
                label=".."
                active={false}
                onSelect={handleParentDirectory}
              />
            ) : null}
            {!isSubmitting && options.length === 0 && !query.trim() ? (
              <Text style={emptyTextStyle}>Start typing a path</Text>
            ) : null}
            {!isSubmitting && options.length === 0 && query.trim() ? (
              <Text style={emptyTextStyle}>No directories found</Text>
            ) : null}
            {!isSubmitting && options.length > 0 ? (
              <>
                {options.map((path, index) => (
                  <PathRow
                    key={path}
                    path={path}
                    label={isBrowsingCurrentDirectory ? lastPathSegment(path) : shortenPath(path)}
                    active={index + (isBrowsingCurrentDirectory ? 1 : 0) === activeIndex}
                    onSelect={isBrowsingCurrentDirectory ? handleNavigate : handleSelectPath}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: theme.spacing[12],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  panel: {
    width: 640,
    maxWidth: "92%",
    maxHeight: "80%",
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    ...theme.shadow.lg,
  },
  header: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    gap: theme.spacing[2],
  },
  breadcrumbs: {
    flexGrow: 0,
  },
  breadcrumbsContent: {
    alignItems: "center",
    gap: theme.spacing[1],
  },
  breadcrumbItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 180,
  },
  breadcrumb: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  breadcrumbHovered: {
    backgroundColor: theme.colors.surface1,
  },
  breadcrumbText: {
    fontSize: theme.fontSize.sm,
    fontWeight: "500",
  },
  input: {
    fontSize: theme.fontSize.lg,
    paddingVertical: theme.spacing[1],
    outlineStyle: "none",
  } as object,
  results: {
    flexGrow: 0,
  },
  resultsContent: {
    paddingVertical: theme.spacing[2],
  },
  row: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconSlot: {
    width: 16,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: 20,
    flexShrink: 1,
  },
  emptyText: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    fontSize: theme.fontSize.base,
  },
  helperText: {
    fontSize: theme.fontSize.xs,
  },
}));
