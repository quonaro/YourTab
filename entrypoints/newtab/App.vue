<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { Settings } from "lucide-vue-next";
import { useTheme } from "@/composables/useTheme";
import { useI18n } from "@/composables/useI18n";
import { useSettings } from "@/composables/useSettings";
import { useOrgData, type OrgType } from "@/composables/useOrgData";
import { readLastLocation, writeLastLocation } from "@/lib/settings";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import AgileBoard from "@/components/AgileBoard.vue";
import ProjectSidebar from "@/components/ProjectSidebar.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import QuickLinks from "@/components/QuickLinks.vue";
import Logo from "@/components/Logo.vue";
import type { Project } from "@/lib/types";

const { t } = useI18n();
const { initTheme } = useTheme();
const { settings } = useSettings();

const selectedOrg = ref<string | null>(null);
const selectedProject = ref<string | null>(null);
const breadcrumbsRef = ref<InstanceType<typeof Breadcrumbs> | null>(null);
const settingsOpen = ref(false);
const isRestoring = ref(false);
const pendingProject = ref<string | null>(null);

const orgType = computed<OrgType>(() =>
  selectedOrg.value === "local" || !selectedOrg.value ? "local" : "remote",
);

const orgData = useOrgData(orgType, selectedOrg);

function persistLocation() {
  writeLastLocation({ org: selectedOrg.value, project: selectedProject.value });
}

function tryRestoreProject() {
  if (!pendingProject.value) return;
  const slug = pendingProject.value;
  const exists = sidebarProjects.value.some((p) => p.slug === slug);
  if (exists) {
    selectedProject.value = slug;
    pendingProject.value = null;
  }
}

onMounted(async () => {
  initTheme();
  const saved = readLastLocation();
  isRestoring.value = true;
  selectedOrg.value = saved.org ?? "local";
  await orgData.seedIfEmpty();
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

const showBoard = computed(() => selectedOrg.value && selectedProject.value);

const orgReadOnly = computed(() => breadcrumbsRef.value?.readOnly ?? false);

function handleCreateProject(name: string, description?: string) {
  orgData.createProject(name, description);
}

function handleEditProject(id: number, name: string, description?: string) {
  orgData.updateProject(id, name, description);
}

function handleDeleteProject(id: number) {
  orgData.deleteProject(id);
}
</script>

<template>
  <div class="flex h-screen flex-col bg-background text-foreground">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-foreground/10 px-4 py-3"
    >
      <div class="flex items-center gap-3">
        <Logo path="/logos/logo-cat.svg" :accent="settings.accent" :size="32" />
        <Breadcrumbs ref="breadcrumbsRef" v-model:org="selectedOrg" />
      </div>
      <div class="absolute left-1/2 -translate-x-1/2 z-50">
        <QuickLinks />
      </div>
      <button
        class="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        :title="t('settings.title')"
        @click="settingsOpen = true"
      >
        <Settings :size="18" />
      </button>
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
        @select="selectedProject = $event"
        @create="handleCreateProject"
        @edit="handleEditProject"
        @delete="handleDeleteProject"
      />

      <!-- Main content: board -->
      <main class="flex-1 overflow-hidden">
        <AgileBoard
          v-if="showBoard"
          :org-slug="selectedOrg!"
          :project-slug="selectedProject!"
          :read-only="orgReadOnly"
          :org-type="orgType"
        />
        <div
          v-else
          class="flex h-full items-center justify-center text-muted-foreground"
        >
          {{ t("main.selectPrompt") }}
        </div>
      </main>
    </div>

    <!-- Settings panel (right sidebar) -->
    <SettingsPanel v-model:open="settingsOpen" />
  </div>
</template>
