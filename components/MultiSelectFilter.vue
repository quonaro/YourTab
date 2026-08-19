<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { IconChevronDown, IconCheck, IconX } from "@tabler/icons-vue";

interface Option {
  value: number;
  label: string;
}

const props = defineProps<{
  modelValue: number[];
  options: Option[];
  placeholder: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: number[]): void;
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const selectedLabels = computed(() => {
  const selected = props.modelValue
    .map((id) => props.options.find((o) => o.value === id))
    .filter((o): o is Option => !!o);
  return selected.map((o) => o.label);
});

const displayLabel = computed(() => {
  if (selectedLabels.value.length === 0) return props.placeholder;
  if (selectedLabels.value.length === 1) return selectedLabels.value[0];
  return `${selectedLabels.value[0]} +${selectedLabels.value.length - 1}`;
});

function toggle(id: number) {
  const current = [...props.modelValue];
  const idx = current.indexOf(id);
  if (idx === -1) {
    current.push(id);
  } else {
    current.splice(idx, 1);
  }
  emit("update:modelValue", current);
}

function clear() {
  emit("update:modelValue", []);
}

function handleClickOutside(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-background px-3 text-sm text-foreground transition hover:border-primary/50 focus:border-primary focus:outline-none"
      @click="open = !open"
    >
      <span
        class="truncate"
        :class="{ 'text-muted-foreground': modelValue.length === 0 }"
      >
        {{ displayLabel }}
      </span>
      <span class="flex shrink-0 items-center gap-1">
        <button
          v-if="modelValue.length > 0"
          type="button"
          class="text-muted-foreground transition hover:text-foreground"
          @click.stop="clear"
        >
          <IconX :size="14" />
        </button>
        <IconChevronDown
          :size="16"
          class="text-muted-foreground transition-transform"
          :class="{ 'rotate-180': open }"
        />
      </span>
    </button>

    <div
      v-if="open"
      class="dropdown-panel absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto p-1"
    >
      <label
        v-for="opt in options"
        :key="opt.value"
        class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition hover:bg-muted"
      >
        <span
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-foreground/20"
          :class="{
            'bg-primary text-primary-foreground': modelValue.includes(
              opt.value,
            ),
          }"
        >
          <IconCheck v-if="modelValue.includes(opt.value)" :size="12" />
        </span>
        <span class="truncate">{{ opt.label }}</span>
        <input
          type="checkbox"
          class="sr-only"
          :checked="modelValue.includes(opt.value)"
          @change="toggle(opt.value)"
        />
      </label>
      <p
        v-if="options.length === 0"
        class="px-2 py-1.5 text-sm text-muted-foreground"
      >
        —
      </p>
    </div>
  </div>
</template>

<style scoped>
.dropdown-panel {
  border: 1px solid hsl(var(--foreground) / 0.1);
  border-radius: 0.5rem;
  background: hsl(var(--background, 0 0% 100%));
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
}
</style>
