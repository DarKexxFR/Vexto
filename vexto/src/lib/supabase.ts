import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { config, isSupabaseConfigured } from "@/lib/config";
import type { Database } from "@/types/database";

/**
 * Typed Supabase client for Vexto. Sessions persist via AsyncStorage on native
 * (web falls back to the default localStorage), so the user stays logged in
 * across app reloads. Without credentials a harmless placeholder client is
 * created and the app shows its setup screen instead of crashing.
 */
export const supabase = createClient<Database>(
  isSupabaseConfigured ? config.supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? config.supabaseAnonKey : "placeholder-anon-key-not-configured",
  {
    auth: {
      storage: Platform.OS === "web" ? undefined : AsyncStorage,
      autoRefreshToken: isSupabaseConfigured,
      persistSession: true,
      // Web: finish OAuth / password-reset redirects (?code=…) on page load.
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  },
);
