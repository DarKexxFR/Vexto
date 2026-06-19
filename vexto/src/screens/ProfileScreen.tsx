import { useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ScreenContainer } from "@/components/ScreenContainer";
import { authErrorMessage, signOut } from "@/lib/auth";
import { formatCo2 } from "@/domain/format";
import { colors } from "@/theme/colors";
import { useAppStore } from "@/store/useAppStore";

interface OwnedTransport {
  id: string;
  label: string;
  icon: string;
  owned: boolean;
}

const INITIAL_TRANSPORTS: OwnedTransport[] = [
  { id: "car", label: "Voiture", icon: "🚗", owned: true },
  { id: "bike", label: "Vélo", icon: "🚲", owned: false },
  { id: "escooter", label: "Trottinette électrique", icon: "🛴", owned: false },
];

export function ProfileScreen() {
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const [transports, setTransports] = useState(INITIAL_TRANSPORTS);
  const [signingOut, setSigningOut] = useState(false);

  const toggle = (id: string) =>
    setTransports((prev) =>
      prev.map((t) => (t.id === id ? { ...t, owned: !t.owned } : t)),
    );

  const displayName =
    profile?.full_name ??
    (session?.user.user_metadata?.full_name as string | undefined) ??
    "Vextonaute";
  const displayEmail = profile?.email ?? session?.user.email ?? "";

  const handleSignOut = () => {
    Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: () => {
          setSigningOut(true);
          signOut()
            .catch((e) => Alert.alert("Erreur", authErrorMessage(e)))
            .finally(() => setSigningOut(false));
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <Text className="mb-1 mt-2 text-2xl font-bold text-forest">Profil</Text>
      <Text className="mb-4 text-sm text-muted">{displayEmail}</Text>

      <Card className="mb-5 bg-forest">
        <Text className="text-lg font-bold text-white">{displayName}</Text>
        <View className="mt-3 flex-row justify-between">
          <View>
            <Text className="text-xs text-white/70">Points cumulés</Text>
            <Text className="text-xl font-bold text-white">
              {profile?.cumulative_points ?? 0}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-xs text-white/70">CO₂ évité</Text>
            <Text className="text-xl font-bold text-white">
              {formatCo2(profile?.current_co2_saved ?? 0)}
            </Text>
          </View>
        </View>
      </Card>

      <Text className="mb-2 text-xs font-semibold uppercase text-muted">
        Mes moyens de transport
      </Text>
      <View className="mb-5 gap-2">
        {transports.map((t) => (
          <Card key={t.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Text className="text-2xl">{t.icon}</Text>
                <Text className="text-base font-medium text-forest">
                  {t.label}
                </Text>
              </View>
              <Switch
                value={t.owned}
                onValueChange={() => toggle(t.id)}
                trackColor={{ true: colors.leaf, false: colors.line }}
                thumbColor={colors.card}
              />
            </View>
          </Card>
        ))}
      </View>

      <Text className="mb-2 text-xs font-semibold uppercase text-muted">
        Groupes de trajet
      </Text>
      <Card>
        <Text className="text-sm text-muted">
          Créez un groupe pour partager vos trajets avec des collègues qui
          habitent près de chez vous. (Bientôt disponible)
        </Text>
        <Pressable className="mt-3">
          <Text className="text-sm font-semibold text-leaf">
            + Créer un groupe
          </Text>
        </Pressable>
      </Card>

      <View className="mb-8 mt-6">
        <Button
          label="Se déconnecter"
          variant="ghost"
          onPress={handleSignOut}
          loading={signingOut}
        />
      </View>
    </ScreenContainer>
  );
}
