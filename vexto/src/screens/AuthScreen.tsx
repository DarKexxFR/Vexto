import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Provider } from "@supabase/supabase-js";

import { Button } from "@/components/Button";
import {
  authErrorMessage,
  signIn,
  signInWithProvider,
  signUp,
} from "@/lib/auth";
import { colors } from "@/theme/colors";

type Mode = "signin" | "signup";

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = "default",
  autoCapitalize = "none",
}: FieldProps) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs font-semibold uppercase text-muted">
        {label}
      </Text>
      <View className="h-12 flex-row items-center rounded-xl border border-line bg-card px-3">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          className="flex-1 text-base text-forest"
        />
      </View>
    </View>
  );
}

interface SocialButtonProps {
  icon: string;
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

function SocialButton({
  icon,
  label,
  loading,
  disabled,
  onPress,
}: SocialButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`mb-3 h-13 flex-row items-center justify-center gap-2 rounded-2xl border border-line bg-card px-5 py-4 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator color={colors.forest} />
      ) : (
        <>
          <Text className="text-base font-bold text-forest">{icon}</Text>
          <Text className="text-base font-semibold text-forest">{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const busy = loading || oauthLoading !== null;

  const canSubmit =
    email.trim().length > 3 &&
    password.length >= 6 &&
    (!isSignup || fullName.trim().length > 1);

  const switchMode = () => {
    setMode(isSignup ? "signin" : "signup");
    setError(null);
    setInfo(null);
  };

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (isSignup) {
        const { needsEmailConfirmation } = await signUp(
          email,
          password,
          fullName,
        );
        if (needsEmailConfirmation) {
          setInfo(
            "Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.",
          );
          setMode("signin");
        }
        // Otherwise onAuthStateChange logs the user in automatically.
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: Provider) => {
    if (busy) return;
    setOauthLoading(provider);
    setError(null);
    setInfo(null);
    try {
      await signInWithProvider(provider);
    } catch (e) {
      const msg = authErrorMessage(e);
      // Don't surface a scary error when the user simply closed the browser.
      if (msg !== "Connexion annulée.") setError(msg);
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <View className="flex-1 bg-mineral">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 items-center">
            <View className="mb-3 h-16 w-16 items-center justify-center rounded-2xl bg-forest">
              <Text className="text-3xl">🌿</Text>
            </View>
            <Text className="text-3xl font-bold text-forest">Vexto</Text>
            <Text className="mt-1 text-center text-sm text-muted">
              {isSignup
                ? "Créez votre compte et réduisez votre empreinte carbone."
                : "Connectez-vous pour suivre vos trajets et vos points."}
            </Text>
          </View>

          {isSignup ? (
            <Field
              label="Nom complet"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Votre nom"
              autoCapitalize="words"
            />
          ) : null}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="vous@exemple.fr"
            keyboardType="email-address"
          />

          <Field
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            placeholder="Au moins 6 caractères"
            secureTextEntry
          />

          {error ? (
            <Text className="mb-3 text-sm text-danger">{error}</Text>
          ) : null}
          {info ? (
            <Text className="mb-3 text-sm text-leaf">{info}</Text>
          ) : null}

          <View className="mt-2">
            <Button
              label={isSignup ? "Créer mon compte" : "Se connecter"}
              onPress={() => {
                void submit();
              }}
              loading={loading}
              disabled={!canSubmit || oauthLoading !== null}
            />
          </View>

          <View className="my-5 flex-row items-center">
            <View className="h-px flex-1 bg-line" />
            <Text className="mx-3 text-xs uppercase text-muted">ou</Text>
            <View className="h-px flex-1 bg-line" />
          </View>

          <SocialButton
            icon="G"
            label="Continuer avec Google"
            loading={oauthLoading === "google"}
            disabled={busy}
            onPress={() => {
              void handleOAuth("google");
            }}
          />
          {Platform.OS === "ios" ? (
            <SocialButton
              icon=""
              label="Continuer avec Apple"
              loading={oauthLoading === "apple"}
              disabled={busy}
              onPress={() => {
                void handleOAuth("apple");
              }}
            />
          ) : null}

          <View className="mt-5 flex-row justify-center">
            <Text className="text-sm text-muted">
              {isSignup ? "Déjà un compte ? " : "Pas encore de compte ? "}
            </Text>
            <Text
              onPress={switchMode}
              className="text-sm font-semibold text-leaf"
            >
              {isSignup ? "Se connecter" : "Créer un compte"}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
