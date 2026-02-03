// =============================================================================
// Skills Library - Core Exports
// =============================================================================
// This file exports the core functions and types for use as a library.
// Import from '@your-org/skills' to use these exports in your custom CLI.

// -----------------------------------------------------------------------------
// Installer - Core installation logic
// -----------------------------------------------------------------------------
export {
  installSkillForAgent,
  installMintlifySkillForAgent,
  installRemoteSkillForAgent,
  installWellKnownSkillForAgent,
  listInstalledSkills,
  isSkillInstalled,
  getInstallPath,
  getCanonicalPath,
  getCanonicalSkillsDir,
  sanitizeName,
} from './installer.js';

export type { InstallMode, InstalledSkill } from './installer.js';

// -----------------------------------------------------------------------------
// Skills - Discovery and parsing
// -----------------------------------------------------------------------------
export {
  discoverSkills,
  parseSkillMd,
  getSkillDisplayName,
  filterSkills,
  shouldInstallInternalSkills,
} from './skills.js';

export type { DiscoverSkillsOptions } from './skills.js';

// -----------------------------------------------------------------------------
// Source Parser - Parse various source formats
// -----------------------------------------------------------------------------
export { parseSource, getOwnerRepo, parseOwnerRepo, isRepoPrivate } from './source-parser.js';

// -----------------------------------------------------------------------------
// Git - Repository cloning
// -----------------------------------------------------------------------------
export { cloneRepo, cleanupTempDir, GitCloneError } from './git.js';

// -----------------------------------------------------------------------------
// Agents - Agent configuration and detection
// -----------------------------------------------------------------------------
export { agents, getAgentConfig, detectInstalledAgents } from './agents.js';

// -----------------------------------------------------------------------------
// Skill Lock - Lock file management
// -----------------------------------------------------------------------------
export {
  readSkillLock,
  writeSkillLock,
  addSkillToLock,
  removeSkillFromLock,
  getSkillFromLock,
  getAllLockedSkills,
  getSkillsBySource,
  getSkillLockPath,
  computeContentHash,
  fetchSkillFolderHash,
  isPromptDismissed,
  dismissPrompt,
  getLastSelectedAgents,
  saveSelectedAgents,
} from './skill-lock.js';

export type { SkillLockEntry, SkillLockFile, DismissedPrompts } from './skill-lock.js';

// -----------------------------------------------------------------------------
// Types - Core type definitions
// -----------------------------------------------------------------------------
export type {
  AgentType,
  Skill,
  AgentConfig,
  ParsedSource,
  MintlifySkill,
  RemoteSkill,
} from './types.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
export { AGENTS_DIR, SKILLS_SUBDIR } from './constants.js';
