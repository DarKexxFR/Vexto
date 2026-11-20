import { Pressable } from "react-native";

import { Avatar } from "@/components/ui";
import { useAppNavigation } from "@/navigation/types";
import { useAppStore } from "@/store/useAppStore";

/** Top-right avatar opening the profile (shared by the main tabs). */
export function HeaderAvatar({ size = 38 }: { size?: number }) {
  const navigation = useAppNavigation();
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const name = profile?.full_name ?? (session?.user.user_metadata?.full_name as string | undefined) ?? null;
  return (
    <Pressable
      onPress={() => navigation.navigate("Profile")}
      accessibilityRole="button"
      accessibilityLabel="Mon profil"
      hitSlop={6}
      className="active:opacity-70"
    >
      <Avatar name={name} seed={session?.user.id ?? "vexto"} size={size} />
    </Pressable>
  );
}
