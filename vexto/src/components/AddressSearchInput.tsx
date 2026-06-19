import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors } from "@/theme/colors";
import {
  createSearchSession,
  retrieveSuggestion,
  searchSuggest,
  type GeocodeResult,
  type SearchSuggestion,
} from "@/lib/mapbox";

interface AddressSearchInputProps {
  label: string;
  placeholder: string;
  /** External label to display (e.g. set after a GPS lookup). */
  selectedLabel?: string | null;
  onSelect: (result: GeocodeResult) => void;
  /** Optional trailing control, e.g. a "use my location" button. */
  rightAccessory?: React.ReactNode;
  disabled?: boolean;
}

const DEBOUNCE_MS = 350;

export function AddressSearchInput({
  label,
  placeholder,
  selectedLabel,
  onSelect,
  rightAccessory,
  disabled = false,
}: AddressSearchInputProps) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const session = useRef<string>(createSearchSession());

  useEffect(() => {
    if (selectedLabel != null) {
      setText(selectedLabel);
      setSuggestions([]);
      setOpen(false);
    }
  }, [selectedLabel]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    };
  }, []);

  const onChangeText = (value: string) => {
    setText(value);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();

    if (value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    timer.current = setTimeout(async () => {
      const ac = new AbortController();
      controller.current = ac;
      setLoading(true);
      try {
        const results = await searchSuggest(value, session.current, ac.signal);
        setSuggestions(results);
        setOpen(true);
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(
            e instanceof Error ? e.message : "Recherche d'adresse indisponible.",
          );
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const pick = async (suggestion: SearchSuggestion) => {
    setText(suggestion.name);
    setSuggestions([]);
    setOpen(false);
    setLoading(true);
    try {
      const result = await retrieveSuggestion(suggestion.id, session.current);
      onSelect(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Localisation indisponible.");
    } finally {
      setLoading(false);
      // A retrieve closes the billing session — start a fresh one next time.
      session.current = createSearchSession();
    }
  };

  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs font-semibold uppercase text-muted">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <View className="h-12 flex-1 flex-row items-center rounded-xl border border-line bg-card px-3">
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            editable={!disabled}
            className="flex-1 text-base text-forest"
            autoCorrect={false}
          />
          {loading ? <ActivityIndicator size="small" color={colors.leaf} /> : null}
        </View>
        {rightAccessory}
      </View>

      {error ? <Text className="mt-1 text-xs text-danger">{error}</Text> : null}

      {open && suggestions.length > 0 ? (
        <View className="mt-1 overflow-hidden rounded-xl border border-line bg-card">
          {suggestions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => {
                void pick(s);
              }}
              className="border-b border-line px-3 py-3"
            >
              <Text className="text-sm font-medium text-forest" numberOfLines={1}>
                {s.name}
              </Text>
              {s.context ? (
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {s.context}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
