import { ref, watch, type Ref } from "vue";

export function useScrollSync(
  boardScrollRef: Ref<HTMLElement | null>,
  boardContainerRef: Ref<HTMLElement | null>,
  collapsed: Ref<Set<number>>,
) {
  let isSyncing = false;
  let cachedRowScrollEls: HTMLElement[] = [];
  let scrollElsDirty = true;

  watch(
    [collapsed],
    () => {
      scrollElsDirty = true;
    },
    { flush: "post" },
  );

  function getRowScrollEls(): HTMLElement[] {
    if (scrollElsDirty) {
      cachedRowScrollEls = boardContainerRef.value
        ? Array.from(
            boardContainerRef.value.querySelectorAll<HTMLElement>(
              ".agile-row-scroll",
            ),
          )
        : [];
      scrollElsDirty = false;
    }
    return cachedRowScrollEls;
  }

  function syncScrollFrom(source: HTMLElement) {
    if (isSyncing) return;
    isSyncing = true;
    const sl = source.scrollLeft;
    if (boardScrollRef.value && boardScrollRef.value !== source) {
      boardScrollRef.value.scrollLeft = sl;
    }
    for (const el of getRowScrollEls()) {
      if (el !== source) el.scrollLeft = sl;
    }
    requestAnimationFrame(() => {
      isSyncing = false;
    });
  }

  return { syncScrollFrom };
}
