async function testSuggestSkill(ctx) {
  const file = ctx.file?.filename;
  const patch = ctx.file?.patch;
  if (!file || !patch) return { sections: [] };

  const model = ctx.config?.ai?.model || "gpt-4o-mini";
  const temperature = ctx.config?.ai?.temperature ?? 0;
  const maxTokens = Math.max(400, ctx.config?.ai?.maxTokens ?? 300);

  const prompt = `You are a senior software engineer helping add unit tests for a PR.

File changed: ${file}

Diff patch:
${patch}

Task:
- Suggest unit tests to cover behavioral changes.
- Provide a short checklist of test cases (inputs/outputs, edge cases).
- Suggest where to place tests (file path conventions).
- If you propose code, keep it short and framework-agnostic unless obvious.

Constraints:
- Do NOT ask to commit code; output is for a PR comment only.

Return format (Markdown):
### ✅ Suggested Unit Tests
- Test cases:
  - ...
- Suggested location:
  - ...
- Optional skeleton:
\`\`\`
...\n+\`\`\`
`;

  const text = await ctx.services.ai.chat({
    model,
    temperature,
    maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const md = `${text.trim()}\n\n`;
  return { sections: [{ title: "Suggested Unit Tests", markdown: md }] };
}

module.exports = { testSuggestSkill };

