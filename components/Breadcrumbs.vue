<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { Building2, Lock, HardDrive, ChevronDown } from "lucide-vue-next";
import { useApi } from "@/composables/useApi";
import { useI18n } from "@/composables/useI18n";
import { useAuth } from "@/composables/useAuth";
import { isOrgReadOnly } from "@/composables/useBilling";
import type { Organization, Project } from "@/lib/types";
import type { OrgEntry } from "@/composables/useOrgData";

const { t } = useI18n();

const org = defineModel<string | null>("org");

const { getWorkspace } = useApi();
const { isAuthenticated } = useAuth();

const remoteOrganizations = ref<(Organization & { projects: Project[] })[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const showOrgDropdown = ref(false);

const selectedOrg = ref<Organization | null>(null);
const selectedOrgType = ref<"local" | "remote">("local");

const LOCAL_ORG: OrgEntry = {
  type: "local",
  slug: "local",
  name: t("breadcrumbs.localOrg"),
};

const readOnly = computed(() =>
  selectedOrgType.value === "remote" ? isOrgReadOnly(selectedOrg.value) : false,
);

defineExpose({ readOnly, selectedOrgType, remoteOrganizations });

onMounted(async () => {
  // Auto-select local org
  if (!org.value) {
    org.value = "local";
    selectedOrgType.value = "local";
  }

  // Load remote organizations if authenticated
  if (isAuthenticated.value) {
    await loadRemoteOrgs();
  }
});

async function loadRemoteOrgs() {
  loading.value = true;
  try {
    const resp = await getWorkspace();
    remoteOrganizations.value = resp.organizations;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("breadcrumbs.loadFailed");
  } finally {
    loading.value = false;
  }
}

function syncSelectedOrg(newOrg: string | null) {
  if (newOrg === "local") {
    selectedOrgType.value = "local";
    selectedOrg.value = null;
  } else {
    selectedOrgType.value = "remote";
    selectedOrg.value =
      remoteOrganizations.value.find((o) => o.slug === newOrg) ?? null;
  }
}

watch(org, syncSelectedOrg);

watch(remoteOrganizations, () => {
  if (org.value && org.value !== "local") {
    syncSelectedOrg(org.value);
  }
});

function selectOrgEntry(entry: OrgEntry) {
  org.value = entry.slug;
  showOrgDropdown.value = false;
}
</script>

<template>
  <div class="flex items-center gap-1 text-sm">
    <!-- Organization selector -->
    <div class="relative">
      <button
        class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-foreground/80 transition hover:bg-muted"
        @click="showOrgDropdown = !showOrgDropdown"
      >
        <HardDrive v-if="selectedOrgType === 'local'" :size="15" />
        <Building2 v-else :size="15" />
        {{
          org === "local"
            ? t("breadcrumbs.localOrg")
            : (selectedOrg?.name ?? t("breadcrumbs.selectOrg"))
        }}
        <span
          v-if="readOnly"
          class="flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <Lock :size="10" />
          {{ t("breadcrumbs.readOnly") }}
        </span>
        <ChevronDown :size="14" class="text-muted-foreground" />
      </button>
      <div
        v-if="showOrgDropdown"
        class="dropdown-panel absolute left-0 z-50 mt-1 min-w-[220px]"
      >
        <!-- Local org -->
        <button
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition hover:bg-muted"
          :class="org === 'local' ? 'bg-primary/10 font-medium' : ''"
          @click="selectOrgEntry(LOCAL_ORG)"
        >
          <HardDrive :size="13" class="shrink-0 text-muted-foreground" />
          {{ t("breadcrumbs.localOrg") }}
        </button>

        <!-- Remote orgs -->
        <template v-if="remoteOrganizations.length > 0">
          <div class="my-1 border-t border-foreground/10" />
          <button
            v-for="o in remoteOrganizations"
            :key="o.id"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition hover:bg-muted"
            :class="org === o.slug ? 'bg-primary/10 font-medium' : ''"
            @click="
              selectOrgEntry({ type: 'remote', slug: o.slug, name: o.name })
            "
          >
            <Lock
              v-if="isOrgReadOnly(o)"
              :size="12"
              class="shrink-0 text-muted-foreground"
            />
            {{ o.name }}
          </button>
        </template>

        <div
          v-if="!isAuthenticated && remoteOrganizations.length === 0"
          class="border-t border-foreground/10 px-2 py-1.5 text-xs text-muted-foreground"
        >
          {{ t("breadcrumbs.connectServerHint") }}
        </div>
      </div>
    </div>

    <span v-if="loading" class="text-xs text-muted-foreground">{{
      t("breadcrumbs.loading")
    }}</span>
    <span v-if="error" class="text-xs text-destructive">{{ error }}</span>
  </div>
</template>

<style scoped>
.dropdown-panel {
  border: 1px solid hsl(var(--foreground) / 0.1);
  border-radius: 0.5rem;
  background: hsl(var(--background, 0 0% 100%));
  padding: 0.25rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
</style>
