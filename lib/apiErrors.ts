import type { useI18n } from "@/composables/useI18n";

type TranslateFn = ReturnType<typeof useI18n>["t"];

const ERROR_KEY_MAP: Record<string, string> = {
  "tasks.readonly": "board.readOnlyError",
  "tasks.agile_not_available": "board.agileNotAvailable",
};

/**
 * Maps a backend error code (e.g. "tasks.readonly") to a user-friendly
 * translated message. Falls back to the original error message if no
 * mapping exists.
 */
export function mapApiError(error: unknown, t: TranslateFn): string {
  const message = error instanceof Error ? error.message : String(error);
  const i18nKey = ERROR_KEY_MAP[message];
  if (i18nKey) return t(i18nKey);
  return message;
}
