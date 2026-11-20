import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { refreshAll } from "@/lib/sync";
import { useAppStore } from "@/store/useAppStore";

/**
 * Bootstraps auth: restores any persisted session, keeps the store in sync with
 * Supabase auth changes, and loads the user's profile + trips once per user.
 * Returns `ready` once the initial session check has completed.
 */
export function useAuthSession(): { ready: boolean } {
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    let loadedFor: string | null = null;

    const onSession = (session: Session | null) => {
      const store = useAppStore.getState();
      const userId = session?.user.id ?? null;
      if (!userId) {
        loadedFor = null;
        store.reset();
        return;
      }
      store.setSession(session);
      if (userId !== loadedFor) {
        loadedFor = userId;
        void refreshAll();
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        onSession(data.session);
      })
      .catch(() => {
        // offline at startup: show the auth screen rather than a spinner forever
      })
      .finally(() => {
        if (active) setReady(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) onSession(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { ready };
}
