import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { HeaderAvatar } from "@/components/HeaderAvatar";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Banner, Chip, ProgressBar, ScreenHeader, SectionHeader } from "@/components/ui";
import { DEMO_REWARDS } from "@/constants/sampleData";
import { formatInt, formatRelativeDay } from "@/domain/format";
import { useUserStats } from "@/hooks/useUserStats";
import { confirmAsync } from "@/lib/dialogs";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { listRedemptions, listRewards, redeemReward, type Redemption, type Reward } from "@/lib/rewards";
import { copyText } from "@/lib/share";
import { refreshProfile } from "@/lib/sync";
import { useAppStore } from "@/store/useAppStore";
import { avatarColor, colors } from "@/theme/colors";

interface CatalogItem {
  id: string;
  brand: string;
  title: string;
  cost: number;
  tile: string;
  demo: boolean;
}

function toItem(r: Reward): CatalogItem {
  return { id: r.id, brand: r.brand_name, title: r.title, cost: r.points_cost, tile: avatarColor(r.brand_name), demo: false };
}

export function RewardsScreen() {
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const applyRedemption = useAppStore((s) => s.applyRedemption);
  const stats = useUserStats();
  const credits = stats.available;

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<Redemption | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rewards = await listRewards();
      if (rewards.length > 0) {
        setCatalog(rewards.map(toItem));
        setIsDemo(false);
      } else {
        setCatalog(DEMO_REWARDS.map((d) => ({ ...d, demo: true })));
        setIsDemo(true);
      }
    } catch (e) {
      setCatalog(DEMO_REWARDS.map((d) => ({ ...d, demo: true })));
      setIsDemo(true);
      setError(friendlyError(e, "Catalogue indisponible."));
    }
    if (session?.user.id) {
      try {
        setRedemptions(await listRedemptions(session.user.id));
      } catch {
        // history is secondary
      }
    }
  }, [session?.user.id]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshProfile()]);
    setRefreshing(false);
  };

  const redeem = async (item: CatalogItem) => {
    const ok = await confirmAsync(
      `Échanger ${formatInt(item.cost)} crédits ?`,
      `${item.brand} — ${item.title}`,
      "Échanger",
    );
    if (!ok) return;
    setBusyId(item.id);
    try {
      const redemption = await redeemReward(item.id);
      applyRedemption(redemption.points_spent);
      haptic.success();
      setCopied(false);
      setVoucher(redemption);
      setRedemptions((prev) => [redemption, ...prev]);
      void refreshProfile();
    } catch (e) {
      haptic.error();
      setError(friendlyError(e, "Échange impossible."));
    } finally {
      setBusyId(null);
    }
  };

  const copyVoucher = async () => {
    if (!voucher?.voucher_code) return;
    if (await copyText(voucher.voucher_code)) {
      haptic.success();
      setCopied(true);
    }
  };

  const spent = profile?.spent_points ?? 0;

  return (
    <ScreenContainer onRefresh={() => void onRefresh()} refreshing={refreshing}>
      <ScreenHeader title="Récompenses" subtitle="Vos trajets verts valent de vrais avantages." right={<HeaderAvatar />} />

      <LinearGradient
        colors={[colors.forest, colors.forestSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, padding: 20, marginBottom: 16 }}
      >
        <Text className="text-sm text-white/70">Crédits disponibles</Text>
        <Text className="mt-1 text-4xl font-extrabold text-white">{formatInt(credits)}</Text>
        <Text className="mt-1 text-xs text-white/60">
          {formatInt(stats.points)} gagnés{spent > 0 ? ` · ${formatInt(spent)} échangés` : ""} · 1 crédit = 100 g de CO₂ évité
        </Text>
      </LinearGradient>

      {isDemo ? (
        <Banner
          tone="info"
          title="Catalogue de démonstration"
          message="Aucune offre active pour le moment. Ajoutez vos partenaires dans la table « rewards » de Supabase."
        />
      ) : null}
      {error ? <Banner tone="danger" message={error} /> : null}

      <SectionHeader title="Catalogue" />
      {loading ? (
        <View className="items-center py-8">
          <ActivityIndicator color={colors.leaf} />
        </View>
      ) : (
        <View className="mb-5 gap-3">
          {catalog.map((item) => {
            const affordable = credits >= item.cost;
            const missing = Math.max(0, item.cost - credits);
            return (
              <Card key={item.id}>
                <View className="flex-row items-center gap-3">
                  <View className="h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: item.tile }}>
                    <Text className="text-base font-extrabold text-white">{item.brand.slice(0, 1)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-forest">{item.brand}</Text>
                    <Text className="text-xs text-muted">{item.title}</Text>
                  </View>
                  <Chip label={`${formatInt(item.cost)} pts`} tone={affordable ? "leaf" : "muted"} />
                </View>
                <View className="mt-3">
                  {affordable && !item.demo ? (
                    <Button
                      label="Échanger"
                      size="sm"
                      variant="secondary"
                      icon="gift-outline"
                      loading={busyId === item.id}
                      disabled={busyId !== null}
                      onPress={() => void redeem(item)}
                    />
                  ) : (
                    <>
                      <ProgressBar value={credits / item.cost} height={6} color={colors.leafBright} />
                      <Text className="mt-1.5 text-xs text-muted">
                        {item.demo
                          ? "Offre de démonstration"
                          : `Encore ${formatInt(missing)} pts — environ ${formatInt(Math.ceil(missing / 21))} trajets de 10 km en transports`}
                      </Text>
                    </>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {redemptions.length > 0 ? (
        <>
          <SectionHeader title="Mes récompenses" />
          <Card className="gap-3">
            {redemptions.map((r, i) => (
              <View key={r.id} className={`flex-row items-center gap-3 ${i > 0 ? "border-t border-line pt-3" : ""}`}>
                <Text className="text-2xl">🎟️</Text>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-forest" numberOfLines={1}>
                    {r.brand_name ?? "Récompense"} · {r.reward_title ?? ""}
                  </Text>
                  <Text className="text-xs text-muted">
                    {formatRelativeDay(new Date(r.created_at))} · {formatInt(r.points_spent)} pts
                  </Text>
                </View>
                {r.voucher_code ? (
                  <Text selectable className="text-sm font-extrabold tracking-wider text-leaf">
                    {r.voucher_code}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Modal visible={voucher !== null} transparent animationType="fade" onRequestClose={() => setVoucher(null)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-[420px] rounded-3xl bg-card p-6">
            <Text className="text-center text-5xl">🎁</Text>
            <Text className="mt-2 text-center text-xl font-extrabold text-forest">C'est à vous !</Text>
            <Text className="mt-1 text-center text-sm text-muted">
              {voucher?.brand_name} · {voucher?.reward_title}
            </Text>
            <View className="mt-4 items-center rounded-2xl border-2 border-dashed border-leaf bg-leaf-soft py-4">
              <Text className="text-xs uppercase text-muted">Votre code</Text>
              <Text selectable className="mt-1 text-2xl font-extrabold tracking-[3px] text-forest">
                {voucher?.voucher_code ?? "Présentez cet écran en caisse"}
              </Text>
            </View>
            <View className="mt-5 gap-2">
              {voucher?.voucher_code ? (
                <Button
                  label={copied ? "Code copié ✓" : "Copier le code"}
                  icon="copy-outline"
                  variant="secondary"
                  onPress={() => void copyVoucher()}
                />
              ) : null}
              <Button label="Fermer" variant="ghost" onPress={() => setVoucher(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
