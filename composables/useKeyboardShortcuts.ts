import { onMounted, onUnmounted, type Ref } from "vue";

interface KeyboardShortcutOptions {
  settingsOpen: Ref<boolean>;
  onEscape: () => void;
  onCreateStatus?: () => void;
  onCreateBoard?: () => void;
  canCreate: () => boolean;
}

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export function useKeyboardShortcuts(opts: KeyboardShortcutOptions) {
  function handler(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "Escape") {
      if (opts.settingsOpen.value) {
        opts.settingsOpen.value = false;
        return;
      }
      opts.onEscape();
      return;
    }

    if (isTypingInField(e.target)) return;

    if (e.key === "/") {
      e.preventDefault();
      document
        .querySelector<HTMLElement>('[data-keyboard-shortcut="search"]')
        ?.focus();
      return;
    }

    if (!opts.canCreate()) return;

    if (e.key === "c" && opts.onCreateStatus) {
      e.preventDefault();
      opts.onCreateStatus();
      return;
    }

    if (e.key === "b" && opts.onCreateBoard) {
      e.preventDefault();
      opts.onCreateBoard();
      return;
    }
  }

  onMounted(() => window.addEventListener("keydown", handler));
  onUnmounted(() => window.removeEventListener("keydown", handler));
}
