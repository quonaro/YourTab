import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";

function mountShortcuts(opts: {
  settingsOpen?: boolean;
  canCreate?: boolean;
  onEscape?: () => void;
  onCreateStatus?: () => void;
  onCreateBoard?: () => void;
}) {
  const wrapper = mount(
    defineComponent({
      setup() {
        useKeyboardShortcuts({
          settingsOpen: ref(opts.settingsOpen ?? false),
          onEscape: opts.onEscape ?? vi.fn(),
          onCreateStatus: opts.onCreateStatus,
          onCreateBoard: opts.onCreateBoard,
          canCreate: () => opts.canCreate ?? true,
        });
        return () => null;
      },
    }),
    { attachTo: document.body },
  );
  return wrapper;
}

function keydown(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
}

describe("useKeyboardShortcuts", () => {
  it("Escape calls onEscape when settings are closed", () => {
    const onEscape = vi.fn();
    const w = mountShortcuts({ onEscape });
    keydown("Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("Escape closes settings instead of calling onEscape", () => {
    const onEscape = vi.fn();
    const w = mountShortcuts({ settingsOpen: true, onEscape });
    keydown("Escape");
    expect(onEscape).not.toHaveBeenCalled();
    w.unmount();
  });

  it("ignores keys combined with modifiers", () => {
    const onEscape = vi.fn();
    const onCreateStatus = vi.fn();
    const w = mountShortcuts({ onEscape, onCreateStatus });
    keydown("c", { ctrlKey: true });
    keydown("b", { metaKey: true });
    keydown("Escape", { altKey: true });
    expect(onCreateStatus).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
    w.unmount();
  });

  it("c/b trigger create handlers when allowed", () => {
    const onCreateStatus = vi.fn();
    const onCreateBoard = vi.fn();
    const w = mountShortcuts({ onCreateStatus, onCreateBoard });
    keydown("c");
    keydown("b");
    expect(onCreateStatus).toHaveBeenCalledTimes(1);
    expect(onCreateBoard).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("does not fire create handlers when canCreate is false", () => {
    const onCreateStatus = vi.fn();
    const w = mountShortcuts({ onCreateStatus, canCreate: false });
    keydown("c");
    expect(onCreateStatus).not.toHaveBeenCalled();
    w.unmount();
  });

  it("ignores shortcuts while typing in inputs, textareas and editable nodes", () => {
    const onCreateStatus = vi.fn();
    const onEscape = vi.fn();
    const w = mountShortcuts({ onCreateStatus, onEscape });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "c", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    expect(onCreateStatus).not.toHaveBeenCalled();

    // Escape still works while typing (it is handled before the field check).
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onEscape).toHaveBeenCalledTimes(1);
    input.remove();
    w.unmount();
  });

  it("pressing / focuses the search shortcut target", () => {
    const w = mountShortcuts({});
    const search = document.createElement("input");
    search.setAttribute("data-keyboard-shortcut", "search");
    document.body.appendChild(search);

    keydown("/");
    expect(document.activeElement).toBe(search);
    search.remove();
    w.unmount();
  });

  it("stops listening after unmount", () => {
    const onEscape = vi.fn();
    const w = mountShortcuts({ onEscape });
    w.unmount();
    keydown("Escape");
    expect(onEscape).not.toHaveBeenCalled();
  });
});
