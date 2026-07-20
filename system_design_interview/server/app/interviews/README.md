# Interview prompt authoring

Interview packets are Markdown files in `server/app/interviews/prompts/`.

From the repository root, copy an existing packet:

```sh
cp server/app/interviews/prompts/tinyurl_interview_prompt.md server/app/interviews/prompts/my_interview_prompt.md
```

Replace its YAML front matter and Markdown body:

```yaml
---
id: my-system-design
display_name: My System Design
summary: A concise candidate-facing description.
question_number: 12
skill_level: Intern
difficulty: Beginner
focus:
  - Data model
  - Indexes
tags:
  - databases
  - backend
---

# Interview instructions
...
```

Validation requires:

- Front matter starts on the first line, contains every field above, and contains no extra fields.
- `id` is unique lowercase kebab-case; `question_number` is a positive integer.
- A packet with the `tinyurl-system-design` ID remains present.
- `display_name`, `summary`, and the Markdown body are nonempty.
- `focus` and `tags` are nonempty lists of nonempty, unique strings.
- `skill_level` is `Intern`, `Junior`, or `Senior`; `difficulty` is `Beginner`, `Intermediate`, or `Advanced`.

The filename does not determine the packet ID. Validate all packets from the repository root:

```sh
pnpm interview:validate
```
