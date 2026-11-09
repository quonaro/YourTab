<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import {
  IconX,
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconSend,
  IconPlayerStop,
  IconLoader2,
  IconLock,
  IconRefresh,
  IconAlertTriangle,
  IconSparkles,
  IconBulb,
} from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import { useAiChat } from "@/composables/useAiChat";
import { useSettings } from "@/composables/useSettings";
import { renderMarkdown } from "@/lib/markdown";
import { sanitizeAiText } from "@/lib/aiText";
import Form from "@/components/Form.vue";
import type { AiConversation, AiMessage } from "@/lib/types";

const { t } = useI18n();
const { settings, saveSettings } = useSettings();
const {
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
} = useAiChat();

const open = defineModel<boolean>("open", { default: false });

type View = "list" | "chat";
const view = ref<View>("list");
const inputText = ref("");
const deleteTarget = ref<AiConversation | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

onMounted(() => {
  init();
  if (accessState.value === "granted") {
    void loadConversations();
    if (!currentConversation.value) view.value = "list";
  }
});

onUnmounted(() => {
  teardown();
});

const inChat = computed(() => view.value === "chat");
const headerTitle = computed(() =>
  inChat.value
    ? currentConversation.value?.title || t("ai.newChat")
    : t("ai.title"),
);

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

async function handleOpen(conv: AiConversation) {
  view.value = "chat";
  await openConversation(conv.id);
  scrollToBottom();
}

function handleNewChat() {
  newChat();
  view.value = "chat";
  nextTick(() => textareaRef.value?.focus());
}

function handleBack() {
  backToList();
  view.value = "list";
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  const wasCurrent = currentConversation.value?.id === deleteTarget.value.id;
  await removeConversation(deleteTarget.value.id);
  deleteTarget.value = null;
  if (wasCurrent) view.value = "list";
}

function handleSend() {
  const text = inputText.value;
  inputText.value = "";
  void send(text).then(scrollToBottom);
}

function scrollToBottom() {
  nextTick(() => {
    const el = scrollContainer.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// Auto-scroll while streaming and when new messages arrive.
watch(
  () => [
    messages.value.length,
    messages.value[messages.value.length - 1]?.content.length,
  ],
  () => {
    if (inChat.value) scrollToBottom();
  },
);

function close() {
  open.value = false;
}

const lastAssistantId = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === "assistant") return messages.value[i].id;
  }
  return null;
});

function showRegenerate(msg: AiMessage): boolean {
  return (
    msg.id === lastAssistantId.value &&
    msg.status === "complete" &&
    !isStreaming.value
  );
}

// Provider-leaked harmony markup (channel labels, special tokens) is split
// into visible content and reasoning at render time — covers both persisted
// messages and live deltas.
function msgContent(msg: AiMessage): string {
  return sanitizeAiText(msg.content).content;
}

function msgReasoning(msg: AiMessage): string {
  const extracted = sanitizeAiText(msg.content).reasoning;
  const live =
    msg.id === streamingMessageId.value
      ? streamingReasoning.value
      : (msg.reasoning ?? "");
  return [extracted, live].filter(Boolean).join("\n");
}

function toolStatusLabel(status: string): string {
  if (status === "calling") return "…";
  return "";
}

// ─── Resizable panel width ───
const panelWidth = ref(settings.value.aiPanelWidth ?? 480);
const resizing = ref(false);
const MIN_WIDTH = 320;

function maxWidth(): number {
  return Math.min(900, Math.round(window.innerWidth * 0.7));
}

function startResize(e: PointerEvent) {
  e.preventDefault();
  resizing.value = true;
  const startX = e.clientX;
  const startW = panelWidth.value;
  const onMove = (ev: PointerEvent) => {
    panelWidth.value = Math.min(
      maxWidth(),
      Math.max(MIN_WIDTH, startW + (startX - ev.clientX)),
    );
  };
  const onUp = () => {
    resizing.value = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    settings.value.aiPanelWidth = panelWidth.value;
    saveSettings();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
</script>

<template>
  <!-- Panel (inline right column) -->
  <aside
    class="relative m-4 flex shrink-0 flex-col self-stretch overflow-hidden rounded-xl border border-foreground/10 bg-card"
    :class="{ 'select-none': resizing }"
    :style="{ width: panelWidth + 'px' }"
  >
    <!-- Resize handle (left edge) -->
    <div
      class="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition hover:bg-primary/30"
      :class="{ 'bg-primary/40': resizing }"
      @pointerdown="startResize"
    />

    <!-- Header -->
    <div
      class="flex items-center justify-between border-b border-foreground/10 px-4 py-3"
    >
      <div class="flex min-w-0 items-center gap-2">
        <button
          v-if="inChat"
          class="rounded-lg p-1 text-muted-foreground transition hover:bg-muted"
          @click="handleBack"
        >
          <IconArrowLeft :size="16" />
        </button>
        <h2 class="truncate text-sm font-semibold text-foreground">
          {{ headerTitle }}
        </h2>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="!inChat && accessState === 'granted'"
          class="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          :title="t('ai.newChat')"
          @click="handleNewChat"
        >
          <IconPlus :size="16" />
        </button>
        <button
          class="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted"
          @click="close"
        >
          <IconX :size="18" />
        </button>
      </div>
    </div>

    <!-- No subscription -->
    <div
      v-if="accessState === 'no_addon'"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <IconLock :size="32" class="text-muted-foreground" />
      <p class="text-sm font-medium text-foreground">{{ t("ai.noAccess") }}</p>
      <p class="text-xs text-muted-foreground">
        {{ t("ai.noAccessDescription") }}
      </p>
    </div>

    <!-- Access check error -->
    <div
      v-else-if="accessState === 'error'"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <IconAlertTriangle :size="32" class="text-muted-foreground" />
      <p class="text-sm text-muted-foreground">{{ t("ai.errorOccurred") }}</p>
      <button class="btn-small" @click="checkAccess">
        {{ t("ai.retry") }}
      </button>
    </div>

    <!-- Checking -->
    <div
      v-else-if="accessState === 'checking' || accessState === 'idle'"
      class="flex flex-1 items-center justify-center"
    >
      <IconLoader2 :size="24" class="animate-spin text-muted-foreground" />
    </div>

    <!-- Conversation list -->
    <template v-else-if="!inChat">
      <div class="flex-1 overflow-y-auto">
        <div
          v-if="conversations.length === 0 && !loading"
          class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
        >
          <IconSparkles :size="32" class="text-muted-foreground" />
          <p class="text-sm text-muted-foreground">{{ t("ai.empty") }}</p>
          <button class="btn-primary btn-small" @click="handleNewChat">
            {{ t("ai.newChat") }}
          </button>
        </div>

        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="group flex w-full cursor-pointer items-center gap-2 border-b border-foreground/5 px-4 py-3 text-left transition hover:bg-muted/50"
          @click="handleOpen(conv)"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-foreground">
              {{ conv.title || t("ai.newChat") }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ formatDate(conv.lastMessageAt || conv.createdAt) }}
            </p>
          </div>
          <IconLoader2
            v-if="generatingConvIds.has(conv.id)"
            :size="14"
            class="shrink-0 animate-spin text-primary"
          />
          <button
            class="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            :title="t('ai.deleteConversation')"
            @click.stop="deleteTarget = conv"
          >
            <IconTrash :size="14" />
          </button>
        </div>

        <div v-if="loading" class="flex justify-center p-4">
          <IconLoader2 :size="20" class="animate-spin text-muted-foreground" />
        </div>
      </div>
    </template>

    <!-- Chat view -->
    <template v-else>
      <div ref="scrollContainer" class="flex-1 space-y-4 overflow-y-auto p-4">
        <div
          v-if="loading && messages.length === 0"
          class="flex h-full items-center justify-center"
        >
          <IconLoader2 :size="24" class="animate-spin text-muted-foreground" />
        </div>

        <!-- Empty draft state -->
        <div
          v-else-if="messages.length === 0"
          class="flex h-full flex-col items-center justify-center gap-3 text-center"
        >
          <IconSparkles :size="32" class="text-muted-foreground" />
          <p class="text-sm text-muted-foreground">
            {{ t("ai.welcomeDescription") }}
          </p>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="text-sm"
            :class="
              msg.role === 'user'
                ? 'max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-primary-foreground'
                : 'w-full py-1 text-foreground'
            "
          >
            <!-- User message -->
            <template v-if="msg.role === 'user'">
              <p class="whitespace-pre-wrap break-words">{{ msg.content }}</p>
            </template>

            <!-- Assistant message -->
            <template v-else>
              <details
                v-if="msgReasoning(msg)"
                class="mb-2 text-xs text-muted-foreground"
              >
                <summary class="cursor-pointer">
                  {{ t("ai.reasoning") }}
                </summary>
                <p class="mt-1 whitespace-pre-wrap">{{ msgReasoning(msg) }}</p>
              </details>

              <div
                v-if="msgContent(msg)"
                class="ai-markdown break-words"
                v-html="renderMarkdown(msgContent(msg))"
              />

              <!-- Streaming indicator -->
              <div
                v-if="msg.id === streamingMessageId && !msgContent(msg)"
                class="flex items-center gap-2 text-muted-foreground"
              >
                <IconLoader2 :size="14" class="animate-spin" />
                <span class="text-xs">{{ t("ai.thinking") }}</span>
              </div>

              <!-- Active tool calls -->
              <div
                v-if="msg.id === streamingMessageId && activeToolCalls.length"
                class="mt-2 space-y-1"
              >
                <div
                  v-for="(tc, i) in activeToolCalls"
                  :key="i"
                  class="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <IconLoader2
                    v-if="tc.status === 'calling'"
                    :size="11"
                    class="animate-spin"
                  />
                  <IconBulb v-else :size="11" />
                  <span>{{ tc.toolName }}{{ toolStatusLabel(tc.status) }}</span>
                </div>
              </div>

              <!-- Error state -->
              <p
                v-if="msg.status === 'error'"
                class="mt-1 text-xs text-destructive"
              >
                {{ msg.error || t("ai.errorOccurred") }}
              </p>

              <!-- Regenerate -->
              <button
                v-if="showRegenerate(msg)"
                class="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                :title="t('ai.regenerate')"
                @click="regenerate"
              >
                <IconRefresh :size="12" />
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Error banner -->
      <p
        v-if="error"
        class="border-t border-foreground/10 bg-destructive/10 px-4 py-2 text-xs text-destructive"
      >
        {{ error }}
      </p>

      <!-- Input -->
      <div class="border-t border-foreground/10 p-3">
        <div class="flex items-end gap-2">
          <textarea
            ref="textareaRef"
            v-model="inputText"
            rows="1"
            class="input-base max-h-32 flex-1 resize-none py-2 text-sm"
            :placeholder="t('ai.placeholder')"
            @keydown.enter.exact.prevent="handleSend"
          />
          <button
            v-if="isStreaming"
            class="btn-small flex h-9 w-9 shrink-0 items-center justify-center !p-0"
            :title="t('ai.stop')"
            @click="stop"
          >
            <IconPlayerStop :size="16" />
          </button>
          <button
            v-else
            class="btn-primary flex h-9 w-9 shrink-0 items-center justify-center !p-0"
            :disabled="!inputText.trim() || sending"
            :title="t('ai.send')"
            @click="handleSend"
          >
            <IconSend :size="16" />
          </button>
        </div>
      </div>
    </template>

    <!-- Delete conversation confirmation -->
    <Form
      as="modal"
      destructive
      :open="!!deleteTarget"
      @update:open="
        (v) => {
          if (!v) deleteTarget = null;
        }
      "
      @submit="confirmDelete"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <IconAlertTriangle :size="18" class="text-destructive" />
          <h2 class="text-sm font-semibold">
            {{ t("ai.deleteConfirmTitle") }}
          </h2>
        </div>
      </template>
      <p class="text-sm text-muted-foreground">
        {{ t("ai.deleteConfirmText") }}
      </p>
      <template #submit>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-small" @click="deleteTarget = null">
            {{ t("common.cancel") }}
          </button>
          <button
            type="submit"
            class="btn-small bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {{ t("common.delete") }}
          </button>
        </div>
      </template>
    </Form>
  </aside>
</template>

<style>
.ai-markdown > *:first-child {
  margin-top: 0;
}
.ai-markdown > *:last-child {
  margin-bottom: 0;
}
.ai-markdown p {
  margin: 0.5em 0;
}
.ai-markdown pre {
  margin: 0.5em 0;
  overflow-x: auto;
  border-radius: 0.375rem;
  background: hsl(var(--foreground) / 0.08);
  padding: 0.5rem;
  font-size: 0.75rem;
}
.ai-markdown code {
  font-size: 0.85em;
}
.ai-markdown ul,
.ai-markdown ol {
  margin: 0.5em 0;
  padding-left: 1.25em;
}
.ai-markdown ul {
  list-style: disc;
}
.ai-markdown ol {
  list-style: decimal;
}
.ai-markdown a {
  color: hsl(var(--primary));
  text-decoration: underline;
}
.ai-markdown h1,
.ai-markdown h2,
.ai-markdown h3,
.ai-markdown h4 {
  margin: 0.75em 0 0.35em;
  font-weight: 600;
}
.ai-markdown blockquote {
  margin: 0.5em 0;
  border-left: 2px solid hsl(var(--foreground) / 0.2);
  padding-left: 0.75em;
  color: hsl(var(--muted-foreground));
}
.ai-markdown .md-table-wrap {
  overflow-x: auto;
}
.ai-markdown table {
  border-collapse: collapse;
  font-size: 0.8em;
}
.ai-markdown th,
.ai-markdown td {
  border: 1px solid hsl(var(--foreground) / 0.15);
  padding: 0.25rem 0.5rem;
}
</style>
