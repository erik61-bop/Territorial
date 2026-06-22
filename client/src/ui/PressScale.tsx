import React, { useRef } from 'react';
import { Animated, Pressable, StyleProp, ViewStyle } from 'react-native';

/** A Pressable that springs down slightly while pressed — tactile feedback for primary buttons. */
export default function PressScale({
  onPress, style, children, disabled, to = 0.94,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  to?: number;
}) {
  const s = useRef(new Animated.Value(1)).current;
  const spring = (v: number) => Animated.spring(s, { toValue: v, useNativeDriver: false, speed: 40, bounciness: 8 }).start();
  return (
    <Pressable onPress={onPress} disabled={disabled}
      onPressIn={() => spring(to)} onPressOut={() => spring(1)}>
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
