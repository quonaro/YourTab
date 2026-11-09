import { describe, it, expect, afterEach } from "vitest";
import { renderMarkdown } from "@/lib/markdown";
import { SETTINGS_KEY } from "@/lib/settings";

afterEach(() => localStorage.clear());

describe("renderMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("renders headings, bold and lists", () => {
    const html = renderMarkdown("# Title\n\n**bold** and a list:\n\n- a\n- b");
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>a</li>");
  });

  it("converts single newlines to <br> (breaks option)", () => {
    const html = renderMarkdown("line one\nline two");
    expect(html).toContain("<br");
  });

  it("adds target=_blank and rel to links", () => {
    const html = renderMarkdown("[x](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("strips script tags (XSS)", () => {
    const html = renderMarkdown('hello <script>alert("x")</script>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert");
    expect(html).toContain("hello");
  });

  it("strips javascript: URLs", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("strips inline event handlers", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("resolves relative links against the configured api domain", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ apiDomain: "yourtask.ru" }),
    );
    const html = renderMarkdown(
      "[YO-144](/app/organizations/mirit/projects/yourtask/tasks/YO-144)",
    );
    expect(html).toContain(
      'href="https://yourtask.ru/app/organizations/mirit/projects/yourtask/tasks/YO-144"',
    );
  });

  it("resolves relative links against the default domain", () => {
    const html = renderMarkdown("[task](/app/x)");
    expect(html).toContain('href="https://yourtask.app/app/x"');
  });

  it("leaves absolute and anchor links untouched", () => {
    expect(renderMarkdown("[x](https://example.com/p)")).toContain(
      'href="https://example.com/p"',
    );
    expect(renderMarkdown("[x](mailto:a@b.c)")).toContain(
      'href="mailto:a@b.c"',
    );
  });

  it("wraps tables in .md-table-wrap", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('class="md-table-wrap"');
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders fenced code blocks", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });
});
