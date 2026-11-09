import { describe, it, expect } from "vitest";
import { sanitizeAiText } from "@/lib/aiText";

describe("sanitizeAiText", () => {
  it("passes plain text through untouched", () => {
    const r = sanitizeAiText("Привет, как дела?");
    expect(r.content).toBe("Привет, как дела?");
    expect(r.reasoning).toBe("");
  });

  it("splits bare analysis preamble and fused final label", () => {
    const raw =
      'analysis: user says "How are you doing?" friendly small talk.\n' +
      "According: respond warm.<|end|>\n" +
      "<|start|>assistantfinal:Привет, Daniil! — I'm doing great.<|return|>";
    const r = sanitizeAiText(raw);
    expect(r.reasoning).toContain("friendly small talk");
    expect(r.reasoning).toContain("respond warm");
    expect(r.content).toBe("Привет, Daniil! — I'm doing great.");
  });

  it("handles canonical harmony channel markup", () => {
    const raw =
      "<|start|>assistant<|channel|>analysis<|message|>thinking hard<|end|>" +
      "<|start|>assistant<|channel|>final<|message|>Done!<|return|>";
    const r = sanitizeAiText(raw);
    expect(r.reasoning).toBe("thinking hard");
    expect(r.content).toBe("Done!");
  });

  it("strips stray special tokens from content", () => {
    const r = sanitizeAiText("a<|message|>b<|end|>c");
    expect(r.content).toBe("abc");
  });

  it("drops an unterminated trailing token", () => {
    const r = sanitizeAiText("hello <|sta");
    expect(r.content).toBe("hello");
  });

  it("drops leaked user/system channels", () => {
    const raw =
      "<|start|>user:secret prompt<|end|><|start|>assistantfinal:answer";
    const r = sanitizeAiText(raw);
    expect(r.content).toBe("answer");
    expect(r.content).not.toContain("secret");
  });

  it("keeps prose that follows a marker without a label", () => {
    const r = sanitizeAiText("<|start|>Привет мир");
    expect(r.content).toBe("Привет мир");
  });

  it("handles bare analysis without colon", () => {
    const raw =
      "analysisWe need list my tasks for user Daniil Dymant.\n" +
      "Use list_my_tasks.<|end|>";
    const r = sanitizeAiText(raw);
    expect(r.content).toBe("");
    expect(r.reasoning).toContain("We need list my tasks");
    expect(r.reasoning).toContain("Use list_my_tasks");
  });

  it("drops assistantcommentary tool dumps", () => {
    const raw =
      '<|start|>assistantcommentary{ "tool": "functions.list_my_tasks", "params": {} }<|end|>' +
      "<|start|>assistantfinal:Done";
    const r = sanitizeAiText(raw);
    expect(r.content).toBe("Done");
    expect(r.content).not.toContain("tool");
    expect(r.reasoning).toBe("");
  });

  it("routes fused assistantanalysis label to reasoning", () => {
    const raw =
      "<|start|>assistantanalysisWe got list of tasks. Let's wait for response.<|end|>" +
      "<|start|>assistantfinal:Here they are.";
    const r = sanitizeAiText(raw);
    expect(r.reasoning).toContain("We got list of tasks");
    expect(r.content).toBe("Here they are.");
  });

  it("keeps text fused after a canonical channel label", () => {
    const raw =
      '<|start|>assistant<|channel|>finalGiven the user asked "My tasks", we will list them.<|end|><|return|>';
    const r = sanitizeAiText(raw);
    expect(r.content).toBe(
      'Given the user asked "My tasks", we will list them.',
    );
  });
});
