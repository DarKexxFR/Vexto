import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { formatDistance } from "@/domain/format";
import { shortPlaceLabel, type Place } from "@/domain/places";
import { haptic } from "@/lib/haptics";
import {
  createSearchSession,
  retrieveSuggestion,
  searchSuggest,
  type SearchSuggestion,
} from "@/lib/mapbox";
import { colors } from "@/theme/colors";

interface AddressSearchInputProps {
  /** Leading marker: departure dot or destination pin. */
  kind: "start" | "end";
  placeholder: string;
  accessibilityLabel: string;
  value: Place | null;
  onSelect: (place: Place) => void;
  onClear: () => void;
  /** Bias suggestions around this position [lon, lat]. */
  proximity?: [number, number] | null;
  rightAccessory?: ReactNode;
  disabled?: boolean;
  /** Notified when the suggestions list opens/closes. */
  onActiveChange?: (active: boolean) => void;
}

const DEBOUNCE_MS = 300;

const TYPE_ICON: Record<string, IconName> = {
  poi: "location-outline",
  address: "home-outline",
  street: "map-outline",
  place: "business-outline",
  locality: "business-outline",
  neighborhood: "business-outline",
};

/** Debounced place search (Mapbox Search Box) with inline suggestions. */
export function AddressSearchInput({
  kind,
  placeholder,
  accessibilityLabel,
  value,
  onSelect,
  onClear,
  proximity,
  rightAccessory,
  disabled = false,
  onActiveChange,
}: AddressSearchInputProps) {
  const [text, setText] = useState(value ? shortPlaceLabel(value.label) : "");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<string>(createSearchSession());

  // Reflect external selections (GPS, swap, shortcuts).
  useEffect(() => {
    setText(value ? shortPlaceLabel(value.label) : "");
    setSuggestions([]);
    setOpen(false);
  }, [value]);

  useEffect(() => {
    onActiveChange?.(open && suggestions.length > 0);
  }, [open, suggestions.length, onActiveChange]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    };
  }, []);

  const onChangeText = (input: string) => {
    setText(input);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();

    if (input.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    timer.current = setTimeout(async () => {
      const ac = new AbortController();
      controller.current = ac;
      setLoading(true);
      try {
        const results = await searchSuggest(input, session.current, ac.signal, proximity);
        if (ac.signal.aborted) return;
        setSuggestions(results);
        setOpen(true);
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(e instanceof Error ? e.message : "Recherche d'adresse indisponible.");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const pick = async (suggestion: SearchSuggestion) => {
    haptic.tap();
    setText(suggestion.name);
    setSuggestions([]);
    setOpen(false);
    setLoading(true);
    try {
      const result = await retrieveSuggestion(suggestion.id, session.current);
      const label = result.placeName.startsWith(result.shortName)
        ? result.placeName
        : `${result.shortName}, ${result.placeName}`;
      onSelect({ label, coords: result.coordinates });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Localisation indisponible.");
    } finally {
      setLoading(false);
      // A retrieve closes the billing session — start a fresh one next time.
      session.current = createSearchSession();
    }
  };

  const clear = () => {
    setText("");
    setSuggestions([]);
    setOpen(false);
    setError(null);
    onClear();
  };

  return (
    <View>
      <View className="flex-row items-center gap-2">
        <View className="h-12 flex-1 flex-row items-center gap-2 rounded-xl bg-mineral px-3">
          {kind === "start" ? (
            <View className="h-3 w-3 rounded-full border-[3px] border-forest bg-white" />
          ) : (
            <Icon name="location" size={16} color={colors.leaf} />
          )}
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.faint}
            editable={!disabled}
            accessibilityLabel={accessibilityLabel}
            className="h-full min-w-0 flex-1 text-base text-forest"
            autoCorrect={false}
            returnKeyType="search"
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
          />
          {loading ? <ActivityIndicator size="small" color={colors.leaf} /> : null}
          {!loading && text.length > 0 ? (
            <Pressable onPress={clear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer">
              <Icon name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>
        {rightAccessory}
      </View>

      {error ? <Text className="ml-1 mt-1 text-xs text-danger">{error}</Text> : null}

      {open && suggestions.length > 0 ? (
        <View className="mt-2 overflow-hidden rounded-xl border border-line bg-card">
          {suggestions.map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => {
                void pick(s);
              }}
              accessibilityRole="button"
              className={`flex-row items-center gap-3 px-3 py-3 active:bg-mineral ${i > 0 ? "border-t border-line" : ""}`}
            >
              <Icon name={TYPE_ICON[s.featureType ?? ""] ?? "location-outline"} size={18} color={colors.muted} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-forest" numberOfLines={1}>
                  {s.name}
                </Text>
                {s.context ? (
                  <Text className="text-xs text-muted" numberOfLines={1}>
                    {s.context}
                  </Text>
                ) : null}
              </View>
              {s.distanceM != null ? (
                <Text className="text-xs text-faint">{formatDistance(s.distanceM / 1000)}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : open && !loading && text.trim().length >= 2 && suggestions.length === 0 ? (
        <Text className="ml-1 mt-2 text-xs text-muted">Aucun résultat pour « {text.trim()} ».</Text>
      ) : null}
    </View>
  );
}
