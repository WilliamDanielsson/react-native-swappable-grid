import React, { useEffect, useState } from "react";
import {
  Text,
  View,
  Pressable,
  Vibration,
  Platform,
  LayoutChangeEvent,
} from "react-native";

// Try to import expo-haptics (optional dependency)
let Haptics: any = null;
try {
  Haptics = require("expo-haptics");
} catch (e) {
  // expo-haptics not available, will fall back to Vibration API
}
import Animated, {
  Easing,
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  SharedValue,
  useDerivedValue,
  cancelAnimation,
  runOnJS,
} from "react-native-reanimated";

type Props = {
  position: {
    x: SharedValue<number>;
    y: SharedValue<number>;
    active: SharedValue<number>;
    width: SharedValue<number>;
    height: SharedValue<number>;
  };
  defaultWidth?: number; // Default width if item doesn't report its own size
  defaultHeight?: number; // Default height if item doesn't report its own size
  onDimensionsChange?: (width: number, height: number) => void; // Callback when item dimensions are measured
  dragMode: SharedValue<boolean>;
  anyItemInDeleteMode: SharedValue<boolean>;
  isPressingDeleteItem: SharedValue<boolean>;
  children: React.ReactNode;
  wiggle?: { duration: number; degrees: number };
  wiggleDeleteMode?: { duration: number; degrees: number };
  holdStillToDeleteMs?: number;
  dragSizeIncreaseFactor: number;
  onDelete?: () => void;
  disableHoldToDelete?: boolean; // If true, disable the hold-to-delete feature
  hapticFeedback?: boolean; // If true, enable haptic feedback when entering delete mode
};

export default function ChildWrapper({
  position,
  defaultWidth = 100,
  defaultHeight = 100,
  onDimensionsChange,
  dragMode,
  anyItemInDeleteMode,
  isPressingDeleteItem,
  children,
  wiggle,
  wiggleDeleteMode,
  holdStillToDeleteMs = 1000,
  dragSizeIncreaseFactor,
  onDelete,
  disableHoldToDelete = false,
  hapticFeedback = false,
}: Props) {
  // Don't initialize dimensions - let child measure itself first
  // This ensures we get the actual child dimensions, not defaults

  // Measure child dimensions
  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      // Only update if dimensions have changed significantly (avoid unnecessary updates)
      const currentWidth = position.width.value;
      const currentHeight = position.height.value;
      if (
        Math.abs(currentWidth - width) > 0.5 ||
        Math.abs(currentHeight - height) > 0.5
      ) {
        position.width.value = width;
        position.height.value = height;
        onDimensionsChange?.(width, height);
      }
    }
  };
  const rotation = useSharedValue(0);
  const currentWiggleMode = useSharedValue<"none" | "normal" | "delete">(
    "none"
  );
  const previousDragMode = useSharedValue(false);

  const showDelete = useSharedValue(false);
  const deleteModeActive = useSharedValue(false); // Persistent delete mode state
  const stillTimer = useSharedValue(0);
  const lastX = useSharedValue(position.x.value);
  const lastY = useSharedValue(position.y.value);
  const frameCounter = useSharedValue(0);
  const wasReleasedAfterDeleteMode = useSharedValue(false); // Track if item was released after entering delete mode

  // Function to trigger haptic feedback (called from worklet via runOnJS)
  const triggerHapticFeedback = () => {
    try {
      // Platform-specific haptic feedback
      if (Platform.OS === "ios") {
        // iOS: Prefer expo-haptics for better control (subtle feedback)
        if (Haptics && Haptics.impactAsync) {
          // Use light impact for subtle feedback (similar to iOS system haptics)
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
        }
        // Fallback to Vibration API if expo-haptics not available
        // Note: This will be a stronger vibration than desired on iOS
        if (Vibration && typeof Vibration.vibrate === "function") {
          Vibration.vibrate(1);
        }
      } else {
        // Android: Use Vibration API (works well and is more reliable than expo-haptics)
        if (Vibration && typeof Vibration.vibrate === "function") {
          // Android requires a pattern array: [delay, duration]
          // [0, 20] means: start immediately (0ms delay), vibrate for 20ms
          Vibration.vibrate([0, 20]);
        }
      }
    } catch (error) {
      // Silently fail if haptic feedback is not available or fails
      // This allows the library to work in environments where haptics are not supported
    }
  };

  // Timer logic that runs every frame via useDerivedValue
  useDerivedValue(() => {
    "worklet";
    frameCounter.value = frameCounter.value + 1;

    // If hold-to-delete is disabled, skip all delete mode logic
    if (disableHoldToDelete) {
      deleteModeActive.value = false;
      showDelete.value = false;
      stillTimer.value = 0;
      anyItemInDeleteMode.value = false;
      return;
    }

    const isDragging = dragMode.value;
    const isActive = position.active.value > 0.5;
    const x = position.x.value;
    const y = position.y.value;

    // Track dragMode changes for detecting touches outside
    const dragModeJustEnded = previousDragMode.value && !isDragging;
    previousDragMode.value = isDragging;

    // If delete mode is active, keep it active unless:
    // 1. Another item becomes active (dragMode true but this item not active)
    // 2. This item becomes active again AFTER it was released (user starts dragging it again)
    // 3. User touches outside (dragMode becomes false and no item is active)
    if (deleteModeActive.value) {
      // Check if item was released (became inactive)
      if (!isActive && !wasReleasedAfterDeleteMode.value) {
        wasReleasedAfterDeleteMode.value = true;
      }

      if (isDragging && !isActive) {
        // Another item is being dragged, exit delete mode
        deleteModeActive.value = false;
        anyItemInDeleteMode.value = false; // Clear global delete mode
        showDelete.value = false;
        stillTimer.value = 0;
        wasReleasedAfterDeleteMode.value = false;
      } else if (isActive && wasReleasedAfterDeleteMode.value) {
        // This item became active again AFTER it was released, exit delete mode
        deleteModeActive.value = false;
        anyItemInDeleteMode.value = false; // Clear global delete mode
        showDelete.value = false;
        stillTimer.value = 0;
        wasReleasedAfterDeleteMode.value = false;
      } else if (!isDragging && !isActive) {
        // Keep delete mode active (waiting for user interaction)
        // The tap gesture handler in SwappableGrid will cancel it when user taps outside
        showDelete.value = true;
      } else {
        // Keep delete mode active (item can still be held or released)
        showDelete.value = true;
      }
      return;
    }

    // Reset release tracking when not in delete mode
    wasReleasedAfterDeleteMode.value = false;

    // Timer runs when item is active (being held)
    // Note: isActive (position.active.value) is set when gesture activates after long press
    // isDragging (dragMode.value) is also set at that time, but we primarily check isActive
    // to allow timer to work even in edge cases
    if (!isActive) {
      stillTimer.value = 0;
      return;
    }

    // Item is active - timer can run (dragMode should also be true at this point,
    // but we don't require it to allow timer to work in all cases)

    // Item is active (being held down) - check if it's still
    // Only reset timer if user is actively dragging (dragMode is true and position changed)
    // Don't reset on initial activation or small position adjustments
    const moved =
      isDragging &&
      (Math.abs(x - lastX.value) > 10 || Math.abs(y - lastY.value) > 10);

    if (moved) {
      // Reset timer if item moved while being dragged
      stillTimer.value = 0;
      lastX.value = x;
      lastY.value = y;
      return;
    }

    // Initialize last position on first frame when active
    if (stillTimer.value === 0) {
      lastX.value = x;
      lastY.value = y;
    }

    // If the tile hasn't moved significantly while being held → increment timer
    // Increment by ~16ms per frame (assuming 60fps)
    stillTimer.value += 16;

    // Enter delete mode after holdStillToDeleteMs of being held still
    if (stillTimer.value >= holdStillToDeleteMs && !deleteModeActive.value) {
      deleteModeActive.value = true;
      anyItemInDeleteMode.value = true; // Set global delete mode
      showDelete.value = true;
      wasReleasedAfterDeleteMode.value = false; // Reset on entry

      // Trigger haptic feedback when entering delete mode
      if (hapticFeedback) {
        runOnJS(triggerHapticFeedback)();
      }
    }
  });

  const deleteButtonStyle = useAnimatedStyle(() => {
    // Show delete button when delete mode is active (persists after release)
    const shouldShow = showDelete.value;
    return {
      opacity: shouldShow ? 1 : 0,
      pointerEvents: shouldShow ? "auto" : "none",
      transform: [
        { scale: withTiming(shouldShow ? 1 : 0.6, { duration: 120 }) },
      ],
    };
  });

  // Watch for when global delete mode is cancelled (user tapped outside)
  useAnimatedReaction(
    () => anyItemInDeleteMode.value,
    (current, previous) => {
      "worklet";
      // If delete mode was cancelled globally (user tapped outside)
      if (previous && !current && deleteModeActive.value) {
        deleteModeActive.value = false;
        showDelete.value = false;
        stillTimer.value = 0;
        wasReleasedAfterDeleteMode.value = false;
      }
    }
  );

  // Wiggle animation — triggers on editMode/active changes and delete mode
  useAnimatedReaction(
    () => ({
      isEditMode: dragMode.value,
      isActive: position.active.value > 0.5,
      inDeleteMode: deleteModeActive.value,
      anyInDeleteMode: anyItemInDeleteMode.value,
    }),
    ({ isEditMode, isActive, inDeleteMode, anyInDeleteMode }) => {
      // Determine the target wiggle mode
      let targetMode: "none" | "normal" | "delete" = "none";
      if (inDeleteMode && (wiggleDeleteMode || wiggle)) {
        targetMode = "delete";
      } else if (anyInDeleteMode && !isActive && wiggle) {
        targetMode = "normal";
      } else if (isEditMode && !isActive && wiggle) {
        targetMode = "normal";
      }

      // If no wiggle is configured at all, stop animation
      if (!wiggle && !wiggleDeleteMode) {
        if (currentWiggleMode.value !== "none") {
          cancelAnimation(rotation);
          currentWiggleMode.value = "none";
        }
        rotation.value = withTiming(0, { duration: 150 });
        return;
      }

      // If in delete mode but no wiggleDeleteMode and no wiggle, stop animation
      if (targetMode === "delete" && !wiggleDeleteMode && !wiggle) {
        if (currentWiggleMode.value !== "none") {
          cancelAnimation(rotation);
          currentWiggleMode.value = "none";
        }
        rotation.value = withTiming(0, { duration: 150 });
        return;
      }

      // If normal mode but no wiggle, stop animation
      if (targetMode === "normal" && !wiggle) {
        if (currentWiggleMode.value !== "none") {
          cancelAnimation(rotation);
          currentWiggleMode.value = "none";
        }
        rotation.value = withTiming(0, { duration: 150 });
        return;
      }

      // Only restart animation if mode changed
      if (currentWiggleMode.value === targetMode) {
        return; // Already in the correct mode, don't restart
      }

      const previousMode = currentWiggleMode.value;
      currentWiggleMode.value = targetMode;

      // Cancel current animation
      cancelAnimation(rotation);

      // If this item is in delete mode, use wiggleDeleteMode if provided, otherwise use 2x degrees and 0.7x duration
      if (targetMode === "delete") {
        const deleteWiggleDegrees = wiggleDeleteMode
          ? wiggleDeleteMode.degrees
          : (wiggle?.degrees ?? 0) * 2;
        const deleteWiggleDuration = wiggleDeleteMode
          ? wiggleDeleteMode.duration
          : (wiggle?.duration ?? 200) * 0.7; // Faster wiggle

        // If transitioning from normal wiggle, preserve the phase by scaling
        if (previousMode === "normal" && wiggle) {
          const currentRot = rotation.value;
          const scaleFactor = deleteWiggleDegrees / wiggle.degrees;
          rotation.value = currentRot * scaleFactor;
        }

        rotation.value = withRepeat(
          withSequence(
            withTiming(deleteWiggleDegrees, {
              duration: deleteWiggleDuration,
              easing: Easing.linear,
            }),
            withTiming(-deleteWiggleDegrees, {
              duration: deleteWiggleDuration,
              easing: Easing.linear,
            })
          ),
          -1, // infinite
          true
        );
      }
      // Normal wiggle (when dragging but not this item, or any item in delete mode)
      else if (targetMode === "normal") {
        // If transitioning from delete wiggle, preserve the phase by scaling
        if (previousMode === "delete") {
          const currentRot = rotation.value;
          const scaleFactor = wiggle.degrees / (wiggle.degrees * 2);
          rotation.value = currentRot * scaleFactor;
        }

        rotation.value = withRepeat(
          withSequence(
            withTiming(wiggle.degrees, {
              duration: wiggle.duration,
              easing: Easing.linear,
            }),
            withTiming(-wiggle.degrees, {
              duration: wiggle.duration,
              easing: Easing.linear,
            })
          ),
          -1, // infinite
          true
        );
      }
      // Stop wiggling
      else {
        rotation.value = withTiming(0, { duration: 150 });
      }
    },
    [
      dragMode,
      position.active,
      deleteModeActive,
      anyItemInDeleteMode,
      wiggle,
      wiggleDeleteMode,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const scale = position.active.value
      ? withTiming(dragSizeIncreaseFactor, { duration: 120 })
      : withTiming(1, { duration: 120 });

    // Use measured dimensions if available, otherwise use defaults
    // If dimensions are 0 or very small, use defaults to allow child to render
    const width =
      position.width.value > 1 ? position.width.value : defaultWidth;
    const height =
      position.height.value > 1 ? position.height.value : defaultHeight;

    return {
      position: "absolute",
      width: width,
      height: height,
      // Allow child to determine its own size by not constraining it
      // The wrapper View will measure the actual child size
      overflow: "visible",
      transform: [
        { translateX: position.x.value as any },
        { translateY: position.y.value as any },
        { scale: scale as any },
        { rotate: `${rotation.value}deg` as any },
      ],
      zIndex: position.active.value ? 2 : 0,
    } as any;
  });

  // Track delete mode on JS thread for Pressable disabled state
  const [isInDeleteMode, setIsInDeleteMode] = useState(false);

  useAnimatedReaction(
    () => deleteModeActive.value,
    (current) => {
      runOnJS(setIsInDeleteMode)(current);
    }
  );

  const handleDelete = () => {
    // Exit delete mode when delete button is pressed
    deleteModeActive.value = false;
    anyItemInDeleteMode.value = false; // Clear global delete mode
    showDelete.value = false;
    stillTimer.value = 0;
    wasReleasedAfterDeleteMode.value = false;
    if (onDelete) {
      onDelete();
    }
  };

  // Animated style for delete overlay - always render but control visibility
  const deleteOverlayStyle = useAnimatedStyle(() => ({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: position.width.value,
    height: position.height.value,
    zIndex: 2,
    opacity: deleteModeActive.value ? 1 : 0,
    pointerEvents: deleteModeActive.value ? "auto" : "none",
  }));

  return (
    <Animated.View style={animatedStyle} pointerEvents="box-none">
      {/* Full-item Pressable for delete - always render but control visibility */}
      <Animated.View style={deleteOverlayStyle}>
        <Pressable
          onPressIn={() => {
            // Mark that we're pressing an item to prevent ScrollView from canceling delete mode
            isPressingDeleteItem.value = true;
          }}
          onPressOut={() => {
            // Clear the flag after a short delay to allow onPress to fire
            setTimeout(() => {
              isPressingDeleteItem.value = false;
            }, 50);
          }}
          onPress={handleDelete}
          style={{ flex: 1 }}
          disabled={!isInDeleteMode}
        />
      </Animated.View>

      {/* Delete button (×) - visual indicator only */}
      <Animated.View
        style={[
          useAnimatedStyle(() => ({
            position: "absolute",
            top: position.height.value * 0.01,
            right: position.width.value * 0.04,
            width: position.width.value * 0.2,
            height: position.height.value * 0.2,
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 3,
          })),
          deleteButtonStyle,
        ]}
        pointerEvents="none"
      >
        <Animated.Text
          style={useAnimatedStyle(() => ({
            fontSize: position.width.value * 0.2,
            color: "black",
            fontWeight: "500",
          }))}
        >
          ×
        </Animated.Text>
      </Animated.View>

      <View
        onLayout={handleLayout}
        style={{
          // Let child determine its own size - don't constrain it
          // alignSelf: "flex-start" makes the wrapper shrink to fit content
          alignSelf: "flex-start",
          // Ensure the wrapper doesn't stretch the child
          flexShrink: 0,
          flexGrow: 0,
        }}
        collapsable={false}
      >
        {children}
      </View>
    </Animated.View>
  );
}
