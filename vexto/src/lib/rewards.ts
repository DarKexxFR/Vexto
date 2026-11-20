import { isMissingBackendFeature } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type { RedemptionRow, RewardRow } from "@/types/database";

/** Public reward fields (voucher codes are only revealed after redemption). */
export type Reward = Pick<
  RewardRow,
  "id" | "brand_name" | "title" | "points_cost" | "expiration_date" | "active"
>;

export type Redemption = Pick<RedemptionRow, "id" | "reward_id" | "points_spent" | "created_at"> & {
  voucher_code: string | null;
  reward_title: string | null;
  brand_name: string | null;
};

export async function listRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from("rewards")
    .select("id, brand_name, title, points_cost, expiration_date, active")
    .eq("active", true)
    .order("points_cost", { ascending: true });
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  return (data ?? []).filter((r) => !r.expiration_date || r.expiration_date >= today);
}

/** Atomically spend points and reveal the voucher (migration 0006). */
export async function redeemReward(rewardId: string): Promise<Redemption> {
  const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId });
  if (error) throw error;
  const row = data as RedemptionRow;
  return {
    id: row.id,
    reward_id: row.reward_id,
    points_spent: Number(row.points_spent) || 0,
    created_at: row.created_at,
    voucher_code: row.voucher_code ?? null,
    reward_title: row.reward_title ?? null,
    brand_name: row.brand_name ?? null,
  };
}

export async function listRedemptions(userId: string): Promise<Redemption[]> {
  const res = await supabase
    .from("redemptions")
    .select("id, reward_id, points_spent, created_at, voucher_code, reward_title, brand_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (res.error) {
    if (isMissingBackendFeature(res.error)) return [];
    throw res.error;
  }
  return (res.data ?? []).map((r) => ({
    id: r.id,
    reward_id: r.reward_id,
    points_spent: Number(r.points_spent) || 0,
    created_at: r.created_at,
    voucher_code: r.voucher_code ?? null,
    reward_title: r.reward_title ?? null,
    brand_name: r.brand_name ?? null,
  }));
}
