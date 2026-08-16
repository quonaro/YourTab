<script setup lang="ts">
import { ref } from "vue";
import {
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconNotes,
} from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import { useNotes } from "@/composables/useNotes";
import Form from "@/components/Form.vue";

const { t, locale } = useI18n();
const { notes, activeNoteId, createNote, deleteNote, selectNote } = useNotes();

const emit = defineEmits<{
  select: [];
}>();

function noteTitle(text: string): string {
  const firstLine = text
    .trim()
    .split("\n")
    .find((l) => l.trim());
  if (!firstLine) return t("notes.untitled");
  return firstLine.replace(/^#+\s*/, "").substring(0, 28);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const lang = locale.value === "ru" ? "ru-RU" : "en-US";
  if (isToday) {
    return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(lang, { day: "numeric", month: "short" });
}

function handleCreateNote() {
  createNote();
  emit("select");
}

// ─── Delete note confirmation ───
const deleteTargetId = ref<string | null>(null);

function handleDeleteNote(id: string) {
  deleteTargetId.value = id;
}

function confirmDeleteNote() {
  if (deleteTargetId.value) {
    deleteNote(deleteTargetId.value);
    deleteTargetId.value = null;
  }
}

function handleSelectNote(id: string) {
  selectNote(id);
  emit("select");
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5">
      <span
        class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {{ t("notes.title") }}
      </span>
      <button
        class="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        :title="t('notes.newNote')"
        @click="handleCreateNote"
      >
        <IconPlus :size="16" />
      </button>
    </div>

    <!-- Note list -->
    <div class="min-h-0 flex-1 overflow-y-auto px-2">
      <div class="mt-1.5" />
      <button
        v-for="n in notes"
        :key="n.id"
        class="group flex w-full items-center gap-2 rounded-lg py-2 px-2.5 text-sm transition"
        :class="
          n.id === activeNoteId
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-foreground/70 hover:bg-muted'
        "
        @click="handleSelectNote(n.id)"
      >
        <IconNotes :size="15" class="shrink-0" />
        <span class="min-w-0 flex-1 truncate text-left">{{
          noteTitle(n.text)
        }}</span>
        <span
          class="shrink-0 text-[10px] font-normal tabular-nums"
          :class="
            n.id === activeNoteId
              ? 'text-primary/60'
              : 'text-muted-foreground/60'
          "
        >
          {{ formatDate(n.updatedAt) }}
        </span>
        <IconTrash
          :size="13"
          class="shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-destructive"
          @click.stop="handleDeleteNote(n.id)"
        />
      </button>
      <div
        v-if="notes.length === 0"
        class="px-2 py-3 text-xs text-muted-foreground"
      >
        {{ t("notes.empty") }}
      </div>
    </div>

    <!-- Delete note confirmation modal -->
    <Form
      as="modal"
      destructive
      :open="!!deleteTargetId"
      @update:open="
        (v) => {
          if (!v) deleteTargetId = null;
        }
      "
      @submit="confirmDeleteNote"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <IconAlertTriangle :size="18" class="text-destructive" />
          <h2 class="text-sm font-semibold">
            {{ t("notes.deleteConfirmTitle") }}
          </h2>
        </div>
      </template>
      <p class="text-sm text-muted-foreground">
        {{ t("notes.deleteConfirmText") }}
      </p>
      <template #submit>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn-small"
            @click="deleteTargetId = null"
          >
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
  </div>
</template>
