import { ref, onMounted, onUnmounted } from "vue";

export function useActionsMenu(triggerAttr: string, menuAttr: string) {
  const actionsOpen = ref<number | null>(null);
  const menuPos = ref<{ top: number; left: number } | null>(null);

  function toggle(id: number) {
    if (actionsOpen.value === id) {
      actionsOpen.value = null;
      menuPos.value = null;
      return;
    }
    const trigger = document.querySelector<HTMLElement>(
      `[${triggerAttr}="${id}"]`,
    );
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      menuPos.value = { top: rect.bottom + 4, left: rect.right - 176 };
    }
    actionsOpen.value = id;
  }

  function close() {
    actionsOpen.value = null;
    menuPos.value = null;
  }

  function closeIfOutside(e: MouseEvent) {
    if (actionsOpen.value === null) return;
    const target = e.target as HTMLElement;
    const id = actionsOpen.value;
    const menu = document.querySelector(`[${menuAttr}="${id}"]`);
    const trigger = document.querySelector(`[${triggerAttr}="${id}"]`);
    if (!menu || !trigger) return;
    if (!menu.contains(target) && !trigger.contains(target)) {
      actionsOpen.value = null;
    }
  }

  onMounted(() => {
    document.addEventListener("click", closeIfOutside, true);
  });
  onUnmounted(() => {
    document.removeEventListener("click", closeIfOutside, true);
  });

  return { actionsOpen, menuPos, toggle, close };
}
