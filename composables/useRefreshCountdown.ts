import { ref } from "vue";
import { useSettings } from "./useSettings";

const nextRefreshIn = ref(0);
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let nextRefreshAt = 0;

export function useRefreshCountdown() {
  const { settings } = useSettings();

  function setupAutoRefresh(refreshFn: () => void) {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    nextRefreshIn.value = 0;
    if (
      settings.value.autoRefreshEnabled &&
      settings.value.autoRefreshInterval > 0
    ) {
      nextRefreshAt = Date.now() + settings.value.autoRefreshInterval * 1000;
      nextRefreshIn.value = settings.value.autoRefreshInterval;
      refreshTimer = setInterval(() => {
        refreshFn();
        nextRefreshAt = Date.now() + settings.value.autoRefreshInterval * 1000;
      }, settings.value.autoRefreshInterval * 1000);
      countdownTimer = setInterval(() => {
        const remaining = Math.max(
          0,
          Math.ceil((nextRefreshAt - Date.now()) / 1000),
        );
        nextRefreshIn.value = remaining;
      }, 1000);
    }
  }

  function teardownAutoRefresh() {
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

  return {
    nextRefreshIn,
    setupAutoRefresh,
    teardownAutoRefresh,
  };
}
