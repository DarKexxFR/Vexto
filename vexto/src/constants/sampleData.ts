/**
 * Placeholder data for screens before the live data layer is wired in.
 * Replace these with Supabase queries (profile.ts, trips.ts) as features land.
 */

export interface RoutePreset {
  from: string;
  to: string;
  km: number;
}

export const ROUTE_PRESETS: RoutePreset[] = [
  { from: "Le Kremlin-Bicêtre", to: "Paris — Châtelet", km: 6.5 },
  { from: "Le Kremlin-Bicêtre", to: "La Défense", km: 13 },
  { from: "Paris — Bastille", to: "Boulogne-Billancourt", km: 9 },
  { from: "Vincennes", to: "Montmartre", km: 11 },
];

export interface SampleFriend {
  id: string;
  name: string;
  points: number;
  isYou?: boolean;
}

export const SAMPLE_LEADERBOARD: SampleFriend[] = [
  { id: "1", name: "Inès", points: 2310 },
  { id: "2", name: "Karim", points: 1290 },
  { id: "3", name: "Vous", points: 1175, isYou: true },
  { id: "4", name: "Thomas", points: 980 },
  { id: "5", name: "Léa", points: 760 },
];

export interface SampleReward {
  id: string;
  brand: string;
  title: string;
  cost: number;
  tile: string;
}

export const SAMPLE_REWARDS: SampleReward[] = [
  { id: "nike", brand: "Nike", title: "−20 % sur une paire running", cost: 1500, tile: "#111111" },
  { id: "sephora", brand: "Sephora", title: "Trousse découverte offerte", cost: 900, tile: "#1A1A1A" },
  { id: "decathlon", brand: "Decathlon", title: "Bon d'achat de 15 €", cost: 1200, tile: "#0082C3" },
  { id: "cafe", brand: "Café partenaire", title: "Une boisson chaude offerte", cost: 250, tile: "#2A804D" },
];
