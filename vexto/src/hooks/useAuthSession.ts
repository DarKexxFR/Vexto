import { useEffect, useState } from "react";

import { getProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";

/**
 * Bootstraps auth: restores any persisted session, keeps the store in sync with
 * Supabase auth changes, and loads the matching profile row. Returns `ready`
 * once the initial session check has completed (used to gate the UI splash).
 */
export function useAuthSession(): { ready: boolean } {
  const [ready, setReady] = useState(false);
  const setSession = useAppStore((s) => s.setSession);
  const setProfile = useAppStore((s) => s.setProfile);
  const setProfileStatus = useAppStore((s) => s.setProfileStatus);
  const reset = useAppStore((s) => s.reset);

  useEffect(() => {
    let active = true;

    const loadProfile = async (userId: string) => {
      setProfileStatus("loading");
      try {
        const profile = await getProfile(userId);
        if (!active) return;
        setProfile(profile);
        setProfileStatus("success");
      } catch {
        if (!active) return;
        setProfileStatus("error");
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) void loadProfile(data.session.user.id);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSession(session);
      if (session) {
        void loadProfile(session.user.id);
      } else {
        reset();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ready };
}
