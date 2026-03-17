const fs = require("fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

function parseAST(code) {
  return parser.parse(code, {
    sourceType: "unambiguous",
    plugins: ["jsx", "typescript", "classProperties", "topLevelAwait"],
    errorRecovery: true,
  });
}

function extractChangedLines(patch) {
  const lines = String(patch).split("\n");
  let newLine = 0;
  const changed = [];

  for (const line of lines) {
    const match = line.match(/\@\@ .* \+(\d+)/);
    if (match) {
      newLine = Number(match[1]);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      changed.push(newLine);
      newLine++;
      continue;
    }

    if (line.startsWith("-")) continue;
    newLine++;
  }

  return changed;
}

function findFunctionsByLines(code, changedLines) {
  let ast;
  try {
    ast = parseAST(code);
  } catch {
    return [];
  }

  const functions = [];
  traverse(ast, {
    Function(path) {
      const loc = path.node.loc;
      if (!loc) return;
      const start = loc.start.line;
      const end = loc.end.line;
      const affected = changedLines.some((l) => l >= start && l <= end);
      if (!affected) return;

      const snippet = code
        .split("\n")
        .slice(start - 1, end)
        .join("\n");

      functions.push({ start, end, code: snippet });
    },
  });

  // de-dup by range
  const unique = new Map();
  for (const fn of functions) unique.set(`${fn.start}-${fn.end}`, fn);
  return [...unique.values()];
}

function parseIssues(text) {
  if (!text || String(text).includes("ISSUES: NONE")) return [];
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"))
    .map((line) => {
      const m = line.match(/(HIGH|MEDIUM|LOW) line (\d+): (.+)/i);
      if (!m) return null;
      return { level: m[1].toUpperCase(), line: Number(m[2]), message: m[3] };
    })
    .filter(Boolean);
}

function severityIcon(level) {
  if (level === "HIGH") return "❌";
  if (level === "MEDIUM") return "⚠️";
  return "💡";
}

function renderFunctionFrame(fn, issues) {
  const lines = fn.code.split("\n");
  let out = "```js\n";
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = fn.start + i;
    out += `${lineNumber} | ${lines[i]}\n`;
    const issue = issues.find((x) => x.line === lineNumber);
    if (issue) {
      out += `     ^ ${severityIcon(issue.level)} ${issue.level} ${issue.message}\n`;
    }
  }
  out += "```\n";
  return out;
}

async function aiReviewSkill(ctx) {
  const file = ctx.file?.filename;
  const patch = ctx.file?.patch;
  if (!file || !patch) return { sections: [] };

  let code;
  try {
    code = fs.readFileSync(file, "utf8");
  } catch {
    return { sections: [] };
  }

  const changedLines = extractChangedLines(patch);
  const functions = findFunctionsByLines(code, changedLines);
  if (!functions.length) return { sections: [] };

  const model = ctx.config?.ai?.model || "gpt-4o-mini";
  const temperature = ctx.config?.ai?.temperature ?? 0;
  const maxTokens = ctx.config?.ai?.maxTokens ?? 300;

  const frames = [];
  for (const fn of functions) {
    const prompt = `You are a senior software engineer reviewing a pull request.

File: ${file}

Code:
${fn.code}

Task:
List ONLY real issues.

Rules:
- Show only problematic lines
- Keep it short
- Use severity labels: HIGH, MEDIUM, LOW
- No explanation outside the list

Return issues in this format:
- HIGH line <number>: <message>
- MEDIUM line <number>: <message>
- LOW line <number>: <message>

If no issues return:
ISSUES: NONE
`;

    const text = await ctx.services.ai.chat({
      model,
      temperature,
      maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const issues = parseIssues(text);
    if (!issues.length) continue;
    frames.push(renderFunctionFrame(fn, issues));
  }

  if (!frames.length) return { sections: [] };

  let md = "### 🧠 AI Review\n\n";
  for (const f of frames) md += `${f}\n`;
  md += "\n";

  return { sections: [{ title: "AI Review", markdown: md }] };
}

module.exports = { aiReviewSkill };

