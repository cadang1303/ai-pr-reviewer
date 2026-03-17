const OpenAI = require("openai");

function createAiClient({ config }) {
  const provider = config?.ai?.provider || "github_models";

  // Default: GitHub Models uses GITHUB_TOKEN with a fixed baseURL.
  const baseURL =
    config?.ai?.baseUrl ||
    process.env.AI_BASE_URL ||
    (provider === "github_models" ? "https://models.github.ai/inference" : undefined);

  const apiKey =
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GITHUB_TOKEN;

  if (!apiKey) {
    throw new Error(
      "Missing AI_API_KEY/OPENAI_API_KEY/GITHUB_TOKEN for the AI client."
    );
  }

  const client = new OpenAI({ apiKey, baseURL });

  return {
    async chat({ model, temperature, maxTokens, messages }) {
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      return res.choices?.[0]?.message?.content || "";
    },
  };
}

module.exports = { createAiClient };

