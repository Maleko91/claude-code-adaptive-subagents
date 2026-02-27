#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

const SKILL_NAME = "adaptive-subagents";
const SKILL_FILES = ["SKILL.md", "hooks.json"];

const args = process.argv.slice(2);

function usage() {
  console.log(`
  adaptive-subagents — Install the Claude Code adaptive subagent routing skill

  Usage:
    npx adaptive-subagents                   Install globally (~/.claude/skills/)
    npx adaptive-subagents --project .       Install into a project's .claude/skills/
    npx adaptive-subagents --uninstall       Remove global install
    npx adaptive-subagents --uninstall --project .  Remove project install

  Options:
    --project <path>   Target a project directory instead of global install
    --uninstall        Remove the skill instead of installing it
    --help             Show this help message
`.trimEnd());
}

function resolveTarget() {
  const projectIdx = args.indexOf("--project");
  if (projectIdx !== -1) {
    const projectPath = args[projectIdx + 1];
    if (!projectPath || projectPath.startsWith("--")) {
      console.error("Error: --project requires a path argument");
      process.exit(1);
    }
    return path.resolve(projectPath, ".claude", "skills", SKILL_NAME);
  }
  return path.join(os.homedir(), ".claude", "skills", SKILL_NAME);
}

function install(targetDir) {
  const sourceDir = path.join(__dirname, "..", SKILL_NAME);

  fs.mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  for (const file of SKILL_FILES) {
    const src = path.join(sourceDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetDir, file));
      copied++;
    }
  }

  console.log(`Installed ${SKILL_NAME} to ${targetDir} (${copied} files)`);
  console.log(`Invoke with: /adaptive-subagents`);
}

function uninstall(targetDir) {
  if (!fs.existsSync(targetDir)) {
    console.log(`Nothing to remove — ${targetDir} does not exist.`);
    return;
  }

  for (const file of SKILL_FILES) {
    const filePath = path.join(targetDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Remove the directory if empty
  try {
    fs.rmdirSync(targetDir);
  } catch {
    // Directory not empty — leave it
  }

  console.log(`Removed ${SKILL_NAME} from ${targetDir}`);
}

// Main
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const targetDir = resolveTarget();

if (args.includes("--uninstall")) {
  uninstall(targetDir);
} else {
  install(targetDir);
}
