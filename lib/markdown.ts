import { marked } from "marked";
import DOMPurify from "dompurify";
import { getApiDomain } from "./config";

marked.setOptions({
  breaks: true,
  gfm: true,
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href && !href.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      try {
        node.setAttribute("href", new URL(href, getApiDomain()).toString());
      } catch {
        // keep original href
      }
    }
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMarkdown(content: string): string {
  if (!content) return "";
  const raw = marked.parse(content, { async: false }) as string;
  const wrapped = raw
    .replace(/<table>/g, '<div class="md-table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return DOMPurify.sanitize(wrapped);
}
