import React, { useEffect } from "react";
import { Text, View, Pressable } from "react-native";
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
  };
  itemWidth: number;
  itemHeight: number;
  dragMode: SharedValue<boolean>;
  anyItemInDeleteMode: SharedValue<boolean>;
  children: React.ReactNode;
  wiggle?: { duration: number; degrees: number };
  dragSizeIncreaseFactor: number;
  onDelete?: () => void;
  disableHoldToDelete?: boolean; // If true, disable the hold-to-delete feature
};

export default function ChildWrapper({
  position,
  itemWidth,
  itemHeight,
  dragMode,
  anyItemInDeleteMode,
  children,
  wiggle,
  dragSizeIncreaseFactor,
  onDelete,
  disableHoldToDelete = false,
}: Props) {
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

    // If not in drag mode or not active, reset timer
    if (!isDragging || !isActive) {
      stillTimer.value = 0;
      return;
    }

    // Item is active (being held down) - check if it's still
    // Check if position has changed significantly (more than 10px threshold)
    const moved =
      Math.abs(x - lastX.value) > 10 || Math.abs(y - lastY.value) > 10;

    if (moved) {
      // Reset timer if item moved while being held
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

    // Enter delete mode after 1 second (1000ms) of being held still
    if (stillTimer.value >= 1000) {
      deleteModeActive.value = true;
      anyItemInDeleteMode.value = true; // Set global delete mode
      showDelete.value = true;
      wasReleasedAfterDeleteMode.value = false; // Reset on entry
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
      if (!wiggle) {
        if (currentWiggleMode.value !== "none") {
          cancelAnimation(rotation);
          currentWiggleMode.value = "none";
        }
        rotation.value = withTiming(0, { duration: 150 });
        return;
      }

      // Determine the target wiggle mode
      let targetMode: "none" | "normal" | "delete" = "none";
      if (inDeleteMode) {
        targetMode = "delete";
      } else if (anyInDeleteMode && !isActive) {
        targetMode = "normal";
      } else if (isEditMode && !isActive) {
        targetMode = "normal";
      }

      // Only restart animation if mode changed
      if (currentWiggleMode.value === targetMode) {
        return; // Already in the correct mode, don't restart
      }

      const previousMode = currentWiggleMode.value;
      currentWiggleMode.value = targetMode;

      // Cancel current animation
      cancelAnimation(rotation);

      // If this item is in delete mode, wiggle more (2x degrees, faster)
      if (targetMode === "delete") {
        const deleteWiggleDegrees = wiggle.degrees * 2;
        const deleteWiggleDuration = wiggle.duration * 0.7; // Faster wiggle

        // If transitioning from normal wiggle, preserve the phase by scaling
        if (previousMode === "normal") {
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
    [dragMode, position.active, deleteModeActive, anyItemInDeleteMode]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const scale = position.active.value
      ? withTiming(dragSizeIncreaseFactor, { duration: 120 })
      : withTiming(1, { duration: 120 });

    return {
      position: "absolute",
      width: itemWidth,
      height: itemHeight,
      transform: [
        { translateX: position.x.value as any },
        { translateY: position.y.value as any },
        { scale: scale as any },
        { rotate: `${rotation.value}deg` as any },
      ],
      zIndex: position.active.value ? 2 : 0,
    } as any;
  });

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

  return (
    <Animated.View style={animatedStyle} pointerEvents="box-none">
      <Animated.View
        style={[
          {
            position: "absolute",
            top: itemHeight * 0.01,
            right: itemWidth * 0.04,
            width: itemWidth * 0.2,
            height: itemHeight * 0.2,
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 3,
          },
          deleteButtonStyle,
        ]}
      >
        <Pressable
          onPress={handleDelete}
          style={{
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: itemWidth * 0.2,
              color: "black",
              fontWeight: 500,
            }}
          >
            ×
          </Text>
        </Pressable>
      </Animated.View>

      {children}
    </Animated.View>
  );
}
