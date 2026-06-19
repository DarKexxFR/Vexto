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
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);
