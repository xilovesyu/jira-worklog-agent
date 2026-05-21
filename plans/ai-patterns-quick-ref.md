# AI Patterns Quick Reference

## 10 Patterns in One Sentence

| # | Pattern | Essence |
|---|---------|---------|
| 1 | **Agentic Loop** | Execute → Observe → Reflect → Correct (iterate until good) |
| 2 | **Multi-Agent** | Planner + Executor + Critic + Summarizer collaborate |
| 3 | **Tool Discovery** | AI searches tools, creates new ones if missing |
| 4 | **Evidence-Based** | Collect evidence first, AI decides ON evidence (not guessing) |
| 5 | **State Machine** | States + transitions, not linear flow |
| 6 | **Self-Prompting** | AI evaluates output, suggests better prompt, retry |
| 7 | **Context Compression** | Keep high-density chunks, summarize low-density ones |
| 8 | **Thought Tracing** | AI outputs reasoning steps for audit |
| 9 | **Predictive** | Predict future work from patterns + roadmap |
| 10 | **Calendar-Aware** | Meeting title/attendees → infer related tickets |

---

## Decision Tree: Which Pattern to Use?

```
Is the task simple single-call?
├─ YES → Just use LLM directly
└─ NO → Is quality critical?
    ├─ YES → Use Agentic Loop (Pattern 1)
    └─ NO → Is task decomposable?
        ├─ YES → Multi-Agent (Pattern 2)
        └─ NO → Need new capabilities?
            ├─ YES → Tool Discovery (Pattern 3)
            └─ NO → Have data/evidence?
                ├─ YES → Evidence-Based (Pattern 4)
                └─ NO → Need workflow control?
                    ├─ YES → State Machine (Pattern 5)
                    └─ NO → Want better prompts?
                        ├─ YES → Self-Prompting (Pattern 6)
                        └─ NO → Context too long?
                            ├─ YES → Compression (Pattern 7)
                            └─ NO → Need reasoning audit?
                                ├─ YES → Thought Tracing (Pattern 8)
                                └─ NO → Want predictions?
                                    ├─ YES → Predictive (Pattern 9)
                                    └─ NO → Calendar context?
                                        ├─ YES → Calendar-Aware (Pattern 10)
                                        └─ NO → Default: Evidence-Based
```

---

## Code Snippets for Quick Copy

### Agentic Loop (Minimal)

```javascript
for (let i = 0; i < 3; i++) {
  const result = await llm.execute(prompt);
  const critique = await llm.execute(`Review: ${result}, suggest improvements`);
  if (critique.score >= 8) return result;
  prompt = critique.improvedPrompt;
}
```

### Multi-Agent (Minimal)

```javascript
const plan = await planner.execute(task);
const execution = await executor.execute(plan);
const review = await critic.execute(execution);
const final = review.ok ? execution : await executor.execute(review.fix);
return await summarizer.execute(final);
```

### Evidence-Based (Minimal)

```javascript
const evidence = { commits, history, activity };
const decision = await llm.execute(`
  Evidence: ${JSON.stringify(evidence)}
  Task: ${task}
  Decide based on evidence only. Rate confidence.
`);
```

---

## Model Selection Guide

| Role | Best Model | Reason |
|------|------------|--------|
| Strategic Planner | Opus 4.7 | Complex decomposition |
| Quality Critic | Opus 4.7 | Deep analysis needed |
| Executor | Sonnet 4.6 | Balance speed/quality |
| Summarizer | Haiku 4.5 | Fast, cheap |
| Tool Creator | Sonnet 4.6 | Code generation |
| Validator | Haiku 4.5 | Binary check fast |

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Single call for complex task | No iteration, no correction | Use Agentic Loop |
| AI guesses without data | Hallucination, unreliability | Collect evidence first |
| Fixed tools only | Can't adapt to new needs | Add Tool Discovery |
| Linear flow only | No retry, no branching | Use State Machine |
| Truncate context blindly | Lose important info | Semantic compression |
| No reasoning trail | Can't audit/debug | Add Thought Tracing |

---

## Implementation Priority for This Project

1. **Now**: Enhance Evidence-Based (upgrade `evidenceCollector.mjs`)
2. **Next**: Add Agentic Loop to `intelligentDecision.mjs`
3. **Later**: Multi-Agent split, Predictive features

See `advanced-ai-patterns.md` for full details.