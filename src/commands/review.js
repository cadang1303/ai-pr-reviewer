const { createProvider } = require("../provider/createProvider");
const { runAgent } = require("../core/runAgent");

async function runReview({ config }) {
  const provider = await createProvider({ config });
  await runAgent({ config, provider });
}

module.exports = { runReview };

