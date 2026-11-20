/**
 * Demo catalogue shown (read-only) while the `rewards` table is empty, so the
 * Récompenses screen never looks broken. Real offers live in Supabase.
 */
export interface DemoReward {
  id: string;
  brand: string;
  title: string;
  cost: number;
  tile: string;
}

export const DEMO_REWARDS: DemoReward[] = [
  { id: "demo-cafe", brand: "Café partenaire", title: "Une boisson chaude offerte", cost: 250, tile: "#2A804D" },
  { id: "demo-sephora", brand: "Sephora", title: "Trousse découverte offerte", cost: 900, tile: "#1A1A1A" },
  { id: "demo-decathlon", brand: "Decathlon", title: "Bon d'achat de 15 €", cost: 1200, tile: "#0082C3" },
  { id: "demo-nike", brand: "Nike", title: "−20 % sur une paire running", cost: 1500, tile: "#111111" },
];
