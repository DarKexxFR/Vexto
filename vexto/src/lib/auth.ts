import { Platform } from "react-native";
import type { Provider, Session } from "@supabase/supabase-js";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";

import { supabase } from "@/lib/supabase";

// Dismiss the in-app browser automatically once auth completes.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where the OAuth provider sends the user back to. Native: deep link into the
 * app. Web: the exact page the app is served from (e.g.
 * https://darkexxfr.github.io/Vexto/), including the GitHub Pages sub-path
 * that makeRedirectUri() would drop.
 */
function webRedirect(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname.endsWith("/") ? pathname : pathname.replace(/[^/]*$/, "")}`;
}
const redirectTo = Platform.OS === "web" ? webRedirect() : makeRedirectUri();

export interface SignUpResult {
  session: Session | null;
  /** True when the project requires email confirmation before first login. */
  needsEmailConfirmation: boolean;
}

/** Create an account. `full_name` is stored in user metadata and copied to the
 * profile row by the `handle_new_user` trigger. */
export async function signUp(
  email: string,
  password: string,
  fullName: string,
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw error;
  return {
    session: data.session,
    needsEmailConfirmation: data.session === null,
  };
}

/** Sign in with email + password. */
export async function signIn(
  email: string,
  password: string,
): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.session;
}

/** Exchange the data returned in the redirect URL for a Supabase session. */
async function createSessionFromUrl(url: string): Promise<void> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  // PKCE flow: the provider returns an authorization code.
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }

  // Implicit flow fallback: tokens come back directly in the URL.
  const { access_token, refresh_token } = params;
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
  }
}

/**
 * Sign in with a third-party provider (Google, Apple…) via the system browser.
 * Works in Expo Go — no native sign-in modules required. The resulting session
 * is picked up by the `onAuthStateChange` listener.
 */
export async function signInWithProvider(provider: Provider): Promise<void> {
  if (Platform.OS === "web") {
    // Full-page redirect: popups get blocked and lose the PKCE verifier.
    // On return, supabase-js exchanges ?code= automatically (detectSessionInUrl).
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("URL d'authentification introuvable.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === "success") {
    await createSessionFromUrl(result.url);
  } else if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("Connexion annulée.");
  }
}

/** Send a password-reset email (the link opens the app via its scheme). */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Human-friendly French messages for common Supabase auth errors. */
export function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login")) return "Email ou mot de passe incorrect.";
  if (msg.includes("email not confirmed"))
    return "Confirmez d'abord votre adresse via l'email reçu à l'inscription.";
  if (msg.includes("already registered") || msg.includes("already exists"))
    return "Un compte existe déjà avec cet email.";
  if (msg.includes("password") && msg.includes("at least"))
    return "Le mot de passe doit contenir au moins 6 caractères.";
  if (msg.includes("unable to validate email") || msg.includes("invalid email"))
    return "Adresse email invalide.";
  if (msg.includes("rate limit") || msg.includes("too many"))
    return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  if (msg.includes("network") || msg.includes("failed to fetch"))
    return "Problème de connexion réseau.";
  return raw;
}
