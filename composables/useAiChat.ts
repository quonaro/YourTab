import { ref, computed, watch } from "vue";
import { useApi } from "./useApi";
import { useWebSocket, type WSMessage } from "./useWebSocket";
import type { AiConversation, AiMessage, AiToolCall } from "@/lib/types";

export type AiAccessState =
  "idle" | "checking" | "granted" | "no_addon" | "error";

// Module-level singleton state — shared across all useAiChat() callers.
const accessState = ref<AiAccessState>("idle");
const conversations = ref<AiConversation[]>([]);
const currentConversation = ref<AiConversation | null>(null);
const messages = ref<AiMessage[]>([]);
const loading = ref(false);
const sending = ref(false);
const error = ref<string | null>(null);

const streamingMessageId = ref<string | null>(null);
const streamingReasoning = ref("");
const activeToolCalls = ref<AiToolCall[]>([]);
const generatingConvIds = ref(new Set<string>());

const isStreaming = computed(() => streamingMessageId.value !== null);

let wsUnsub: (() => void) | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let presenceTimer: ReturnType<typeof setInterval> | null = null;
let presenceWatchStarted = false;

// Conversations whose presence we currently report. Tracks every source:
// the open conversation plus any conversation with an in-flight generation
// shown as a spinner in the list — notifications are suppressed for all of
// them while the extension's WS is alive.
const joinedConvIds = new Set<string>();

// Leaves are delayed so the backend's IsViewerStr check — which runs right
// when a generation completes — still sees the presence we held during it.
const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();
const PRESENCE_LEAVE_DELAY_MS = 15_000;

const PRESENCE_REFRESH_MS = 60_000;

export function useAiChat() {
  const api = useApi();
  const {
    connect: wsConnect,
    onMessage: wsOnMessage,
    connected: wsConnected,
    send: wsSend,
  } = useWebSocket();

  // checkAccess verifies the user can use AI chats. The conversations list
  // endpoint is the definitive server-side gate: it returns ai.addon_required
  // (402) when billing is on and the user has no ai_assistant addon, while
  // self-hosted servers without billing and admins get full access.
  async function checkAccess(): Promise<void> {
    if (accessState.value === "checking") return;
    accessState.value = "checking";
    error.value = null;
    try {
      conversations.value = await api.listAIConversations();
      accessState.value = "granted";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      accessState.value = msg === "ai.addon_required" ? "no_addon" : "error";
      error.value = msg;
    }
  }

  // init is called when the sidebar opens: start the shared WS connection and
  // subscribe to ai.stream.* events. Idempotent.
  function init() {
    wsConnect();
    if (!wsUnsub) {
      wsUnsub = wsOnMessage(handleWSMessage);
    }
    if (!presenceWatchStarted) {
      presenceWatchStarted = true;
      // Presence does not survive a reconnect — re-join everything.
      watch(wsConnected, (ok) => {
        if (ok) joinedConvIds.forEach(joinPresence);
      });
      // Generating conversations get presence too — the list shows their
      // spinner, so completion notifications would be redundant.
      watch(
        () => [...generatingConvIds.value],
        () => syncPresence(),
      );
    }
  }

  // teardown is called when the sidebar closes. The WS connection itself is a
  // shared singleton and is left running for other consumers.
  function teardown() {
    if (wsUnsub) {
      wsUnsub();
      wsUnsub = null;
    }
    stopStatusPolling();
    for (const t of pendingLeaves.values()) clearTimeout(t);
    pendingLeaves.clear();
    for (const id of joinedConvIds) leavePresence(id);
    stopPresenceHeartbeat();
    presenceWatchStarted = false;
  }

  // Reports "viewing a conversation" over WS so the backend can skip the
  // ai.response_ready notification — mirrors the main app (entity
  // ai_conversation, 90s TTL, 60s heartbeat).
  function joinPresence(id: string) {
    wsSend("presence.join", { entity: "ai_conversation", sid: id });
    joinedConvIds.add(id);
  }

  function leavePresence(id: string) {
    wsSend("presence.leave", { entity: "ai_conversation", sid: id });
    joinedConvIds.delete(id);
  }

  function stopPresenceHeartbeat() {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
  }

  // syncPresence reconciles reported presence with what the panel actually
  // shows: the open conversation plus every conversation with an in-flight
  // generation (visible as spinners in the list).
  function syncPresence() {
    const want = new Set(generatingConvIds.value);
    const cur = currentConversation.value?.id;
    if (cur) want.add(cur);
    for (const id of [...joinedConvIds]) {
      if (!want.has(id) && !pendingLeaves.has(id)) {
        pendingLeaves.set(
          id,
          setTimeout(() => {
            pendingLeaves.delete(id);
            const still = new Set(generatingConvIds.value);
            const c = currentConversation.value?.id;
            if (c) still.add(c);
            if (!still.has(id)) leavePresence(id);
          }, PRESENCE_LEAVE_DELAY_MS),
        );
      }
    }
    for (const id of want) {
      const pending = pendingLeaves.get(id);
      if (pending) {
        clearTimeout(pending);
        pendingLeaves.delete(id);
      }
      joinPresence(id);
    }
    if (joinedConvIds.size > 0 && !presenceTimer) {
      presenceTimer = setInterval(() => {
        joinedConvIds.forEach(joinPresence);
      }, PRESENCE_REFRESH_MS);
    } else if (joinedConvIds.size === 0) {
      stopPresenceHeartbeat();
    }
  }

  async function loadConversations() {
    loading.value = true;
    error.value = null;
    try {
      conversations.value = await api.listAIConversations();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function openConversation(id: string) {
    loading.value = true;
    error.value = null;
    try {
      const resp = await api.getAIConversation(id);
      currentConversation.value = resp.conversation;
      syncPresence();
      messages.value = resp.messages ?? [];
      streamingReasoning.value = "";
      activeToolCalls.value = [];
      const streamingMsg = messages.value.find((m) => m.status === "streaming");
      streamingMessageId.value = streamingMsg?.id ?? null;
      if (streamingMsg) {
        generatingConvIds.value.add(id);
        void checkStatus(id);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // backToList leaves the chat view without touching server state.
  function backToList() {
    currentConversation.value = null;
    syncPresence();
    messages.value = [];
    streamingMessageId.value = null;
    streamingReasoning.value = "";
    activeToolCalls.value = [];
    void loadConversations();
  }

  // newChat opens an empty draft: the conversation is created server-side
  // together with the first message.
  function newChat() {
    currentConversation.value = null;
    syncPresence();
    messages.value = [];
    streamingMessageId.value = null;
    streamingReasoning.value = "";
    activeToolCalls.value = [];
    error.value = null;
  }

  async function removeConversation(id: string) {
    try {
      await api.deleteAIConversation(id);
      conversations.value = conversations.value.filter((c) => c.id !== id);
      if (currentConversation.value?.id === id) {
        newChat();
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending.value || loading.value) return;

    // Draft mode: create the conversation first, then send into it.
    if (!currentConversation.value) {
      loading.value = true;
      try {
        const conv = await api.createAIConversation();
        conversations.value.unshift(conv);
        currentConversation.value = conv;
        syncPresence();
        messages.value = [];
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
        loading.value = false;
        return;
      } finally {
        loading.value = false;
      }
    }

    const convId = currentConversation.value.id;

    const userMsg: AiMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: trimmed,
      status: "complete",
      createdAt: new Date().toISOString(),
    };
    messages.value.push(userMsg);

    const assistantMsg: AiMessage = {
      id: `temp-${Date.now() + 1}`,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date().toISOString(),
    };
    messages.value.push(assistantMsg);

    streamingMessageId.value = assistantMsg.id;
    streamingReasoning.value = "";
    activeToolCalls.value = [];
    generatingConvIds.value.add(convId);
    sending.value = true;
    error.value = null;
    startStatusPolling(convId);

    try {
      const resp = await api.sendAIMessage(convId, trimmed);
      if (resp.message) {
        userMsg.id = resp.message.id;
        userMsg.createdAt = resp.message.createdAt;
      }
      if (resp.assistantMessage) {
        assistantMsg.id = resp.assistantMessage.id;
        assistantMsg.createdAt = resp.assistantMessage.createdAt;
        streamingMessageId.value = assistantMsg.id;
      }
      if (resp.conversationTitle && currentConversation.value) {
        currentConversation.value.title = resp.conversationTitle;
        const conv = conversations.value.find((c) => c.id === convId);
        if (conv) conv.title = resp.conversationTitle;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      generatingConvIds.value.delete(convId);
      finalizeStreaming();
      await resyncMessages(convId);
    }
  }

  async function stop() {
    const conv = currentConversation.value;
    if (!conv) return;
    try {
      await api.stopAIGeneration(conv.id);
    } catch {
      // ignore
    }
    generatingConvIds.value.delete(conv.id);
    finalizeStreaming();
    await resyncMessages(conv.id);
  }

  async function regenerate() {
    const conv = currentConversation.value;
    if (!conv || isStreaming.value) return;
    const convId = conv.id;

    const lastIdx = messages.value.length - 1;
    if (lastIdx >= 0 && messages.value[lastIdx].role === "assistant") {
      messages.value.splice(lastIdx, 1);
    }

    const assistantMsg: AiMessage = {
      id: `temp-${Date.now() + 1}`,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date().toISOString(),
    };
    messages.value.push(assistantMsg);

    streamingMessageId.value = assistantMsg.id;
    streamingReasoning.value = "";
    activeToolCalls.value = [];
    generatingConvIds.value.add(convId);
    sending.value = true;
    error.value = null;
    startStatusPolling(convId);

    try {
      const resp = await api.regenerateAIResponse(convId);
      if (resp.assistantMessage) {
        assistantMsg.id = resp.assistantMessage.id;
        assistantMsg.createdAt = resp.assistantMessage.createdAt;
        streamingMessageId.value = assistantMsg.id;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      generatingConvIds.value.delete(convId);
      finalizeStreaming();
      await resyncMessages(convId);
    }
  }

  async function resyncMessages(convId: string) {
    try {
      const conv = await api.getAIConversation(convId);
      if (currentConversation.value?.id === convId) {
        messages.value = conv.messages ?? [];
      }
    } catch {
      // ignore
    }
  }

  // checkStatus reconciles streaming state via the status endpoint — used as
  // a fallback when the WebSocket is down and to detect mid-generation
  // conversations after a reload.
  async function checkStatus(id: string) {
    try {
      const resp = await api.getAIStatus(id);
      if (resp.active) {
        generatingConvIds.value.add(id);
        if (currentConversation.value?.id === id && resp.messageId) {
          const placeholder = messages.value.find(
            (m) => m.id === streamingMessageId.value,
          );
          if (placeholder && placeholder.id !== resp.messageId) {
            placeholder.id = resp.messageId;
          }
          streamingMessageId.value = resp.messageId;
          if (typeof resp.content === "string") {
            const msg = messages.value.find((m) => m.id === resp.messageId);
            if (msg) msg.content = resp.content;
          }
          if (typeof resp.reasoning === "string") {
            streamingReasoning.value = resp.reasoning;
          }
          if (resp.toolCalls) {
            activeToolCalls.value = resp.toolCalls;
          }
          if (resp.model) {
            const msg = messages.value.find((m) => m.id === resp.messageId);
            if (msg) msg.model = resp.model;
          }
        }
        return;
      }
      generatingConvIds.value.delete(id);
      if (currentConversation.value?.id === id) {
        const pendingTemp = messages.value.some(
          (m) => m.status === "streaming" && m.id.startsWith("temp-"),
        );
        if (pendingTemp) {
          generatingConvIds.value.add(id);
          return;
        }
        if (streamingMessageId.value !== null) {
          await resyncMessages(id);
          finalizeStreaming();
        }
      }
    } catch {
      // ignore
    }
  }

  // Status polling runs only while a generation is in flight AND the WS
  // connection is down — when the socket is live, deltas drive the UI.
  function startStatusPolling(convId: string) {
    stopStatusPolling();
    statusPollTimer = setInterval(() => {
      if (!streamingMessageId.value || wsConnected.value) return;
      void checkStatus(convId);
    }, 1500);
  }

  function stopStatusPolling() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  }

  function handleWSMessage(msg: WSMessage) {
    const data = msg.data as Record<string, unknown>;
    switch (msg.type) {
      case "ai.stream.start":
        onStreamStart(data);
        break;
      case "ai.stream.delta":
        onStreamDelta(data);
        break;
      case "ai.stream.reasoning":
        onStreamReasoningDelta(data);
        break;
      case "ai.stream.tool_call":
        onStreamToolCall(data);
        break;
      case "ai.stream.end":
        void onStreamEnd(data);
        break;
      case "ai.stream.error":
        void onStreamError(data);
        break;
    }
  }

  function onStreamStart(data: Record<string, unknown>) {
    const conversationId = data.conversationId as string;
    const messageId = data.messageId as string;
    generatingConvIds.value.add(conversationId);
    if (currentConversation.value?.id !== conversationId) return;
    const placeholder = messages.value.find(
      (m) => m.id === streamingMessageId.value || m.id === messageId,
    );
    if (placeholder) {
      placeholder.id = messageId;
      if (data.model) placeholder.model = data.model as string;
    }
    streamingMessageId.value = messageId;
    streamingReasoning.value = "";
  }

  function onStreamDelta(data: Record<string, unknown>) {
    const conversationId = data.conversationId as string;
    const messageId = data.messageId as string;
    generatingConvIds.value.add(conversationId);
    if (currentConversation.value?.id !== conversationId) return;
    const msg = messages.value.find((m) => m.id === messageId);
    if (msg) {
      msg.content += (data.delta as string) ?? "";
      streamingMessageId.value = msg.id;
    }
  }

  function onStreamReasoningDelta(data: Record<string, unknown>) {
    if (currentConversation.value?.id !== data.conversationId) return;
    streamingReasoning.value += (data.delta as string) ?? "";
  }

  function onStreamToolCall(data: Record<string, unknown>) {
    if (currentConversation.value?.id !== data.conversationId) return;
    const toolName = data.toolName as string;
    const existing = activeToolCalls.value.find(
      (tc) => tc.toolName === toolName,
    );
    if (existing) {
      existing.status = data.status as string;
      if (data.arguments !== undefined)
        existing.arguments = data.arguments as string;
      if (data.result !== undefined) existing.result = data.result as string;
    } else {
      activeToolCalls.value.push({
        toolName,
        status: (data.status as string) ?? "",
        arguments: (data.arguments as string) ?? "",
        result: (data.result as string) ?? "",
      });
    }
  }

  async function onStreamEnd(data: Record<string, unknown>) {
    const conversationId = data.conversationId as string;
    const messageId = data.messageId as string;
    generatingConvIds.value.delete(conversationId);
    if (currentConversation.value?.id !== conversationId) return;
    const localId = streamingMessageId.value;
    try {
      const conv = await api.getAIConversation(conversationId);
      const finalMsg = conv.messages?.find((m) => m.id === messageId);
      if (finalMsg) {
        const idx = messages.value.findIndex(
          (m) => m.id === messageId || m.id === localId,
        );
        if (idx !== -1) messages.value[idx] = finalMsg;
      }
      // Refresh the list entry (title may have been generated).
      const fresh = conv.conversation;
      if (fresh) {
        const listed = conversations.value.find((c) => c.id === fresh.id);
        if (listed) Object.assign(listed, fresh);
        if (currentConversation.value?.id === fresh.id) {
          currentConversation.value = fresh;
        }
      }
    } catch {
      // keep streamed content as-is
    } finally {
      finalizeStreaming();
    }
  }

  async function onStreamError(data: Record<string, unknown>) {
    const conversationId = data.conversationId as string;
    const messageId = data.messageId as string;
    const errText = (data.error as string) ?? "";
    generatingConvIds.value.delete(conversationId);
    if (currentConversation.value?.id !== conversationId) return;
    error.value = errText;
    const msg = messages.value.find(
      (m) => m.id === messageId || m.id === streamingMessageId.value,
    );
    if (msg) {
      msg.status = "error";
      msg.error = errText;
    }
    const localId = msg?.id;
    try {
      const conv = await api.getAIConversation(conversationId);
      const finalMsg = conv.messages?.find((m) => m.id === messageId);
      if (finalMsg) {
        const idx = messages.value.findIndex(
          (m) => m.id === messageId || m.id === localId,
        );
        if (idx !== -1) messages.value[idx] = finalMsg;
      }
    } catch {
      // keep error marker as-is
    } finally {
      finalizeStreaming();
    }
  }

  function finalizeStreaming() {
    streamingMessageId.value = null;
    streamingReasoning.value = "";
    activeToolCalls.value = [];
    sending.value = false;
    stopStatusPolling();
  }

  return {
    accessState,
    conversations,
    currentConversation,
    messages,
    loading,
    sending,
    error,
    streamingMessageId,
    streamingReasoning,
    activeToolCalls,
    generatingConvIds,
    isStreaming,
    checkAccess,
    init,
    teardown,
    loadConversations,
    openConversation,
    backToList,
    newChat,
    removeConversation,
    send,
    stop,
    regenerate,
  };
}
