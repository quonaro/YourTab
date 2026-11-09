import { describe, it, expect } from "vitest";
import { useNotes } from "@/composables/useNotes";

// notes/activeNoteId are module-level singletons shared by all callers.
describe("useNotes", () => {
  it("creates a note and makes it active", () => {
    const { notes, activeNoteId, createNote } = useNotes();
    const before = notes.value.length;
    const id = createNote();
    expect(notes.value).toHaveLength(before + 1);
    expect(notes.value[0].id).toBe(id);
    expect(activeNoteId.value).toBe(id);
    expect(notes.value[0].text).toBe("");
  });

  it("creates a note seeded with a markdown title", () => {
    const { notes, createNote } = useNotes();
    const id = createNote("My Title");
    expect(notes.value.find((n) => n.id === id)!.text).toBe("# My Title\n");
  });

  it("updates text and updatedAt", () => {
    const { notes, createNote, updateNote } = useNotes();
    const id = createNote();
    const created = notes.value[0].createdAt;
    updateNote(id, "hello");
    const note = notes.value.find((n) => n.id === id)!;
    expect(note.text).toBe("hello");
    expect(note.createdAt).toBe(created);
    expect(note.updatedAt >= note.createdAt).toBe(true);
  });

  it("ignores updates for unknown ids", () => {
    const { notes, updateNote } = useNotes();
    const texts = notes.value.map((n) => n.text);
    updateNote("missing-id", "x");
    expect(notes.value.map((n) => n.text)).toEqual(texts);
  });

  it("selects an existing note only", () => {
    const { activeNoteId, createNote, selectNote } = useNotes();
    const id = createNote();
    selectNote("missing");
    expect(activeNoteId.value).toBe(id);
    selectNote(id);
    expect(activeNoteId.value).toBe(id);
  });

  it("activates the next note after deleting the active one", () => {
    const { notes, activeNoteId, createNote, deleteNote } = useNotes();
    const first = createNote();
    const second = createNote();
    expect(activeNoteId.value).toBe(second);
    deleteNote(second);
    expect(notes.value.find((n) => n.id === second)).toBeUndefined();
    expect(activeNoteId.value).toBe(first);
  });

  it("keeps the active note when deleting a different one", () => {
    const { notes, activeNoteId, createNote, deleteNote } = useNotes();
    const keep = createNote();
    const other = createNote();
    useNotes().selectNote(keep);
    deleteNote(other);
    expect(activeNoteId.value).toBe(keep);
    expect(notes.value.find((n) => n.id === other)).toBeUndefined();
  });

  it("persists notes to localStorage", async () => {
    const { createNote } = useNotes();
    const id = createNote("Persisted");
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem("yourtask-sidebar-notes");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).some((n: { id: string }) => n.id === id)).toBe(
      true,
    );
  });
});
