const { loadConfig } = require("./config/loadConfig");
const { runReview } = require("./commands/review");

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`ai-pr-reviewer

Usage:
  ai-pr-reviewer review

Environment (GitHub PR mode):
  GITHUB_TOKEN   Token to read PR diff and create comments
  REPO           owner/repo (e.g. octo-org/octo-repo)
  PR_NUMBER      Pull request number

Config (optional):
  .ai-pr-reviewer.yml
  ai-pr-reviewer.config.json
`);
}

async function runCli(argv) {
  const [command] = argv;

  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  if (command !== "review") {
    throw new Error(`Unknown command: ${command}`);
  }

  const config = await loadConfig(process.cwd());
  await runReview({ config });
}

module.exports = { runCli };

