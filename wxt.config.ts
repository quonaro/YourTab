import { defineConfig } from "wxt";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  manifest: {
    name: "YourTab",
    description: "YourTab agile board in your new tab",
    version: "0.1.0",
    permissions: ["storage", "identity"],
    host_permissions: ["https://*/*"],
    chrome_url_overrides: {
      newtab: "newtab.html",
    },
    options_page: "options.html",
  },
  vite: () => ({
    plugins: [vue()],
  }),
});
