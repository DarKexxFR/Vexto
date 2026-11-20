/**
 * Imperative data refreshers shared by hooks, pull-to-refresh and post-trip
 * flows. They read the current user from the store so callers stay simple.
 */
import { getProfile } from "@/lib/profile";
import { listTrips } from "@/lib/trips";
import { useAppStore } from "@/store/useAppStore";

export async function refreshProfile(): Promise<void> {
  const { session, setProfile, setProfileStatus } = useAppStore.getState();
  const userId = session?.user.id;
  if (!userId) return;
  setProfileStatus("loading");
  try {
    const profile = await getProfile(userId);
    if (useAppStore.getState().session?.user.id !== userId) return;
    setProfile(profile);
    setProfileStatus("success");
  } catch {
    setProfileStatus("error");
  }
}

export async function refreshTrips(): Promise<void> {
  const { session, setTrips, setTripsStatus } = useAppStore.getState();
  const userId = session?.user.id;
  if (!userId) return;
  setTripsStatus("loading");
  try {
    const trips = await listTrips(userId);
    if (useAppStore.getState().session?.user.id !== userId) return;
    setTrips(trips);
    setTripsStatus("success");
  } catch {
    setTripsStatus("error");
  }
}

export async function refreshAll(): Promise<void> {
  await Promise.all([refreshProfile(), refreshTrips()]);
}
