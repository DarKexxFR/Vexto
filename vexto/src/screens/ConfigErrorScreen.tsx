import { Text, View } from "react-native";

import { Card } from "@/components/Card";
import { ScreenContainer } from "@/components/ScreenContainer";

const STEPS = [
  "Copiez .env.example vers .env à la racine du dossier vexto/",
  "Renseignez SUPABASE_URL et SUPABASE_ANON_KEY (Supabase → Settings → API)",
  "Ajoutez MAPBOX_TOKEN (pk.…) pour la carte et les itinéraires",
  "Relancez avec : npx expo start -c",
];

/** Shown instead of crashing when the Supabase keys are missing. */
export function ConfigErrorScreen() {
  return (
    <ScreenContainer edges={["top", "bottom"]} contentClassName="pt-10">
      <View className="mb-6 items-center">
        <View className="mb-3 h-16 w-16 items-center justify-center rounded-2xl bg-forest">
          <Text className="text-3xl">🌿</Text>
        </View>
        <Text className="text-2xl font-bold text-forest">Configuration requise</Text>
        <Text className="mt-1 text-center text-sm text-muted">
          Vexto a besoin de vos clés Supabase pour démarrer.
        </Text>
      </View>
      <Card>
        {STEPS.map((step, i) => (
          <View key={step} className={`flex-row gap-3 ${i > 0 ? "mt-3" : ""}`}>
            <View className="h-6 w-6 items-center justify-center rounded-full bg-leaf-soft">
              <Text className="text-xs font-bold text-leaf">{i + 1}</Text>
            </View>
            <Text className="flex-1 text-sm text-forest">{step}</Text>
          </View>
        ))}
      </Card>
    </ScreenContainer>
  );
}
