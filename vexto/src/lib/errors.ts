/**
 * Error helpers: detect backend features that are not deployed yet (migration
 * 0006 not applied) and translate server error codes into friendly French.
 */

interface PgLikeError {
  code?: string;
  message?: string;
}

function asPgError(e: unknown): PgLikeError {
  if (e && typeof e === "object") return e as PgLikeError;
  return { message: String(e) };
}

/** Function / column / table missing on the server (schema not migrated). */
export function isMissingBackendFeature(e: unknown): boolean {
  const { code, message = "" } = asPgError(e);
  return (
    code === "PGRST202" || // function not found in schema cache
    code === "PGRST204" || // column not found in schema cache
    code === "PGRST205" || // table not found in schema cache
    code === "42883" || // undefined_function
    code === "42703" || // undefined_column
    /could not find the (function|.*column)/i.test(message)
  );
}

export const MIGRATION_HINT =
  "Cette fonctionnalité nécessite la migration Supabase 0006 (voir README).";

const KNOWN_MESSAGES: Record<string, string> = {
  insufficient_points: "Vous n'avez pas encore assez de crédits pour cette récompense.",
  reward_unavailable: "Cette récompense n'est plus disponible.",
  reward_expired: "Cette offre a expiré.",
  profile_not_found: "Profil introuvable, reconnectez-vous.",
  code_not_found: "Aucun compte ne correspond à ce code ami.",
  code_ambiguous: "Ce code correspond à plusieurs comptes. Demandez un nouveau partage à votre ami.",
  cannot_add_self: "C'est votre propre code 😉",
  invalid_code: "Un code ami contient 8 caractères (chiffres et lettres A à F).",
  blocked: "Impossible d'ajouter cet utilisateur.",
  not_authenticated: "Session expirée, reconnectez-vous.",
  request_not_found: "Cette demande n'existe plus.",
  cannot_answer_own_request: "Vous ne pouvez pas répondre à votre propre demande.",
};

export function friendlyError(e: unknown, fallback = "Une erreur est survenue."): string {
  if (isMissingBackendFeature(e)) return MIGRATION_HINT;
  const { message } = asPgError(e);
  if (!message) return fallback;
  const known = KNOWN_MESSAGES[message.trim()];
  if (known) return known;
  if (/network request failed|failed to fetch|networkerror|load failed/i.test(message)) {
    return "Pas de connexion internet. Réessayez dans un instant.";
  }
  if (/jwt|refresh token|not authorized/i.test(message)) {
    return "Session expirée, reconnectez-vous.";
  }
  return message;
}
