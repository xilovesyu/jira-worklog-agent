# Advanced AI Engineering Patterns

Higher-level, more creative, and deeper AI integration patterns that go beyond simple "call LLM API".

## Overview

Key mindset shift: **Don't treat AI as a "question-answering tool", but as a "stateful, reflective, collaborative, and evolving agent"**.

Upgrade Path:
1. **Single Call** → **Multi-Step Loop with Reflection**
2. **One Agent** → **Multi-Agent Collaboration**
3. **Fixed Tools** → **Dynamic Tool Discovery**
4. **Blind Guessing** → **Evidence-Based Reasoning**
5. **Linear Flow** → **State Machine Driven**
6. **Static Prompt** → **Self-Optimizing Prompt**

---

## Pattern 1: Agentic Loop with Reflection

AI doesn't just execute once, but: **Execute → Observe → Reflect → Correct**.

### Implementation

```javascript
async function agenticLoop(task, maxIterations = 5) {
  let result = null;
  let reflection = null;
  const reflections = [];

  for (let i = 0; i < maxIterations; i++) {
    // Step 1: Execute
    result = await llm.execute(task, reflection);

    // Step 2: Observe result
    const observation = await observeResult(result);

    // Step 3: Self-reflection - AI judges its own output
    reflection = await llm.reflect({
      originalTask: task,
      result: result,
      observation: observation,
      previousReflections: reflections
    });

    reflections.push(reflection);

    if (reflection.confidence === 'high' && reflection.needsCorrection === false) {
      break; // AI decides it's good enough
    }

    // Step 4: Refine task based on reflection
    task = reflection.refinedTask;
  }

  return { result, reflections };
}
```

### Use Cases

- **Automated Code Review**: AI analyzes → finds issues → reflects → deeper analysis → final report
- **Document Generation**: Draft → review quality → refine → final version
- **Debugging**: Initial diagnosis → test hypothesis → refine understanding → root cause

### Key Benefits

- Self-correction without human intervention
- Transparent reasoning trail via reflections
- Converges on better solutions iteratively

---

## Pattern 2: Multi-Agent Collaboration

Different AI agents with distinct roles collaborate on complex tasks.

### Implementation

```javascript
class AgentTeam {
  agents = {
    planner: new Agent({ role: 'Planner', model: 'claude-opus' }),
    executor: new Agent({ role: 'Executor', model: 'claude-sonnet' }),
    critic: new Agent({ role: 'Critic', model: 'claude-opus' }),
    summarizer: new Agent({ role: 'Summarizer', model: 'claude-haiku' })
  };

  async solveComplexTask(task) {
    // Planner creates the plan
    const plan = await this.agents.planner.execute(`
      As a strategic planner, break down this task into executable steps:
      ${task}

      Output format:
      {
        "steps": [
          { "id": 1, "description": "...", "dependencies": [] },
          ...
        ],
        "success_criteria": "...",
        "risks": ["..."]
      }
    `);

    // Executor handles each step
    const results = [];
    for (const step of plan.steps) {
      const result = await this.agents.executor.execute(step);
      results.push(result);

      // Critic reviews immediately
      const critique = await this.agents.critic.execute(`
        Review this execution for quality and correctness:
        Step: ${JSON.stringify(step)}
        Result: ${result}
        Success Criteria: ${plan.success_criteria}

        Evaluate:
        1. Does it meet the criteria?
        2. Any errors or gaps?
        3. Specific improvements needed?
      `);

      if (critique.needsRevision) {
        // Feedback to Executor for correction
        const revisedResult = await this.agents.executor.execute(`
          Original task: ${step.description}
          Original result: ${result}
          Critique: ${critique.feedback}

          Revise your work to address the critique.
        `);
        results.push(revisedResult);
      }
    }

    // Summarizer synthesizes final output
    return await this.agents.summarizer.execute(`
      Synthesize these execution results into a final deliverable:
      Original task: ${task}
      Execution results: ${JSON.stringify(results)}

      Create:
      1. Executive summary
      2. Key outputs
      3. Lessons learned
    `);
  }
}
```

### Use Cases

- **Software Development**: Planner designs → Executor writes code → Critic reviews → Summarizer documents
- **Research Analysis**: Planner identifies sources → Executor gathers data → Critic validates → Summarizer reports
- **Customer Support**: Planner triages → Executor resolves → Critic verifies satisfaction → Summarizer logs

### Agent Roles to Consider

| Role | Responsibility | Model Tier |
|------|----------------|------------|
| Planner | Strategy, decomposition | High (Opus) |
| Researcher | Information gathering | Medium (Sonnet) |
| Executor | Implementation | Medium (Sonnet) |
| Critic | Quality assurance | High (Opus) |
| Validator | Testing, verification | Medium |
| Summarizer | Output synthesis | Low (Haiku) |
| Communicator | User interaction | Medium |

---

## Pattern 3: Dynamic Tool Discovery

AI doesn't just know fixed tools, but can "discover" or "create" new capabilities.

### Implementation

```javascript
class ToolDiscoveryAgent {
  toolRegistry = new Map();

  async discoverAndUse(userIntent) {
    // 1. AI analyzes what capabilities are needed
    const capabilityAnalysis = await llm.execute(`
      User wants: ${userIntent}

      Analyze what capabilities/tools would be needed:
      1. Data sources needed
      2. Transformations required
      3. Outputs expected
      4. External services to integrate

      Output as JSON capability requirements.
    `);

    // 2. Search available tools
    const availableTools = this.searchToolRegistry(
      capabilityAnalysis.requiredCapabilities
    );

    // 3. If not found, let AI create the tool
    if (availableTools.length === 0) {
      const toolDefinition = await llm.execute(`
        Create a tool definition for this capability:
        ${capabilityAnalysis.requiredCapabilities}

        Output:
        {
          "name": "toolName",
          "description": "what it does",
          "parameters": { ... },
          "implementation": "JavaScript function code"
        }
      `);

      // Safe sandbox execution
      const newTool = await this.sandboxCreateTool(toolDefinition);
      this.registerTool(newTool);
      availableTools.push(newTool);
    }

    // 4. Compose tool chain
    const toolChain = await this.planToolChain(availableTools, userIntent);

    // 5. Execute with error handling
    return await this.executeToolChain(toolChain);
  }

  async sandboxCreateTool(toolDef) {
    // Use vm2 or similar sandboxed environment
    // Validate inputs/outputs
    // Add logging and error handling
    return {
      name: toolDef.name,
      execute: async (params) => {
        // Safe execution with timeouts, limits
        return await sandbox.run(toolDef.implementation, params);
      }
    };
  }
}
```

### Use Cases

- **Ad-hoc Data Processing**: User asks for new format → AI creates converter
- **API Integration**: Need new API → AI generates client code
- **Report Generation**: New report type → AI builds template

### Safety Considerations

- Always sandbox dynamic code execution
- Validate generated code before running
- Human approval for destructive operations
- Log all dynamically created tools

---

## Pattern 4: Evidence-Based Decision Making

Systematically collect evidence before AI decision, instead of letting AI guess.

### Implementation

```javascript
class EvidenceBasedAgent {
  async makeDecision(context) {
    // Phase 1: Evidence Collection (deterministic computation)
    const evidence = {
      quantitative: await this.collectQuantitativeEvidence(context),
      historical: await this.collectHistoricalPatterns(context),
      behavioral: await this.collectUserBehavior(context),
      external: await this.collectExternalSignals(context)
    };

    // Phase 2: Evidence Credibility Assessment
    const weightedEvidence = await this.calculateEvidenceWeight(evidence);

    // Phase 3: AI Reasoning ON Evidence (not speculation)
    const decision = await llm.execute(`
      Based on the following EVIDENCE (not speculation), make a decision.

      === QUANTITATIVE DATA ===
      Confidence: ${weightedEvidence.quantitative.confidence}
      Data: ${JSON.stringify(weightedEvidence.quantitative.data)}

      === HISTORICAL PATTERNS ===
      Confidence: ${weightedEvidence.historical.confidence}
      Patterns: ${JSON.stringify(weightedEvidence.historical.patterns)}

      === USER BEHAVIOR ===
      Confidence: ${weightedEvidence.behavioral.confidence}
      Signals: ${JSON.stringify(weightedEvidence.behavioral.signals)}

      === EXTERNAL SIGNALS ===
      Confidence: ${weightedEvidence.external.confidence}
      Signals: ${JSON.stringify(weightedEvidence.external.signals)}

      Your task:
      1. Evaluate each piece of evidence
      2. Identify conflicts between sources
      3. Weigh evidence by confidence
      4. Make decision with explicit reasoning chain
      5. Assign your own confidence level
      6. List assumptions made
    `);

    return {
      decision: decision,
      evidence: weightedEvidence,
      reasoning: decision.reasoning_chain,
      confidence: decision.confidence
    };
  }

  async calculateEvidenceWeight(evidence) {
    // Weight based on:
    // - Data freshness
    // - Source reliability
    // - Sample size
    // - Consistency with other sources
    return {
      quantitative: {
        ...evidence.quantitative,
        confidence: this.calculateConfidence(evidence.quantitative)
      },
      // ... same for others
    };
  }
}
```

### Evidence Sources for Jira Worklog Agent

| Source | What to Collect | Confidence Factor |
|--------|-----------------|-------------------|
| Git Commits | Message content, file changes, frequency | High if multiple commits |
| Jira Activity | Comments, status changes, assignments | High if recent |
| History Patterns | Past ticket allocations | Medium (may change) |
| Calendar Events | Meeting titles, attendees | Medium (inferred) |
| Slack Keywords | Mentioned ticket keys | Low (noise) |

### Key Principle

**Never let AI make decisions without evidence. If evidence is insufficient, AI should explicitly say "insufficient evidence" rather than guessing.**

---

## Pattern 5: State Machine Driven Prompt Chain

Control AI conversation flow with a state machine, not linear execution.

### Implementation

```javascript
class PromptStateMachine {
  states = {
    INITIAL: {
      onEnter: async (ctx) => ({ classification: await this.classifyIntent(ctx) }),
      transitions: { to: ['CLARIFY', 'EXECUTE', 'REJECT'] }
    },
    CLARIFY: {
      onEnter: async (ctx) => ({ clarification: await this.askClarification(ctx) }),
      transitions: { to: ['EXECUTE', 'ABORT'] }
    },
    EXECUTE: {
      onEnter: async (ctx) => ({ execution: await this.executeTask(ctx) }),
      transitions: { to: ['VERIFY', 'COMPLETE'] }
    },
    VERIFY: {
      onEnter: async (ctx) => ({ verification: await this.verifyResult(ctx) }),
      transitions: { to: ['EXECUTE', 'COMPLETE', 'ERROR'] } // Can retry
    },
    COMPLETE: { final: true },
    ERROR: { final: true },
    ABORT: { final: true }
  };

  async run(initialContext) {
    let state = 'INITIAL';
    let context = {
      ...initialContext,
      stateHistory: []
    };

    while (!this.states[state].final) {
      // Execute current state handler
      const result = await this.states[state].onEnter(context);

      // Record state transition
      context.stateHistory.push({
        state,
        result,
        timestamp: Date.now()
      });

      // AI decides next state
      const transitionDecision = await this.decideTransition(state, result, context);
      state = transitionDecision.nextState;

      // Update context
      context = { ...context, ...result, transitionReason: transitionDecision.reason };
    }

    return context;
  }

  async decideTransition(currentState, result, context) {
    const validTransitions = this.states[currentState].transitions.to;

    return await llm.execute(`
      Current state: ${currentState}
      Valid next states: ${validTransitions.join(', ')}
      Current result: ${JSON.stringify(result)}
      Context: ${JSON.stringify(context)}

      Decide:
      1. Which state to transition to?
      2. Why this transition?

      Output: { "nextState": "...", "reason": "..." }
    `);
  }
}
```

### State Machine Patterns

| Pattern | States | Use Case |
|---------|--------|----------|
| Linear Pipeline | START → A → B → C → END | Sequential processing |
| Error Recovery | START → EXECUTE → (ERROR → RETRY → EXECUTE) → END | Fault tolerance |
| Approval Loop | START → DRAFT → REVIEW → (REJECT → DRAFT) → APPROVE → END | Quality gates |
| Adaptive | Any state can go to any state | Complex workflows |

### Benefits

- Clear execution trace
- Retry logic built-in
- Easy to visualize/debug
- State-specific handlers

---

## Pattern 6: Self-Prompting / Auto-Prompt Engineering

AI optimizes its own prompts iteratively.

### Implementation

```javascript
class SelfPromptingAgent {
  promptLibrary = new Map(); // taskType → bestPrompt

  async optimizePrompt(task) {
    // 1. Initial prompt (from library or template)
    let currentPrompt = this.getInitialPrompt(task);

    // 2. Iterative optimization
    let bestResult = null;
    let bestPrompt = currentPrompt;
    let bestScore = 0;

    for (let iteration = 0; iteration < 3; iteration++) {
      const result = await llm.execute(currentPrompt);

      // 3. AI evaluates result quality
      const evaluation = await llm.execute(`
        Evaluate the quality of this result:

        Original task: ${task.description}
        Prompt used: ${currentPrompt}
        Result: ${result}

        Evaluate:
        1. Completeness (1-10): Did it address all requirements?
        2. Accuracy (1-10): Is it correct?
        3. Clarity (1-10): Is it well-presented?
        4. Overall score (1-10)

        What's missing or could be better?
        Suggest an improved prompt that would yield better results.
      `);

      const score = evaluation.overallScore;

      if (score >= 9) {
        bestResult = result;
        bestPrompt = currentPrompt;
        break;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPrompt = currentPrompt;
        bestResult = result;
      }

      // 4. Use AI's suggested improved prompt
      currentPrompt = evaluation.suggestedPrompt;
    }

    // 5. Save best prompt for reuse
    this.promptLibrary.set(task.type, {
      prompt: bestPrompt,
      score: bestScore,
      taskExample: task.description
    });

    return { result: bestResult, prompt: bestPrompt };
  }
}
```

### Use Cases

- **Domain-specific optimization**: Learn best prompts for specific task types
- **User preference learning**: Adapt prompts to user's preferred output style
- **Quality improvement**: Systematically improve output quality

### Prompt Library Structure

```javascript
{
  "ticket_recommendation": {
    "prompt": "Analyze user's recent activity...\n[optimized prompt]",
    "avgScore": 8.5,
    "examples": ["..."]
  },
  "worklog_summary": {
    "prompt": "Summarize the following worklogs...",
    "avgScore": 9.2,
    "examples": ["..."]
  }
}
```

---

## Pattern 7: Context Compression with Semantic Chunking

Intelligently compress history instead of simple truncation.

### Implementation

```javascript
class ContextCompressor {
  async compressContext(fullHistory, maxTokens = 4000) {
    // 1. Semantic chunking
    const chunks = await this.semanticChunk(fullHistory);

    // 2. Score information density for each chunk
    const scoredChunks = await Promise.all(
      chunks.map(async chunk => ({
        chunk,
        density: await this.calculateInformationDensity(chunk)
      }))
    );

    // 3. Select high-density chunks
    const selectedChunks = scoredChunks
      .sort((a, b) => b.density - a.density)
      .filter(c => c.density > THRESHOLD);

    // 4. Compress low-importance chunks into summary
    const lowImportanceChunks = scoredChunks.filter(c => c.density <= THRESHOLD);

    const summary = await llm.execute(`
      Summarize these conversation segments in < 200 tokens.
      Preserve: key decisions, important context, unresolved questions.

      Segments:
      ${lowImportanceChunks.map(c => c.chunk.content).join('\n---\n')}
    `);

    // 5. Build compressed context
    const compressedContext = {
      preservedChunks: selectedChunks.map(c => c.chunk),
      summary: summary,
      tokenCount: this.calculateTokens([...selectedChunks, { content: summary }])
    };

    return compressedContext;
  }

  async calculateInformationDensity(chunk) {
    // Ask AI to rate information value
    const assessment = await llm.execute(`
      Rate the information density of this text segment (1-10):

      Criteria:
      - Contains decisions or conclusions? (+3)
      - Contains unresolved questions? (+2)
      - Contains factual data? (+2)
      - Is procedural/fluff? (-2)
      - Is repetitive? (-3)

      Text: ${chunk.content}
    `);

    return assessment.score;
  }
}
```

### Chunking Strategies

| Strategy | Method | Best For |
|----------|--------|----------|
| Turn-based | Each message = chunk | Short conversations |
| Topic-based | Semantic similarity | Long discussions |
| Time-based | Time windows | Historical logs |
| Entity-based | Related to same entity | Domain-specific |

---

## Pattern 8: Thought Tracing (Reasoning Chain Tracking)

Make AI explicitly output reasoning process for audit and improvement.

### Implementation

```javascript
class ThoughtTracer {
  traceStore = [];

  async executeWithTrace(task) {
    const result = await llm.execute(`
      Before answering, explicitly show your reasoning process.

      Use this format:
      <thought_process>
      <thought_1>What am I being asked to do?</thought_1>
      <thought_2>What information is available?</thought_2>
      <thought_3>What assumptions am I making?</thought_3>
      <thought_4>What's my approach?</thought_4>
      <thought_5>Let me verify step by step...</thought_5>
      <thought_6>Are there edge cases?</thought_6>
      <thought_7>Final conclusion...</thought_7>
      </thought_process>

      <answer>
      [Your actual answer here]
      </answer>

      <confidence>
      [Your confidence level: high/medium/low]
      [List uncertainties]
      </confidence>

      Task: ${task}
    `);

    // Parse and store trace
    const trace = {
      task: task,
      thoughts: this.parseThoughts(result),
      answer: this.parseAnswer(result),
      confidence: this.parseConfidence(result),
      timestamp: Date.now()
    };

    this.traceStore.push(trace);

    return {
      result: trace.answer,
      thoughts: trace.thoughts,
      confidence: trace.confidence
    };
  }

  async analyzeThoughtPatterns() {
    // Analyze traces to find patterns
    return await llm.execute(`
      Analyze these reasoning traces. Identify:

      1. Successful reasoning patterns (lead to correct answers)
      2. Failure patterns (lead to errors or low confidence)
      3. Common blind spots
      4. Missing thought steps that would help

      Suggest prompt improvements to guide better reasoning.

      Traces: ${JSON.stringify(this.traceStore.slice(-20))}
    `);
  }
}
```

### Use Cases

- **Quality audit**: Review AI reasoning for correctness
- **Training data**: Improve prompts based on successful patterns
- **Debugging**: Find where reasoning went wrong
- **Trust building**: Show users how AI reached conclusion

---

## Pattern 9: Predictive Recommendations

Predict future work, not just react to current state.

### Implementation

```javascript
class PredictiveAgent {
  async predictUpcomingWork(userHistory, projectData) {
    // Analyze patterns
    const patterns = await this.analyzeWorkPatterns(userHistory);

    // Identify upcoming milestones
    const milestones = await this.extractMilestones(projectData);

    // Predict future tickets
    const predictions = await llm.execute(`
      Based on historical patterns and project roadmap, predict:

      User's recent work pattern:
      ${JSON.stringify(patterns)}

      Project upcoming milestones:
      ${JSON.stringify(milestones)}

      Predict:
      1. Tickets user will likely work on next week
      2. Skills/topics they should prepare
      3. Collaboration needs (who they might need to work with)
      4. Potential blockers

      Output predictions with confidence levels.
    `);

    return predictions;
  }

  async analyzeWorkPatterns(history) {
    // Extract:
    // - Ticket type preferences
    // - Project involvement frequency
    // - Collaboration patterns
    // - Time-of-week patterns (Monday vs Friday work)
    return {
      preferredTicketTypes: this.extractTypes(history),
      projectFrequency: this.extractProjectFrequency(history),
      collaborators: this.extractCollaborators(history),
      weeklyPattern: this.extractWeeklyPattern(history)
    };
  }
}
```

---

## Pattern 10: Meeting-Aware Inference

Use calendar context to infer work context.

### Implementation

```javascript
class CalendarAwareAgent {
  async inferFromCalendar(date) {
    const meetings = await this.fetchCalendarEvents(date);

    const inferences = await Promise.all(
      meetings.map(meeting => this.inferMeetingContext(meeting))
    );

    // Combine meeting contexts to suggest tickets
    const suggestions = await llm.execute(`
      Based on today's meetings, suggest likely work tickets:

      Meetings and inferred contexts:
      ${JSON.stringify(inferences)}

      Suggest:
      1. Tickets likely discussed in each meeting
      2. Preparation needed before meetings
      3. Follow-up work after meetings
    `);

    return suggestions;
  }

  async inferMeetingContext(meeting) {
    return await llm.execute(`
      Infer work context from this meeting:

      Title: ${meeting.title}
      Attendees: ${meeting.attendees.map(a => a.name).join(', ')}
      Duration: ${meeting.duration} minutes

      Infer:
      1. Topic/project area
      2. Likely Jira tickets involved (use attendee's recent tickets)
      3. Type of work (planning, review, sync, problem-solving)
    `);
  }
}
```

---

## Implementation Roadmap for Jira Worklog Agent

### Phase 1: Enhanced Evidence Collection (Week 1)

Upgrade `evidenceCollector.mjs`:

- Git commit semantic analysis (not just count)
- Jira activity timeline (comments, transitions)
- Historical pattern matching

### Phase 2: Reflection Loop (Week 2)

Add to `intelligentDecision.mjs`:

- After LLM recommendation, verify with evidence
- If confidence low, gather more evidence and retry
- Store reasoning trail for analysis

### Phase 3: Multi-Agent Split (Week 3)

Split into specialized agents:

- Evidence Agent: Collect and score evidence
- Recommendation Agent: Make ticket suggestions
- Verification Agent: Validate recommendations

### Phase 4: Predictive Features (Week 4)

- Predict next week's tickets
- Calendar meeting inference
- Collaboration network analysis

---

## Metrics to Track

| Metric | How to Measure | Target |
|--------|----------------|--------|
| Recommendation Accuracy | User accepts AI suggestion | >80% |
| Evidence Coverage | % of decisions with evidence | >90% |
| Reflection Improvement | Accuracy improves after retry | +15% |
| Prediction Accuracy | Predicted tickets match actual | >70% |
| User Satisfaction | Survey/feedback | >4.5/5 |

---

## Resources

- [LangChain Agent Patterns](https://python.langchain.com/docs/modules/agents/)
- [AutoGPT Architecture](https://github.com/Significant-Gravitas/Auto-GPT)
- [Anthropic's Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [OpenAI Function Calling Best Practices](https://platform.openai.com/docs/guides/function-calling)