# 定制化 Skills 管理工具实施方案

## 技术方案：Fork 改造为库

```
架构：
your-org/skills (Fork，改造为库)
    ↓ npm 依赖
your-org/custom-skills-cli (定制 CLI)
    ↓ 调用
your-platform.com (后端服务)
```

---

## 一、Fork 改造（将原项目改为可导入的库）

### 1.1 新增 src/index.ts

```typescript
// 导出核心函数供外部使用
export { installSkillForAgent, listInstalledSkills } from './installer.js';
export { discoverSkills, parseSkillMd } from './skills.js';
export { parseSource, getOwnerRepo } from './source-parser.js';
export { cloneRepo } from './git.js';
export { agents, getAgentConfig } from './agents.js';
export { readLockFile, writeLockFile } from './skill-lock.js';

// 导出类型
export type { Skill, AgentType, ParsedSource, AgentConfig, SkillLock } from './types.js';
```

### 1.2 修改 build.config.mjs

```javascript
import { defineBuildConfig } from 'obuild/config';

export default defineBuildConfig({
  entries: [
    { type: 'module', input: './src/index.ts' },  // 库入口（新增）
    { type: 'bundle', input: './src/cli.ts' }     // CLI 入口（保留）
  ],
});
```

### 1.3 修改 package.json

```json
{
  "name": "@your-org/skills",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "bin": {
    "skills": "./bin/cli.mjs"
  }
}
```

### 1.4 同步上游策略

```bash
# 初始设置
git remote add upstream https://github.com/vercel-labs/skills.git

# 定期同步（建议每月或上游有重要更新时）
git fetch upstream
git merge upstream/main
# 解决冲突（主要在 package.json 的 exports 字段）
git push origin main

# 发布新版本
npm version patch
npm publish
```

---

## 二、定制 CLI 工具

### 2.1 项目结构

```
custom-skills-cli/
├── package.json
├── src/
│   ├── cli.ts           # CLI 入口
│   ├── config.ts        # 配置模块
│   ├── commands/
│   │   ├── add.ts       # 复用 @your-org/skills
│   │   ├── bundle.ts    # 套件安装（新功能）
│   │   ├── find.ts      # 搜索（对接定制平台）
│   │   ├── list.ts      # 列表
│   │   ├── remove.ts    # 移除
│   │   ├── check.ts     # 检查更新
│   │   └── update.ts    # 更新
│   ├── telemetry.ts     # 遥测（上报定制平台）
│   └── bundle-parser.ts # 套件解析
└── bin/
    └── cli.mjs
```

### 2.2 package.json

```json
{
  "name": "@your-org/custom-skills-cli",
  "version": "1.0.0",
  "bin": {
    "an-skills": "./bin/cli.mjs"
  },
  "dependencies": {
    "@your-org/skills": "^1.0.0",
    "@clack/prompts": "^0.11.0",
    "yaml": "^2.3.0"
  }
}
```

### 2.3 配置模块

```typescript
// src/config.ts
export interface Config {
  platform: {
    baseUrl: string;
    telemetryEndpoint: string;
    searchEndpoint: string;
    bundleEndpoint: string;
  };
  telemetry: {
    enabled: boolean;
  };
  privateRepo: {
    alwaysUpdate: boolean;  // true = 不检查 hash，直接更新
  };
}

const defaultConfig: Config = {
  platform: {
    baseUrl: 'https://skills.your-company.com',
    telemetryEndpoint: '/api/telemetry',
    searchEndpoint: '/api/search',
    bundleEndpoint: '/api/bundles',
  },
  telemetry: {
    enabled: true,
  },
  privateRepo: {
    alwaysUpdate: true,
  },
};

export function loadConfig(): Config {
  // 支持环境变量覆盖
  return {
    ...defaultConfig,
    platform: {
      ...defaultConfig.platform,
      baseUrl: process.env.SKILLS_PLATFORM_URL || defaultConfig.platform.baseUrl,
    },
  };
}
```

### 2.4 复用核心逻辑示例

```typescript
// src/commands/add.ts
import {
  parseSource,
  cloneRepo,
  discoverSkills,
  installSkillForAgent,
} from '@your-org/skills';
import { reportTelemetry } from '../telemetry.js';
import { loadConfig } from '../config.js';

export async function addCommand(sources: string[], options: AddOptions) {
  const config = loadConfig();

  for (const source of sources) {
    // 复用原项目的解析逻辑
    const parsed = parseSource(source);

    // 复用原项目的克隆逻辑
    const localPath = await cloneRepo(parsed);

    // 复用原项目的发现逻辑
    const skills = await discoverSkills(localPath);

    // 复用原项目的安装逻辑
    for (const skill of skills) {
      for (const agent of options.agents) {
        await installSkillForAgent(skill, agent, { global: options.global });
      }
    }
  }

  // 上报到定制平台（新增）
  await reportTelemetry(config, {
    event: 'install',
    sources,
    agents: options.agents,
  });
}
```

---

## 三、套件功能

### 3.1 套件定义格式

```yaml
# bundle.yaml
name: react-dev-kit
description: React 全栈开发技能套件

skills:
  - source: vercel-labs/agent-skills
    skills:
      - react-best-practices
      - nextjs-patterns

  - source: git@github.com:company/internal-skills.git
    skills:
      - code-review
      - testing-standards

defaultAgents:
  - claude-code
  - cursor

defaultScope: global
```

### 3.2 CLI 命令

```bash
# 从平台安装
an-skills bundle react-dev-kit

# 从本地文件安装
an-skills bundle ./my-bundle.yaml

# 从远程 URL 安装
an-skills bundle https://skills.company.com/bundles/react-dev.yaml

# 列出平台套件
an-skills bundle list

# 导出当前配置
an-skills bundle export > my-bundle.yaml
```

### 3.3 实现

```typescript
// src/commands/bundle.ts
import { parseSource, cloneRepo, discoverSkills, installSkillForAgent } from '@your-org/skills';
import { parse as parseYaml } from 'yaml';
import { loadConfig } from '../config.js';

interface Bundle {
  name: string;
  skills: Array<{ source: string; skills?: string[] }>;
  defaultAgents?: string[];
  defaultScope?: 'global' | 'project';
}

export async function bundleCommand(source: string, options: BundleOptions) {
  const config = loadConfig();
  const bundle = await loadBundle(source, config);

  for (const item of bundle.skills) {
    const parsed = parseSource(item.source);
    const localPath = await cloneRepo(parsed);
    let skills = await discoverSkills(localPath);

    // 过滤指定的技能
    if (item.skills?.length) {
      skills = skills.filter(s => item.skills!.includes(s.name));
    }

    const agents = options.agents || bundle.defaultAgents || ['claude-code'];
    const isGlobal = options.global ?? (bundle.defaultScope === 'global');

    for (const skill of skills) {
      for (const agent of agents) {
        await installSkillForAgent(skill, agent, { global: isGlobal });
      }
    }
  }

  await reportTelemetry(config, { event: 'bundle', bundleName: bundle.name });
}

async function loadBundle(source: string, config: Config): Promise<Bundle> {
  // 本地文件
  if (source.endsWith('.yaml') || source.endsWith('.yml')) {
    const content = await fs.readFile(source, 'utf-8');
    return parseYaml(content);
  }

  // 远程 URL
  if (source.startsWith('http')) {
    const res = await fetch(source);
    return parseYaml(await res.text());
  }

  // 平台 API
  const url = `${config.platform.baseUrl}${config.platform.bundleEndpoint}/${source}`;
  const res = await fetch(url);
  return res.json();
}
```

---

## 四、后端 API 规范

### 4.1 遥测 API

```
POST /api/telemetry
Content-Type: application/json

{
  "event": "install" | "remove" | "bundle" | "find" | "check" | "update",
  "cliVersion": "1.0.0",
  "timestamp": "2026-02-03T10:00:00Z",
  "platform": "win32",
  "isCI": false,

  // install/remove
  "sources"?: ["org/repo"],
  "skills"?: ["skill-a"],
  "agents"?: ["claude-code"],

  // bundle
  "bundleName"?: "react-dev-kit",
  "bundleSource"?: "platform" | "local" | "remote",

  // find
  "query"?: "react",
  "resultCount"?: 10
}

Response: 204 No Content
```

### 4.2 搜索 API

```
GET /api/search?q={query}&limit={limit}

Response 200:
{
  "skills": [
    {
      "id": "react-best-practices",
      "name": "React Best Practices",
      "description": "...",
      "source": "org/repo",
      "installs": 1234,
      "tags": ["react"]
    }
  ],
  "total": 42
}
```

### 4.3 套件 API

```
GET /api/bundles
Response: [{ "id": "...", "name": "...", "description": "..." }]

GET /api/bundles/{id}
Response: 完整套件定义（同 YAML 格式）
```

### 4.4 更新检查 API

```
POST /api/check-updates
{
  "installed": {
    "skill-a": { "source": "org/repo", "skillFolderHash": "abc123" },
    "skill-b": { "source": "git@...", "isPrivate": true }
  }
}

Response:
{
  "skill-a": { "hasUpdate": false },
  "skill-b": { "hasUpdate": true, "reason": "private-always-update" }
}
```

---

## 五、实施步骤

### 阶段 1：Fork 改造

| 任务 | 文件 |
|------|------|
| Fork vercel-labs/skills | - |
| 新增库入口 | src/index.ts |
| 修改构建配置 | build.config.mjs |
| 添加 exports | package.json |
| 发布到私有 registry | - |

**验证：** `import { parseSource } from '@your-org/skills'` 成功

### 阶段 2：定制 CLI 骨架

| 任务 | 文件 |
|------|------|
| 初始化项目 | package.json |
| 配置模块 | src/config.ts |
| CLI 入口 | src/cli.ts |
| add 命令（复用） | src/commands/add.ts |
| 遥测模块 | src/telemetry.ts |

**验证：** `an-skills add org/repo` 成功安装并上报

### 阶段 3：后端服务

| 任务 | 端点 |
|------|------|
| 遥测收集 | POST /api/telemetry |
| 搜索 API | GET /api/search |
| 套件 API | GET /api/bundles |
| 部署到 K8s | - |

**验证：** `an-skills find react` 返回结果

### 阶段 4：套件功能

| 任务 | 文件 |
|------|------|
| 套件解析 | src/bundle-parser.ts |
| bundle 命令 | src/commands/bundle.ts |
| 平台套件管理 | 后端 |

**验证：** `an-skills bundle ./test.yaml` 批量安装成功

### 阶段 5：完善发布

| 任务 |
|------|
| 单元测试 |
| 文档 |
| 发布到私有 npm |
| 内部推广 |

---

## 六、关键修改文件清单

### Fork 项目（@your-org/skills）

| 文件 | 操作 | 说明 |
|------|------|------|
| src/index.ts | 新增 | 库导出入口 |
| build.config.mjs | 修改 | 添加 module 入口 |
| package.json | 修改 | 添加 exports、改名 |

### 定制 CLI（@your-org/custom-skills-cli）

| 文件 | 说明 |
|------|------|
| src/cli.ts | CLI 入口和命令路由 |
| src/config.ts | 配置管理 |
| src/telemetry.ts | 遥测上报 |
| src/commands/*.ts | 各命令实现 |
| src/bundle-parser.ts | 套件解析 |

---

## 七、验证方案

```bash
# 1. Fork 库可导入
node -e "import('@your-org/skills').then(m => console.log(Object.keys(m)))"

# 2. 安装功能
an-skills add vercel-labs/agent-skills@commit-commands

# 3. 搜索功能
an-skills find react

# 4. 套件功能
an-skills bundle ./test-bundle.yaml

# 5. 遥测上报
# 检查后端日志确认收到事件
```
