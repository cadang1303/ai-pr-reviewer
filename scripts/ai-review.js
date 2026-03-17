const { Octokit } = require("@octokit/rest");
const OpenAI = require("openai");
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const token = process.env.GITHUB_TOKEN;
const pr = process.env.PR_NUMBER;
const repo = process.env.REPO;
const openai = new OpenAI({
  apiKey: token,
  baseURL: "https://models.github.ai/inference",
});

const [owner, repoName] = repo.split("/");

const octokit = new Octokit({ auth: token });

const CACHE_FILE = ".cache/ai-review.json";

const CODE_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"];

const IGNORE_FOLDERS = [
  "dist/",
  "build/",
  "coverage/",
  "node_modules/",
  ".next/",
  "out/",
];

const HEADER = "## 🤖 AI Review (auto-generated)";

const MAX_FILES = 20;
const MAX_PATCH = 6000;

function isCodeFile(file) {
  return CODE_EXTENSIONS.some((ext) => file.endsWith(ext));
}

function isIgnored(file) {
  return IGNORE_FOLDERS.some((folder) => file.startsWith(folder));
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(CACHE_FILE));
}

function saveCache(cache) {
  fs.mkdirSync(".cache", { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function hashPatch(patch) {
  return crypto.createHash("sha1").update(patch).digest("hex");
}

function parseAST(code) {
  return parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript", "classProperties", "topLevelAwait"],
  });
}

function extractChangedLines(patch) {
  const lines = patch.split("\n");

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

    const functions = [];

    traverse(ast, {
      Function(path) {
        const start = path.node.loc.start.line;
        const end = path.node.loc.end.line;

        const affected = changedLines.some((l) => l >= start && l <= end);

        if (affected) {
          functions.push({
            start,
            end,
            code: code
              .split("\n")
              .slice(start - 1, end)
              .join("\n"),
          });
        }
      },
    });

    return functions;
  } catch (err) {
    console.log("AST parse failed");
    return [];
  }
}

async function getChangedFiles() {
  const res = await octokit.pulls.listFiles({
    owner,
    repo: repoName,
    pull_number: pr,
    per_page: 100,
  });

  return res.data
    .filter((f) => f.status !== "removed")
    .map((f) => ({
      filename: f.filename,
      patch: f.patch,
    }));
}

function runEslint(file) {
  try {
    const output = execSync(`npx eslint ${file} -f json`, { encoding: "utf8" });

    return JSON.parse(output)[0].messages;
  } catch (err) {
    if (!err.stdout) return [];

    return JSON.parse(err.stdout)[0].messages;
  }
}

function renderLintIssues(issues) {
  if (!issues.length) return "";

  let out = "### 🧹 Lint Issues\n\n";

  issues.forEach((i) => {
    const level = i.severity === 2 ? "❌" : "⚠️";

    out += `- ${level} line ${i.line} ${i.message} (${i.ruleId})\n`;
  });

  out += "\n";

  return out;
}

async function aiReview(file, patch) {
  const prompt = `
You are a senior software engineer reviewing a pull request.

File: ${file}

Code:
${patch}

Task:
List ONLY real issues

Rules:
- Show only problematic lines
- Keep it short
- Use:
  ❌ HIGH
  ⚠️ MEDIUM
  💡 LOW
- No explanation outside code block

Focus on:
- code convention, syntax
- bugs

Return issues in this format:

- HIGH line <number>: <message>
- MEDIUM line <number>: <message>
- LOW line <number>: <message>

If no issues return:

ISSUES: NONE
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
    max_tokens: 200,
  });

  return res.choices[0].message.content;
}

async function reviewFile(file, cache) {
  if (!isCodeFile(file.filename)) return null;

  if (isIgnored(file.filename)) return null;

  if (!file.patch) return null;

  if (file.patch.length > MAX_PATCH) return null;

  const hash = hashPatch(file.patch);

  if (cache[file.filename] === hash) {
    console.log("Skip cached:", file.filename);
    return null;
  }

  const code = fs.readFileSync(file.filename, "utf8");

  const lintIssues = runEslint(file.filename);

  const changedLines = extractChangedLines(file.patch);

  const functions = findFunctionsByLines(code, changedLines);

  const unique = new Map();

  for (const fn of functions) {
    const key = `${fn.start}-${fn.end}`;
    unique.set(key, fn);
  }

  const finalFunctions = [...unique.values()];

  const aiResults = [];

  for (const fn of finalFunctions) {
    const aiOutput = await aiReview(file.filename, fn.code);

    const issues = parseIssues(aiOutput);

    if (issues.length) {
      const frame = renderFunctionFrame(fn, issues);

      aiResults.push(frame);
    }
  }
  cache[file.filename] = hash;

  return {
    file: file.filename,
    lint: lintIssues,
    ai: aiResults,
  };
}

async function deleteOldBotComments() {
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const res = await octokit.issues.listComments({
      owner,
      repo: repoName,
      issue_number: pr,
      per_page: 100,
      page,
    });

    const comments = res.data;

    for (const c of comments) {
      // chỉ xóa comment của bot + đúng format
      const isBot = c.user.type === "Bot";
      const isOurComment = c.body && c.body.startsWith(HEADER);

      if (isBot && isOurComment) {
        await octokit.issues.deleteComment({
          owner,
          repo: repoName,
          comment_id: c.id,
        });

        console.log("Deleted:", c.id);
      }
    }

    hasNext = comments.length === 100;
    page++;
  }
}

function parseIssues(text) {
  if (!text || text.includes("NONE")) return [];

  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"))
    .map((line) => {
      const m = line.match(/(HIGH|MEDIUM|LOW) line (\d+): (.+)/i);
      if (!m) return null;

      return {
        level: m[1].toUpperCase(),
        line: Number(m[2]),
        message: m[3],
      };
    })
    .filter(Boolean);
}
function severityIcon(level) {
  switch (level) {
    case "HIGH":
      return "❌";
    case "MEDIUM":
      return "⚠️";
    default:
      return "💡";
  }
}

function renderFunctionFrame(fn, issues) {
  const lines = fn.code.split("\n");

  let output = "```js\n";

  lines.forEach((code, i) => {
    const lineNumber = fn.start + i;

    output += `${lineNumber} | ${code}\n`;

    const issue = issues.find((x) => x.line === lineNumber);

    if (issue) {
      output += `     ^ ${severityIcon(issue.level)} ${issue.level} ${
        issue.message
      }\n`;
    }
  });

  output += "```\n";

  return output;
}

async function postFreshComment(body) {
  await octokit.issues.createComment({
    owner,
    repo: repoName,
    issue_number: pr,
    body,
  });
}

function buildComment(results) {
  let body = `${HEADER}\n\n`;

  for (const r of results) {
    body += `## 📄 ${r.file}\n\n`;

    body += renderLintIssues(r.lint);

    if (r.ai && r.ai.length) {
      body += "### 🧠 AI Review\n\n";

      r.ai.forEach((frame) => {
        body += frame + "\n";
      });
    }
  }

  if (body.length > 60000) {
    body = body.slice(0, 60000) + "\n...truncated";
  }

  return body;
}

async function main() {
  const files = await getChangedFiles();

  const cache = loadCache();

  const targets = files.slice(0, MAX_FILES);
  const results = [];

  for (const file of targets) {
    const r = await reviewFile(file, cache);
    results.push(r);
  }

  saveCache(cache);

  const validReviews = results.filter((r) => r !== null);

  let comment = buildComment(validReviews);

  await deleteOldBotComments();
  if (validReviews.length === 0) {
    await postFreshComment(`${HEADER}
  
  ✅ No issues found`);
    return;
  }

  await postFreshComment(comment);
}

main();
