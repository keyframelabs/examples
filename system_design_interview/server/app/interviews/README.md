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
---
```

`id` must be unique kebab-case. Filenames are free-form and do not determine prompt identity. The Markdown after the
front matter is sent to ElevenLabs as the complete system prompt. The shared opening message and default prompt ID live
in `interview_loader.py`.
