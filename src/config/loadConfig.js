const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const DEFAULT_CONFIG = {
  provider: { kind: "github", publish: { mode: "comment" } },
  budgets: { maxFiles: 20, maxPatchChars: 6000, maxChunks: 80, maxCommentChars: 60000 },
  filters: {
    include: ["**/*.{js,ts,jsx,tsx,mjs,cjs}"],
    exclude: ["node_modules/**", "dist/**", "build/**", "coverage/**", ".next/**", "out/**"],
  },
  ai: { model: "gpt-4o-mini", temperature: 0, maxTokens: 300 },
  lint: { command: "npx eslint" },
  tests: { suggest: true, run: { enabled: false, command: "" } },
  comment: { header: "## 🤖 AI Review (auto-generated)" },
};

function deepMerge(base, override) {
  if (!override) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || base === null) return override;
  if (typeof override !== "object" || override === null) return override;

  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = deepMerge(base[k], v);
  }
  return out;
}

function tryReadFile(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

async function loadConfig(cwd) {
  const yamlPath = path.join(cwd, ".ai-pr-reviewer.yml");
  const jsonPath = path.join(cwd, "ai-pr-reviewer.config.json");

  const yamlText = tryReadFile(yamlPath);
  if (yamlText) {
    const parsed = YAML.parse(yamlText) || {};
    return deepMerge(DEFAULT_CONFIG, parsed);
  }

  const jsonText = tryReadFile(jsonPath);
  if (jsonText) {
    const parsed = JSON.parse(jsonText);
    return deepMerge(DEFAULT_CONFIG, parsed);
  }

  return DEFAULT_CONFIG;
}

module.exports = { loadConfig, DEFAULT_CONFIG };

