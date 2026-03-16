const fs = require("fs");
const axios = require("axios");

const diff = fs.readFileSync("diff.txt", "utf8");

const prompt = `
You are a senior software engineer reviewing a Pull Request.

Tasks:
1. Detect bugs
2. Check coding conventions
3. Suggest improvements
4. Evaluate code quality

Return result in Markdown.

DIFF:
${diff}
`;

async function run() {
  const res = await axios.post(
    "https://models.github.ai/inference",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
      }
    }
  );

  const review = res.data.choices[0].message.content;

  fs.writeFileSync("review.md", review);
}

run();