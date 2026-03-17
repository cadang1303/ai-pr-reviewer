function clampText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n...truncated`;
}

function renderFileSection({ file, lint, review, tests }) {
  let md = `## 📄 ${file}\n\n`;
  for (const r of [lint, review, tests]) {
    if (!r || !Array.isArray(r.sections)) continue;
    for (const s of r.sections) md += s.markdown;
  }
  return md;
}

function renderReport({ config, results }) {
  const header = config?.comment?.header || "## 🤖 AI Review (auto-generated)";
  const max = config?.budgets?.maxCommentChars ?? 60000;

  if (!results.length) {
    return `${header}\n\n✅ No issues found\n`;
  }

  let md = `${header}\n\n`;
  for (const r of results) {
    md += renderFileSection(r);
  }

  return clampText(md, max);
}

module.exports = { renderReport };

