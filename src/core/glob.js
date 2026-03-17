const path = require("path");

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(glob) {
  // Minimal glob: **, *, ?, and {...} sets for extensions.
  // This is intentionally small; can be replaced with picomatch later.
  let g = String(glob);

  // Handle {a,b,c} by expanding to (a|b|c)
  g = g.replace(/\{([^}]+)\}/g, (_, inner) => `(${inner.split(",").map(escapeRegex).join("|")})`);

  // Normalize path separators to /
  g = g.replace(/\\/g, "/");

  // Escape regex chars then re-introduce glob tokens
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    const next = g[i + 1];
    if (ch === "*" && next === "*") {
      // ** -> match anything including /
      re += ".*";
      i++;
      continue;
    }
    if (ch === "*") {
      re += "[^/]*";
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    re += escapeRegex(ch);
  }

  return new RegExp(`^${re}$`);
}

function normalizeForMatch(p) {
  return String(p).split(path.sep).join("/");
}

function matchesAny(globs, filePath) {
  const p = normalizeForMatch(filePath);
  for (const g of globs || []) {
    const re = globToRegExp(g);
    if (re.test(p)) return true;
  }
  return false;
}

module.exports = { matchesAny };

