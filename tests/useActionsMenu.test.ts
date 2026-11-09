import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { useActionsMenu } from "@/composables/useActionsMenu";

function mountMenu() {
  let api!: ReturnType<typeof useActionsMenu>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useActionsMenu("data-trigger", "data-menu");
        return () => null;
      },
    }),
    { attachTo: document.body },
  );
  return { api, wrapper };
}

describe("useActionsMenu", () => {
  it("toggle opens a menu anchored to the trigger rect", () => {
    const { api, wrapper } = mountMenu();
    const trigger = document.createElement("button");
    trigger.setAttribute("data-trigger", "7");
    document.body.appendChild(trigger);

    api.toggle(7);
    expect(api.actionsOpen.value).toBe(7);
    expect(api.menuPos.value).not.toBeNull();
    trigger.remove();
    wrapper.unmount();
  });

  it("toggle on the open id closes the menu", () => {
    const { api, wrapper } = mountMenu();
    api.toggle(3);
    api.toggle(3);
    expect(api.actionsOpen.value).toBeNull();
    expect(api.menuPos.value).toBeNull();
    wrapper.unmount();
  });

  it("close resets state", () => {
    const { api, wrapper } = mountMenu();
    api.toggle(3);
    api.close();
    expect(api.actionsOpen.value).toBeNull();
    wrapper.unmount();
  });

  it("clicking outside menu and trigger closes the open menu", () => {
    const { api, wrapper } = mountMenu();
    const menu = document.createElement("div");
    menu.setAttribute("data-menu", "5");
    const trigger = document.createElement("button");
    trigger.setAttribute("data-trigger", "5");
    const outside = document.createElement("div");
    document.body.append(menu, trigger, outside);

    api.toggle(5);
    expect(api.actionsOpen.value).toBe(5);
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.actionsOpen.value).toBeNull();

    menu.remove();
    trigger.remove();
    outside.remove();
    wrapper.unmount();
  });

  it("clicking inside the menu keeps it open", () => {
    const { api, wrapper } = mountMenu();
    const menu = document.createElement("div");
    menu.setAttribute("data-menu", "5");
    const trigger = document.createElement("button");
    trigger.setAttribute("data-trigger", "5");
    document.body.append(menu, trigger);

    api.toggle(5);
    menu.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.actionsOpen.value).toBe(5);

    menu.remove();
    trigger.remove();
    wrapper.unmount();
  });
});
