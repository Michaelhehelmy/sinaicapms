const fs = require('fs');
const path = require('path');
const Mustache = require('mustache');

// Resolve directories
const WORKSPACE_DIR = path.resolve(__dirname, '..');
const PROJECT_DIR = path.resolve(WORKSPACE_DIR, '..');

// Load config (check workspace directory FIRST, then parent for legacy support)
// This ensures .opencode/ is always created inside the project, not at workspace root
let configPath = path.join(WORKSPACE_DIR, 'workspace.config.json');
let targetProjectDir = WORKSPACE_DIR;

if (!fs.existsSync(configPath)) {
  const parentPath = path.join(PROJECT_DIR, 'workspace.config.json');
  if (fs.existsSync(parentPath)) {
    console.warn(`⚠️  Warning: Found workspace.config.json at project root. Using parent directory.`);
    console.warn(`   For correct structure, move workspace.config.json into .opencode/ directory.`);
    configPath = parentPath;
    targetProjectDir = PROJECT_DIR;
  } else {
    console.error(`❌ Error: workspace.config.json not found at ${configPath} or ${parentPath}`);
    process.exit(1);
  }
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Format some values for Mustache helpers
const view = {
  ...config,
  // Tech helper flags
  nextjs: config.tech.framework?.toLowerCase().includes('next.js') || config.tech.framework?.toLowerCase().includes('nextjs'),
  tailwind: config.tech.styling?.toLowerCase().includes('tailwind'),
  sqlite: config.tech.database?.toLowerCase().includes('sqlite'),
  drizzle: config.tech.database?.toLowerCase().includes('drizzle') || config.tech.framework?.toLowerCase().includes('drizzle') || true,

  // Flat helpers for template simplicity
  projectName: config.project.name,
  projectSlug: config.project.slug,
  projectDescription: config.project.description,
  projectAuthor: config.project.author,
  projectGithub: config.project.github,
  projectUrl: config.project.url,

  techFramework: config.tech.framework,
  techLanguage: config.tech.language,
  techDatabase: config.tech.database,
  techDbFile: config.tech.db_file,
  techStyling: config.tech.styling,
  techUnit: config.tech.test_unit,
  techE2e: config.tech.test_e2e,
  techPackageManager: config.tech.package_manager,

  deployMethod: config.deploy?.method,
  deployScript: config.deploy?.script,
  deploySshKey: config.deploy?.ssh_key,
  deployRemoteUser: config.deploy?.remote_user,
  deployRemoteHost: config.deploy?.remote_host,
  deployPm2App: config.deploy?.pm2_app,
  deployLogFile: config.deploy?.log_file,

  rulesList: (config.rules || []).map(r => `- ${r}`).join('\n'),

  // Absolute paths for MCP commands — required so the desktop app (Electron)
  // can launch MCP servers regardless of cwd or shell PATH environment.
  // We prefer ~/.local/bin symlinks (stable, set by setup.sh) over the fnm
  // dynamic session path (/run/user/.../fnm_multishells/...) which changes each login.
  opencodeModules: path.join(WORKSPACE_DIR, 'node_modules'),
  nodebin: (() => {
    const stable = path.join(process.env.HOME, '.local', 'bin', 'node');
    if (require('fs').existsSync(stable)) return stable;
    try { return require('child_process').execSync('command -v node', { encoding: 'utf8' }).trim(); } catch(e) { return 'node'; }
  })(),
  npxbin: (() => {
    const stable = path.join(process.env.HOME, '.local', 'bin', 'npx');
    if (require('fs').existsSync(stable)) return stable;
    try { return require('child_process').execSync('command -v npx', { encoding: 'utf8' }).trim(); } catch(e) { return 'npx'; }
  })(),
};

// Define template maps: [Template Path relative to WORKSPACE_DIR/templates, Dest Path relative to PROJECT_DIR]
const templateFiles = [
  ['opencode.json.tmpl', 'opencode.json'],
  ['AGENTS.md.tmpl', 'AGENTS.md'],
  ['AGENT_LOGBOOK.md.tmpl', 'AGENT_LOGBOOK.md'],

  // Skill registry index (never overwrite — agents append to it)
  ['SKILLS_INDEX.md.tmpl', '.opencode/skills/SKILLS_INDEX.md'],
  
  // Prompts
  ['prompts/project-context.md.tmpl', '.opencode/prompts/project-context.md'],
  ['prompts/safety-rules.md.tmpl', '.opencode/prompts/safety-rules.md'],

  // Skills — categorized
  ['skills/database/db-migration/SKILL.md.tmpl', '.opencode/skills/database/db-migration/SKILL.md'],
  ['skills/devops/configure-workspace/SKILL.md.tmpl', '.opencode/skills/devops/configure-workspace/SKILL.md'],
  ['skills/devops/deploy-to-server/SKILL.md.tmpl', '.opencode/skills/devops/deploy-to-server/SKILL.md'],
  ['skills/backend/create-feature/SKILL.md.tmpl', '.opencode/skills/backend/create-feature/SKILL.md'],
  ['skills/testing/new-e2e-test/SKILL.md.tmpl', '.opencode/skills/testing/new-e2e-test/SKILL.md'],
  ['skills/testing/fix-failing-test/SKILL.md.tmpl', '.opencode/skills/testing/fix-failing-test/SKILL.md'],
  ['skills/frontend/frontend-feature/SKILL.md.tmpl', '.opencode/skills/frontend/frontend-feature/SKILL.md'],
];

// Meta-agents — always rendered
templateFiles.push(['agents/orchestrator.md.tmpl', '.opencode/agents/orchestrator.md']);
templateFiles.push(['agents/skill-builder.md.tmpl', '.opencode/agents/skill-builder.md']);

// Legacy role agents — conditionally rendered based on workspace.config.json
if (config.agents?.deploy) {
  templateFiles.push(['agents/deploy.md.tmpl', '.opencode/agents/deploy.md']);
}
if (config.agents?.qa) {
  templateFiles.push(['agents/qa.md.tmpl', '.opencode/agents/qa.md']);
}
if (config.agents?.db) {
  templateFiles.push(['agents/db.md.tmpl', '.opencode/agents/db.md']);
}
if (config.agents?.['plugin-dev']) {
  templateFiles.push(['agents/plugin-dev.md.tmpl', '.opencode/agents/plugin-dev.md']);
}
if (config.agents?.frontend) {
  templateFiles.push(['agents/frontend.md.tmpl', '.opencode/agents/frontend.md']);
}
if (config.agents?.['pr-reviewer']) {
  templateFiles.push(['agents/pr-reviewer.md.tmpl', '.opencode/agents/pr-reviewer.md']);
}
if (config.agents?.['security-auditor']) {
  templateFiles.push(['agents/security-auditor.md.tmpl', '.opencode/agents/security-auditor.md']);
}
if (config.agents?.['performance-profiler']) {
  templateFiles.push(['agents/performance-profiler.md.tmpl', '.opencode/agents/performance-profiler.md']);
}
if (config.agents?.['docs-generator']) {
  templateFiles.push(['agents/docs-generator.md.tmpl', '.opencode/agents/docs-generator.md']);
}
console.log('🔄 Rendering templates...');

for (const [tmplRel, destRel] of templateFiles) {
  const tmplPath = path.join(WORKSPACE_DIR, 'templates', tmplRel);
  const destPath = path.join(targetProjectDir, destRel);

  if (!fs.existsSync(tmplPath)) {
    console.warn(`⚠️ Warning: Template not found: ${tmplPath}`);
    continue;
  }

  // Skip these files if they already exist to preserve agent memory/history
  const preserveIfExists = ['AGENT_LOGBOOK.md', '.opencode/skills/SKILLS_INDEX.md'];
  if (preserveIfExists.some(p => destRel === p) && fs.existsSync(destPath)) {
    console.log(`  ℹ️ Skipped (already exists): ${destRel}`);
    continue;
  }

  // Read template
  const templateContent = fs.readFileSync(tmplPath, 'utf8');

  // Render content
  let renderedContent = Mustache.render(templateContent, view);

  // If destination is a JSON file, clean up trailing commas and empty items
  if (destRel.endsWith('.json')) {
    // Remove trailing commas before closing braces/brackets
    renderedContent = renderedContent.replace(/,(\s*[\]}])/g, '$1');
    // Remove double commas or leading commas
    renderedContent = renderedContent.replace(/\[\s*,/g, '[').replace(/\{\s*,/g, '{');
    // Try to format it for neatness
    try {
      renderedContent = JSON.stringify(JSON.parse(renderedContent), null, 2);
    } catch (e) {
      console.warn(`⚠️ Warning: Generated JSON for ${destRel} is invalid: ${e.message}`);
    }
  }

  // Ensure target directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Write file
  fs.writeFileSync(destPath, renderedContent, 'utf8');
  console.log(`  ✅ Generated: ${destRel}`);
}

// Ensure tmp agents directory exists for @orchestrator to write ephemeral task agents
const tmpAgentsDir = path.join(targetProjectDir, '.opencode', 'agents', 'tmp');
if (!fs.existsSync(tmpAgentsDir)) {
  fs.mkdirSync(tmpAgentsDir, { recursive: true });
  console.log('  ✅ Created: .opencode/agents/tmp/ (tmp agent workspace)');
}

console.log('🎉 Templates successfully rendered!');
