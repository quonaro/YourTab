import { describe, it, expect } from "vitest";
import { ref, nextTick } from "vue";
import { useScrollSync } from "@/composables/useScrollSync";

function makeScroller() {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollLeft", {
    value: 0,
    writable: true,
    configurable: true,
  });
  return el;
}

describe("useScrollSync", () => {
  it("propagates scrollLeft from a row scroller to header and siblings", () => {
    const board = makeScroller();
    const container = document.createElement("div");
    const r1 = makeScroller();
    const r2 = makeScroller();
    r1.className = "agile-row-scroll";
    r2.className = "agile-row-scroll";
    container.append(r1, r2);
    document.body.appendChild(container);

    const boardScrollRef = ref<HTMLElement | null>(board);
    const containerRef = ref<HTMLElement | null>(container);
    const collapsed = ref(new Set<number>());
    const { syncScrollFrom } = useScrollSync(
      boardScrollRef,
      containerRef,
      collapsed,
    );

    r1.scrollLeft = 250;
    syncScrollFrom(r1);
    expect(board.scrollLeft).toBe(250);
    expect(r2.scrollLeft).toBe(250);
    container.remove();
  });

  it("propagates scrollLeft from the header scroller to rows", () => {
    const board = makeScroller();
    const container = document.createElement("div");
    const row = makeScroller();
    row.className = "agile-row-scroll";
    container.appendChild(row);
    document.body.appendChild(container);

    const boardScrollRef = ref<HTMLElement | null>(board);
    const containerRef = ref<HTMLElement | null>(container);
    const collapsed = ref(new Set<number>());
    const { syncScrollFrom } = useScrollSync(
      boardScrollRef,
      containerRef,
      collapsed,
    );

    board.scrollLeft = 120;
    syncScrollFrom(board);
    expect(row.scrollLeft).toBe(120);
    container.remove();
  });

  it("re-queries row elements after collapsed changes", async () => {
    const board = makeScroller();
    const container = document.createElement("div");
    const r1 = makeScroller();
    r1.className = "agile-row-scroll";
    container.appendChild(r1);
    document.body.appendChild(container);

    const boardScrollRef = ref<HTMLElement | null>(board);
    const containerRef = ref<HTMLElement | null>(container);
    const collapsed = ref(new Set<number>());
    const { syncScrollFrom } = useScrollSync(
      boardScrollRef,
      containerRef,
      collapsed,
    );

    // Collapse toggles → cached list is invalidated, new row is picked up.
    const r2 = makeScroller();
    r2.className = "agile-row-scroll";
    container.appendChild(r2);
    collapsed.value = new Set([1]);
    await nextTick();
    await nextTick();

    board.scrollLeft = 33;
    syncScrollFrom(board);
    expect(r2.scrollLeft).toBe(33);
    container.remove();
  });
});
