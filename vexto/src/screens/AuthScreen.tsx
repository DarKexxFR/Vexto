import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Provider } from "@supabase/supabase-js";

import { Button } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import {
  authErrorMessage,
  requestPasswordReset,
  signIn,
  signInWithProvider,
  signUp,
} from "@/lib/auth";
import { colors } from "@/theme/colors";

type Mode = "signin" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface FieldProps extends Omit<TextInputProps, "className"> {
  label: string;
  icon: IconName;
  inputRef?: React.Ref<TextInput>;
  right?: React.ReactNode;
}

function Field({ label, icon, inputRef, right, ...input }: FieldProps) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs font-semibold uppercase text-muted">{label}</Text>
      <View className="h-14 flex-row items-center gap-2 rounded-2xl border border-line bg-card px-4">
        <Icon name={icon} size={18} color={colors.muted} />
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.faint}
          autoCorrect={false}
          className="h-full min-w-0 flex-1 text-base text-forest"
          accessibilityLabel={label}
          {...input}
        />
        {right}
      </View>
    </View>
  );
}

interface SocialButtonProps {
  icon: IconName;
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

function SocialButton({ icon, label, loading, disabled, onPress }: SocialButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`mb-3 h-14 flex-row items-center justify-center gap-2 rounded-2xl border border-line bg-card px-5 ${
        disabled ? "opacity-50" : "active:opacity-80"
      }`}
    >
      {loading ? (
        <ActivityIndicator color={colors.forest} />
      ) : (
        <>
          <Icon name={icon} size={20} />
          <Text className="text-base font-semibold text-forest">{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const PERKS = [
  { emoji: "🌱", text: "Des points pour chaque gramme de CO₂ évité" },
  { emoji: "🏆", text: "Un classement entre amis, chaque semaine" },
  { emoji: "🎁", text: "Des récompenses chez nos partenaires" },
];

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const isSignup = mode === "signup";
  const busy = loading || oauthLoading !== null;
  const emailValid = EMAIL_RE.test(email.trim());

  const canSubmit =
    emailValid && password.length >= 6 && (!isSignup || fullName.trim().length > 1);

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
        const { needsEmailConfirmation } = await signUp(email, password, fullName);
        if (needsEmailConfirmation) {
          setInfo("Compte créé ! Confirmez votre adresse via l'email reçu, puis connectez-vous.");
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

  const forgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!emailValid) {
      setError("Saisissez d'abord votre email ci-dessus.");
      emailRef.current?.focus();
      return;
    }
    try {
      await requestPasswordReset(email);
      setInfo("Si un compte existe, un lien de réinitialisation vient d'être envoyé.");
    } catch (e) {
      setError(authErrorMessage(e));
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={[colors.forest, colors.forestSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: insets.top + 36,
              paddingBottom: 44,
              paddingHorizontal: 24,
              borderBottomLeftRadius: 32,
              borderBottomRightRadius: 32,
            }}
          >
            <View className="items-center">
              <View className="mb-3 h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
                <Text className="text-3xl">🌿</Text>
              </View>
              <Text className="text-3xl font-extrabold text-white">Vexto</Text>
              <Text className="mt-1 text-center text-sm text-white/75">
                {isSignup
                  ? "Créez votre compte et faites pousser votre forêt."
                  : "Bougez mieux, gagnez des points, faites pousser votre forêt."}
              </Text>
            </View>
            {isSignup ? (
              <View className="mt-5 gap-2">
                {PERKS.map((p) => (
                  <View key={p.text} className="flex-row items-center gap-2">
                    <Text className="text-base">{p.emoji}</Text>
                    <Text className="text-sm text-white/85">{p.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </LinearGradient>

          <View className="px-6 pt-6">
            {isSignup ? (
              <Field
                label="Prénom et nom"
                icon="person-outline"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Camille Martin"
                autoCapitalize="words"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            ) : null}

            <Field
              label="Email"
              icon="mail-outline"
              inputRef={emailRef}
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.fr"
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <Field
              label="Mot de passe"
              icon="lock-closed-outline"
              inputRef={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder="Au moins 6 caractères"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType={isSignup ? "newPassword" : "password"}
              returnKeyType="go"
              onSubmitEditing={() => {
                void submit();
              }}
              right={
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              }
            />

            {!isSignup ? (
              <Pressable onPress={() => void forgotPassword()} className="mb-2 self-end" hitSlop={8}>
                <Text className="text-sm font-semibold text-leaf">Mot de passe oublié ?</Text>
              </Pressable>
            ) : null}

            {error ? (
              <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-danger-soft px-3 py-2">
                <Icon name="alert-circle-outline" size={18} color={colors.danger} />
                <Text className="flex-1 text-sm text-danger">{error}</Text>
              </View>
            ) : null}
            {info ? (
              <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-leaf-soft px-3 py-2">
                <Icon name="checkmark-circle" size={18} color={colors.leaf} />
                <Text className="flex-1 text-sm text-forest">{info}</Text>
              </View>
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
              icon="logo-google"
              label="Continuer avec Google"
              loading={oauthLoading === "google"}
              disabled={busy}
              onPress={() => {
                void handleOAuth("google");
              }}
            />
            {Platform.OS === "ios" ? (
              <SocialButton
                icon="logo-apple"
                label="Continuer avec Apple"
                loading={oauthLoading === "apple"}
                disabled={busy}
                onPress={() => {
                  void handleOAuth("apple");
                }}
              />
            ) : null}

            <View className="mt-4 flex-row justify-center">
              <Text className="text-sm text-muted">
                {isSignup ? "Déjà un compte ? " : "Pas encore de compte ? "}
              </Text>
              <Text onPress={switchMode} className="text-sm font-semibold text-leaf" accessibilityRole="button">
                {isSignup ? "Se connecter" : "Créer un compte"}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
