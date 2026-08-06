# Interview prompts

Only Markdown files in `prompts/` are loaded as interview prompts. To add one, copy the existing TinyURL prompt:

```sh
cp prompts/tinyurl_interview_prompt.md prompts/my_interview_prompt.md
```

Update its YAML front matter and Markdown body, then validate it:

```sh
pnpm interview:validate
```

The required metadata is:

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
```

`id` must be unique kebab-case. `skill_level` is `Intern`, `Junior`, or `Senior`; `difficulty` is `Beginner`,
`Intermediate`, or `Advanced`. The catalog currently pairs those values by tier: Intern/Beginner,
Junior/Intermediate, and Senior/Advanced.
Filenames are free-form and do not determine prompt identity. The catalog API serializes only the public front-matter
fields shown above. It omits the Markdown body, source path, provider configuration, private reference, and evaluation
guidance. The session response intentionally includes the complete body for the selected packet as described below.

The Markdown after the front matter is sent as the `interview_packet` dynamic variable only when a user starts that
packet. The shared opening message and default prompt ID live in `interview_loader.py`; do not put provider
configuration in packet front matter. The persistent ElevenLabs prompt contains only the dynamic-variable placeholder,
not the packet library. For this MVP, the selected Markdown body is intentionally visible in the browser session
response, while unselected packet bodies remain absent.
