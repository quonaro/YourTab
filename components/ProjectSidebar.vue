<script setup lang="ts">
import { ref } from "vue";
import {
  Plus,
  FolderKanban,
  Trash2,
  Pencil,
  X,
  AlertTriangle,
} from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";
import type { Project } from "@/lib/types";

const { t } = useI18n();

const props = defineProps<{
  projects: Project[];
  selectedProject: string | null;
  loading?: boolean;
  canCreate?: boolean;
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

    <!-- Edit project modal -->
    <div
      v-if="editTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="cancelEdit"
    >
      <div class="dropdown-panel w-80 rounded-xl p-4">
        <div class="mb-3 flex items-center gap-2">
          <Pencil :size="18" class="text-primary" />
          <span class="text-sm font-semibold">{{
            t("sidebar.editProject")
          }}</span>
        </div>
        <div class="space-y-3">
          <div>
            <label class="form-hint">{{ t("sidebar.projectName") }}</label>
            <input
              v-model="editName"
              class="input-base mt-1 text-sm"
              :placeholder="t('sidebar.projectName')"
              @keyup.enter="handleEditSave"
            />
          </div>
          <div>
            <label class="form-hint">{{ t("sidebar.projectDesc") }}</label>
            <input
              v-model="editDesc"
              class="input-base mt-1 text-sm"
              :placeholder="t('sidebar.projectDesc')"
              @keyup.enter="handleEditSave"
            />
          </div>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-small" @click="cancelEdit">
            {{ t("sidebar.editCancelButton") }}
          </button>
          <button
            class="btn-primary btn-small"
            :disabled="!editName.trim()"
            @click="handleEditSave"
          >
            {{ t("sidebar.editSaveButton") }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="deleteTarget = null"
    >
      <div class="dropdown-panel w-80 rounded-xl p-4">
        <div class="mb-3 flex items-center gap-2">
          <AlertTriangle :size="18" class="text-destructive" />
          <span class="text-sm font-semibold">{{
            t("sidebar.deleteConfirmTitle")
          }}</span>
        </div>
        <p class="mb-4 text-sm text-muted-foreground">
          {{ t("sidebar.deleteConfirmText") }}
        </p>
        <div class="flex justify-end gap-2">
          <button class="btn-small" @click="deleteTarget = null">
            {{ t("sidebar.deleteCancelButton") }}
          </button>
          <button
            class="btn-small bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            {{ t("sidebar.deleteConfirmButton") }}
          </button>
        </div>
      </div>
    </div>
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
