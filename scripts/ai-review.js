const { Octokit } = require("@octokit/rest");
const OpenAI = require("openai");
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");

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
    return execSync(`npx eslint ${file} -f json`).toString();
  } catch (err) {
    return err.stdout.toString();
  }
}

async function aiReview(file, patch, eslintResult) {
  const prompt = `
You are a senior software engineer reviewing a pull request.

File: ${file}

Diff:
${patch}

ESLint:
${eslintResult}

Task:
List ONLY real issues

Rules:
- Short explaination.
- Do not repeat code.
- One line per issue.

Focus on:
- code convention, syntax
- bugs

Return ONLY issues in this format:

- ❌ [HIGH] line <number>: <short issue>
- ⚠️ [MEDIUM] line <number>: <short issue>
- 💡 [LOW] line <number>: <short issue>

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

  const eslintResult = runEslint(file.filename);

  const review = await aiReview(file.filename, file.patch, eslintResult);

  cache[file.filename] = hash;

  return {
    file: file.filename,
    review,
  };
}

function formatReviewOutput(raw) {

  if (!raw || raw.includes("NONE")) {
    return "✅ No issues";
  }

  return raw
    .split("\n")
    .filter(line => line.trim().startsWith("-"))
    .map(line => line.trim())
    .join("\n");
}

async function upsertSingleComment(body) {
  const comments = await octokit.issues.listComments({
    owner,
    repo: repoName,
    issue_number: pr,
  });

  const botComments = comments.data.filter((c) => c.body.startsWith(HEADER));

  for (const c of botComments) {
    await octokit.issues.deleteComment({
      owner,
      repo: repoName,
      comment_id: c.id,
    });
  }

  await octokit.issues.createComment({
    owner,
    repo: repoName,
    issue_number: pr,
    body,
  });
}

async function main() {
  const files = await getChangedFiles();

  const cache = loadCache();

  const targets = files.slice(0, MAX_FILES);

  const results = await Promise.all(
    targets.map((file) => reviewFile(file, cache))
  );

  saveCache(cache);

  const validReviews = results.filter((r) => r !== null);

  if (validReviews.length === 0) {
    console.log("No files to review");
    return;
  }
  validReviews.sort((a, b) => a.file.localeCompare(b.file));
  let comment = `## 🤖 AI Review (auto-generated)

  _Last updated: ${new Date().toISOString()}_
  
  `;
  
  for (const r of validReviews) {
  
    comment += `### 📄 ${r.file}\n\n`;
  
    comment += formatReviewOutput(r.review);
  
    comment += "\n\n---\n\n";
  }

  if (comment.length > 60000) {
    comment = comment.slice(0, 60000) + "\n...truncated";
  }

  if (validReviews.length === 0) {
    await upsertSingleComment(`${HEADER}
  
  ✅ No issues found`);
    return;
  }
  await upsertSingleComment(comment);
}

main();
