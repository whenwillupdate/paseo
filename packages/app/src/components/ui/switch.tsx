import { useCallback, useMemo } from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

interface SwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  size?: "sm" | "ios";
}

const SWITCH_SIZES = {
  sm: { track: { width: 34, height: 20 }, thumb: 16 },
  ios: { track: { width: 51, height: 31 }, thumb: 27 },
} as const;

const TIMING = { duration: 180, easing: Easing.inOut(Easing.ease) };

export function Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  size = "sm",
}: SwitchProps) {
  const { theme } = useUnistyles();
  const { track, thumb } = SWITCH_SIZES[size];
  const padding = (track.height - thumb) / 2;
  const thumbTravel = track.width - thumb - padding * 2;

  const progress = useDerivedValue(() => withTiming(value ? 1 : 0, TIMING));

  const trackAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.surface3, theme.colors.accent],
    ),
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.palette.white, theme.colors.accentForeground],
    ),
    transform: [{ translateX: progress.value * thumbTravel }],
  }));

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (disabled) return;
      onValueChange?.(!value);
    },
    [disabled, onValueChange, value],
  );

  const accessibilityState = useMemo(() => ({ checked: value, disabled }), [value, disabled]);
  const pressableStyle = useMemo(
    () => [disabled ? styles.disabled : null, style],
    [disabled, style],
  );
  const trackStyle = useMemo(
    () => [
      styles.track,
      {
        width: track.width,
        height: track.height,
        borderRadius: track.height / 2,
        padding,
      },
      trackAnimatedStyle,
    ],
    [track.width, track.height, padding, trackAnimatedStyle],
  );
  const thumbStyle = useMemo(
    () => [
      styles.thumb,
      { width: thumb, height: thumb, borderRadius: thumb / 2 },
      thumbAnimatedStyle,
    ],
    [thumb, thumbAnimatedStyle],
  );

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      aria-checked={value}
      testID={testID}
      style={pressableStyle}
    >
      <Animated.View style={trackStyle}>
        <Animated.View style={thumbStyle} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    justifyContent: "center",
  },
  thumb: {
    shadowColor: "rgba(0, 0, 0, 0.25)",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 1,
    elevation: 2,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
}));
