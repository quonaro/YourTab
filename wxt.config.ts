import { execSync } from "node:child_process";
import { defineConfig } from "wxt";
import vue from "@vitejs/plugin-vue";

const version = execSync("git describe --tags --abbrev=0")
  .toString()
  .trim()
  .replace(/^v/, "");

export default defineConfig({
  srcDir: "composables",
  manifest: {
    name: "YourTab",
    description: "YourTab agile board in your new tab",
    version,
    icons: {
      "16": "icon-16.png",
      "48": "icon-48.png",
      "128": "icon-128.png",
    },
    permissions: ["storage", "identity"],
    host_permissions: ["https://yourtask.app/*"],
    optional_host_permissions: ["https://*/*"],
    chrome_url_overrides: {
      newtab: "newtab.html",
    },
    options_page: "options.html",
    browser_specific_settings: {
      gecko: {
        id: "yourtab@yourtask.app",
      },
    },
  },
  vite: () => ({
    plugins: [vue()],
  }),
});
