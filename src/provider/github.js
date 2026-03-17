const { Octokit } = require("@octokit/rest");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function splitRepo(repo) {
  const parts = String(repo).split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid REPO format (expected owner/repo): ${repo}`);
  }
  return { owner: parts[0], repo: parts[1] };
}

function createGitHubProvider({ config }) {
  const token = requireEnv("GITHUB_TOKEN");
  const repo = requireEnv("REPO");
  const prNumber = Number(requireEnv("PR_NUMBER"));

  if (!Number.isFinite(prNumber)) {
    throw new Error(`Invalid PR_NUMBER: ${process.env.PR_NUMBER}`);
  }

  const { owner, repo: repoName } = splitRepo(repo);
  const octokit = new Octokit({ auth: token });

  const header = config?.comment?.header || "## 🤖 AI Review (auto-generated)";

  return {
    kind: "github",
    owner,
    repo: repoName,
    prNumber,

    async listChangedFiles() {
      const res = await octokit.pulls.listFiles({
        owner,
        repo: repoName,
        pull_number: prNumber,
        per_page: 100,
      });

      return res.data
        .filter((f) => f.status !== "removed")
        .map((f) => ({
          filename: f.filename,
          patch: f.patch || "",
          status: f.status,
        }));
    },

    async deletePreviousBotComments() {
      let page = 1;
      let hasNext = true;

      while (hasNext) {
        const res = await octokit.issues.listComments({
          owner,
          repo: repoName,
          issue_number: prNumber,
          per_page: 100,
          page,
        });

        const comments = res.data;

        for (const c of comments) {
          const isBot = c.user?.type === "Bot";
          const isOurComment = Boolean(c.body && c.body.startsWith(header));

          if (isBot && isOurComment) {
            await octokit.issues.deleteComment({
              owner,
              repo: repoName,
              comment_id: c.id,
            });
          }
        }

        hasNext = comments.length === 100;
        page++;
      }
    },

    async createComment(body) {
      await octokit.issues.createComment({
        owner,
        repo: repoName,
        issue_number: prNumber,
        body,
      });
    },
  };
}

module.exports = { createGitHubProvider };

