// Recettes des machines (four, presse, assembleur) : lesquelles sont actives, et comment
// en changer.
//
// Chaque machine a une liste de recettes possibles (data/buildings.js, recipes) ; on
// choisit dans sa fiche celles qu'elle fait. Une seule recette active par ingrédient :
// une presse transforme ses lingots de fer soit en plaques, soit en engrenages. Un
// ingrédient sans recette active est refusé (il reste sur le tapis).
import { BUILDINGS } from './buildings.js';

export const recipesOf = (type) => BUILDINGS[type].recipes ?? [];

/** Numéros des recettes actives d'une machine. */
export const activeRecipeIndices = (b) => b.recipes ?? BUILDINGS[b.type].defaultRecipes ?? [];

/** Les recettes actives d'une machine : [{ index, recipe }]. */
export const activeRecipes = (b) => activeRecipeIndices(b)
  .map((index) => ({ index, recipe: recipesOf(b.type)[index] }))
  .filter(({ recipe }) => recipe);

export const ingredientsOf = (recipe) => Object.keys(recipe.in);

/** Combien d'items la recette donne d'un coup. */
export const yieldOf = (recipe) => recipe.count ?? 1;

/** La recette active qui utilise cet ingrédient, ou null (alors la machine le refuse). */
export function recipeUsing(b, item) {
  return activeRecipes(b).find(({ recipe }) => recipe.in[item]) ?? null;
}

/**
 * Les recettes actives après avoir allumé (`on`) ou éteint la recette `index`. En allumer
 * une éteint celles qui partagent un de ses ingrédients.
 */
export function withRecipe(type, active, index, on) {
  const recipes = recipesOf(type);
  if (!recipes[index]) return active;
  if (!on) return active.filter((i) => i !== index);
  const mine = new Set(ingredientsOf(recipes[index]));
  const kept = active.filter((i) => i !== index && !ingredientsOf(recipes[i]).some((item) => mine.has(item)));
  return [...kept, index].sort((a, b) => a - b);
}
