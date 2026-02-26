---
name: claude-code-adaptive-subagents
description: Optimize token cost for coding tasks by routing subtasks to the right model tier. Applies to feature implementation, bug fixes, refactoring, test writing, code search, file lookup, architecture design, security review, debugging, documentation updates, and any multi-step request. Delegates cheap work to Haiku, standard coding to Sonnet, and complex planning to Opus. Fans out independent subtasks in parallel.
---

# Adaptive Subagent Routing

Delegate to the cheapest model that satisfies quality. Skip delegation when the task fits in one short response.

**Transparency rule:** Before each delegation, output a single line: `> Routing to {Model}: {brief reason}` so the user sees what's happening.

## Routing Signals

| Haiku | Sonnet | Opus |
|---|---|---|
| Search, grep, lookup | Implementation, bug fix | Architecture, migration |
| Formatting, summarize | Refactor (< 10 files) | Security review |
| Simple validation | Test writing | Ambiguous/conflicting scope |

Escalate +1 tier on: ambiguous requirements, production-critical paths, or 2 consecutive failures.
Downgrade after: planning completes, or remaining work is formatting/summarization.

## Delegation

```
Task(subagent_type: "Explore", model: "haiku", prompt: "...")
Task(subagent_type: "general-purpose", model: "sonnet", prompt: "...")
Task(subagent_type: "Plan", model: "opus", prompt: "...")
```

Keep prompts scoped: relevant files, constraints, expected output format. Pass plan steps, not full conversation history.

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

## Guardrails

- Max 2 retries per subagent, then escalate or ask the user.
- Don't delegate tasks under ~100 tokens of useful output.
- Hand implementation to Sonnet immediately after Opus planning.
- Max 3 sequential delegations per user request. No limit on parallel.
