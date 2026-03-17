const { execSync } = require("child_process");

async function lintSkill(ctx) {
  const file = ctx.file?.filename;
  const cmdBase = ctx.config?.lint?.command;

  if (!file || !cmdBase) return { sections: [] };

  try {
    // Expect eslint-like JSON if command supports it; otherwise just capture text.
    const full = `${cmdBase} ${file} -f json`;
    const output = execSync(full, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const parsed = JSON.parse(output);
    const messages = parsed?.[0]?.messages || [];

    if (!messages.length) return { sections: [] };

    let md = "### 🧹 Lint Issues\n\n";
    for (const m of messages) {
      const level = m.severity === 2 ? "❌" : "⚠️";
      md += `- ${level} line ${m.line} ${m.message} (${m.ruleId})\n`;
    }
    md += "\n";

    return { sections: [{ title: "Lint Issues", markdown: md }], annotations: messages };
  } catch (err) {
    const stderr = err?.stderr ? String(err.stderr) : "";
    const stdout = err?.stdout ? String(err.stdout) : "";
    const text = (stdout || stderr || "").trim();

    if (!text) return { sections: [] };

    const md = `### 🧹 Lint Issues\n\n\`\`\`\n${text.slice(0, 8000)}\n\`\`\`\n\n`;
    return { sections: [{ title: "Lint Issues", markdown: md }] };
  }
}

module.exports = { lintSkill };

