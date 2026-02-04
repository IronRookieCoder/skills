import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import {
  loadConfig,
  loadConfigSync,
  saveConfig,
  updateConfig,
  getConfigPath,
  getDefaultConfig,
  getPlatformUrl,
  ENV_VARS,
  type SkillsConfig,
} from './config.js';

describe('config', () => {
  const originalEnv = { ...process.env };
  let testConfigDir: string;
  let testConfigPath: string;

  beforeEach(async () => {
    // Reset environment
    Object.keys(ENV_VARS).forEach((key) => {
      const envVar = ENV_VARS[key as keyof typeof ENV_VARS];
      delete process.env[envVar];
    });
    delete process.env.DISABLE_TELEMETRY;
    delete process.env.DO_NOT_TRACK;

    // Create temp config directory
    testConfigDir = join(tmpdir(), `skills-config-test-${Date.now()}`);
    testConfigPath = join(testConfigDir, 'config.json');
    await mkdir(testConfigDir, { recursive: true });

    // Point config to temp directory
    process.env[ENV_VARS.CONFIG_PATH] = testConfigPath;
  });

  afterEach(async () => {
    // Restore environment
    process.env = { ...originalEnv };

    // Cleanup temp directory
    await rm(testConfigDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('getDefaultConfig', () => {
    it('returns default configuration', () => {
      const config = getDefaultConfig();

      expect(config.version).toBe(1);
      expect(config.defaultAgents).toEqual([]);
      expect(config.registries).toEqual([]);
      expect(config.telemetry.enabled).toBe(true);
      expect(config.privateRepo.alwaysUpdate).toBe(false);
      expect(config.platform.baseUrl).toBe('https://add-skill.vercel.sh');
    });
  });

  describe('loadConfigSync', () => {
    it('returns defaults when no config file exists', () => {
      const config = loadConfigSync();

      expect(config.version).toBe(1);
      expect(config.telemetry.enabled).toBe(true);
    });

    it('applies environment variable overrides', () => {
      process.env[ENV_VARS.PLATFORM_URL] = 'https://custom.example.com';
      process.env[ENV_VARS.DEFAULT_AGENTS] = 'claude-code,cursor';

      const config = loadConfigSync();

      expect(config.platform.baseUrl).toBe('https://custom.example.com');
      expect(config.defaultAgents).toEqual(['claude-code', 'cursor']);
    });

    it('disables telemetry when DISABLE_TELEMETRY is set', () => {
      process.env.DISABLE_TELEMETRY = '1';

      const config = loadConfigSync();

      expect(config.telemetry.enabled).toBe(false);
    });

    it('disables telemetry when DO_NOT_TRACK is set', () => {
      process.env.DO_NOT_TRACK = '1';

      const config = loadConfigSync();

      expect(config.telemetry.enabled).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('returns defaults when no config file exists', async () => {
      const config = await loadConfig();

      expect(config.version).toBe(1);
      expect(config.telemetry.enabled).toBe(true);
    });

    it('loads configuration from file', async () => {
      const fileConfig: SkillsConfig = {
        version: 1,
        defaultAgents: ['claude-code'],
        registries: [{ name: 'custom', url: 'https://custom.example.com', priority: 1 }],
        platform: {
          baseUrl: 'https://file.example.com',
          telemetryEndpoint: '/t',
          searchEndpoint: '/search',
          checkUpdatesEndpoint: '/check-updates',
        },
        telemetry: { enabled: false },
        privateRepo: { alwaysUpdate: true },
      };

      await writeFile(testConfigPath, JSON.stringify(fileConfig));

      const config = await loadConfig();

      expect(config.defaultAgents).toEqual(['claude-code']);
      expect(config.registries).toHaveLength(1);
      expect(config.platform.baseUrl).toBe('https://file.example.com');
      expect(config.telemetry.enabled).toBe(false);
      expect(config.privateRepo.alwaysUpdate).toBe(true);
    });

    it('environment variables override file config', async () => {
      const fileConfig: SkillsConfig = {
        version: 1,
        defaultAgents: ['claude-code'],
        registries: [],
        platform: {
          baseUrl: 'https://file.example.com',
          telemetryEndpoint: '/t',
          searchEndpoint: '/search',
          checkUpdatesEndpoint: '/check-updates',
        },
        telemetry: { enabled: true },
        privateRepo: { alwaysUpdate: false },
      };

      await writeFile(testConfigPath, JSON.stringify(fileConfig));

      process.env[ENV_VARS.PLATFORM_URL] = 'https://env.example.com';
      process.env[ENV_VARS.DEFAULT_AGENTS] = 'cursor,windsurf';

      const config = await loadConfig();

      expect(config.platform.baseUrl).toBe('https://env.example.com');
      expect(config.defaultAgents).toEqual(['cursor', 'windsurf']);
    });

    it('handles invalid JSON gracefully', async () => {
      await writeFile(testConfigPath, 'not valid json');

      const config = await loadConfig();

      expect(config.version).toBe(1);
      expect(config.telemetry.enabled).toBe(true);
    });

    it('handles missing version gracefully', async () => {
      await writeFile(testConfigPath, JSON.stringify({ defaultAgents: ['claude-code'] }));

      const config = await loadConfig();

      expect(config.version).toBe(1);
    });
  });

  describe('saveConfig', () => {
    it('saves configuration to file', async () => {
      const config: SkillsConfig = {
        version: 1,
        defaultAgents: ['claude-code', 'cursor'],
        registries: [],
        platform: {
          baseUrl: 'https://custom.example.com',
          telemetryEndpoint: '/t',
          searchEndpoint: '/search',
          checkUpdatesEndpoint: '/check-updates',
        },
        telemetry: { enabled: false },
        privateRepo: { alwaysUpdate: true },
      };

      await saveConfig(config);

      const content = await readFile(testConfigPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.defaultAgents).toEqual(['claude-code', 'cursor']);
      expect(saved.telemetry.enabled).toBe(false);
    });

    it('creates directory if it does not exist', async () => {
      await rm(testConfigDir, { recursive: true, force: true });

      const config = getDefaultConfig();
      await saveConfig(config);

      const content = await readFile(testConfigPath, 'utf-8');
      expect(JSON.parse(content).version).toBe(1);
    });
  });

  describe('updateConfig', () => {
    it('updates specific fields', async () => {
      const initial: SkillsConfig = {
        version: 1,
        defaultAgents: ['claude-code'],
        registries: [],
        platform: {
          baseUrl: 'https://initial.example.com',
          telemetryEndpoint: '/t',
          searchEndpoint: '/search',
          checkUpdatesEndpoint: '/check-updates',
        },
        telemetry: { enabled: true },
        privateRepo: { alwaysUpdate: false },
      };

      await writeFile(testConfigPath, JSON.stringify(initial));

      const updated = await updateConfig({
        defaultAgents: ['cursor'],
        telemetry: { enabled: false },
      });

      expect(updated.defaultAgents).toEqual(['cursor']);
      expect(updated.telemetry.enabled).toBe(false);
      expect(updated.platform.baseUrl).toBe('https://initial.example.com');
    });
  });

  describe('getPlatformUrl', () => {
    it('returns full URL for endpoints', () => {
      const config = getDefaultConfig();

      expect(getPlatformUrl(config, 'telemetryEndpoint')).toBe('https://add-skill.vercel.sh/t');
      expect(getPlatformUrl(config, 'searchEndpoint')).toBe('https://add-skill.vercel.sh/search');
      expect(getPlatformUrl(config, 'checkUpdatesEndpoint')).toBe(
        'https://add-skill.vercel.sh/check-updates'
      );
    });

    it('returns baseUrl for baseUrl key', () => {
      const config = getDefaultConfig();

      expect(getPlatformUrl(config, 'baseUrl')).toBe('https://add-skill.vercel.sh');
    });
  });

  describe('getConfigPath', () => {
    it('returns custom path from environment variable', () => {
      process.env[ENV_VARS.CONFIG_PATH] = '/custom/path/config.json';

      expect(getConfigPath()).toBe('/custom/path/config.json');
    });
  });

  describe('environment variable parsing', () => {
    it('parses PRIVATE_REPO_ALWAYS_UPDATE correctly', () => {
      process.env[ENV_VARS.PRIVATE_REPO_ALWAYS_UPDATE] = 'true';
      expect(loadConfigSync().privateRepo.alwaysUpdate).toBe(true);

      process.env[ENV_VARS.PRIVATE_REPO_ALWAYS_UPDATE] = '1';
      expect(loadConfigSync().privateRepo.alwaysUpdate).toBe(true);

      process.env[ENV_VARS.PRIVATE_REPO_ALWAYS_UPDATE] = 'yes';
      expect(loadConfigSync().privateRepo.alwaysUpdate).toBe(true);

      process.env[ENV_VARS.PRIVATE_REPO_ALWAYS_UPDATE] = 'false';
      expect(loadConfigSync().privateRepo.alwaysUpdate).toBe(false);

      process.env[ENV_VARS.PRIVATE_REPO_ALWAYS_UPDATE] = '0';
      expect(loadConfigSync().privateRepo.alwaysUpdate).toBe(false);
    });

    it('parses DEFAULT_AGENTS with various formats', () => {
      process.env[ENV_VARS.DEFAULT_AGENTS] = 'claude-code, cursor , windsurf';
      expect(loadConfigSync().defaultAgents).toEqual(['claude-code', 'cursor', 'windsurf']);

      process.env[ENV_VARS.DEFAULT_AGENTS] = '';
      expect(loadConfigSync().defaultAgents).toEqual([]);

      process.env[ENV_VARS.DEFAULT_AGENTS] = 'single';
      expect(loadConfigSync().defaultAgents).toEqual(['single']);
    });
  });
});
