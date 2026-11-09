<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { IconSettings, IconSparkles } from "@tabler/icons-vue";
import { useTheme } from "@/composables/useTheme";
import { useI18n } from "@/composables/useI18n";
import { useSettings } from "@/composables/useSettings";
import { useOrgData, type OrgType } from "@/composables/useOrgData";
import { useAuth } from "@/composables/useAuth";
import { useAiChat } from "@/composables/useAiChat";
import { readLastLocation, writeLastLocation } from "@/lib/settings";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import AgileBoard from "@/components/AgileBoard.vue";
import ProjectSidebar from "@/components/ProjectSidebar.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import QuickLinks from "@/components/QuickLinks.vue";
import SidebarNotes from "@/components/SidebarNotes.vue";
import AiChatSidebar from "@/components/AiChatSidebar.vue";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import type { Project } from "@/lib/types";

const { t } = useI18n();
const { initTheme } = useTheme();
const { settings } = useSettings();
const { isAuthenticated } = useAuth();
const { accessState: aiAccess, checkAccess: checkAiAccess } = useAiChat();

const selectedOrg = ref<string | null>(null);
const selectedProject = ref<string | null>(null);
const breadcrumbsRef = ref<InstanceType<typeof Breadcrumbs> | null>(null);
const settingsOpen = ref(false);
const aiOpen = ref(true);
const isRestoring = ref(false);
const pendingProject = ref<string | null>(null);

const orgType = computed<OrgType>(() =>
  selectedOrg.value === "local" || !selectedOrg.value ? "local" : "remote",
);

// AI chats live on the server — hidden for the local (extension-only) org.
const aiVisible = computed(
  () => aiAccess.value === "granted" && orgType.value !== "local",
);

const orgData = useOrgData(orgType, selectedOrg);

function persistLocation() {
  writeLastLocation({ org: selectedOrg.value, project: selectedProject.value });
}

function tryRestoreProject() {
  if (!pendingProject.value) return;
  const slug = pendingProject.value;
  if (slug === "__notes__") {
    selectedProject.value = slug;
    pendingProject.value = null;
    return;
  }
  const exists = sidebarProjects.value.some((p) => p.slug === slug);
  if (exists) {
    selectedProject.value = slug;
    pendingProject.value = null;
  }
}

watch(isAuthenticated, (v) => {
  if (v) void checkAiAccess();
});

onMounted(async () => {
  initTheme();
  if (isAuthenticated.value) void checkAiAccess();
  const saved = readLastLocation();
  isRestoring.value = true;
  selectedOrg.value = saved.org ?? "local";
  if (import.meta.env.DEV) {
    await orgData.seedDevIfEmpty();
  } else {
    await orgData.seedIfEmpty();
  }
  await orgData.loadProjects();
  isRestoring.value = false;
  if (saved.project) {
    pendingProject.value = saved.project;
    tryRestoreProject();
  }
});

watch(selectedOrg, async () => {
  if (!isRestoring.value) {
    selectedProject.value = null;
  }
  if (orgType.value === "local") {
    await orgData.loadProjects();
  }
  if (!isRestoring.value) {
    persistLocation();
  }
  tryRestoreProject();
});

watch(selectedProject, () => {
  if (!isRestoring.value) {
    persistLocation();
  }
});

const sidebarProjects = computed<Project[]>(() => {
  if (orgType.value === "local") {
    return orgData.projects.value;
  }
  const orgs = breadcrumbsRef.value?.remoteOrganizations ?? [];
  const org = orgs.find((o) => o.slug === selectedOrg.value);
  return org?.projects ?? [];
});

watch(sidebarProjects, () => {
  if (pendingProject.value) {
    tryRestoreProject();
    return;
  }
  if (
    !isRestoring.value &&
    !selectedProject.value &&
    sidebarProjects.value.length > 0
  ) {
    selectedProject.value = sidebarProjects.value[0].slug;
  }
});

const showNotes = computed(
  () => selectedProject.value === "__notes__" && orgType.value === "local",
);
const showBoard = computed(
  () =>
    !!selectedOrg.value &&
    !!selectedProject.value &&
    selectedProject.value !== "__notes__",
);

const orgReadOnly = computed(() => breadcrumbsRef.value?.readOnly ?? false);

function handleCreateProject(name: string) {
  orgData.createProject(name);
}

function handleEditProject(id: number, name: string) {
  const project = sidebarProjects.value.find((p) => p.id === id);
  orgData.updateProject(id, name, project?.slug);
}

function handleDeleteProject(id: number) {
  const project = sidebarProjects.value.find((p) => p.id === id);
  orgData.deleteProject(id, project?.slug);
}

const agileBoardRef = ref<InstanceType<typeof AgileBoard> | null>(null);

const anyPanelOpen = computed({
  get: () => settingsOpen.value || aiOpen.value,
  set: (v) => {
    if (!v) {
      settingsOpen.value = false;
      aiOpen.value = false;
    }
  },
});

useKeyboardShortcuts({
  settingsOpen: anyPanelOpen,
  onEscape: () => {},
  onCreateStatus: () => agileBoardRef.value?.openCreateStatusModal(),
  onCreateBoard: () => agileBoardRef.value?.openCreateBoardModal(),
  canCreate: () => orgType.value === "local" && showBoard.value,
});
</script>

<template>
  <div
    class="flex flex-col bg-background text-foreground"
    :class="{ 'animations-disabled': !settings.animationsEnabled }"
    :style="{
      zoom: settings.uiScale / 100,
      height: `calc(100vh / ${settings.uiScale / 100})`,
    }"
  >
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-foreground/10 px-4 py-3"
    >
      <Breadcrumbs ref="breadcrumbsRef" v-model:org="selectedOrg" />
      <div class="absolute left-1/2 -translate-x-1/2 z-30">
        <QuickLinks />
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="aiVisible"
          class="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          :title="t('ai.title')"
          @click="aiOpen = true"
        >
          <IconSparkles :size="18" />
        </button>
        <button
          class="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          :title="t('settings.title')"
          @click="settingsOpen = true"
        >
          <IconSettings :size="18" />
        </button>
      </div>
    </header>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left sidebar: projects -->
      <ProjectSidebar
        v-if="orgType === 'local' || selectedOrg"
        :projects="sidebarProjects"
        :selected-project="selectedProject"
        :loading="orgType === 'local' && orgData.projectsLoading.value"
        :can-create="orgType === 'local'"
        :is-remote="orgType === 'remote'"
        :can-edit="orgType === 'remote' && !orgReadOnly"
        @select="selectedProject = $event"
        @create="handleCreateProject"
        @edit="handleEditProject"
        @delete="handleDeleteProject"
      />

      <!-- Main content: board or notes -->
      <main class="flex-1 overflow-hidden">
        <ErrorBoundary>
          <AgileBoard
            ref="agileBoardRef"
            v-if="showBoard"
            :org-slug="selectedOrg!"
            :project-slug="selectedProject!"
            :read-only="orgReadOnly"
            :org-type="orgType"
          />
          <SidebarNotes v-else-if="showNotes" />
          <div
            v-else
            class="flex h-full items-center justify-center text-muted-foreground"
          >
            {{ t("main.selectPrompt") }}
          </div>
        </ErrorBoundary>
      </main>

      <!-- AI chats panel (inline right column) -->
      <AiChatSidebar v-if="aiOpen && aiVisible" v-model:open="aiOpen" />
    </div>

    <!-- Settings panel (right sidebar) -->
    <SettingsPanel v-model:open="settingsOpen" />
  </div>
</template>
