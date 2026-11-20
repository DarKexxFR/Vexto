import { getProfilesByIds, type LeaderboardEntry } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

/**
 * Shareable 8-character friend code derived from the user id. Must match the
 * SQL `public.friend_code()` function (migration 0006).
 */
export function friendCode(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Keep only hexadecimal characters, upper-cased ("ab12-cd34" → "AB12CD34"). */
export function normalizeFriendCode(input: string): string {
  return input.replace(/[^0-9a-fA-F]/g, "").toUpperCase().slice(0, 8);
}

export interface FriendRequest {
  id: string;
  otherUserId: string;
  createdAt: string;
  profile: LeaderboardEntry | null;
}

export interface FriendsData {
  friends: LeaderboardEntry[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** Accepted friends plus pending requests in both directions. */
export async function loadFriends(myId: string): Promise<FriendsData> {
  const { data, error } = await supabase
    .from("friendships")
    .select("id, user_id_1, user_id_2, status, requested_by, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const otherOf = (r: (typeof rows)[number]) => (r.user_id_1 === myId ? r.user_id_2 : r.user_id_1);
  const ids = [...new Set(rows.map(otherOf))];
  const profiles = await getProfilesByIds(ids);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const friends: LeaderboardEntry[] = [];
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];
  for (const r of rows) {
    const other = otherOf(r);
    const profile = byId.get(other) ?? null;
    if (r.status === "accepted") {
      if (profile) friends.push(profile);
    } else if (r.status === "pending") {
      const req: FriendRequest = { id: r.id, otherUserId: other, createdAt: r.created_at, profile };
      if (r.requested_by === myId) outgoing.push(req);
      else incoming.push(req);
    }
  }
  return { friends, incoming, outgoing };
}

/** Returns "accepted" when the other person had already invited you. */
export async function sendFriendRequest(code: string): Promise<"pending" | "accepted"> {
  const { data, error } = await supabase.rpc("send_friend_request", {
    p_code: normalizeFriendCode(code),
  });
  if (error) throw error;
  return data?.status === "accepted" ? "accepted" : "pending";
}

export async function respondFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_friend_request", {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function removeFriend(friendId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_friend", { p_friend_id: friendId });
  if (error) throw error;
}
