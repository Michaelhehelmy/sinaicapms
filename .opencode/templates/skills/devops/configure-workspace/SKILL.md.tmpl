# Configure Workspace

Auto-detect project details and update `workspace.config.json` with current project configuration.

## When to use this skill

- When the project stack has changed (added new dependencies, switched framework, etc.)
- When `workspace.config.json` is missing or outdated
- When you need to refresh the configuration after major project changes

## Steps

1. **Run detection script** to analyze the current project:
   ```bash
   node lib/detect.js
   ```
   This will:
   - Detect framework, language, database, styling, test frameworks
   - Detect package manager (npm, yarn, pnpm, bun)
   - Update `workspace.config.json` with detected values

2. **Review the generated config**:
   ```bash
   cat workspace.config.json
   ```
   Verify the detected values match your actual project setup.

3. **Re-render templates** to apply the new config:
   ```bash
   node lib/render.js
   ```
   This regenerates:
   - `opencode.json` (MCP servers with correct paths)
   - `AGENTS.md` (agent system prompts)
   - All skill files
   - Agent files

4. **Verify MCP connectivity**:
   ```bash
   opencode mcp list
   ```
   Confirm all MCP servers are connected.

## Notes

- The detection script only runs if `workspace.config.json` doesn't exist. To force re-detection, temporarily rename or delete the file:
  ```bash
  mv workspace.config.json workspace.config.json.bak
  node lib/detect.js
  ```
- After running this skill, the workspace configuration is persisted in `workspace.config.json` and will be used automatically whenever OpenCode is started in this project directory.
