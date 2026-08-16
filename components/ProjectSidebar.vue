<script setup lang="ts">
import { ref, computed } from "vue";
import {
  IconPlus,
  IconLayoutKanban,
  IconTrash,
  IconPencil,
  IconAlertTriangle,
  IconRefresh,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-vue";
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
  create: [name: string];
  edit: [id: number, name: string];
  delete: [id: number];
}>();

const ownedProjects = computed(() =>
  props.projects.filter((p) => p.role === "owner" || !p.role),
);
const memberProjects = computed(() =>
  props.projects.filter((p) => p.role && p.role !== "owner"),
);
const showOwned = ref(true);
const showMember = ref(true);

const showCreateForm = ref(false);
const newProjectName = ref("");

function handleCreate() {
  const name = newProjectName.value.trim();
  if (!name) return;
  emit("create", name);
  newProjectName.value = "";
  showCreateForm.value = false;
}

function cancelCreate() {
  showCreateForm.value = false;
  newProjectName.value = "";
}

const editTarget = ref<Project | null>(null);
const editName = ref("");

function startEdit(e: Event, project: Project) {
  e.stopPropagation();
  editTarget.value = project;
  editName.value = project.name;
}

function cancelEdit() {
  editTarget.value = null;
  editName.value = "";
}

function handleEditSave() {
  if (!editTarget.value || !editName.value.trim()) return;
  emit("edit", editTarget.value.id, editName.value.trim());
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
        <IconPlus :size="16" />
      </button>
    </div>

    <!-- Project list -->
    <div class="flex-1 overflow-y-auto px-2">
      <div v-if="loading" class="px-2 py-3 text-xs text-muted-foreground">
        {{ t("breadcrumbs.loading") }}
      </div>

      <template v-if="!loading">
        <!-- Owned projects subgroup -->
        <div v-if="ownedProjects.length > 0">
          <button
            class="flex w-full items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
            @click="showOwned = !showOwned"
          >
            <IconChevronDown v-if="showOwned" :size="13" class="shrink-0" />
            <IconChevronRight v-else :size="13" class="shrink-0" />
            {{ t("sidebar.ownedProjects") }}
            <span class="ml-auto text-[10px] font-normal opacity-60">{{
              ownedProjects.length
            }}</span>
          </button>
          <template v-if="showOwned">
            <button
              v-for="p in ownedProjects"
              :key="p.id"
              class="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition"
              :class="
                selectedProject === p.slug
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-foreground/70 hover:bg-muted'
              "
              @click="emit('select', p.slug)"
            >
              <IconLayoutKanban :size="15" class="shrink-0" />
              <span class="flex-1 truncate text-left">{{ p.name }}</span>
              <IconPencil
                v-if="canCreate"
                :size="13"
                class="shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                @click="(e) => startEdit(e, p)"
              />
              <IconTrash
                v-if="canCreate"
                :size="13"
                class="shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                @click="(e) => handleDelete(e, p)"
              />
            </button>
          </template>
        </div>

        <!-- Member projects subgroup -->
        <div v-if="memberProjects.length > 0">
          <button
            class="flex w-full items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
            @click="showMember = !showMember"
          >
            <IconChevronDown v-if="showMember" :size="13" class="shrink-0" />
            <IconChevronRight v-else :size="13" class="shrink-0" />
            {{ t("sidebar.memberProjects") }}
            <span class="ml-auto text-[10px] font-normal opacity-60">{{
              memberProjects.length
            }}</span>
          </button>
          <template v-if="showMember">
            <button
              v-for="p in memberProjects"
              :key="p.id"
              class="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition"
              :class="
                selectedProject === p.slug
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-foreground/70 hover:bg-muted'
              "
              @click="emit('select', p.slug)"
            >
              <IconLayoutKanban :size="15" class="shrink-0" />
              <span class="flex-1 truncate text-left">{{ p.name }}</span>
              <IconPencil
                v-if="canCreate"
                :size="13"
                class="shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                @click="(e) => startEdit(e, p)"
              />
              <IconTrash
                v-if="canCreate"
                :size="13"
                class="shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                @click="(e) => handleDelete(e, p)"
              />
            </button>
          </template>
        </div>

        <div
          v-if="projects.length === 0"
          class="px-2 py-3 text-xs text-muted-foreground"
        >
          {{ t("sidebar.noProjects") }}
        </div>
      </template>
    </div>

    <!-- Auto-refresh countdown -->
    <div
      v-if="isRemote && settings.autoRefreshEnabled && nextRefreshIn > 0"
      class="flex items-center gap-1.5 border-t border-foreground/10 px-3 py-2 text-xs text-muted-foreground"
    >
      <IconRefresh :size="12" class="shrink-0" />
      <span>{{ t("settings.nextRefreshIn") }} {{ nextRefreshIn }}s</span>
    </div>

    <!-- Create project modal -->
    <Form
      as="modal"
      :open="showCreateForm"
      @update:open="
        (v) => {
          if (!v) cancelCreate();
        }
      "
      @submit="handleCreate"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <IconPlus :size="18" class="text-primary" />
          <h2 class="text-sm font-semibold">
            {{ t("sidebar.createProject") }}
          </h2>
        </div>
      </template>
      <div class="space-y-3">
        <div>
          <label class="form-hint">{{ t("sidebar.projectName") }}</label>
          <input
            v-model="newProjectName"
            class="input-base mt-1 text-sm"
            :placeholder="t('sidebar.projectName')"
          />
        </div>
      </div>
      <template #submit>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-small" @click="cancelCreate">
            {{ t("sidebar.deleteCancelButton") }}
          </button>
          <button
            type="submit"
            class="btn-primary btn-small"
            :disabled="!newProjectName.trim()"
          >
            {{ t("sidebar.create") }}
          </button>
        </div>
      </template>
    </Form>

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
          <IconPencil :size="18" class="text-primary" />
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
          <IconAlertTriangle :size="18" class="text-destructive" />
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
