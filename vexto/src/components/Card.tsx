import { ReactNode } from "react";
import { View } from "react-native";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** White surface with the subtle Sage-Tech border. No heavy shadows. */
export function Card({ children, className = "" }: CardProps) {
  return (
    <View className={`rounded-2xl border border-line bg-card p-4 ${className}`}>
      {children}
    </View>
  );
}
