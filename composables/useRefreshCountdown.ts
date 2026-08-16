import { ref, watch } from "vue";
import { useWebSocket } from "./useWebSocket";

const FALLBACK_INTERVAL = 30; // seconds

const nextRefreshIn = ref(0);
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let nextRefreshAt = 0;
let activeRefreshFn: (() => void) | null = null;
let wsUnwatch: (() => void) | null = null;

function startTimers() {
  stopTimers();
  nextRefreshAt = Date.now() + FALLBACK_INTERVAL * 1000;
  nextRefreshIn.value = FALLBACK_INTERVAL;
  refreshTimer = setInterval(() => {
    activeRefreshFn?.();
    nextRefreshAt = Date.now() + FALLBACK_INTERVAL * 1000;
  }, FALLBACK_INTERVAL * 1000);
  countdownTimer = setInterval(() => {
    nextRefreshIn.value = Math.max(
      0,
      Math.ceil((nextRefreshAt - Date.now()) / 1000),
    );
  }, 1000);
}

function stopTimers() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  nextRefreshIn.value = 0;
}

export function useRefreshCountdown() {
  const { connected } = useWebSocket();

  function setupAutoRefresh(refreshFn: () => void) {
    activeRefreshFn = refreshFn;
    if (wsUnwatch) wsUnwatch();
    wsUnwatch = watch(
      connected,
      (isConnected) => {
        if (isConnected) {
          stopTimers();
        } else {
          startTimers();
        }
      },
      { immediate: true },
    );
  }

  function teardownAutoRefresh() {
    stopTimers();
    if (wsUnwatch) {
      wsUnwatch();
      wsUnwatch = null;
    }
    activeRefreshFn = null;
  }

  return {
    nextRefreshIn,
    setupAutoRefresh,
    teardownAutoRefresh,
  };
}
