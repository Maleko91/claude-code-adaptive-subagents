#!/usr/bin/env node
// PostToolUse hook — logs each Agent delegation to routing-log.md

const fs = require("fs");

const COST = { haiku: "1x", sonnet: "3x", opus: "15x" };
const HEADER = "| Model | Cost | Task |\n|-------|------|------|\n";
const LOG = "routing-log.md";

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(raw);
    const ti = data.tool_input || {};
    const model = ti.model || "sonnet";
    const desc = ti.description || "unknown task";
    const cost = COST[model] || "?";

    const needsHeader = !fs.existsSync(LOG);
    const line = `| ${model} | ${cost} | ${desc} |\n`;
    fs.appendFileSync(LOG, needsHeader ? HEADER + line : line);
  } catch (e) {
    process.stderr.write(`log-delegation: ${e.message}\n`);
  }
});
