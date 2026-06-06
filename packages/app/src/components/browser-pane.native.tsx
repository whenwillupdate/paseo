import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { useBrowserStore, normalizeWorkspaceBrowserUrl } from "@/stores/browser-store";

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}

export function BrowserPane({
  browserId,
  serverId: _serverId,
  workspaceId: _workspaceId,
  cwd: _cwd,
  isInteractive: _isInteractive,
  onFocusPane: _onFocusPane,
}: BrowserPaneProps) {
  void _serverId;
  void _workspaceId;
  void _cwd;
  void _isInteractive;
  void _onFocusPane;

  const { theme } = useUnistyles();
  const browser = useBrowserStore((state) => state.browsersById[browserId] ?? null);
  const updateBrowser = useBrowserStore((state) => state.updateBrowser);
  const webviewRef = useRef<WebView>(null);
  const [draftUrl, setDraftUrl] = useState(browser?.url ?? "https://example.com");

  // Keep draftUrl in sync with browser URL changes from outside
  useEffect(() => {
    const nextUrl = browser?.url ?? "https://example.com";
    setDraftUrl((current) => (current === nextUrl ? current : nextUrl));
  }, [browser?.url]);

  // Navigation callbacks
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      updateBrowser(browserId, {
        url: normalizeWorkspaceBrowserUrl(navState.url),
        canGoBack: navState.canGoBack,
        canGoForward: navState.canGoForward,
        title: navState.title,
      });
    },
    [browserId, updateBrowser],
  );

  const handleLoadStart = useCallback(() => {
    updateBrowser(browserId, { isLoading: true, lastError: null });
  }, [browserId, updateBrowser]);

  const handleLoadEnd = useCallback(() => {
    updateBrowser(browserId, { isLoading: false });
  }, [browserId, updateBrowser]);

  const handleError = useCallback(
    (
      syntheticEvent: NativeSyntheticEvent<{
        domain?: unknown;
        code: number;
        description: string;
        url: string;
      }>,
    ) => {
      const { description, url } = syntheticEvent.nativeEvent;
      updateBrowser(browserId, {
        isLoading: false,
        lastError: `${description}: ${url}`,
      });
    },
    [browserId, updateBrowser],
  );

  // Navigation actions
  const goBack = useCallback(() => {
    webviewRef.current?.goBack();
  }, []);

  const goForward = useCallback(() => {
    webviewRef.current?.goForward();
  }, []);

  const reloadOrStop = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    if (browser?.isLoading) {
      webview.stopLoading();
      updateBrowser(browserId, { isLoading: false });
    } else {
      webview.reload();
    }
  }, [browser?.isLoading, browserId, updateBrowser]);

  const navigateToUrl = useCallback(() => {
    const normalized = normalizeWorkspaceBrowserUrl(draftUrl);
    setDraftUrl(normalized);
    Keyboard.dismiss();
  }, [draftUrl]);

  // Styles
  const urlInputStyle = useMemo(
    () => [
      styles.urlInput,
      {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
      },
    ],
    [theme.colors.foreground, theme.colors.surface1, theme.colors.border],
  );
  const errorTextStyle = useMemo(
    () => [styles.errorText, { color: theme.colors.palette.red[500] }],
    [theme.colors.palette.red],
  );
  const baseIconButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.iconButton,
      pressed && { backgroundColor: theme.colors.surface2 },
    ],
    [theme.colors.surface2],
  );
  const backIconButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.iconButton,
      pressed && { backgroundColor: theme.colors.surface2 },
      !browser?.canGoBack && styles.iconButtonDisabled,
    ],
    [browser?.canGoBack, theme.colors.surface2],
  );
  const forwardIconButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.iconButton,
      pressed && { backgroundColor: theme.colors.surface2 },
      !browser?.canGoForward && styles.iconButtonDisabled,
    ],
    [browser?.canGoForward, theme.colors.surface2],
  );

  const chromeRowStyle = useMemo(
    () => [
      styles.chromeRow,
      {
        backgroundColor: theme.colors.surface0,
        borderBottomColor: theme.colors.border,
      },
    ],
    [theme.colors.surface0, theme.colors.border],
  );

  const errorRowStyle = useMemo(
    () => [
      styles.errorRow,
      {
        backgroundColor: theme.colors.surface0,
        borderBottomColor: theme.colors.border,
      },
    ],
    [theme.colors.surface0, theme.colors.border],
  );

  const webViewSource = useMemo(
    () => ({ uri: browser?.url ?? "https://example.com" }),
    [browser?.url],
  );

  return (
    <View style={styles.container}>
      {/* Chrome bar */}
      <View style={chromeRowStyle}>
        {/* Navigation buttons */}
        <View style={styles.chromeLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            disabled={!browser?.canGoBack}
            onPress={goBack}
            style={backIconButtonStyle}
          >
            <ArrowLeft size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forward"
            disabled={!browser?.canGoForward}
            onPress={goForward}
            style={forwardIconButtonStyle}
          >
            <ArrowRight size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={browser?.isLoading ? "Stop" : "Refresh"}
            onPress={reloadOrStop}
            style={baseIconButtonStyle}
          >
            <RotateCw size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>

        {/* URL bar */}
        <View style={styles.urlBarWrap}>
          <TextInput
            accessibilityLabel="Browser URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setDraftUrl}
            onSubmitEditing={navigateToUrl}
            placeholder="Enter URL"
            placeholderTextColor={theme.colors.foregroundMuted}
            returnKeyType="go"
            style={urlInputStyle}
            value={draftUrl}
          />
        </View>
      </View>

      {/* Error bar */}
      {browser?.lastError ? (
        <View style={errorRowStyle}>
          <Text numberOfLines={1} style={errorTextStyle}>
            {browser.lastError}
          </Text>
        </View>
      ) : null}

      {/* WebView */}
      <View style={styles.webviewWrap}>
        <WebView
          ref={webviewRef}
          source={webViewSource}
          style={styles.webview}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          allowsInlineMediaPlayback
          sharedCookiesEnabled
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  chromeRow: {
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: 1,
  },
  chromeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDisabled: {
    opacity: 0.45,
  },
  urlBarWrap: {
    flex: 1,
    minWidth: 0,
    height: 28,
  },
  urlInput: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 0,
    borderWidth: 1,
    height: 28,
  },
  errorRow: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderBottomWidth: 1,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
  },
  webviewWrap: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
  },
}));
