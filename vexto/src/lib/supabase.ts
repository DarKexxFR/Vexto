import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";
import type { Database } from "@/types/database";

/**
 * Typed Supabase client for Vexto. Sessions persist via AsyncStorage on native
 * (web falls back to the default localStorage), so the user stays logged in
 * across app reloads.
 */
export const supabase = createClient<Database>(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      storage: Platform.OS === "web" ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // On web the OAuth / email-confirmation callback comes back as a URL on
      // the same page, so Supabase must parse it to establish the session. On
      // native there is no callback URL to read (deep links are handled
      // manually in @/lib/auth), so we keep it off to avoid false positives.
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  },
);
