<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Plus,
  X,
  Link as LinkIcon,
  Globe,
  Github,
  Mail,
  Calendar,
  MessageSquare,
  Code,
  Book,
  Briefcase,
  Trello,
  Figma,
  Chrome,
  Gitlab,
  Slack,
  Phone,
  MapPin,
  FileText,
  Music,
  Camera,
  Video,
  ShoppingBag,
  type LucideIcon,
} from "lucide-vue-next";
import { useSettings } from "@/composables/useSettings";
import { useI18n } from "@/composables/useI18n";
import type { QuickLink } from "@/lib/settings";

const { t } = useI18n();
const { settings, saveSettings } = useSettings();

const showAddForm = ref(false);
const editingId = ref<string | null>(null);

const formData = ref({
  name: "",
  url: "",
  icon: "Globe",
});

const ICON_MAP: Record<string, LucideIcon> = {
  Globe,
  Github,
  Mail,
  Calendar,
  MessageSquare,
  Code,
  Book,
  Briefcase,
  Trello,
  Figma,
  Chrome,
  Gitlab,
  Slack,
  Phone,
  MapPin,
  FileText,
  Music,
  Camera,
  Video,
  ShoppingBag,
  Link: LinkIcon,
};

const ICON_NAMES = Object.keys(ICON_MAP);

const quickLinks = computed(() => settings.value.quickLinks ?? []);

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Globe;
}

function openLink(url: string) {
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  window.open(fullUrl, "_blank");
}

function resetForm() {
  formData.value = { name: "", url: "", icon: "Globe" };
  editingId.value = null;
}

function startEdit(link: QuickLink) {
  editingId.value = link.id;
  formData.value = { name: link.name, url: link.url, icon: link.icon };
  showAddForm.value = true;
}

function saveLink() {
  if (!formData.value.name.trim() || !formData.value.url.trim()) return;

  const links = [...quickLinks.value];

  if (editingId.value) {
    const idx = links.findIndex((l) => l.id === editingId.value);
    if (idx >= 0) {
      links[idx] = {
        id: editingId.value,
        name: formData.value.name.trim(),
        url: formData.value.url.trim(),
        icon: formData.value.icon,
      };
    }
  } else {
    links.push({
      id: crypto.randomUUID(),
      name: formData.value.name.trim(),
      url: formData.value.url.trim(),
      icon: formData.value.icon,
    });
  }

  settings.value.quickLinks = links;
  saveSettings();
  showAddForm.value = false;
  resetForm();
}

function deleteLink(id: string) {
  settings.value.quickLinks = quickLinks.value.filter((l) => l.id !== id);
  saveSettings();
}

function cancelForm() {
  showAddForm.value = false;
  resetForm();
}
</script>

<template>
  <div class="relative flex items-center gap-1">
    <!-- Quick links -->
    <button
      v-for="link in quickLinks"
      :key="link.id"
      class="group flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-foreground/70 transition hover:bg-muted hover:text-foreground"
      :title="link.url"
      @click="openLink(link.url)"
      @contextmenu.prevent="startEdit(link)"
    >
      <component :is="getIcon(link.icon)" :size="15" class="shrink-0" />
      <span class="max-w-[120px] truncate">{{ link.name }}</span>
      <span
        class="ml-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-foreground/10 hover:text-destructive"
        @click.stop="deleteLink(link.id)"
      >
        <X :size="12" />
      </span>
    </button>

    <!-- Add button -->
    <button
      class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
      :title="t('quickLinks.add')"
      @click="showAddForm = !showAddForm"
    >
      <Plus :size="15" />
    </button>

    <!-- Add/Edit form dropdown -->
    <div
      v-if="showAddForm"
      class="dropdown-panel absolute left-1/2 top-full z-50 mt-1 w-[300px] -translate-x-1/2"
    >
      <div class="space-y-3 p-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-foreground">
            {{ editingId ? t("quickLinks.edit") : t("quickLinks.add") }}
          </span>
          <button
            class="rounded p-1 text-muted-foreground transition hover:bg-muted"
            @click="cancelForm"
          >
            <X :size="14" />
          </button>
        </div>

        <!-- Icon -->
        <div>
          <label class="form-hint">{{ t("quickLinks.icon") }}</label>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <button
              v-for="iconName in ICON_NAMES"
              :key="iconName"
              class="flex h-7 w-7 items-center justify-center rounded-lg border transition"
              :class="
                formData.icon === iconName
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-foreground/10 text-muted-foreground hover:bg-muted'
              "
              @click="formData.icon = iconName"
            >
              <component :is="ICON_MAP[iconName]" :size="14" />
            </button>
          </div>
        </div>

        <!-- Name -->
        <div>
          <label class="form-hint">{{ t("quickLinks.name") }}</label>
          <input
            v-model="formData.name"
            type="text"
            class="input-base mt-1 text-sm"
            :placeholder="t('quickLinks.namePlaceholder')"
            @keydown.enter="saveLink"
          />
        </div>

        <!-- URL -->
        <div>
          <label class="form-hint">{{ t("quickLinks.url") }}</label>
          <input
            v-model="formData.url"
            type="text"
            class="input-base mt-1 text-sm"
            :placeholder="t('quickLinks.urlPlaceholder')"
            @keydown.enter="saveLink"
          />
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <button class="btn-small" @click="cancelForm">
            {{ t("quickLinks.cancel") }}
          </button>
          <button
            class="btn-primary btn-small"
            :disabled="!formData.name.trim() || !formData.url.trim()"
            @click="saveLink"
          >
            {{ editingId ? t("quickLinks.save") : t("quickLinks.addBtn") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropdown-panel {
  border: 1px solid hsl(var(--border, 240 5% 90%));
  border-radius: 0.5rem;
  background: hsl(var(--background, 0 0% 100%));
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
</style>
