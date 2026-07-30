import type { MealIngredient } from "../../api";

/** Parse "2 cups milk" → { quantity: "2 cups", name: "milk" }; "onions" → { quantity: "1", name: "onions" }. */
export function parseIngredientLines(text: string): MealIngredient[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([\d./]+\s*(?:cups?|tbsp?|tsp|oz|lb?s?|g|kg|ml|l|cloves?|cans?|packs?|boxes|bags?|bunche?s?|sticks?|slices?|pieces?|dozen)?)\s+(.+)$/i);
      if (m) return { quantity: m[1].trim(), name: m[2].trim() };
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && /^[\d./]+$/.test(parts[0])) {
        return { quantity: parts[0], name: parts.slice(1).join(" ") };
      }
      return { name: line, quantity: "1" };
    });
}
