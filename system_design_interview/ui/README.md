# @kfl-system-design/ui

Shared shadcn primitives, theme tokens, and Tailwind theme mapping live here.

## Workflow

- Change theme values in `src/theme/tokens.css`.
- Change shared shadcn component behavior or styles by editing `src/components/*`.
- Add shared components with the shadcn CLI against `ui/components.json`.
- Keep product-specific avatar and canvas composites in the consuming app or package unless they are truly reusable.

## Public Imports

Use component subpaths:

```ts
import { Button } from "@kfl-system-design/ui/components/button";
import { cn } from "@kfl-system-design/ui/lib/utils";
```

Use these stable styling entry points:

```ts
import "@kfl-system-design/ui/styles.css";
import uiPreset from "@kfl-system-design/ui/tailwind-preset";
```
