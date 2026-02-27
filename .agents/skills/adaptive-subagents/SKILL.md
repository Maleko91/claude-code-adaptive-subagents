---
name: adaptive-subagents
user-invokable: true
description: Optimize token cost for coding tasks by routing subtasks to the right model tier. Applies to feature implementation, bug fixes, refactoring, test writing, code search, file lookup, architecture design, security review, debugging, documentation updates, and any multi-step request. Delegates cheap work to Haiku, standard coding to Sonnet, and complex planning to Opus. Fans out independent subtasks in parallel. Logs all delegations to routing-log.md.
---

# Adaptive Subagent Routing

Delegate to the cheapest model that satisfies quality. Skip delegation when the task fits in one short response.

**Transparency rule:** Before each delegation, output a single line: `> Routing to {Model}: {brief reason}` so the user sees what's happening.

## Cost Ratios

| Model | Relative Cost | Best For |
|---|---|---|
| Haiku (1x) | ~$0.25/M input, $1.25/M output | Read-only tasks, search, formatting |
| Sonnet (5x) | ~$3/M input, $15/M output | Implementation, refactoring, tests |
| Opus (30x) | ~$15/M input, $75/M output | Architecture, security, ambiguous scope |

Always route to the cheapest tier that delivers acceptable quality. The savings compound — a 10-delegation task routed to Haiku instead of Opus saves ~97% on those calls.

## Routing Decision Tree

```
Start → estimate complexity
  │
  ├─ Trivial (search, format, lookup, single-line fix)?
  │   → Haiku
  │
  ├─ Standard (implement, bug fix, refactor < 10 files, write tests)?
  │   → Sonnet
  │
  ├─ Complex (architecture, migration, security, ambiguous scope)?
  │   → Opus (include "ultrathink" in prompt for deep reasoning)
  │
  ├─ Failed twice at current tier?
  │   → Escalate +1 tier
  │
  └─ Planning complete, remaining work is implementation/formatting?
      → Downgrade to Sonnet or Haiku
```

### Don't Delegate

Skip delegation entirely when:
- The task is under ~100 tokens of useful output (single-line edits, variable renames, quick answers)
- You already have the answer in context
- The overhead of spawning a subagent exceeds the work itself

## Routing Signals

| Haiku | Sonnet | Opus |
|---|---|---|
| Search, grep, lookup | Implementation, bug fix | Architecture, migration |
| Formatting, summarize | Refactor (< 10 files) | Security review |
| Simple validation | Test writing | Ambiguous/conflicting scope |
| File listing, structure | Debugging with stack traces | Multi-system design |
| Typo fixes, renames | Code generation (< 500 lines) | Performance analysis |

Escalate +1 tier on: ambiguous requirements, production-critical paths, or 2 consecutive failures.
Downgrade after: planning completes, or remaining work is formatting/summarization.

## Delegation

```
Task(subagent_type: "Explore", model: "haiku", prompt: "...")
Task(subagent_type: "general-purpose", model: "sonnet", prompt: "...")
Task(subagent_type: "Plan", model: "opus", prompt: "...")
```

Keep prompts scoped: relevant files, constraints, expected output format. Pass plan steps, not full conversation history.

### Expected Output Formats

Tell each subagent what to return so the parent can integrate cleanly:

| Tier | Expected Output |
|---|---|
| Haiku | File paths, grep results, short summaries, yes/no validations |
| Sonnet | Code diffs, implementation files, test files, error analysis |
| Opus | Numbered plan steps, architecture decisions with rationale, risk assessment |

## Parallel Fan-Out

When a request contains independent subtasks, launch multiple subagents in a single message.

**Before splitting, build a dependency graph.** List subtasks, then check: does any subtask need another's output, or do they modify the same file? If yes, those subtasks are dependent — run them sequentially, feeding earlier output into later prompts.

| Pattern | Parallel? | Why |
|---|---|---|
| Separate files, separate concerns | Yes | No shared state |
| Research + unrelated implementation | Yes | Read-only doesn't conflict with writes |
| Implementation + its tests | **No** | Tests depend on the implementation |
| Feature + docs describing that feature | **No** | Docs need to reflect what was built |
| Two features touching different modules | Yes | Independent code paths |
| Refactor + anything in same files | **No** | Refactor changes the baseline |

**Mixed dependency example** — user asks "add validation, write its tests, and fix the unrelated typo in config.py":
```
# Phase 1 — independent work, launch in parallel:
Task(model: "sonnet", prompt: "Add input validation to UserController. Constraints: ...")
Task(model: "haiku", prompt: "Fix typo on line 12 of config.py: change 'databse' to 'database'")

# Phase 2 — depends on Phase 1 validation output:
Task(model: "sonnet", prompt: "Write unit tests for the validation added to UserController. The validation does: {summary from Phase 1}. Test cases: ...")
```

After all phases return, review outputs for conflicts before applying.

## Thinking Budget

- Opus delegations use extended thinking by default — this is intentional for planning tasks.
- For complex architecture or security reviews, include "ultrathink" in the Opus prompt to signal deep reasoning.
- Don't route to Opus just because a task is important — route based on **complexity**. A critical but simple bug fix still goes to Sonnet.
- Haiku and Sonnet don't benefit from extended thinking prompts — don't include thinking keywords in their prompts.

## Routing Log

After each delegation, append an entry to `routing-log.md` (in this skill's directory) using this format:

```
| {timestamp} | {brief task description} | {model} | {category} | {estimated savings} |
```

**Category** is one of: search, format, implement, refactor, test, debug, plan, security, docs.

**Estimated savings** uses the cost ratio multiplier. If a task was routed to Haiku that could have gone to Opus, the saving is `~30x`. If routed to Sonnet instead of Opus, `~6x`. If routed to the highest necessary tier, `1x (baseline)`.

Estimate task size as: small (~500 tokens), medium (~2000 tokens), large (~5000 tokens). Multiply by the cost difference to get an approximate token saving.

Example: a search task (small, ~500 tokens) routed to Haiku instead of Opus saves approximately `500 × 29 = ~14,500 equivalent Opus tokens`.

## Guardrails

- Max 2 retries per subagent, then escalate or ask the user.
- Don't delegate tasks under ~100 tokens of useful output.
- Hand implementation to Sonnet immediately after Opus planning.
- Max 3 sequential delegations per user request. No limit on parallel.
- Always review subagent outputs before applying — check for conflicts, hallucinated paths, and incomplete work.

## First-Use Setup

On the **first invocation** of this skill in a project, check if the project's `.claude/CLAUDE.md` contains a `## Subagent Routing` section. If it does not:

1. Read the existing `.claude/CLAUDE.md` (or create it if it doesn't exist).
2. Append the following block:

```markdown
## Subagent Routing
- Before every Task tool call, output: `> Routing to {Model}: {reason}`
- After every Task tool call, append a row to the routing-log.md in the adaptive-subagents skill directory.
- Use the adaptive-subagents skill routing table to pick the cheapest model that satisfies quality.
```

3. Next, check if `.claude/settings.json` exists and contains a `PostToolUse` hook with matcher `"Task"`. If it does not:
   - Read the existing `.claude/settings.json` (or create `{ "hooks": {} }` if it doesn't exist).
   - Merge the hook config from `hooks.json` (in this skill's directory) into the project's `.claude/settings.json` under `hooks.PostToolUse`. Preserve any existing hooks — append, don't replace.
4. Tell the user: `> Setup: Added Subagent Routing rules to .claude/CLAUDE.md and PostToolUse hook to .claude/settings.json.`

Do this **once per project**. If both the CLAUDE.md section and the hook already exist, skip silently.

## Mandatory — Do Not Skip

These rules apply to EVERY delegation. Non-negotiable.

1. **Before** every Task call → output `> Routing to {Model}: {reason}`
2. **After** every Task call → append a row to `routing-log.md`
3. Never route to a higher tier than the task requires — cost efficiency is the point of this skill.
