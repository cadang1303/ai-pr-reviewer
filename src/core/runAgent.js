const fs = require("fs");
const crypto = require("crypto");
const { createAiClient } = require("./services/aiClient");
const { lintSkill } = require("../skills/lintSkill");
const { aiReviewSkill } = require("../skills/aiReviewSkill");
const { testSuggestSkill } = require("../skills/testSuggestSkill");
const { renderReport } = require("../render/renderReport");
const { matchesAny } = require("./glob");

const CACHE_FILE = ".cache/ai-pr-reviewer.json";

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(".cache", { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function hashText(text) {
  return crypto.createHash("sha1").update(String(text)).digest("hex");
}

function filterFiles(config, files) {
  const include = config?.filters?.include || [];
  const exclude = config?.filters?.exclude || [];

  return files.filter((f) => {
    const name = f.filename;
    if (exclude.length && matchesAny(exclude, name)) return false;
    if (!include.length) return true;
    return matchesAny(include, name);
  });
}

async function runAgent({ config, provider }) {
  const budgets = config?.budgets || {};
  const maxFiles = budgets.maxFiles ?? 20;
  const maxPatchChars = budgets.maxPatchChars ?? 6000;

  const allFiles = await provider.listChangedFiles();
  const filtered = filterFiles(config, allFiles)
    .filter((f) => f.patch && f.patch.length > 0)
    .filter((f) => f.patch.length <= maxPatchChars)
    .slice(0, maxFiles);

  const cache = loadCache();
  const ai = createAiClient({ config });

  const skillContext = {
    provider: { kind: provider.kind },
    changeSet: { files: filtered },
    workspace: { canReadFiles: true, canRunCommands: true },
    config,
    services: { ai },
  };

  const results = [];

  for (const file of filtered) {
    const patchHash = hashText(file.patch);
    const cacheKey = `${provider.kind}:${file.filename}`;
    if (cache[cacheKey] === patchHash) continue;

    const perFileCtx = { ...skillContext, file };

    const lint = await lintSkill(perFileCtx);
    const review = await aiReviewSkill(perFileCtx);
    const tests = config?.tests?.suggest ? await testSuggestSkill(perFileCtx) : null;

    results.push({
      file: file.filename,
      lint,
      review,
      tests,
    });

    cache[cacheKey] = patchHash;
  }

  saveCache(cache);

  const report = renderReport({ config, results });

  if (config?.provider?.publish?.mode === "comment") {
    await provider.deletePreviousBotComments();
    await provider.createComment(report);
  } else {
    // Artifact/log fallback: print to stdout for CI capture
    // eslint-disable-next-line no-console
    console.log(report);
  }
}

module.exports = { runAgent };

