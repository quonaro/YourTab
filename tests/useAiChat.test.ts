import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { AiConversation, AiMessage } from "@/lib/types";
import type { WSMessage } from "@/composables/useWebSocket";

const api = vi.hoisted(() => ({
  listAIConversations: vi.fn(),
  createAIConversation: vi.fn(),
  getAIConversation: vi.fn(),
  deleteAIConversation: vi.fn(),
  sendAIMessage: vi.fn(),
  getAIStatus: vi.fn(),
  stopAIGeneration: vi.fn(),
  regenerateAIResponse: vi.fn(),
}));

const ws = await vi.hoisted(async () => {
  const { ref } = await import("vue");
  const ws = {
    connected: ref(true),
    connect: vi.fn(),
    send: vi.fn(),
    handlers: [] as Array<(m: WSMessage) => void>,
    onMessage(cb: (m: WSMessage) => void) {
      ws.handlers.push(cb);
      return () => {
        const i = ws.handlers.indexOf(cb);
        if (i !== -1) ws.handlers.splice(i, 1);
      };
    },
    emit(msg: WSMessage) {
      for (const cb of [...ws.handlers]) cb(msg);
    },
  };
  return ws;
});

vi.mock("@/composables/useApi", () => ({ useApi: () => api }));
vi.mock("@/composables/useWebSocket", () => ({
  useWebSocket: () => ({
    connected: ws.connected,
    connect: ws.connect,
    send: ws.send,
    onMessage: ws.onMessage,
  }),
}));

import { useAiChat } from "@/composables/useAiChat";

const conv = (over: Partial<AiConversation> = {}): AiConversation => ({
  id: "c1",
  title: "chat",
  model: "gpt",
  createdAt: "2026-01-01T00:00:00Z",
  lastMessageAt: "2026-01-01T00:00:00Z",
  ...over,
});

const msg = (over: Partial<AiMessage> = {}): AiMessage => ({
  id: "m1",
  role: "assistant",
  content: "hi",
  status: "complete",
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

let chat: ReturnType<typeof useAiChat>;

function reset() {
  chat = useAiChat();
  chat.teardown();
  chat.accessState.value = "idle";
  chat.conversations.value = [];
  chat.currentConversation.value = null;
  chat.messages.value = [];
  chat.loading.value = false;
  chat.sending.value = false;
  chat.error.value = null;
  chat.streamingMessageId.value = null;
  chat.streamingReasoning.value = "";
  chat.activeToolCalls.value = [];
  chat.generatingConvIds.value = new Set();
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  ws.connect.mockReset();
  ws.send.mockReset();
  ws.handlers.length = 0;
  ws.connected.value = true;
  reset();
});

describe("checkAccess", () => {
  it("grants access when conversations load", async () => {
    api.listAIConversations.mockResolvedValue([conv()]);
    await chat.checkAccess();
    expect(chat.accessState.value).toBe("granted");
    expect(chat.conversations.value).toHaveLength(1);
  });

  it("reports no_addon on ai.addon_required", async () => {
    api.listAIConversations.mockRejectedValue(new Error("ai.addon_required"));
    await chat.checkAccess();
    expect(chat.accessState.value).toBe("no_addon");
  });

  it("reports generic error otherwise", async () => {
    api.listAIConversations.mockRejectedValue(new Error("boom"));
    await chat.checkAccess();
    expect(chat.accessState.value).toBe("error");
    expect(chat.error.value).toBe("boom");
  });
});

describe("conversations", () => {
  it("openConversation loads messages and joins presence", async () => {
    api.getAIConversation.mockResolvedValue({
      conversation: conv({ id: "c9" }),
      messages: [msg({ id: "m1" })],
    });
    await chat.openConversation("c9");
    expect(chat.currentConversation.value?.id).toBe("c9");
    expect(chat.messages.value).toHaveLength(1);
    expect(ws.send).toHaveBeenCalledWith("presence.join", {
      entity: "ai_conversation",
      sid: "c9",
    });
  });

  it("openConversation picks up an in-flight streaming message", async () => {
    api.getAIConversation.mockResolvedValue({
      conversation: conv(),
      messages: [msg({ id: "m9", status: "streaming" })],
    });
    api.getAIStatus.mockResolvedValue({ active: true, messageId: "m9" });
    await chat.openConversation("c1");
    expect(chat.streamingMessageId.value).toBe("m9");
    expect(chat.generatingConvIds.value.has("c1")).toBe(true);
  });

  it("backToList resets the view, keeps presence briefly, then leaves", async () => {
    vi.useFakeTimers();
    try {
      api.getAIConversation.mockResolvedValue({
        conversation: conv(),
        messages: [],
      });
      api.listAIConversations.mockResolvedValue([]);
      await chat.openConversation("c1");
      ws.send.mockClear();
      chat.backToList();
      expect(chat.currentConversation.value).toBeNull();
      expect(chat.messages.value).toEqual([]);
      // The leave is delayed (PRESENCE_LEAVE_DELAY_MS) so the backend still
      // sees the viewer while a generation completes.
      expect(ws.send).not.toHaveBeenCalledWith("presence.leave", {
        entity: "ai_conversation",
        sid: "c1",
      });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(ws.send).toHaveBeenCalledWith("presence.leave", {
        entity: "ai_conversation",
        sid: "c1",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("teardown leaves all joined presences immediately", async () => {
    api.getAIConversation.mockResolvedValue({
      conversation: conv(),
      messages: [],
    });
    await chat.openConversation("c1");
    ws.send.mockClear();
    chat.teardown();
    expect(ws.send).toHaveBeenCalledWith("presence.leave", {
      entity: "ai_conversation",
      sid: "c1",
    });
  });

  it("removeConversation deletes and resets the open view", async () => {
    api.getAIConversation.mockResolvedValue({
      conversation: conv(),
      messages: [],
    });
    api.listAIConversations.mockResolvedValue([]);
    chat.conversations.value = [conv({ id: "c1" }), conv({ id: "c2" })];
    await chat.openConversation("c1");
    await chat.removeConversation("c1");
    expect(api.deleteAIConversation).toHaveBeenCalledWith("c1");
    expect(chat.conversations.value.map((c) => c.id)).toEqual(["c2"]);
    expect(chat.currentConversation.value).toBeNull();
  });
});

describe("send", () => {
  it("ignores empty messages", async () => {
    await chat.send("   ");
    expect(api.sendAIMessage).not.toHaveBeenCalled();
  });

  it("creates the conversation on first send, then posts the message", async () => {
    api.createAIConversation.mockResolvedValue(conv({ id: "c1" }));
    api.sendAIMessage.mockResolvedValue({
      message: msg({ id: "u1", role: "user", content: "hi" }),
      assistantMessage: msg({ id: "a1", status: "streaming" }),
      conversationTitle: "auto title",
    });
    api.getAIStatus.mockResolvedValue({ active: true, messageId: "a1" });
    await chat.send("hi");

    expect(api.createAIConversation).toHaveBeenCalled();
    expect(api.sendAIMessage).toHaveBeenCalledWith("c1", "hi");
    expect(chat.currentConversation.value?.title).toBe("auto title");
    const ids = chat.messages.value.map((m) => m.id);
    expect(ids).toEqual(["u1", "a1"]);
    expect(chat.generatingConvIds.value.has("c1")).toBe(true);
  });

  it("sends into an existing conversation without creating one", async () => {
    api.getAIConversation.mockResolvedValue({
      conversation: conv(),
      messages: [],
    });
    await chat.openConversation("c1");
    api.sendAIMessage.mockResolvedValue({
      message: msg({ id: "u1", role: "user" }),
      assistantMessage: msg({ id: "a1" }),
    });
    api.createAIConversation.mockClear();
    await chat.send("yo");
    expect(api.createAIConversation).not.toHaveBeenCalled();
    expect(api.sendAIMessage).toHaveBeenCalledWith("c1", "yo");
  });

  it("resyncs messages when send fails", async () => {
    chat.currentConversation.value = conv();
    api.sendAIMessage.mockRejectedValue(new Error("send broke"));
    api.getAIConversation.mockResolvedValue({
      conversation: conv(),
      messages: [msg({ id: "real" })],
    });
    await chat.send("x");
    expect(chat.error.value).toBe("send broke");
    expect(chat.messages.value.map((m) => m.id)).toEqual(["real"]);
    expect(chat.sending.value).toBe(false);
    expect(chat.streamingMessageId.value).toBeNull();
  });
});

describe("ws stream events", () => {
  async function startStream() {
    chat.currentConversation.value = conv({ id: "c1" });
    chat.messages.value = [
      msg({ id: "temp-1", status: "streaming", content: "" }),
    ];
    chat.streamingMessageId.value = "temp-1";
    chat.init();
  }

  it("stream.start swaps the placeholder id", async () => {
    await startStream();
    ws.emit({
      type: "ai.stream.start",
      data: { conversationId: "c1", messageId: "srv-1", model: "gpt-x" },
    });
    expect(chat.messages.value[0].id).toBe("srv-1");
    expect(chat.messages.value[0].model).toBe("gpt-x");
    expect(chat.streamingMessageId.value).toBe("srv-1");
    chat.teardown();
  });

  it("stream.delta appends content to the streaming message", async () => {
    await startStream();
    ws.emit({
      type: "ai.stream.start",
      data: { conversationId: "c1", messageId: "srv-1" },
    });
    ws.emit({
      type: "ai.stream.delta",
      data: { conversationId: "c1", messageId: "srv-1", delta: "Hello" },
    });
    ws.emit({
      type: "ai.stream.delta",
      data: { conversationId: "c1", messageId: "srv-1", delta: " world" },
    });
    expect(chat.messages.value[0].content).toBe("Hello world");
    chat.teardown();
  });

  it("ignores events for other conversations", async () => {
    await startStream();
    ws.emit({
      type: "ai.stream.delta",
      data: { conversationId: "other", messageId: "srv-1", delta: "nope" },
    });
    expect(chat.messages.value[0].content).toBe("");
    expect(chat.generatingConvIds.value.has("other")).toBe(true);
    chat.teardown();
  });

  it("accumulates reasoning deltas and tool calls", async () => {
    await startStream();
    ws.emit({
      type: "ai.stream.reasoning",
      data: { conversationId: "c1", delta: "think " },
    });
    ws.emit({
      type: "ai.stream.reasoning",
      data: { conversationId: "c1", delta: "more" },
    });
    expect(chat.streamingReasoning.value).toBe("think more");

    ws.emit({
      type: "ai.stream.tool_call",
      data: { conversationId: "c1", toolName: "list", status: "running" },
    });
    ws.emit({
      type: "ai.stream.tool_call",
      data: {
        conversationId: "c1",
        toolName: "list",
        status: "done",
        result: "[]",
      },
    });
    expect(chat.activeToolCalls.value).toHaveLength(1);
    expect(chat.activeToolCalls.value[0].status).toBe("done");
    chat.teardown();
  });

  it("stream.end replaces the message with the final version", async () => {
    await startStream();
    api.getAIConversation.mockResolvedValue({
      conversation: conv({ id: "c1", title: "final title" }),
      messages: [msg({ id: "srv-1", content: "done", status: "complete" })],
    });
    ws.emit({
      type: "ai.stream.start",
      data: { conversationId: "c1", messageId: "srv-1" },
    });
    ws.emit({
      type: "ai.stream.end",
      data: { conversationId: "c1", messageId: "srv-1" },
    });
    await vi.waitFor(() => expect(chat.messages.value[0].content).toBe("done"));
    expect(chat.streamingMessageId.value).toBeNull();
    expect(chat.sending.value).toBe(false);
    expect(chat.generatingConvIds.value.has("c1")).toBe(false);
    chat.teardown();
  });

  it("stream.error marks the message and resyncs", async () => {
    await startStream();
    api.getAIConversation.mockResolvedValue({
      conversation: conv(),
      messages: [msg({ id: "srv-1", status: "error" })],
    });
    ws.emit({
      type: "ai.stream.start",
      data: { conversationId: "c1", messageId: "srv-1" },
    });
    ws.emit({
      type: "ai.stream.error",
      data: { conversationId: "c1", messageId: "srv-1", error: "ai failed" },
    });
    await vi.waitFor(() => expect(chat.streamingMessageId.value).toBeNull());
    expect(chat.error.value).toBe("ai failed");
    expect(chat.messages.value[0].status).toBe("error");
    chat.teardown();
  });
});

describe("stop / regenerate", () => {
  it("stop calls the api and resyncs messages", async () => {
    chat.currentConversation.value = conv({ id: "c1" });
    chat.messages.value = [msg({ id: "x" })];
    chat.streamingMessageId.value = "x";
    chat.generatingConvIds.value = new Set(["c1"]);
    api.getAIConversation.mockResolvedValue({
      conversation: conv(),
      messages: [msg({ id: "final" })],
    });
    await chat.stop();
    expect(api.stopAIGeneration).toHaveBeenCalledWith("c1");
    expect(chat.messages.value.map((m) => m.id)).toEqual(["final"]);
    expect(chat.generatingConvIds.value.size).toBe(0);
  });

  it("regenerate drops the last assistant message and re-requests", async () => {
    chat.currentConversation.value = conv({ id: "c1" });
    chat.messages.value = [
      msg({ id: "u", role: "user" }),
      msg({ id: "a", role: "assistant" }),
    ];
    api.regenerateAIResponse.mockResolvedValue({
      assistantMessage: msg({ id: "a2" }),
    });
    await chat.regenerate();
    expect(api.regenerateAIResponse).toHaveBeenCalledWith("c1");
    const msgs = chat.messages.value;
    expect(msgs.map((m) => m.id)).toEqual(["u", "a2"]);
  });

  it("regenerate does nothing while streaming", async () => {
    chat.currentConversation.value = conv({ id: "c1" });
    chat.streamingMessageId.value = "x";
    await chat.regenerate();
    expect(api.regenerateAIResponse).not.toHaveBeenCalled();
  });
});
