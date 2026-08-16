<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import {
  IconBold,
  IconItalic,
  IconLink,
  IconHeading,
  IconList,
  IconListNumbers,
  IconQuote,
  IconCode,
} from "@tabler/icons-vue";
import { useI18n } from "@/composables/useI18n";
import { useNotes } from "@/composables/useNotes";

const { t } = useI18n();
const { notes, activeNoteId, updateNote } = useNotes();

const activeNote = computed(
  () => notes.value.find((n) => n.id === activeNoteId.value) ?? null,
);

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      link: { openOnClick: false },
    }),
    Markdown.configure({ breaks: true }),
  ],
  content: activeNote.value?.text ?? "",
  editorProps: {
    attributes: {
      class: "tiptap-editor prose-notes",
      "data-placeholder": t("notes.placeholder"),
    },
  },
  onUpdate: ({ editor: e }) => {
    if (activeNoteId.value) {
      updateNote(activeNoteId.value, (e.storage as any).markdown.getMarkdown());
    }
  },
});

// Load note content into editor when active note changes
watch(
  () => activeNoteId.value,
  () => {
    if (editor.value && activeNote.value) {
      editor.value.commands.setContent(activeNote.value.text, {
        emitUpdate: false,
      });
    }
  },
);

onBeforeUnmount(() => {
  editor.value?.destroy();
});

function insertLink() {
  if (!editor.value) return;
  if (editor.value.isActive("link")) {
    editor.value.chain().focus().unsetLink().run();
    return;
  }
  const url = window.prompt("URL");
  if (url) {
    editor.value.chain().focus().setLink({ href: url }).run();
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- WYSIWYG editor area -->
    <div class="flex min-h-0 flex-1 flex-col">
      <!-- Formatting toolbar -->
      <div
        v-if="editor"
        class="flex items-center gap-0.5 border-b border-foreground/10 px-3 py-1.5"
      >
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('bold')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.bold') + ' (Ctrl+B)'"
          @click="editor.chain().focus().toggleBold().run()"
        >
          <IconBold :size="15" />
        </button>
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('italic')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.italic') + ' (Ctrl+I)'"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          <IconItalic :size="15" />
        </button>
        <div class="mx-1 h-4 w-px bg-foreground/10" />
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('heading', { level: 1 })
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.heading')"
          @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
        >
          <IconHeading :size="15" />
        </button>
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('bulletList')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.bulletList')"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          <IconList :size="15" />
        </button>
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('orderedList')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.orderedList')"
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          <IconListNumbers :size="15" />
        </button>
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('blockquote')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.quote')"
          @click="editor.chain().focus().toggleBlockquote().run()"
        >
          <IconQuote :size="15" />
        </button>
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('codeBlock')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.code')"
          @click="editor.chain().focus().toggleCodeBlock().run()"
        >
          <IconCode :size="15" />
        </button>
        <div class="mx-1 h-4 w-px bg-foreground/10" />
        <button
          class="rounded p-1.5 transition"
          :class="
            editor.isActive('link')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :title="t('notes.link') + ' (Ctrl+K)'"
          @click="insertLink"
        >
          <IconLink :size="15" />
        </button>
      </div>

      <!-- Editor content -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        <EditorContent v-if="activeNote" :editor="editor" class="h-full" />
        <div
          v-else
          class="flex h-full items-center justify-center text-muted-foreground"
        >
          {{ t("notes.empty") }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tiptap WYSIWYG editor styles */
:deep(.tiptap-editor) {
  padding: 1rem 1.5rem;
  min-height: 100%;
  outline: none;
}

:deep(.tiptap-editor.ProseMirror) {
  font-size: 0.875rem;
  line-height: 1.6;
  color: hsl(var(--foreground));
}

:deep(.tiptap-editor.ProseMirror:focus) {
  outline: none;
}

:deep(.tiptap-editor.ProseMirror.is-empty::before) {
  content: attr(data-placeholder);
  float: left;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  height: 0;
}

:deep(.tiptap-editor h1),
:deep(.tiptap-editor h2),
:deep(.tiptap-editor h3),
:deep(.tiptap-editor h4),
:deep(.tiptap-editor h5),
:deep(.tiptap-editor h6) {
  font-weight: 600;
  line-height: 1.3;
  margin-top: 0.6em;
  margin-bottom: 0.3em;
}

:deep(.tiptap-editor h1) {
  font-size: 1.6em;
}

:deep(.tiptap-editor h2) {
  font-size: 1.35em;
}

:deep(.tiptap-editor h3) {
  font-size: 1.15em;
}

:deep(.tiptap-editor h4),
:deep(.tiptap-editor h5),
:deep(.tiptap-editor h6) {
  font-size: 1em;
}

:deep(.tiptap-editor p) {
  margin: 0;
}

:deep(.tiptap-editor p + p) {
  margin-top: 0.2em;
}

:deep(.tiptap-editor ul),
:deep(.tiptap-editor ol) {
  padding-left: 1.2em;
  margin: 0.3em 0;
}

:deep(.tiptap-editor ul) {
  list-style: disc;
}

:deep(.tiptap-editor ol) {
  list-style: decimal;
}

:deep(.tiptap-editor li) {
  margin: 0.1em 0;
}

:deep(.tiptap-editor li p) {
  margin: 0;
}

:deep(.tiptap-editor a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  word-break: break-all;
}

:deep(.tiptap-editor strong) {
  font-weight: 700;
}

:deep(.tiptap-editor em) {
  font-style: italic;
}

:deep(.tiptap-editor code) {
  font-family: monospace;
  font-size: 0.85em;
  background: hsl(var(--muted));
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

:deep(.tiptap-editor pre) {
  background: hsl(var(--muted));
  padding: 0.6em;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.4em 0;
}

:deep(.tiptap-editor pre code) {
  background: none;
  padding: 0;
}

:deep(.tiptap-editor blockquote) {
  border-left: 2px solid hsl(var(--primary) / 0.3);
  padding-left: 0.6em;
  margin: 0.4em 0;
  color: hsl(var(--muted-foreground));
}

:deep(.tiptap-editor hr) {
  border: none;
  border-top: 1px solid hsl(var(--foreground) / 0.1);
  margin: 0.6em 0;
}

:deep(.tiptap-editor table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9em;
}

:deep(.tiptap-editor th),
:deep(.tiptap-editor td) {
  border: 1px solid hsl(var(--foreground) / 0.1);
  padding: 0.2em 0.4em;
}

:deep(.tiptap-editor img) {
  max-width: 100%;
  border-radius: 4px;
}
</style>
