/**
 * Turn abstract kilograms of CO₂e into things people can picture. Orders of
 * magnitude from ADEME (base Empreinte / impactco2.fr); the car factor is the
 * same one the app uses for points so everything stays consistent.
 */
import { EMISSION_FACTORS } from "@/domain/carbon";
import { formatDecimal, formatInt } from "@/domain/format";

export interface Equivalence {
  id: string;
  icon: string;
  /** kg CO₂e represented by one unit. */
  kgPerUnit: number;
  singular: string;
  plural: string;
}

const PARIS_LYON_KM = 465;

export const EQUIVALENCES: readonly Equivalence[] = [
  {
    id: "car_km",
    icon: "🚗",
    kgPerUnit: EMISSION_FACTORS.carThermal,
    singular: "km en voiture évité",
    plural: "km en voiture évités",
  },
  {
    id: "beef_meal",
    icon: "🍔",
    kgPerUnit: 7.26,
    singular: "repas avec du bœuf",
    plural: "repas avec du bœuf",
  },
  {
    id: "jeans",
    icon: "👖",
    kgPerUnit: 23.2,
    singular: "jean neuf fabriqué",
    plural: "jeans neufs fabriqués",
  },
  {
    id: "tree_year",
    icon: "🌳",
    kgPerUnit: 25,
    singular: "an d'absorption d'un arbre",
    plural: "ans d'absorption d'un arbre",
  },
  {
    id: "paris_lyon",
    icon: "🛣️",
    kgPerUnit: PARIS_LYON_KM * EMISSION_FACTORS.carThermal,
    singular: "trajet Paris → Lyon en voiture",
    plural: "trajets Paris → Lyon en voiture",
  },
];

export interface EquivalenceValue {
  equivalence: Equivalence;
  count: number;
  /** Ready-to-display value, e.g. "4,2" or "128". */
  value: string;
  label: string;
}

function formatCount(n: number): string {
  if (n >= 10) return formatInt(n);
  return formatDecimal(n, 1).replace(/,0$/, "");
}

export function equivalenceValue(eq: Equivalence, kg: number): EquivalenceValue {
  const count = Math.max(0, kg) / eq.kgPerUnit;
  const value = formatCount(count);
  return {
    equivalence: eq,
    count,
    value,
    label: count >= 2 || value === "2" ? eq.plural : eq.singular,
  };
}

/**
 * Up to `max` equivalences, most tangible first: those reaching at least one
 * whole unit, largest unit first; the car-km one is always available.
 */
export function equivalencesFor(kg: number, max = 3): EquivalenceValue[] {
  const values = EQUIVALENCES.map((eq) => equivalenceValue(eq, kg));
  const whole = values
    .filter((v) => v.count >= 1 && v.equivalence.id !== "car_km")
    .sort((a, b) => b.equivalence.kgPerUnit - a.equivalence.kgPerUnit);
  const car = values.find((v) => v.equivalence.id === "car_km");
  const picked = [...whole.slice(0, max - 1)];
  if (car) picked.push(car);
  if (picked.length < max) {
    for (const v of values) {
      if (picked.length >= max) break;
      if (!picked.includes(v)) picked.push(v);
    }
  }
  return picked.slice(0, max);
}
