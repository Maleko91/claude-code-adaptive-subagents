---
name: adaptive-subagents
user-invocable: true
description: Optimize token cost for coding tasks by routing subtasks to the right model tier. Applies to feature implementation, bug fixes, refactoring, test writing, code search, file lookup, architecture design, security review, debugging, documentation updates, and any multi-step request. Delegates cheap work to Haiku, standard coding to Sonnet, and complex planning to Opus. Fans out independent subtasks in parallel. Logs all delegations to routing-log.md.
---

# Adaptive Subagent Routing

Delegate to the cheapest model that satisfies quality. Skip delegation when the task fits in one short response.

**Transparency rule:** The plugin's PreToolUse hook prompts you to output `**Routing to {Model}:** {brief reason}` before each delegation. Use bold text, not `>` blockquote (blockquotes indent and reduce visibility).

## Per-Subtask Routing (Critical)

Do NOT route once and use the same model for an entire multi-step task. Instead:

1. **Decompose first.** Break the user's request into a todo list of subtasks.
2. **Route each subtask independently.** Evaluate complexity per item — most items will be cheaper than the overall task.
3. **Downgrade after planning.** If Opus produces a plan, the remaining implementation steps go to Sonnet. Formatting, file lookups, and cleanup go to Haiku.

Example — user asks "design and implement a caching layer":
- Plan the architecture → Opus
- Search for existing cache usage → Haiku
- Implement the cache module → Sonnet
- Write tests → Sonnet
- Update internal dev notes → Haiku
- Write public API docs → Sonnet (escalated: public-facing)

Each of those gets its own `**Routing to {Model}:**` line and its own routing-log entry.

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
  ├─ High-stakes output (public-facing, security-sensitive, production-critical)?
  │   → Escalate +1 tier (Haiku→Sonnet, Sonnet→Opus)
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

Escalate +1 tier on: ambiguous requirements, public-facing/security-sensitive output, production-critical paths, or 2 consecutive failures.
Downgrade after: planning completes, or remaining work is internal formatting/summarization.

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
- Don't route to Opus just because a task is important — route based on **complexity**, then apply the criticality escalation. A critical but simple bug fix still goes to Sonnet; a simple doc task that's public-facing escalates from Haiku to Sonnet, not to Opus.
- Haiku and Sonnet don't benefit from extended thinking prompts — don't include thinking keywords in their prompts.

## Routing Log

The plugin's PostToolUse hook prompts you to log each delegation. Append rows to `routing-log.md` in the current working directory (create with header if missing). Use Edit directly — don't delegate the log write.

```markdown
| Task | Model | Category | Saved |
|------|-------|----------|-------|
| {brief task description} | {model} | {category} | {multiplier} |
```

**Category:** search, format, implement, refactor, test, debug, plan, security, docs.

**Saved:** `30x` if Haiku instead of Opus, `6x` if Sonnet instead of Opus, `—` if already at the highest necessary tier.

## Guardrails

- Max 2 retries per subagent, then escalate or ask the user.
- Don't delegate tasks under ~100 tokens of useful output.
- Hand implementation to Sonnet immediately after Opus planning.
- Max 3 sequential delegations per user request. No limit on parallel.
- Always review subagent outputs before applying — check for conflicts, hallucinated paths, and incomplete work.

## Core Rules

1. **Decompose** the request into subtasks and route each one independently.
2. **Downgrade** after planning — implementation goes to Sonnet, cleanup to Haiku.
3. Never route to a higher tier than the subtask requires — cost efficiency is the point of this plugin.

Routing transparency and log writes are enforced by the plugin's PreToolUse and PostToolUse hooks.
