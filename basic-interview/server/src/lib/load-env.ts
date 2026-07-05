import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

const workspaceRoot = findWorkspaceRoot(process.cwd());
const envPaths = [
  path.join(workspaceRoot, ".env"),
  path.join(process.cwd(), ".env")
];

for (const envPath of new Set(envPaths)) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }

    current = parent;
  }
}
