import { ref, type Ref } from "vue";
import { getApiDomain } from "@/lib/config";
import { useAuth } from "./useAuth";

export interface WSMessage {
  type: string;
  data: Record<string, unknown>;
}

type MessageCallback = (msg: WSMessage) => void;

// Module-level singleton state — single WebSocket connection shared across all useWebSocket() callers.
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const baseReconnectDelay = 1000;
const pingIntervalMs = 30000;

const callbacks = new Set<MessageCallback>();
const connected: Ref<boolean> = ref(false);

function getWsUrl(token: string): string {
  const domain = getApiDomain();
  const protocol = domain.startsWith("https://") ? "wss:" : "ws:";
  const host = domain.replace(/^https?:\/\//, "");
  return `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(token)}`;
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping", data: {} }));
    }
  }, pingIntervalMs);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

async function connect() {
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const { getValidAccessToken } = useAuth();
  const token = await getValidAccessToken();
  if (!token) {
    console.debug("[ws] no access token, skipping connect");
    return;
  }

  const url = getWsUrl(token);
  console.debug("[ws] connecting to", url);

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.debug("[ws] connected");
    reconnectAttempts = 0;
    connected.value = true;
    startPing();
  };

  ws.onmessage = (event) => {
    try {
      const msg: WSMessage = JSON.parse(event.data);
      if (msg.type === "pong" || msg.type === "ws.connected") return;
      console.debug("[ws] message", msg.type);
      callbacks.forEach((cb) => cb(msg));
    } catch (e) {
      console.warn("[ws] malformed message", event.data, e);
    }
  };

  ws.onclose = (event) => {
    console.debug("[ws] closed", event.code, event.reason);
    connected.value = false;
    ws = null;
    stopPing();
    scheduleReconnect();
  };

  ws.onerror = (event) => {
    console.error("[ws] error", event);
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.debug("[ws] max reconnect attempts reached");
    return;
  }

  const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
  reconnectAttempts++;
  console.debug("[ws] reconnecting in", delay, "ms");

  reconnectTimer = setTimeout(
    () => {
      reconnectTimer = null;
      connect();
    },
    Math.min(delay, 30000),
  );
}

function disconnect() {
  console.debug("[ws] disconnecting");
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPing();
  reconnectAttempts = maxReconnectAttempts;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  connected.value = false;
}

function onMessage(cb: MessageCallback): () => void {
  callbacks.add(cb);
  return () => callbacks.delete(cb);
}

function send(type: string, data: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

export function useWebSocket() {
  return {
    connected,
    connect,
    disconnect,
    onMessage,
    send,
  };
}
