# Interview prompt authoring

Interview packets are Markdown files in `server/app/interviews/prompts/`. Every
packet uses the same comprehensive formula so the candidate experience, canvas
context, pacing, evaluation, and safety boundaries stay consistent while the
system-design content remains specific to the product.

## Required front matter

```yaml
---
display_name: My System Design
skill_level: Intern
---
```

Validation requires:

- Front matter starts on the first line, contains exactly `display_name` and
  `skill_level`, and contains no extra fields.
- The Markdown filename stem is the packet ID and must be unique lowercase
  kebab-case, such as `my-system-design.md`.
- A packet with the `tinyurl-system-design` ID remains present.
- `display_name` and the Markdown body are nonempty.
- `skill_level` is `Intern`, `Junior`, or `Senior`.

## Prompt formula and checklist

Use these sections in this order:

1. **Personality** — Define Lyra's expertise and supportive, candidate-led
   posture.
2. **Environment** — Preserve the shared Keyframe/ElevenLabs context and the
   identical React Flow canvas serialization semantics and connection syntax.
   A canvas update is background context, not a request to speak.
3. **Goal** — State what the candidate is designing and what reasoning the
   interviewer evaluates.
4. **Interview flow** — Include the topic's exact opening, a concise explanation
   for candidates unfamiliar with the product, candidate-led pacing, a
   topic-specific core/MVP completion definition, direct handling of candidate
   questions, and silence/vagueness/off-topic/solution/conflict/early-stop edge
   cases.
5. **Voice response style** — Keep normal turns to one brief acknowledgment and
   one focused question; do not read lists aloud.
6. **Candidate-facing reference** — Separate functional requirements,
   non-functional requirements, and concrete scale assumptions. Give this
   information directly when asked without revealing a solution.
7. **Interviewer question bank** — Supply optional clarifying, topic, risk, and
   allowed-guidance-boundary questions tailored to this packet.
8. **Private interviewer reference** — Document multiple plausible solution
   families and a strong design direction for evaluation only.
9. **Evaluation and closing** — Name the relevant evaluation dimensions and a
   concise feedback/closing sequence grounded in the candidate's actual design.
10. **Guardrails** and **Critical reminder** — Never reveal the private answer
    during the candidate-led portion or provide a mitigation before the
    candidate reasons about it.

All content must remain topic-specific. Do not copy TinyURL's SQL/caching probe,
product facts, or exact NoSQL closing into another packet.

## Hard 10-minute constraint

Every interview is a hard 10-minute session enforced by the application. The
prompt must tell Lyra to prioritize the core/MVP, ask one focused question at a
time, stop opening new topics as time runs out, and close promptly. Lyra cannot
read or infer the UI countdown, so never instruct the model to announce exact
time remaining. The UI starts its countdown only after the avatar first
connects and disconnects Lyra at `00:00`.

## Template skeleton

```markdown
# Personality

# Environment
## Canvas context

# Goal

# Interview flow
## Opening
## If the candidate is unfamiliar with the product
## Candidate-led exploration and 10-minute pacing
## Core/MVP completion and closing trigger
## Answering candidate questions
## Edge cases

# Voice response style

# Candidate-facing reference
## Functional requirements
## Non-functional requirements
## Scale assumptions

# Interviewer question bank
## Clarifying questions
## Topics to probe
## Risk-focused probes
## Examples of the allowed guidance boundary

# Private interviewer reference
## Possible solution families
## Strong design direction

# Evaluation and closing

# Guardrails

# Critical reminder
```

Validate all packets from the repository root:

```sh
pnpm interview:validate
```
