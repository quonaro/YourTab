<script setup lang="ts">
import { ref, computed } from "vue";
import {
  IconPlus,
  IconX,
  IconLink,
  IconWorld,
  IconBrandGithub,
  IconMail,
  IconCalendar,
  IconMessage2,
  IconCode,
  IconBook,
  IconBriefcase,
  IconBrandTrello,
  IconBrandFigma,
  IconBrandChrome,
  IconBrandGitlab,
  IconBrandSlack,
  IconPhone,
  IconMapPin,
  IconFileText,
  IconMusic,
  IconCamera,
  IconVideo,
  IconShoppingBag,
  IconBrandTwitter,
  IconBrandYoutube,
  IconBrandLinkedin,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandTelegram,
  IconBrandDiscord,
  IconBrandTwitch,
  IconBrandDribbble,
  IconBrandNotion,
  IconExternalLink,
  IconStar,
  IconHeart,
  IconBookmark,
  IconFolder,
  IconDatabase,
  IconServer,
  IconCloud,
  IconTerminal,
  IconGitBranch,
  IconBug,
  IconBulb,
  IconBolt,
  IconRocket,
  IconSettings,
  IconUser,
  IconUsers,
  IconHome,
  IconSearch,
  IconBell,
  IconClock,
  IconDownload,
  IconUpload,
  IconLock,
  IconKey,
  IconWallet,
  IconCreditCard,
  type Icon,
} from "@tabler/icons-vue";
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

const ICON_MAP: Record<string, Icon> = {
  Globe: IconWorld,
  Github: IconBrandGithub,
  Mail: IconMail,
  Calendar: IconCalendar,
  MessageSquare: IconMessage2,
  Code: IconCode,
  Book: IconBook,
  Briefcase: IconBriefcase,
  Trello: IconBrandTrello,
  Figma: IconBrandFigma,
  Chrome: IconBrandChrome,
  Gitlab: IconBrandGitlab,
  Slack: IconBrandSlack,
  Phone: IconPhone,
  MapPin: IconMapPin,
  FileText: IconFileText,
  Music: IconMusic,
  Camera: IconCamera,
  Video: IconVideo,
  ShoppingBag: IconShoppingBag,
  Twitter: IconBrandTwitter,
  Youtube: IconBrandYoutube,
  Linkedin: IconBrandLinkedin,
  Facebook: IconBrandFacebook,
  Instagram: IconBrandInstagram,
  Telegram: IconBrandTelegram,
  Discord: IconBrandDiscord,
  Twitch: IconBrandTwitch,
  Dribbble: IconBrandDribbble,
  Notion: IconBrandNotion,
  ExternalLink: IconExternalLink,
  Star: IconStar,
  Heart: IconHeart,
  Bookmark: IconBookmark,
  Folder: IconFolder,
  Database: IconDatabase,
  Server: IconServer,
  Cloud: IconCloud,
  Terminal: IconTerminal,
  GitBranch: IconGitBranch,
  Bug: IconBug,
  Lightbulb: IconBulb,
  Zap: IconBolt,
  Rocket: IconRocket,
  Settings: IconSettings,
  User: IconUser,
  Users: IconUsers,
  Home: IconHome,
  Search: IconSearch,
  Bell: IconBell,
  Clock: IconClock,
  Download: IconDownload,
  Upload: IconUpload,
  Lock: IconLock,
  Key: IconKey,
  Wallet: IconWallet,
  CreditCard: IconCreditCard,
  Link: IconLink,
};

const ICON_NAMES = Object.keys(ICON_MAP);

const quickLinks = computed(() => settings.value.quickLinks ?? []);

function getIcon(name: string): Icon {
  return ICON_MAP[name] ?? IconWorld;
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
  if (!formData.value.url.trim()) return;

  const links = [...quickLinks.value];
  const name = formData.value.name.trim() || formData.value.url.trim();

  if (editingId.value) {
    const idx = links.findIndex((l) => l.id === editingId.value);
    if (idx >= 0) {
      links[idx] = {
        id: editingId.value,
        name,
        url: formData.value.url.trim(),
        icon: formData.value.icon,
      };
    }
  } else {
    links.push({
      id: crypto.randomUUID(),
      name,
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
      class="group relative flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground/70 transition hover:bg-primary/10 hover:text-primary"
      :title="link.name"
      @click="openLink(link.url)"
      @contextmenu.prevent="startEdit(link)"
    >
      <component :is="getIcon(link.icon)" :size="15" class="shrink-0" />
      <span
        class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition group-hover:opacity-100"
        @click.stop="deleteLink(link.id)"
      >
        <IconX :size="10" />
      </span>
    </button>

    <!-- Add button -->
    <button
      class="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-foreground/20 text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-primary"
      :class="{ 'w-auto gap-1 px-3': quickLinks.length === 0 }"
      :title="t('quickLinks.add')"
      @click="showAddForm = !showAddForm"
    >
      <IconPlus :size="15" />
      <span v-if="quickLinks.length === 0">{{ t("quickLinks.add") }}</span>
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
            <IconX :size="14" />
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
            :disabled="!formData.url.trim()"
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
