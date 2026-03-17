#!/usr/bin/env node

const { runCli } = require("../src/cli");

runCli(process.argv.slice(2)).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});

