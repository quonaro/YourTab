<script setup lang="ts">
import { ref } from "vue";
import {
  Plus,
  FolderKanban,
  Trash2,
  Pencil,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";
import { useSettings } from "@/composables/useSettings";
import { useRefreshCountdown } from "@/composables/useRefreshCountdown";
import type { Project } from "@/lib/types";
import Form from "@/components/Form.vue";

const { t } = useI18n();
const { settings } = useSettings();
const { nextRefreshIn } = useRefreshCountdown();

const props = defineProps<{
  projects: Project[];
  selectedProject: string | null;
  loading?: boolean;
  canCreate?: boolean;
  isRemote?: boolean;
}>();

const emit = defineEmits<{
  select: [slug: string];
  create: [name: string, description?: string];
  edit: [id: number, name: string, description?: string];
  delete: [id: number];
}>();

const showCreateForm = ref(false);
const newProjectName = ref("");
const newProjectDesc = ref("");

function handleCreate() {
  const name = newProjectName.value.trim();
  if (!name) return;
  emit("create", name, newProjectDesc.value.trim() || undefined);
  newProjectName.value = "";
  newProjectDesc.value = "";
  showCreateForm.value = false;
}

const editTarget = ref<Project | null>(null);
const editName = ref("");
const editDesc = ref("");

function startEdit(e: Event, project: Project) {
  e.stopPropagation();
  editTarget.value = project;
  editName.value = project.name;
  editDesc.value = project.description ?? "";
}

function cancelEdit() {
  editTarget.value = null;
  editName.value = "";
  editDesc.value = "";
}

function handleEditSave() {
  if (!editTarget.value || !editName.value.trim()) return;
  emit(
    "edit",
    editTarget.value.id,
    editName.value.trim(),
    editDesc.value.trim() || undefined,
  );
  cancelEdit();
}

const deleteTarget = ref<Project | null>(null);

function handleDelete(e: Event, project: Project) {
  e.stopPropagation();
  deleteTarget.value = project;
}

function confirmDelete() {
  if (deleteTarget.value) {
    emit("delete", deleteTarget.value.id);
    deleteTarget.value = null;
  }
}
</script>

<template>
  <aside
    class="flex w-60 shrink-0 flex-col border-r border-foreground/10 bg-muted/20"
  >
    <div class="flex items-center justify-between px-3 py-2.5">
      <span
        class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {{ t("sidebar.projects") }}
      </span>
      <button
        v-if="canCreate"
        class="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        :title="t('sidebar.createProject')"
        @click="showCreateForm = !showCreateForm"
      >
        <Plus :size="16" />
      </button>
    </div>

    <!-- Create project form -->
    <div v-if="showCreateForm" class="space-y-2 px-3 pb-2">
      <input
        v-model="newProjectName"
        class="input-base h-8 text-sm"
        :placeholder="t('sidebar.projectName')"
        @keyup.enter="handleCreate"
      />
      <input
        v-model="newProjectDesc"
        class="input-base h-8 text-sm"
        :placeholder="t('sidebar.projectDesc')"
      />
      <div class="flex gap-2">
        <button class="btn-small flex-1" @click="handleCreate">
          {{ t("sidebar.create") }}
        </button>
        <button class="btn-small" @click="showCreateForm = false">
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- Project list -->
    <div class="flex-1 overflow-y-auto px-2">
      <div v-if="loading" class="px-2 py-3 text-xs text-muted-foreground">
        {{ t("breadcrumbs.loading") }}
      </div>
      <button
        v-for="p in projects"
        :key="p.id"
        class="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition"
        :class="
          selectedProject === p.slug
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-foreground/70 hover:bg-muted'
        "
        @click="emit('select', p.slug)"
      >
        <FolderKanban :size="15" class="shrink-0" />
        <span class="flex-1 truncate text-left">{{ p.name }}</span>
        <Pencil
          v-if="canCreate"
          :size="13"
          class="shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-foreground"
          @click="(e) => startEdit(e, p)"
        />
        <Trash2
          v-if="canCreate"
          :size="13"
          class="shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-destructive"
          @click="(e) => handleDelete(e, p)"
        />
      </button>
      <div
        v-if="!loading && projects.length === 0"
        class="px-2 py-3 text-xs text-muted-foreground"
      >
        {{ t("sidebar.noProjects") }}
      </div>
    </div>

    <!-- Auto-refresh countdown -->
    <div
      v-if="isRemote && settings.autoRefreshEnabled && nextRefreshIn > 0"
      class="flex items-center gap-1.5 border-t border-foreground/10 px-3 py-2 text-xs text-muted-foreground"
    >
      <RefreshCw :size="12" class="shrink-0" />
      <span>{{ t("settings.nextRefreshIn") }} {{ nextRefreshIn }}s</span>
    </div>

    <!-- Edit project modal -->
    <Form
      as="modal"
      :open="!!editTarget"
      @update:open="
        (v) => {
          if (!v) cancelEdit();
        }
      "
      @submit="handleEditSave"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <Pencil :size="18" class="text-primary" />
          <h2 class="text-sm font-semibold">{{ t("sidebar.editProject") }}</h2>
        </div>
      </template>
      <div class="space-y-3">
        <div>
          <label class="form-hint">{{ t("sidebar.projectName") }}</label>
          <input
            v-model="editName"
            class="input-base mt-1 text-sm"
            :placeholder="t('sidebar.projectName')"
          />
        </div>
        <div>
          <label class="form-hint">{{ t("sidebar.projectDesc") }}</label>
          <input
            v-model="editDesc"
            class="input-base mt-1 text-sm"
            :placeholder="t('sidebar.projectDesc')"
          />
        </div>
      </div>
      <template #submit>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-small" @click="cancelEdit">
            {{ t("sidebar.editCancelButton") }}
          </button>
          <button
            type="submit"
            class="btn-primary btn-small"
            :disabled="!editName.trim()"
          >
            {{ t("sidebar.editSaveButton") }}
          </button>
        </div>
      </template>
    </Form>

    <!-- Delete confirmation modal -->
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
          <AlertTriangle :size="18" class="text-destructive" />
          <h2 class="text-sm font-semibold">
            {{ t("sidebar.deleteConfirmTitle") }}
          </h2>
        </div>
      </template>
      <p class="text-sm text-muted-foreground">
        {{ t("sidebar.deleteConfirmText") }}
      </p>
      <template #submit>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-small" @click="deleteTarget = null">
            {{ t("sidebar.deleteCancelButton") }}
          </button>
          <button
            type="submit"
            class="btn-small bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {{ t("sidebar.deleteConfirmButton") }}
          </button>
        </div>
      </template>
    </Form>
  </aside>
</template>

<style scoped>
.dropdown-panel {
  border: 1px solid hsl(var(--border, 240 5% 90%));
  border-radius: 0.5rem;
  background: hsl(var(--background, 0 0% 100%));
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
}
</style>
