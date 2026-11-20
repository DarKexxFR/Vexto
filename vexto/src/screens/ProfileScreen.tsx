import { useState, type ReactNode } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon, McIcon, type IconName, type McIconName } from "@/components/Icon";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Avatar, Chip, ProgressBar, SectionHeader } from "@/components/ui";
import { formatCo2, formatInt, formatMonthYear, pluralize } from "@/domain/format";
import { shortPlaceLabel } from "@/domain/places";
import { useUserStats } from "@/hooks/useUserStats";
import { authErrorMessage, signOut } from "@/lib/auth";
import { appVersion } from "@/lib/config";
import { confirmAsync, notify } from "@/lib/dialogs";
import { friendlyError } from "@/lib/errors";
import { friendCode } from "@/lib/friends";
import { haptic } from "@/lib/haptics";
import { updateDisplayName } from "@/lib/profile";
import { shareText } from "@/lib/share";
import { refreshProfile } from "@/lib/sync";
import { useAppNavigation } from "@/navigation/types";
import { useAppStore } from "@/store/useAppStore";
import { usePrefsStore, type OwnedVehicle } from "@/store/usePrefsStore";
import { colors } from "@/theme/colors";

const VEHICLES: Array<{ id: OwnedVehicle; label: string; icon: McIconName; hint: string }> = [
  { id: "bike", label: "Vélo", icon: "bike", hint: "Sinon on vous suggère le libre-service" },
  { id: "eScooter", label: "Trottinette électrique", icon: "human-scooter", hint: "Idem pour les trottinettes" },
  { id: "car", label: "Voiture", icon: "car-side", hint: "Sert de référence pour le CO₂ évité" },
];

function Row({
  icon,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View className="flex-row items-center gap-3 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-leaf-soft">
        <Icon name={icon} size={18} color={colors.leaf} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-forest">{title}</Text>
        {subtitle ? (
          <Text className="text-xs text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.faint} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      className="active:opacity-70"
    >
      {content}
    </Pressable>
  );
}

export function ProfileScreen() {
  const navigation = useAppNavigation();
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const stats = useUserStats();
  const home = usePrefsStore((s) => s.home);
  const work = usePrefsStore((s) => s.work);
  const owned = usePrefsStore((s) => s.owned);
  const voiceGuidance = usePrefsStore((s) => s.voiceGuidance);
  const forestVisited = usePrefsStore((s) => s.forestVisited);
  const setOwned = usePrefsStore((s) => s.setOwned);
  const setVoiceGuidance = usePrefsStore((s) => s.setVoiceGuidance);
  const setFavorite = usePrefsStore((s) => s.setFavorite);
  const clearRecents = usePrefsStore((s) => s.clearRecents);

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const userId = session?.user.id ?? "";
  const displayName =
    profile?.full_name ?? (session?.user.user_metadata?.full_name as string | undefined) ?? "Vextonaute";
  const email = session?.user.email ?? "";
  const memberSince = profile?.created_at ? formatMonthYear(new Date(profile.created_at)) : null;
  const myCode = userId ? friendCode(userId) : "";
  const { level, summary, streak, co2Kg } = stats;

  const saveName = async () => {
    const next = nameDraft.trim();
    if (next.length < 2 || !userId) {
      setEditing(false);
      return;
    }
    setSavingName(true);
    try {
      await updateDisplayName(userId, next);
      await refreshProfile();
      haptic.success();
      setEditing(false);
    } catch (e) {
      notify("Erreur", friendlyError(e));
    } finally {
      setSavingName(false);
    }
  };

  const handleSignOut = async () => {
    const ok = await confirmAsync("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", "Se déconnecter", true);
    if (!ok) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      notify("Erreur", authErrorMessage(e));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <ScreenContainer>
      {/* Identity */}
      <View className="mb-5 mt-4 items-center">
        <Avatar name={displayName} seed={userId || "vexto"} size={84} ring={colors.leafSoft} />
        {editing ? (
          <View className="mt-3 w-full flex-row items-center gap-2">
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              maxLength={40}
              placeholder="Votre nom"
              placeholderTextColor={colors.faint}
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-base text-forest"
              onSubmitEditing={() => void saveName()}
              accessibilityLabel="Nom affiché"
            />
            <View className="w-28">
              <Button label="OK" size="sm" onPress={() => void saveName()} loading={savingName} />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setNameDraft(displayName === "Vextonaute" ? "" : displayName);
              setEditing(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Modifier mon nom"
            className="mt-3 flex-row items-center gap-1.5 active:opacity-70"
          >
            <Text className="text-2xl font-extrabold text-forest">{displayName}</Text>
            <Icon name="pencil" size={15} color={colors.muted} />
          </Pressable>
        )}
        <Text className="mt-0.5 text-sm text-muted">{email}</Text>
        {memberSince ? <Text className="text-xs text-faint">Membre depuis {memberSince}</Text> : null}
      </View>

      {/* Level */}
      <Card className="mb-4">
        <View className="flex-row items-center gap-3">
          <Text className="text-3xl">{level.current.icon}</Text>
          <View className="flex-1">
            <Text className="text-base font-extrabold text-forest">
              Niveau {level.current.index + 1} · {level.current.name}
            </Text>
            <Text className="text-xs text-muted">
              {level.next
                ? `${formatInt(level.pointsToNext)} pts avant ${level.next.name} ${level.next.icon}`
                : "Niveau maximum 🌍"}
            </Text>
          </View>
        </View>
        <View className="mt-3">
          <ProgressBar value={level.progress} />
        </View>
      </Card>

      {/* Stats */}
      <View className="mb-4 flex-row flex-wrap justify-between gap-y-3">
        {[
          { label: "Trajets verts", value: formatInt(summary.lowCarbonTrips) },
          { label: "Distance verte", value: `${formatInt(summary.totalKm - summary.byMode.carThermal.km)} km` },
          { label: "CO₂ évité", value: formatCo2(co2Kg) },
          { label: "Meilleure série", value: `${streak.best} ${pluralize(streak.best, "jour", "jours")}` },
        ].map((s) => (
          <View key={s.label} className="w-[48.5%] rounded-2xl border border-line bg-card p-3.5">
            <Text className="text-xs text-muted">{s.label}</Text>
            <Text className="mt-0.5 text-lg font-extrabold text-forest">{s.value}</Text>
          </View>
        ))}
      </View>

      <Card className="mb-4 py-1">
        <Row
          icon="leaf"
          title="Ma forêt"
          subtitle={`${stats.forest.trees} ${pluralize(stats.forest.trees, "arbre", "arbres")} · ${stats.unlockedCount} succès`}
          onPress={() => navigation.navigate("Forest")}
          right={!forestVisited ? <Chip label="Nouveau" tone="amber" emoji="🎁" /> : undefined}
        />
        <View className="h-px bg-line" />
        <Row
          icon="time-outline"
          title="Historique des trajets"
          subtitle={`${summary.totalTrips} ${pluralize(summary.totalTrips, "trajet", "trajets")}`}
          onPress={() => navigation.navigate("History")}
        />
        <View className="h-px bg-line" />
        <Row
          icon="people-outline"
          title="Mon code ami"
          subtitle={myCode}
          onPress={() => void shareText(`Ajoute-moi sur Vexto 🌿 avec mon code ami : ${myCode}`)}
          right={<Icon name="share-social-outline" size={18} color={colors.faint} />}
        />
      </Card>

      <SectionHeader title="Adresses favorites" />
      <Card className="mb-4 py-1">
        {(
          [
            { kind: "home" as const, place: home, icon: "home-outline" as const, title: "Maison" },
            { kind: "work" as const, place: work, icon: "briefcase-outline" as const, title: "Travail" },
          ]
        ).map((f, i) => (
          <View key={f.kind}>
            {i > 0 ? <View className="h-px bg-line" /> : null}
            <Row
              icon={f.icon}
              title={f.title}
              subtitle={f.place ? shortPlaceLabel(f.place.label) : "Non définie · touchez ☆ dans Trajet"}
              right={
                f.place ? (
                  <Pressable
                    onPress={() => setFavorite(f.kind, null)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer l'adresse ${f.title}`}
                  >
                    <Icon name="trash-outline" size={18} color={colors.faint} />
                  </Pressable>
                ) : undefined
              }
              onPress={f.place ? undefined : () => navigation.navigate("Route")}
            />
          </View>
        ))}
        <View className="h-px bg-line" />
        <Row icon="refresh" title="Effacer les recherches récentes" onPress={clearRecents} />
      </Card>

      <SectionHeader title="Mes véhicules" />
      <Card className="mb-4 py-1">
        {VEHICLES.map((v, i) => (
          <View key={v.id}>
            {i > 0 ? <View className="h-px bg-line" /> : null}
            <View className="flex-row items-center gap-3 py-3">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-leaf-soft">
                <McIcon name={v.icon} size={18} color={colors.leaf} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-forest">{v.label}</Text>
                <Text className="text-xs text-muted">{v.hint}</Text>
              </View>
              <Switch
                value={owned[v.id]}
                onValueChange={(on) => {
                  haptic.tap();
                  setOwned(v.id, on);
                }}
                trackColor={{ true: colors.leaf, false: colors.line }}
                thumbColor={colors.card}
                accessibilityLabel={v.label}
              />
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Navigation" />
      <Card className="mb-4 py-1">
        <Row
          icon="volume-high-outline"
          title="Guidage vocal"
          subtitle="Instructions parlées pendant le trajet"
          right={
            <Switch
              value={voiceGuidance}
              onValueChange={setVoiceGuidance}
              trackColor={{ true: colors.leaf, false: colors.line }}
              thumbColor={colors.card}
              accessibilityLabel="Guidage vocal"
            />
          }
        />
      </Card>

      <View className="mb-3">
        <Button
          label="Se déconnecter"
          variant="danger"
          icon="log-out-outline"
          onPress={() => void handleSignOut()}
          loading={signingOut}
        />
      </View>
      <Text className="mb-6 text-center text-[11px] text-faint">
        Vexto {appVersion} · facteurs d'émission ADEME · anti-triche PostGIS
      </Text>
    </ScreenContainer>
  );
}
