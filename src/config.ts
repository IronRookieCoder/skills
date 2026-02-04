import { homedir } from 'os';
import { join, dirname } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import type { AgentType } from './types.js';

// =============================================================================
// Configuration Module
// =============================================================================
// Manages user configuration with support for:
// - Environment variable overrides
// - Configuration file (~/.agents/config.json)
// - Sensible defaults

const AGENTS_DIR = '.agents';
const CONFIG_FILE = 'config.json';
const CURRENT_CONFIG_VERSION = 1;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Registry configuration for custom skill sources.
 */
export interface RegistryConfig {
  /** Unique name for this registry */
  name: string;
  /** Base URL for the registry API */
  url: string;
  /** Priority for resolution (lower = higher priority) */
  priority: number;
}

/**
 * Platform configuration for custom deployments.
 */
export interface PlatformConfig {
  /** Base URL for the platform API */
  baseUrl: string;
  /** Endpoint for telemetry data */
  telemetryEndpoint: string;
  /** Endpoint for skill search */
  searchEndpoint: string;
  /** Endpoint for checking updates */
  checkUpdatesEndpoint: string;
}

/**
 * Telemetry configuration.
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
}

/**
 * Private repository handling configuration.
 */
export interface PrivateRepoConfig {
  /** Always update without hash check (useful for private repos) */
  alwaysUpdate: boolean;
}

/**
 * Main configuration interface.
 */
export interface SkillsConfig {
  /** Configuration schema version */
  version: number;
  /** Default agents to install skills to */
  defaultAgents: AgentType[];
  /** Custom registries for skill discovery */
  registries: RegistryConfig[];
  /** Platform API configuration */
  platform: PlatformConfig;
  /** Telemetry settings */
  telemetry: TelemetryConfig;
  /** Private repository handling */
  privateRepo: PrivateRepoConfig;
}

// -----------------------------------------------------------------------------
// Environment Variable Names
// -----------------------------------------------------------------------------

export const ENV_VARS = {
  /** Disable telemetry (standard) */
  DISABLE_TELEMETRY: 'DISABLE_TELEMETRY',
  /** Disable telemetry (Do Not Track standard) */
  DO_NOT_TRACK: 'DO_NOT_TRACK',
  /** Platform base URL */
  PLATFORM_URL: 'SKILLS_PLATFORM_URL',
  /** Telemetry endpoint */
  TELEMETRY_ENDPOINT: 'SKILLS_TELEMETRY_ENDPOINT',
  /** Search endpoint */
  SEARCH_ENDPOINT: 'SKILLS_SEARCH_ENDPOINT',
  /** Check updates endpoint */
  CHECK_UPDATES_ENDPOINT: 'SKILLS_CHECK_UPDATES_ENDPOINT',
  /** Default agents (comma-separated) */
  DEFAULT_AGENTS: 'SKILLS_DEFAULT_AGENTS',
  /** Always update private repos without hash check */
  PRIVATE_REPO_ALWAYS_UPDATE: 'SKILLS_PRIVATE_REPO_ALWAYS_UPDATE',
  /** Custom config file path */
  CONFIG_PATH: 'SKILLS_CONFIG_PATH',
} as const;

// -----------------------------------------------------------------------------
// Default Configuration
// -----------------------------------------------------------------------------

const DEFAULT_PLATFORM: PlatformConfig = {
  baseUrl: 'https://add-skill.vercel.sh',
  telemetryEndpoint: '/t',
  searchEndpoint: '/search',
  checkUpdatesEndpoint: '/check-updates',
};

const DEFAULT_CONFIG: SkillsConfig = {
  version: CURRENT_CONFIG_VERSION,
  defaultAgents: [],
  registries: [],
  platform: DEFAULT_PLATFORM,
  telemetry: {
    enabled: true,
  },
  privateRepo: {
    alwaysUpdate: false,
  },
};

// -----------------------------------------------------------------------------
// Path Utilities
// -----------------------------------------------------------------------------

/**
 * Get the path to the configuration file.
 * Can be overridden with SKILLS_CONFIG_PATH environment variable.
 */
export function getConfigPath(): string {
  const envPath = process.env[ENV_VARS.CONFIG_PATH]?.trim();
  if (envPath) {
    return envPath;
  }
  return join(homedir(), AGENTS_DIR, CONFIG_FILE);
}

/**
 * Get the configuration directory.
 */
export function getConfigDir(): string {
  return join(homedir(), AGENTS_DIR);
}

// -----------------------------------------------------------------------------
// Environment Variable Parsing
// -----------------------------------------------------------------------------

/**
 * Parse a boolean from environment variable.
 */
function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const lower = value.toLowerCase().trim();
  return lower === '1' || lower === 'true' || lower === 'yes';
}

/**
 * Parse a comma-separated list from environment variable.
 */
function parseEnvList(value: string | undefined): string[] {
  if (!value || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Check if telemetry is disabled via environment variables.
 */
function isTelemetryDisabledByEnv(): boolean {
  return !!(process.env[ENV_VARS.DISABLE_TELEMETRY] || process.env[ENV_VARS.DO_NOT_TRACK]);
}

/**
 * Apply environment variable overrides to configuration.
 */
function applyEnvOverrides(config: SkillsConfig): SkillsConfig {
  const result = { ...config };

  // Platform overrides
  const platformUrl = process.env[ENV_VARS.PLATFORM_URL]?.trim();
  const telemetryEndpoint = process.env[ENV_VARS.TELEMETRY_ENDPOINT]?.trim();
  const searchEndpoint = process.env[ENV_VARS.SEARCH_ENDPOINT]?.trim();
  const checkUpdatesEndpoint = process.env[ENV_VARS.CHECK_UPDATES_ENDPOINT]?.trim();

  result.platform = {
    baseUrl: platformUrl || config.platform.baseUrl,
    telemetryEndpoint: telemetryEndpoint || config.platform.telemetryEndpoint,
    searchEndpoint: searchEndpoint || config.platform.searchEndpoint,
    checkUpdatesEndpoint: checkUpdatesEndpoint || config.platform.checkUpdatesEndpoint,
  };

  // Telemetry override (env vars take precedence)
  if (isTelemetryDisabledByEnv()) {
    result.telemetry = { enabled: false };
  }

  // Default agents override
  const defaultAgentsEnv = process.env[ENV_VARS.DEFAULT_AGENTS];
  if (defaultAgentsEnv) {
    result.defaultAgents = parseEnvList(defaultAgentsEnv) as AgentType[];
  }

  // Private repo override
  const alwaysUpdateEnv = process.env[ENV_VARS.PRIVATE_REPO_ALWAYS_UPDATE];
  if (alwaysUpdateEnv !== undefined) {
    result.privateRepo = {
      alwaysUpdate: parseEnvBool(alwaysUpdateEnv, config.privateRepo.alwaysUpdate),
    };
  }

  return result;
}

// -----------------------------------------------------------------------------
// Configuration Loading and Saving
// -----------------------------------------------------------------------------

/**
 * Load configuration from file.
 * Returns default configuration if file doesn't exist or is invalid.
 */
async function loadConfigFromFile(): Promise<SkillsConfig> {
  const configPath = getConfigPath();

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<SkillsConfig>;

    // Validate version
    if (typeof parsed.version !== 'number') {
      return { ...DEFAULT_CONFIG };
    }

    // Merge with defaults to ensure all fields exist
    return {
      version: parsed.version,
      defaultAgents: parsed.defaultAgents ?? DEFAULT_CONFIG.defaultAgents,
      registries: parsed.registries ?? DEFAULT_CONFIG.registries,
      platform: {
        ...DEFAULT_CONFIG.platform,
        ...parsed.platform,
      },
      telemetry: {
        ...DEFAULT_CONFIG.telemetry,
        ...parsed.telemetry,
      },
      privateRepo: {
        ...DEFAULT_CONFIG.privateRepo,
        ...parsed.privateRepo,
      },
    };
  } catch {
    // File doesn't exist or is invalid
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Load configuration with environment variable overrides.
 * Priority: Environment Variables > Config File > Defaults
 */
export async function loadConfig(): Promise<SkillsConfig> {
  const fileConfig = await loadConfigFromFile();
  return applyEnvOverrides(fileConfig);
}

/**
 * Load configuration synchronously (uses defaults + env vars only).
 * Useful for initialization where async is not available.
 */
export function loadConfigSync(): SkillsConfig {
  return applyEnvOverrides({ ...DEFAULT_CONFIG });
}

/**
 * Save configuration to file.
 */
export async function saveConfig(config: SkillsConfig): Promise<void> {
  const configPath = getConfigPath();

  // Ensure directory exists (use dirname of configPath to handle custom paths)
  await mkdir(dirname(configPath), { recursive: true });

  // Write with pretty formatting
  const content = JSON.stringify(config, null, 2);
  await writeFile(configPath, content, 'utf-8');
}

/**
 * Update specific configuration values.
 */
export async function updateConfig(updates: Partial<SkillsConfig>): Promise<SkillsConfig> {
  const current = await loadConfigFromFile();

  const updated: SkillsConfig = {
    ...current,
    ...updates,
    platform: {
      ...current.platform,
      ...updates.platform,
    },
    telemetry: {
      ...current.telemetry,
      ...updates.telemetry,
    },
    privateRepo: {
      ...current.privateRepo,
      ...updates.privateRepo,
    },
  };

  await saveConfig(updated);
  return applyEnvOverrides(updated);
}

// -----------------------------------------------------------------------------
// Convenience Functions
// -----------------------------------------------------------------------------

/**
 * Check if telemetry is enabled.
 */
export async function isTelemetryEnabled(): Promise<boolean> {
  // Environment variables take precedence
  if (isTelemetryDisabledByEnv()) {
    return false;
  }

  const config = await loadConfig();
  return config.telemetry.enabled;
}

/**
 * Check if telemetry is enabled (sync version).
 */
export function isTelemetryEnabledSync(): boolean {
  // Environment variables take precedence
  if (isTelemetryDisabledByEnv()) {
    return false;
  }

  // Without file access, assume enabled by default
  return true;
}

/**
 * Get the full URL for a platform endpoint.
 */
export function getPlatformUrl(config: SkillsConfig, endpoint: keyof PlatformConfig): string {
  if (endpoint === 'baseUrl') {
    return config.platform.baseUrl;
  }
  const path = config.platform[endpoint];
  return `${config.platform.baseUrl}${path}`;
}

/**
 * Get default agents from configuration.
 */
export async function getDefaultAgents(): Promise<AgentType[]> {
  const config = await loadConfig();
  return config.defaultAgents;
}

/**
 * Set default agents in configuration.
 */
export async function setDefaultAgents(agents: AgentType[]): Promise<void> {
  await updateConfig({ defaultAgents: agents });
}

/**
 * Get the default configuration (for reference/documentation).
 */
export function getDefaultConfig(): SkillsConfig {
  return { ...DEFAULT_CONFIG };
}
