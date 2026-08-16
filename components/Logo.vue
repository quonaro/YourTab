<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ACCENTS, type AccentKey } from "@/lib/settings";

const props = withDefaults(
  defineProps<{
    path: string;
    color?: string;
    accent?: AccentKey;
    size?: number | string;
  }>(),
  {
    size: 40,
  },
);

const DEFAULT_PURPLE = "hsl(270 60% 55%)";

const resolvedColor = computed(() => {
  if (props.color) return props.color;
  if (props.accent) return `hsl(${ACCENTS[props.accent].value})`;
  return DEFAULT_PURPLE;
});

const sizeValue = computed(() =>
  typeof props.size === "number" ? `${props.size}px` : props.size,
);

const svgHtml = ref("");
const svgCache = new Map<string, string>();

watch(
  () => props.path,
  async (path) => {
    if (!path) {
      svgHtml.value = "";
      return;
    }
    const cached = svgCache.get(path);
    if (cached !== undefined) {
      svgHtml.value = cached;
      return;
    }
    try {
      const res = await fetch(path);
      const text = res.ok ? await res.text() : "";
      svgCache.set(path, text);
      svgHtml.value = text;
    } catch {
      svgHtml.value = "";
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-html="svgHtml"
    :style="{ color: resolvedColor, width: sizeValue }"
    class="[&_svg]:h-auto [&_svg]:w-full"
    aria-hidden="true"
  />
</template>
