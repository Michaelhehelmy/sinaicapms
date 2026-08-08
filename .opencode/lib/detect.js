const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const PROJECT_DIR = path.resolve(WORKSPACE_DIR, '..');
const configPath = path.join(PROJECT_DIR, 'workspace.config.json');

// Check if config already exists
if (fs.existsSync(configPath)) {
  process.exit(0);
}

console.log('🔍 No workspace.config.json found. Running auto-detection...');

// Read parent package.json if it exists
let parentPkg = {};
const pkgPath = path.join(PROJECT_DIR, 'package.json');
if (fs.existsSync(pkgPath)) {
  try {
    parentPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    console.warn('⚠️ Warning: Failed to parse package.json');
  }
}

const deps = { ...parentPkg.dependencies, ...parentPkg.devDependencies };

// Detect Package Manager
let pm = 'npm';
if (fs.existsSync(path.join(PROJECT_DIR, 'yarn.lock'))) pm = 'yarn';
else if (fs.existsSync(path.join(PROJECT_DIR, 'pnpm-lock.yaml'))) pm = 'pnpm';
else if (fs.existsSync(path.join(PROJECT_DIR, 'bun.lockb')) || fs.existsSync(path.join(PROJECT_DIR, 'bun.lock'))) pm = 'bun';

// Detect Language
const isTS = fs.existsSync(path.join(PROJECT_DIR, 'tsconfig.json'));
const lang = isTS ? 'TypeScript' : 'JavaScript';

// Detect Framework
let framework = 'Vanilla';
if (deps.next) framework = 'Next.js';
else if (deps.nuxt) framework = 'Nuxt';
else if (deps['@sveltejs/kit']) framework = 'SvelteKit';
else if (deps.react) framework = 'React';
else if (deps.vue) framework = 'Vue.js';

// Detect Styling
let styling = 'CSS';
if (deps.tailwindcss) styling = 'Tailwind CSS';

// Detect Database
let db = 'None';
if (deps.sqlite3 || deps['better-sqlite3']) db = 'SQLite';
else if (deps.pg) db = 'PostgreSQL';
else if (deps.mysql2) db = 'MySQL';

// Detect Unit Test
let testUnit = 'None';
if (deps.vitest) testUnit = 'Vitest';
else if (deps.jest) testUnit = 'Jest';

// Detect E2E Test
let testE2e = 'None';
if (deps['@playwright/test']) testE2e = 'Playwright';
else if (deps.cypress) testE2e = 'Cypress';

// Construct default config
const name = parentPkg.name ? parentPkg.name.charAt(0).toUpperCase() + parentPkg.name.slice(1) : 'My Project';
const slug = parentPkg.name || 'my-project';

const defaultConfig = {
  project: {
    name: name,
    slug: slug,
    description: parentPkg.description || 'A software application project',
    author: parentPkg.author || 'Developer',
    github: ''
  },
  tech: {
    framework: framework,
    language: lang,
    database: db,
    db_file: db === 'SQLite' ? `${slug}.db` : '',
    styling: styling,
    test_unit: testUnit !== 'None' ? testUnit : undefined,
    test_e2e: testE2e !== 'None' ? testE2e : undefined,
    package_manager: pm
  },
  mcps: {
    filesystem: true,
    github: false,
    playwright: testE2e === 'Playwright',
    sqlite: db === 'SQLite',
    "sequential-thinking": true,
    tailwindcss: styling === 'Tailwind CSS',
    "lucide-icons": true,
    git: true,
    fetch: true,
    docker: false,
    ripgrep: true,
    everything: false,
    pdf: true,
    time: true,
    codetree: true,
    "next-devtools": framework === 'Next.js',
    "next-intl": false,
    lighthouse: false,
    "better-auth": false,
    email: false,
    cloudflare: false,
    linear: false,
    memory: true,
    postgres: db === 'PostgreSQL',
    puppeteer: false,
    discord: false
  },
  agents: {
    deploy: false,
    qa: testUnit !== 'None' || testE2e !== 'None',
    db: db !== 'None',
    "plugin-dev": false,
    frontend: framework !== 'Vanilla',
    "pr-reviewer": true,
    "security-auditor": true,
    "performance-profiler": false,
    "docs-generator": true
  },
  rules: [
    "Always verify code changes with standard verification commands before completion",
    "Do not commit API tokens, client secrets, or private keys to the repository"
  ]
};

try {
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
  console.log(`✅ Created workspace.config.json with detected configurations!`);
} catch (err) {
  console.error('❌ Failed to write workspace.config.json:', err.message);
}
