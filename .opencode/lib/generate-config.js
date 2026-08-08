const fs = require('fs');
const path = require('path');

// ── Path overrides for Docker vs host ────────────────────────────────────
// Set NODE_MODULES_PATH and NPX_BIN env vars when generating inside Docker
const WORKSPACE_NODE_MODULES = process.env.NODE_MODULES_PATH || path.join(__dirname, '..', 'node_modules');
const NODE_BIN = process.env.NODE_BIN || 'node';
const NPX_BIN = process.env.NPX_BIN || path.join(process.env.HOME, '.local', 'bin', 'npx');

function checkMcp(name, modulePath) {
  const fullPath = path.join(WORKSPACE_NODE_MODULES, modulePath);
  return fs.existsSync(fullPath);
}

const mcpServers = {};

// ── Core MCPs (installed via npm) ──────────────────────────────────────

if (checkMcp('sequential-thinking', '@modelcontextprotocol/server-sequential-thinking')) {
  mcpServers['sequential-thinking'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@modelcontextprotocol/server-sequential-thinking/dist/index.js')],
    enabled: true
  };
}

if (checkMcp('filesystem', '@modelcontextprotocol/server-filesystem')) {
  mcpServers['filesystem'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@modelcontextprotocol/server-filesystem/dist/index.js'), '.'],
    enabled: true
  };
}

if (checkMcp('github', '@modelcontextprotocol/server-github') && process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
  mcpServers['github'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@modelcontextprotocol/server-github/dist/index.js')],
    enabled: true,
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN
    }
  };
  console.log('  ✅ GitHub MCP enabled');
}

if (checkMcp('memory', '@modelcontextprotocol/server-memory')) {
  const memoryConfig = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@modelcontextprotocol/server-memory/dist/index.js')],
    enabled: true
  };
  if (process.env.MEMORY_FILE_PATH) {
    memoryConfig.env = { MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH };
  }
  mcpServers['memory'] = memoryConfig;
  console.log('  ✅ Memory MCP enabled');
}

if (checkMcp('postgres', '@modelcontextprotocol/server-postgres') && process.env.DATABASE_URL) {
  mcpServers['postgres'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@modelcontextprotocol/server-postgres/dist/index.js')],
    enabled: true,
    env: { DATABASE_URL: process.env.DATABASE_URL }
  };
  console.log('  ✅ PostgreSQL MCP enabled');
}

if (checkMcp('puppeteer', '@modelcontextprotocol/server-puppeteer')) {
  mcpServers['puppeteer'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@modelcontextprotocol/server-puppeteer/dist/index.js')],
    enabled: true
  };
  console.log('  ✅ Puppeteer MCP enabled (PDF/screenshot generation)');
}

// Everything MCP is a test server - disabled by default (enable by setting ENABLE_EVERYTHING_MCP=true)
if (checkMcp('everything', '@modelcontextprotocol/server-everything') && process.env.ENABLE_EVERYTHING_MCP === 'true') {
  mcpServers['everything'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@modelcontextprotocol/server-everything/dist/index.js')],
    enabled: true
  };
  console.log('  ✅ Everything MCP enabled (test server)');
}

if (checkMcp('sqlite', 'mcp-server-sqlite')) {
  mcpServers['sqlite'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, 'mcp-server-sqlite/dist/index.js'), '--db', './dev.db'],
    enabled: true
  };
}

if (checkMcp('playwright', '@playwright/mcp')) {
  mcpServers['playwright'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@playwright/mcp/cli.js')],
    enabled: true
  };
}

if (checkMcp('discord', 'discord-mcp') && process.env.DISCORD_BOT_TOKEN) {
  mcpServers['discord'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, 'discord-mcp/dist/index.js')],
    enabled: true,
    env: { DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN }
  };
  console.log('  ✅ Discord MCP enabled');
}

// ── Locally installed MCPs from package.json ─────────────────────────────

if (checkMcp('tailwindcss', 'tailwindcss-mcp')) {
  mcpServers['tailwindcss'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, 'tailwindcss-mcp/dist/index.js')],
    enabled: true
  };
}

if (checkMcp('lucide-icons', 'lucide-icons-mcp')) {
  mcpServers['lucide-icons'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, 'lucide-icons-mcp/dist/index.js')],
    enabled: true
  };
}

if (checkMcp('ripgrep', 'ripgrep-mcp')) {
  mcpServers['ripgrep'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, 'ripgrep-mcp/dist/index.js')],
    enabled: true
  };
}

if (checkMcp('i18nexus', '@i18nexus/mcp')) {
  mcpServers['i18nexus'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, '@i18nexus/mcp/dist/index.js')],
    enabled: true
  };
}

if (checkMcp('next-devtools', 'next-devtools-mcp')) {
  mcpServers['next-devtools'] = {
    type: 'local',
    command: [NODE_BIN, path.join(WORKSPACE_NODE_MODULES, 'next-devtools-mcp/dist/index.js')],
    enabled: true
  };
}

// ── Generate config files ──────────────────────────────────────────────────

// Detect available plugins
const plugins = [];

// Add plugins if their configs exist
// User will provide GitHub URLs for these community plugins
const pluginConfigs = {
  // ✅ Core (3) - Essential
  'opencode-plugin-compose': true,           // Docker Compose
  'opencode-plugin-inspector': true,         // Debug/inspect
  'opencode-plugin-notification': true,      // Desktop notifications
  
  // ✅ Productivity (3) - No overlap
  'opencode-plugin-worktree': true,          // Git worktrees
  'opencode-plugin-sessions': true,          // Session management
  'opencode-plugin-subtask2': true,          // Orchestration system
  
  // ✅ Memory (2) - Pick best 2, different approaches
  'opencode-plugin-mem': true,               // Vector DB memory (powerful)
  'opencode-plugin-tokenscope': true,        // Token cost tracking
  
  // ✅ Notifications (1) - OS notifications preferred
  'opencode-plugin-notify': true,            // Native OS notifications
  
  // ✅ Agent Enhancement (4) - Most useful
  'opencode-plugin-skills': true,             // Skills management
  'opencode-plugin-pilot': true,             // Automation daemon
  'opencode-plugin-identity': true,          // Agent self-identity
  'opencode-plugin-oh-my-openagent': true,   // Agent framework
  
  // ✅ Utilities (3) - Practical tools
  'opencode-plugin-snippets': true,          // Text expansion
  'opencode-plugin-smart-title': true,       // Auto session titles
  'opencode-plugin-optimal-temps': true,     // Sampling optimization
  
  // ✅ Tmux (1) - Real-time panes most useful
  'opencode-plugin-opentmux': true,          // Real-time tmux panes
  
  // 🔐 Token-required (optional)
  'opencode-plugin-slack': process.env.SLACK_BOT_TOKEN,
  'opencode-plugin-wakatime': process.env.WAKATIME_API_KEY,
  'opencode-plugin-helicone': process.env.HELICONE_API_KEY,
};

for (const [plugin, enabled] of Object.entries(pluginConfigs)) {
  if (enabled) {
    plugins.push(plugin);
    console.log(`  ✅ Plugin added: ${plugin}`);
  }
}

// ── LSP servers (exact format from opencode.json.tmpl) ─────────────────────

const lspServers = {
  typescript: {
    command: ['typescript-language-server', '--stdio'],
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  tailwindcss: {
    command: ['tailwindcss-language-server', '--stdio'],
    extensions: ['.ts', '.tsx', '.css']
  },
  json: {
    command: ['vscode-json-language-server', '--stdio'],
    extensions: ['.json', '.jsonc']
  },
  html: {
    command: ['vscode-html-language-server', '--stdio'],
    extensions: ['.html']
  },
  css: {
    command: ['vscode-css-language-server', '--stdio'],
    extensions: ['.css']
  },
  markdown: {
    command: ['marksman', 'server'],
    extensions: ['.md']
  },
  python: {
    command: ['pylsp', '--stdio'],
    extensions: ['.py', '.pyw', '.pyi']
  },
  go: {
    command: ['gopls', '-rpc.trace', '-serve'],
    extensions: ['.go', '.mod', '.sum']
  },
  rust: {
    command: ['rust-analyzer'],
    extensions: ['.rs']
  },
  ruby: {
    command: ['solargraph', 'stdio'],
    extensions: ['.rb', '.erb', '.rake', '.gemspec']
  },
  php: {
    command: ['intelephense', '--stdio'],
    extensions: ['.php', '.phtml']
  },
  java: {
    command: ['jdtls'],
    extensions: ['.java']
  },
  csharp: {
    command: ['omnisharp', '--languageserver'],
    extensions: ['.cs', '.csx']
  },
  cpp: {
    command: ['clangd', '--background-index'],
    extensions: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp']
  },
  shell: {
    command: ['bash-language-server', 'start'],
    extensions: ['.sh', '.bash', '.zsh', '.fish']
  },
  yaml: {
    command: ['yaml-language-server', '--stdio'],
    extensions: ['.yml', '.yaml']
  },
  docker: {
    command: ['dockerfile-language-server', '--stdio'],
    extensions: ['.dockerfile', 'Dockerfile']
  }
};

const config = { 
  mcp: mcpServers,
  lsp: lspServers
};
const configJson = JSON.stringify(config, null, 2);

// Generate clean .jsonc (no comments, same as .json for simplicity)
const configJsonc = configJson;

// ── Write configs to all locations ─────────────────────────────────────────

const globalConfigDir = path.join(process.env.HOME, '.config', 'opencode');
const globalConfig = path.join(globalConfigDir, 'opencode.json');
fs.mkdirSync(globalConfigDir, { recursive: true });
fs.writeFileSync(globalConfig, configJson, 'utf8');
console.log('  ✅ Global config written:', globalConfig);

const globalConfigJsonc = path.join(globalConfigDir, 'opencode.jsonc');
fs.writeFileSync(globalConfigJsonc, configJsonc, 'utf8');
console.log('  ✅ Global config (.jsonc) written:', globalConfigJsonc);

const projectConfig = path.join(__dirname, '..', '..', 'opencode.json');
const projectConfigJsonc = path.join(__dirname, '..', '..', 'opencode.jsonc');
if (fs.existsSync(path.dirname(projectConfig))) {
  fs.writeFileSync(projectConfig, configJson, 'utf8');
  console.log('  ✅ Project config updated:', projectConfig);
  fs.writeFileSync(projectConfigJsonc, configJsonc, 'utf8');
  console.log('  ✅ Project config (.jsonc) updated:', projectConfigJsonc);
}

// Don't write to workspace .opencode directory - it conflicts with global config
// const workspaceConfig = path.join(__dirname, '..', 'opencode.json');
// const workspaceConfigJsonc = path.join(__dirname, '..', 'opencode.jsonc');
// fs.writeFileSync(workspaceConfig, configJson, 'utf8');
// console.log('  ✅ Workspace config written:', workspaceConfig);
// fs.writeFileSync(workspaceConfigJsonc, configJsonc, 'utf8');
// console.log('  ✅ Workspace config (.jsonc) written:', workspaceConfigJsonc);

// ── Create plugin directories ─────────────────────────────────────────────

const globalPluginDir = path.join(globalConfigDir, 'plugins');
const workspacePluginDir = path.join(__dirname, '..', '.opencode', 'plugins');
const projectPluginDir = path.join(__dirname, '..', '..', '.opencode', 'plugins');

fs.mkdirSync(globalPluginDir, { recursive: true });
fs.mkdirSync(workspacePluginDir, { recursive: true });
console.log('  ✅ Plugin directories created');

if (fs.existsSync(path.dirname(projectPluginDir))) {
  fs.mkdirSync(projectPluginDir, { recursive: true });
}

console.log('✅ MCP config generation complete');
