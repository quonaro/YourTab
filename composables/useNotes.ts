import { ref, watch } from "vue";

export interface Note {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

const NOTES_KEY = "yourtask-sidebar-notes";
const ACTIVE_NOTE_KEY = "yourtask-active-note";

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n) => n && typeof n.id === "string" && typeof n.text === "string",
    );
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]): void {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    // ignore
  }
}

function loadActiveNoteId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_NOTE_KEY);
  } catch {
    return null;
  }
}

function saveActiveNoteId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_NOTE_KEY, id);
    else localStorage.removeItem(ACTIVE_NOTE_KEY);
  } catch {
    // ignore
  }
}

function generateId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const notes = ref<Note[]>(loadNotes());
const activeNoteId = ref<string | null>(loadActiveNoteId());

if (activeNoteId.value && !notes.value.find((n) => n.id === activeNoteId.value)) {
  activeNoteId.value = null;
}
if (!activeNoteId.value && notes.value.length > 0) {
  activeNoteId.value = notes.value[0].id;
}

watch(notes, (val) => saveNotes(val), { deep: true });
watch(activeNoteId, (val) => saveActiveNoteId(val));

function createNote(title?: string): string {
  const note: Note = {
    id: generateId(),
    text: title ? `# ${title}\n` : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  notes.value.unshift(note);
  activeNoteId.value = note.id;
  return note.id;
}

function updateNote(id: string, text: string): void {
  const note = notes.value.find((n) => n.id === id);
  if (note) {
    note.text = text;
    note.updatedAt = new Date().toISOString();
  }
}

function deleteNote(id: string): void {
  const idx = notes.value.findIndex((n) => n.id === id);
  if (idx === -1) return;
  notes.value.splice(idx, 1);
  if (activeNoteId.value === id) {
    activeNoteId.value = notes.value[0]?.id ?? null;
  }
}

function selectNote(id: string): void {
  if (notes.value.find((n) => n.id === id)) {
    activeNoteId.value = id;
  }
}

export function useNotes() {
  return {
    notes,
    activeNoteId,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
  };
}
