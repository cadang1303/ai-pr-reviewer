async function createProvider({ config }) {
  const kind = config?.provider?.kind || "github";

  if (kind === "github") {
    // Lazy require to keep provider boundaries clear
    const { createGitHubProvider } = require("./github");
    return createGitHubProvider({ config });
  }

  if (kind === "gitlab") {
    const { createGitLabProvider } = require("./gitlab");
    return createGitLabProvider({ config });
  }

  throw new Error(`Unsupported provider kind: ${kind}`);
}

module.exports = { createProvider };

