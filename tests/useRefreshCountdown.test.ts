import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { useRefreshCountdown } from "@/composables/useRefreshCountdown";
import { useWebSocket } from "@/composables/useWebSocket";

describe("useRefreshCountdown", () => {
  const { connected } = useWebSocket();

  beforeEach(() => {
    vi.useFakeTimers();
    connected.value = false;
  });

  afterEach(() => {
    useRefreshCountdown().teardownAutoRefresh();
    vi.useRealTimers();
  });

  it("counts down and fires the refresh on the fallback interval", async () => {
    const { nextRefreshIn, setupAutoRefresh } = useRefreshCountdown();
    const refresh = vi.fn();
    setupAutoRefresh(refresh);
    await nextTick();

    expect(nextRefreshIn.value).toBe(30);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(nextRefreshIn.value).toBe(20);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops timers while the websocket is connected", async () => {
    const { nextRefreshIn, setupAutoRefresh } = useRefreshCountdown();
    const refresh = vi.fn();
    setupAutoRefresh(refresh);
    await nextTick();

    connected.value = true;
    await nextTick();
    expect(nextRefreshIn.value).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("restarts timers when the websocket drops", async () => {
    const { nextRefreshIn, setupAutoRefresh } = useRefreshCountdown();
    const refresh = vi.fn();
    setupAutoRefresh(refresh);
    connected.value = true;
    await nextTick();
    connected.value = false;
    await nextTick();

    expect(nextRefreshIn.value).toBe(30);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("teardown stops everything", async () => {
    const { setupAutoRefresh, teardownAutoRefresh, nextRefreshIn } =
      useRefreshCountdown();
    const refresh = vi.fn();
    setupAutoRefresh(refresh);
    await nextTick();
    teardownAutoRefresh();
    expect(nextRefreshIn.value).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
