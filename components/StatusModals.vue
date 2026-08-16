<script setup lang="ts">
import { ref } from "vue";
import { IconAlertTriangle, IconPencil, IconTrash } from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import { mapApiError } from "@/lib/apiErrors";
import Form from "@/components/Form.vue";
import type { TaskStatus } from "@/lib/types";

const STATUS_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
];

const { t } = useI18n();

const props = defineProps<{
  readOnly: boolean;
  projectSlug: string;
  statuses: TaskStatus[];
  createStatus: (
    slug: string,
    name: string,
    color: string,
    position: number,
    isEnd: boolean,
  ) => Promise<TaskStatus>;
  updateStatus: (
    slug: string,
    id: number,
    name: string,
    color: string,
    position: number,
    isEnd: boolean,
  ) => Promise<TaskStatus>;
  deleteStatus: (slug: string, id: number) => Promise<void>;
}>();

const emit = defineEmits<{
  error: [message: string];
  dataChanged: [];
}>();

const showCreate = ref(false);
const newName = ref("");
const newColor = ref("#3b82f6");

const editTarget = ref<TaskStatus | null>(null);
const editName = ref("");
const editColor = ref("");

const deleteTarget = ref<TaskStatus | null>(null);

async function handleCreate() {
  if (!newName.value.trim()) return;
  if (props.readOnly) {
    emit("error", t("board.readOnlyError"));
    return;
  }
  try {
    await props.createStatus(
      props.projectSlug,
      newName.value.trim(),
      newColor.value,
      props.statuses.length,
      false,
    );
    newName.value = "";
    newColor.value = "#3b82f6";
    showCreate.value = false;
    emit("dataChanged");
  } catch (e) {
    emit("error", mapApiError(e, t));
  }
}

function startEdit(status: TaskStatus) {
  editTarget.value = status;
  editName.value = status.name;
  editColor.value = status.color;
}

function cancelEdit() {
  editTarget.value = null;
  editName.value = "";
  editColor.value = "";
}

async function handleUpdate() {
  if (!editTarget.value || !editName.value.trim()) return;
  if (props.readOnly) {
    emit("error", t("board.readOnlyError"));
    return;
  }
  try {
    await props.updateStatus(
      props.projectSlug,
      editTarget.value.id,
      editName.value.trim(),
      editColor.value,
      editTarget.value.position,
      false,
    );
    cancelEdit();
    emit("dataChanged");
  } catch (e) {
    emit("error", mapApiError(e, t));
  }
}

function startDelete(status: TaskStatus) {
  deleteTarget.value = status;
}

function cancelDelete() {
  deleteTarget.value = null;
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  if (props.readOnly) {
    emit("error", t("board.readOnlyError"));
    return;
  }
  try {
    await props.deleteStatus(props.projectSlug, deleteTarget.value.id);
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
  <!-- Create status modal -->
  <Form
    as="modal"
    :open="showCreate"
    @update:open="(v) => (showCreate = v)"
    @submit="handleCreate"
  >
    <template #header>
      <h2 class="text-sm font-semibold">{{ t("board.addStatus") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.statusName") }}</label>
        <input
          v-model="newName"
          class="input-base mt-1 text-sm"
          :placeholder="t('board.statusName')"
        />
      </div>
      <div>
        <label class="form-hint">{{ t("board.statusColor") }}</label>
        <div class="mt-2 grid grid-cols-9 gap-1.5">
          <button
            v-for="color in STATUS_COLORS"
            :key="color"
            type="button"
            class="h-7 w-7 rounded-md border-2 transition-transform hover:scale-110"
            :class="
              newColor.toLowerCase() === color
                ? 'border-zinc-900 dark:border-zinc-100'
                : 'border-transparent'
            "
            :style="{ backgroundColor: color }"
            @click="newColor = color"
          />
        </div>
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

  <!-- Edit status modal -->
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
      <h2 class="text-sm font-semibold">{{ t("board.editStatus") }}</h2>
    </template>
    <div class="space-y-3">
      <div>
        <label class="form-hint">{{ t("board.statusName") }}</label>
        <input v-model="editName" class="input-base mt-1 text-sm" />
      </div>
      <div>
        <label class="form-hint">{{ t("board.statusColor") }}</label>
        <div class="mt-2 grid grid-cols-9 gap-1.5">
          <button
            v-for="color in STATUS_COLORS"
            :key="color"
            type="button"
            class="h-7 w-7 rounded-md border-2 transition-transform hover:scale-110"
            :class="
              editColor.toLowerCase() === color
                ? 'border-zinc-900 dark:border-zinc-100'
                : 'border-transparent'
            "
            :style="{ backgroundColor: color }"
            @click="editColor = color"
          />
        </div>
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

  <!-- Delete status modal -->
  <Form
    as="modal"
    destructive
    :open="!!deleteTarget"
    @update:open="
      (v) => {
        if (!v) cancelDelete();
      }
    "
    @submit="handleDelete"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <IconAlertTriangle :size="18" class="text-destructive" />
        <h2 class="text-sm font-semibold">{{ t("board.deleteStatus") }}</h2>
      </div>
    </template>
    <p class="text-sm text-muted-foreground">
      {{ t("board.deleteStatusConfirm") }}
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
