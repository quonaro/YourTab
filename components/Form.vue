<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { useI18n } from "@/composables/useI18n";
import { cn } from "@/lib/utils";

export interface FormProps {
  title?: string;
  description?: string;
  submitLabel?: string;
  loadingLabel?: string;
  loading?: boolean;
  error?: string;
  as?: "card" | "slider" | "modal" | "responsive";
  open?: boolean;
  destructive?: boolean;
  submitDisabled?: boolean;
  submitIcon?: Component;
}

const props = withDefaults(defineProps<FormProps>(), {
  as: "card",
});

const { t } = useI18n();
const submitLabelText = computed(() => props.submitLabel || t("common.save"));
const loadingLabelText = computed(
  () => props.loadingLabel || t("common.saving"),
);
const submitBtnClass = computed(() =>
  props.destructive ? "btn-danger w-full" : "btn-primary w-full",
);

const emit = defineEmits<{
  submit: [event: Event];
  "update:open": [value: boolean];
}>();

defineOptions({ inheritAttrs: false });

const isDesktop = useMediaQuery("(min-width: 768px)");
const isSliderView = computed(
  () =>
    props.as === "slider" || (props.as === "responsive" && !isDesktop.value),
);
const isModalView = computed(() => props.as === "modal");

const internalOpen = ref(props.open ?? isSliderView.value);

watch(
  () => props.open,
  (val) => {
    if (val !== undefined) internalOpen.value = val;
  },
);

watch(isSliderView, (val) => {
  if (props.open === undefined) internalOpen.value = val;
});

const isOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

function close() {
  isOpen.value = false;
}

function onSubmit(event: Event) {
  if (props.loading) {
    event.preventDefault();
    return;
  }
  emit("submit", event);
}

function useMediaQuery(query: string) {
  const matches = ref(
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  if (typeof window !== "undefined") {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => {
      matches.value = e.matches;
    };
    mql.addEventListener("change", handler);
  }
  return matches;
}
</script>

<template>
  <form
    v-if="!isSliderView && !isModalView"
    :class="
      cn('card-base w-full space-y-4 text-foreground shadow-sm', $attrs.class)
    "
    @submit.prevent="onSubmit"
  >
    <header v-if="title || description || $slots.header" class="space-y-1">
      <slot name="header">
        <h2 v-if="title" class="text-lg font-semibold">{{ title }}</h2>
        <p v-if="description" class="form-hint">
          {{ description }}
        </p>
      </slot>
    </header>

    <p v-if="error" class="form-error">{{ error }}</p>

    <slot />

    <div>
      <slot name="submit">
        <button
          type="submit"
          :disabled="loading || submitDisabled"
          :class="
            cn(
              submitBtnClass,
              submitIcon && 'flex items-center justify-center gap-2',
            )
          "
        >
          <component :is="submitIcon" v-if="submitIcon" class="h-4 w-4" />
          {{ loading ? loadingLabelText : submitLabelText }}
        </button>
      </slot>
    </div>
  </form>

  <Teleport to="body">
    <div
      v-if="isModalView && isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200"
      @click.self="close"
    >
      <form
        role="dialog"
        aria-modal="true"
        :class="
          cn(
            'card-base w-full max-w-md space-y-4 text-foreground shadow-2xl animate-in zoom-in-95 fade-in duration-200',
            $attrs.class,
          )
        "
        @submit.prevent="onSubmit"
      >
        <header v-if="title || description || $slots.header" class="space-y-1">
          <slot name="header">
            <h2 v-if="title" class="text-lg font-semibold">{{ title }}</h2>
            <p v-if="description" class="form-hint">
              {{ description }}
            </p>
          </slot>
        </header>

        <p v-if="error" class="form-error">{{ error }}</p>

        <slot />

        <div>
          <slot name="submit">
            <button
              type="submit"
              :disabled="loading || submitDisabled"
              :class="
                cn(
                  submitBtnClass,
                  submitIcon && 'flex items-center justify-center gap-2',
                )
              "
            >
              <component :is="submitIcon" v-if="submitIcon" class="h-4 w-4" />
              {{ loading ? loadingLabelText : submitLabelText }}
            </button>
          </slot>
        </div>
      </form>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="isSliderView && isOpen"
      class="fixed inset-0 z-50 bg-black/60"
      @click.self="close"
    >
      <form
        role="dialog"
        aria-modal="true"
        :class="
          cn(
            'fixed bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto rounded-t-2xl border-t border-foreground/10 bg-background p-6 shadow-2xl',
            $attrs.class,
          )
        "
        @submit.prevent="onSubmit"
      >
        <header v-if="title || description || $slots.header" class="space-y-1">
          <slot name="header">
            <h2 v-if="title" class="text-lg font-semibold">{{ title }}</h2>
            <p v-if="description" class="form-hint">
              {{ description }}
            </p>
          </slot>
        </header>

        <p v-if="error" class="form-error">{{ error }}</p>

        <slot />

        <div>
          <slot name="submit">
            <button
              type="submit"
              :disabled="loading || submitDisabled"
              :class="
                cn(
                  submitBtnClass,
                  submitIcon && 'flex items-center justify-center gap-2',
                )
              "
            >
              <component :is="submitIcon" v-if="submitIcon" class="h-4 w-4" />
              {{ loading ? loadingLabelText : submitLabelText }}
            </button>
          </slot>
        </div>
      </form>
    </div>
  </Teleport>
</template>
