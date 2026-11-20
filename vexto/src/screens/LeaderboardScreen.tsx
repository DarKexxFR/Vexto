import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { HeaderAvatar } from "@/components/HeaderAvatar";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Avatar, Banner, Chip, EmptyState, ScreenHeader, SectionHeader, Segmented } from "@/components/ui";
import { formatCo2, formatInt, pluralize } from "@/domain/format";
import { confirmAsync } from "@/lib/dialogs";
import { friendlyError, isMissingBackendFeature, MIGRATION_HINT } from "@/lib/errors";
import {
  friendCode,
  loadFriends,
  normalizeFriendCode,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  type FriendsData,
} from "@/lib/friends";
import { haptic } from "@/lib/haptics";
import { getLeaderboard, getLeaderboardSince, type LeaderboardEntry } from "@/lib/profile";
import { copyText, shareText } from "@/lib/share";
import { useAppStore } from "@/store/useAppStore";
import { colors } from "@/theme/colors";

type Scope = "friends" | "global";
type Period = "week" | "all";

/** Monday 00:00 local time. */
function startOfWeek(now = new Date()): Date {
  const offset = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
}

const MEDALS = [
  { color: colors.gold, emoji: "🥇", height: 92 },
  { color: colors.silver, emoji: "🥈", height: 70 },
  { color: colors.bronze, emoji: "🥉", height: 56 },
];

function displayName(e: LeaderboardEntry, meId: string | undefined): string {
  if (e.id === meId) return "Vous";
  return e.full_name?.trim() || "Vextonaute";
}

function Podium({
  top,
  meId,
  onLongPress,
}: {
  top: LeaderboardEntry[];
  meId?: string;
  onLongPress?: (e: LeaderboardEntry) => void;
}) {
  // Visual order: 2nd, 1st, 3rd.
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <View className="mb-4 flex-row items-end justify-center gap-3">
      {order.map((i) => {
        const e = top[i] as LeaderboardEntry;
        const medal = MEDALS[i] ?? MEDALS[2]!;
        const isMe = e.id === meId;
        return (
          <Pressable
            key={e.id}
            disabled={!onLongPress || isMe}
            onLongPress={() => onLongPress?.(e)}
            className="w-[30%] items-center"
          >
            <Text className="mb-1 text-2xl">{medal.emoji}</Text>
            <Avatar name={e.full_name} seed={e.id} size={i === 0 ? 60 : 50} ring={medal.color} />
            <Text className={`mt-1 text-sm ${isMe ? "font-extrabold text-leaf" : "font-semibold text-forest"}`} numberOfLines={1}>
              {displayName(e, meId)}
            </Text>
            <Text className="text-xs font-bold text-muted">{formatInt(e.points)} pts</Text>
            <View
              style={{ height: medal.height, backgroundColor: medal.color, opacity: 0.22 }}
              className="mt-2 w-full rounded-t-2xl"
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function RankRow({ entry, rank, meId }: { entry: LeaderboardEntry; rank: number; meId?: string }) {
  const isMe = entry.id === meId;
  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl px-3 py-2.5 ${isMe ? "border border-leaf/40 bg-leaf-soft" : ""}`}
    >
      <Text className="w-7 text-center text-sm font-bold text-muted">{rank}</Text>
      <Avatar name={entry.full_name} seed={entry.id} size={36} />
      <View className="flex-1">
        <Text className={`text-sm ${isMe ? "font-extrabold text-forest" : "font-semibold text-forest"}`} numberOfLines={1}>
          {displayName(entry, meId)}
        </Text>
        <Text className="text-xs text-muted">{formatCo2(entry.co2Kg)} évités</Text>
      </View>
      <Text className="text-sm font-extrabold text-leaf">{formatInt(entry.points)} pts</Text>
    </View>
  );
}

export function LeaderboardScreen() {
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const meId = session?.user.id;

  const [scope, setScope] = useState<Scope>("global");
  const [period, setPeriod] = useState<Period>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [friends, setFriends] = useState<FriendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [friendFeedback, setFriendFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const myCode = meId ? friendCode(meId) : "";

  const load = useCallback(async () => {
    if (!meId) return;
    setError(null);
    setNotice(null);
    let friendsData: FriendsData | null = null;
    try {
      friendsData = await loadFriends(meId);
      setFriends(friendsData);
    } catch (e) {
      setFriends({ friends: [], incoming: [], outgoing: [] });
      if (scope === "friends") setError(friendlyError(e));
    }

    try {
      const friendIds = [meId, ...(friendsData?.friends.map((f) => f.id) ?? [])];
      if (period === "week") {
        try {
          const list = await getLeaderboardSince(startOfWeek(), 50, scope === "friends" ? friendIds : undefined);
          setEntries(list);
          return;
        } catch (e) {
          if (!isMissingBackendFeature(e)) throw e;
          setNotice(`Classement hebdomadaire indisponible. ${MIGRATION_HINT}`);
        }
      }
      if (scope === "friends") {
        const me: LeaderboardEntry | null = profile
          ? {
              id: profile.id,
              full_name: profile.full_name,
              avatar_url: profile.avatar_url,
              points: profile.cumulative_points,
              co2Kg: profile.current_co2_saved,
            }
          : null;
        const list = [...(friendsData?.friends ?? []), ...(me ? [me] : [])];
        setEntries(list.sort((a, b) => b.points - a.points));
      } else {
        setEntries(await getLeaderboard(50));
      }
    } catch (e) {
      setError(friendlyError(e, "Classement indisponible."));
    }
  }, [meId, period, scope, profile]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const myIndex = useMemo(() => entries.findIndex((e) => e.id === meId), [entries, meId]);
  const top = entries.slice(0, 3);
  const rest = entries.slice(3);

  const addFriend = async () => {
    const normalized = normalizeFriendCode(code);
    if (normalized.length !== 8) {
      setFriendFeedback({ ok: false, text: "Un code ami contient 8 caractères." });
      return;
    }
    setSending(true);
    setFriendFeedback(null);
    try {
      const status = await sendFriendRequest(normalized);
      haptic.success();
      setCode("");
      setFriendFeedback({
        ok: true,
        text: status === "accepted" ? "Vous êtes maintenant amis ! 🎉" : "Demande envoyée ✉️",
      });
      await load();
    } catch (e) {
      haptic.error();
      setFriendFeedback({ ok: false, text: friendlyError(e) });
    } finally {
      setSending(false);
    }
  };

  const respond = async (id: string, accept: boolean) => {
    try {
      await respondFriendRequest(id, accept);
      if (accept) haptic.success();
      await load();
    } catch (e) {
      setFriendFeedback({ ok: false, text: friendlyError(e) });
    }
  };

  const unfriend = async (entry: LeaderboardEntry) => {
    const ok = await confirmAsync(
      "Retirer cet ami ?",
      `${entry.full_name ?? "Cet utilisateur"} ne sera plus dans votre classement.`,
      "Retirer",
      true,
    );
    if (!ok) return;
    try {
      await removeFriend(entry.id);
      await load();
    } catch (e) {
      setFriendFeedback({ ok: false, text: friendlyError(e) });
    }
  };

  const copyCode = async () => {
    const ok = await copyText(myCode);
    if (ok) haptic.success();
    setFriendFeedback(ok ? { ok: true, text: "Code copié !" } : { ok: false, text: "Copie impossible sur cet appareil." });
  };

  const shareCode = () => {
    void shareText(`Rejoins-moi sur Vexto 🌿 et défions-nous à qui évite le plus de CO₂ ! Mon code ami : ${myCode}`);
  };

  return (
    <ScreenContainer onRefresh={() => void onRefresh()} refreshing={refreshing}>
      <ScreenHeader title="Classement" subtitle="Qui évite le plus de CO₂ ?" right={<HeaderAvatar />} />

      <Segmented<Scope>
        value={scope}
        onChange={setScope}
        options={[
          { value: "global", label: "Général" },
          { value: "friends", label: `Amis${friends?.incoming.length ? ` (${friends.incoming.length})` : ""}` },
        ]}
      />

      <View className="mb-4 flex-row gap-2">
        {(["all", "week"] as const).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)} className="active:opacity-70" accessibilityRole="button">
            <Chip
              label={p === "all" ? "Depuis toujours" : "Cette semaine"}
              tone={period === p ? "leaf" : "muted"}
              icon={p === "all" ? "infinite-outline" : "calendar-outline"}
            />
          </Pressable>
        ))}
      </View>

      {notice ? <Banner tone="info" message={notice} /> : null}
      {error ? <Banner tone="danger" message={error} actionLabel="Réessayer" onAction={() => void onRefresh()} /> : null}

      {scope === "friends" ? (
        <>
          <Card className="mb-4">
            <Text className="text-xs font-bold uppercase text-muted">Votre code ami</Text>
            <View className="mt-1 flex-row items-center justify-between">
              <Text selectable className="text-2xl font-extrabold tracking-[4px] text-forest">
                {myCode}
              </Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => void copyCode()}
                  accessibilityRole="button"
                  accessibilityLabel="Copier le code"
                  className="h-10 w-10 items-center justify-center rounded-xl bg-leaf-soft active:opacity-70"
                >
                  <Icon name="copy-outline" size={18} color={colors.leaf} />
                </Pressable>
                <Pressable
                  onPress={shareCode}
                  accessibilityRole="button"
                  accessibilityLabel="Partager le code"
                  className="h-10 w-10 items-center justify-center rounded-xl bg-leaf-soft active:opacity-70"
                >
                  <Icon name="share-social-outline" size={18} color={colors.leaf} />
                </Pressable>
              </View>
            </View>
            <View className="mt-3 flex-row items-center gap-2">
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="Code d'un ami (ex. 3F2A9C1B)"
                placeholderTextColor={colors.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                className="h-12 min-w-0 flex-1 rounded-xl bg-mineral px-3 text-base text-forest"
                accessibilityLabel="Code ami"
                onSubmitEditing={() => void addFriend()}
              />
              <View className="w-28">
                <Button label="Ajouter" size="sm" icon="person-add-outline" onPress={() => void addFriend()} loading={sending} />
              </View>
            </View>
            {friendFeedback ? (
              <Text className={`mt-2 text-xs ${friendFeedback.ok ? "text-leaf" : "text-danger"}`}>{friendFeedback.text}</Text>
            ) : null}
          </Card>

          {friends && friends.incoming.length > 0 ? (
            <>
              <SectionHeader title="Demandes reçues" />
              <Card className="mb-4 gap-3">
                {friends.incoming.map((r) => (
                  <View key={r.id} className="flex-row items-center gap-3">
                    <Avatar name={r.profile?.full_name} seed={r.otherUserId} size={36} />
                    <Text className="flex-1 text-sm font-semibold text-forest" numberOfLines={1}>
                      {r.profile?.full_name ?? "Vextonaute"}
                    </Text>
                    <Pressable
                      onPress={() => void respond(r.id, false)}
                      accessibilityRole="button"
                      accessibilityLabel="Refuser"
                      className="h-9 w-9 items-center justify-center rounded-full border border-line active:opacity-70"
                    >
                      <Icon name="close" size={16} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => void respond(r.id, true)}
                      accessibilityRole="button"
                      accessibilityLabel="Accepter"
                      className="h-9 w-9 items-center justify-center rounded-full bg-leaf active:opacity-70"
                    >
                      <Icon name="checkmark" size={16} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {friends && friends.outgoing.length > 0 ? (
            <Text className="mb-3 text-xs text-muted">
              {friends.outgoing.length} {pluralize(friends.outgoing.length, "demande envoyée", "demandes envoyées")} en
              attente de réponse.
            </Text>
          ) : null}
        </>
      ) : null}

      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator color={colors.leaf} />
        </View>
      ) : entries.length === 0 || (scope === "friends" && entries.length <= 1 && (friends?.friends.length ?? 0) === 0) ? (
        <EmptyState
          emoji={scope === "friends" ? "🤝" : "🏁"}
          title={scope === "friends" ? "Invitez vos amis" : "Le classement est vide"}
          message={
            scope === "friends"
              ? "Partagez votre code ami : celui qui évite le plus de CO₂ cette semaine gagne le droit de frimer."
              : "Soyez le premier à valider un trajet bas-carbone !"
          }
          actionLabel={scope === "friends" ? "Partager mon code" : undefined}
          onAction={scope === "friends" ? shareCode : undefined}
        />
      ) : (
        <>
          <Podium top={top} meId={meId} onLongPress={scope === "friends" ? (e) => void unfriend(e) : undefined} />
          {rest.length > 0 ? (
            <Card className="mb-4 gap-1 p-2">
              {rest.map((e, i) => (
                <Pressable
                  key={e.id}
                  disabled={scope !== "friends" || e.id === meId}
                  onLongPress={() => void unfriend(e)}
                  accessibilityHint={scope === "friends" && e.id !== meId ? "Appui long pour retirer cet ami" : undefined}
                >
                  <RankRow entry={e} rank={i + 4} meId={meId} />
                </Pressable>
              ))}
            </Card>
          ) : null}
          {myIndex >= 0 ? (
            <Text className="text-center text-xs text-muted">
              Vous êtes {myIndex === 0 ? "en tête 🏆" : `${myIndex + 1}e`} sur {entries.length}
              {period === "week" ? " cette semaine" : ""}.
            </Text>
          ) : scope === "global" && profile ? (
            <Text className="text-center text-xs text-muted">
              Vous n'êtes pas encore dans le top {entries.length} : chaque trajet vert compte !
            </Text>
          ) : null}
          {scope === "friends" && (friends?.friends.length ?? 0) > 0 ? (
            <Text className="mt-2 text-center text-[11px] text-faint">Appui long sur un ami pour le retirer.</Text>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
