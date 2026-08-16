<script setup lang="ts">
import { ref } from "vue";
import { IconAlertTriangle } from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import { mapApiError } from "@/lib/apiErrors";
import Form from "@/components/Form.vue";
import type { Board } from "@/lib/types";

const { t } = useI18n();

const props = defineProps<{
  readOnly: boolean;
  projectSlug: string;
  boards: Board[];
  createBoard: (slug: string, name: string) => Promise<Board>;
  updateBoard: (slug: string, id: number, name: string) => Promise<Board>;
  deleteBoard: (slug: string, id: number) => Promise<void>;
}>();

const emit = defineEmits<{
  error: [message: string];
  dataChanged: [];
}>();

const showCreate = ref(false);
const newName = ref("");

const editTarget = ref<Board | null>(null);
const editName = ref("");

const deleteTarget = ref<Board | null>(null);

async function handleCreate() {
  if (!newName.value.trim()) return;
  if (props.readOnly) {
    emit("error", t("board.readOnlyError"));
    return;
  }
  try {
    await props.createBoard(props.projectSlug, newName.value.trim());
    newName.value = "";
    showCreate.value = false;
    emit("dataChanged");
  } catch (e) {
    emit("error", mapApiError(e, t));
  }
}

function startEdit(board: Board) {
  editTarget.value = board;
  editName.value = board.name;
}

function cancelEdit() {
  editTarget.value = null;
  editName.value = "";
}

async function handleUpdate() {
  if (!editTarget.value || !editName.value.trim()) return;
  if (props.readOnly) {
    emit("error", t("board.readOnlyError"));
    return;
  }
  try {
    await props.updateBoard(
      props.projectSlug,
      editTarget.value.id,
      editName.value.trim(),
    );
    cancelEdit();
    emit("dataChanged");
  } catch (e) {
    emit("error", mapApiError(e, t));
  }
}

function startDelete(board: Board) {
  deleteTarget.value = board;
}

function cancelDelete() {
  deleteTarget.value = null;
}

async function handleDeleteConfirm() {
  if (!deleteTarget.value) return;
  if (props.readOnly) {
    emit("error", t("board.readOnlyError"));
    return;
  }
  try {
    await props.deleteBoard(props.projectSlug, deleteTarget.value.id);
    deleteTarget.value = null;
    emit("dataChanged");
  } catch (e) {
    emit("error", mapApiError(e, t));
  }
}

function openCreateModal() {
  showCreate.value = true;
}

defineExpose({ openCreateModal, startEdit, startDelete });
</script>

<template>
  <!-- Create board modal -->
  <Form
    as="modal"
    :open="showCreate"
    @update:open="(v) => (showCreate = v)"
    @submit="handleCreate"
  >
    <template #header>
      <h2 class="text-sm font-semibold">{{ t("board.addBoard") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.boardName") }}</label>
        <input
          v-model="newName"
          class="input-base mt-1 text-sm"
          :placeholder="t('board.boardName')"
        />
      </div>
    </div>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-small" @click="showCreate = false">
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-primary btn-small"
          :disabled="!newName.trim()"
        >
          {{ t("board.create") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Edit board modal -->
  <Form
    as="modal"
    :open="!!editTarget"
    @update:open="
      (v) => {
        if (!v) cancelEdit();
      }
    "
    @submit="handleUpdate"
  >
    <template #header>
      <h2 class="text-sm font-semibold">{{ t("board.editBoard") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.boardName") }}</label>
        <input v-model="editName" class="input-base mt-1 text-sm" />
      </div>
    </div>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-small" @click="cancelEdit">
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-primary btn-small"
          :disabled="!editName.trim()"
        >
          {{ t("board.save") }}
        </button>
      </div>
    </template>
  </Form>

  <!-- Delete board modal -->
  <Form
    as="modal"
    destructive
    :open="!!deleteTarget"
    @update:open="
      (v) => {
        if (!v) cancelDelete();
      }
    "
    @submit="handleDeleteConfirm"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <IconAlertTriangle :size="18" class="text-destructive" />
        <h2 class="text-sm font-semibold">{{ t("board.deleteBoard") }}</h2>
      </div>
    </template>
    <p class="text-sm text-muted-foreground">
      {{ t("board.deleteBoardConfirm") }}
    </p>
    <template #submit>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-small" @click="cancelDelete">
          {{ t("board.cancel") }}
        </button>
        <button
          type="submit"
          class="btn-small bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {{ t("board.delete") }}
        </button>
      </div>
    </template>
  </Form>
</template>
