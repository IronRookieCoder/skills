# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

`skills` 是开放代理技能生态系统的 CLI 工具，用于安装、管理和发现可扩展 AI 编码代理能力的可复用指令集（技能）。

## 常用命令

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发 - 本地运行 CLI
pnpm dev add vercel-labs/agent-skills --list
pnpm dev check
pnpm dev update
pnpm dev init my-skill

# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test tests/sanitize-name.test.ts
pnpm test tests/skill-matching.test.ts tests/source-parser.test.ts

# 类型检查
pnpm type-check

# 格式化代码（提交前必须运行）
pnpm format

# 检查格式
pnpm format:check
```

## 架构

```
src/
├── cli.ts           # 主入口，命令路由，init/check/update/generate-lock
├── add.ts           # add 命令核心逻辑
├── list.ts          # 列出已安装技能
├── remove.ts        # 移除已安装技能
├── find.ts          # 交互式技能搜索
├── agents.ts        # 代理定义和检测（支持 30+ 代理）
├── installer.ts     # 技能安装逻辑（符号链接/复制）+ listInstalledSkills
├── skills.ts        # 技能发现和 SKILL.md 解析
├── skill-lock.ts    # 锁文件管理 (~/.agents/.skill-lock.json)
├── source-parser.ts # 解析 git URL、GitHub 简写、本地路径
├── git.ts           # Git 克隆操作
├── telemetry.ts     # 匿名使用统计
├── types.ts         # TypeScript 类型（AgentType, Skill, AgentConfig 等）
├── constants.ts     # 共享常量（AGENTS_DIR, SKILLS_SUBDIR）
├── providers/       # 远程技能提供者
│   ├── registry.ts  # 提供者注册表
│   ├── huggingface.ts
│   ├── mintlify.ts
│   └── wellknown.ts
└── *.test.ts        # 同目录测试文件

tests/               # 额外测试文件
```

## 核心概念

### 技能安装流程

1. 通过 `source-parser.ts` 解析来源（GitHub 简写、URL、本地路径）
2. 通过 `git.ts` 或 providers 克隆/获取技能仓库
3. 通过 `skills.ts` 在标准位置发现技能
4. 安装到规范目录 `.agents/skills/`
5. 为每个代理的技能目录创建符号链接（失败时回退到复制）
6. 更新 `~/.agents/.skill-lock.json` 用于追踪

### 代理配置

代理定义在 `src/agents.ts`。每个代理包含：
- `skillsDir`: 项目级路径（如 `.claude/skills`）
- `globalSkillsDir`: 用户级路径（如 `~/.claude/skills`）
- `detectInstalled`: 检测代理是否已安装的函数

### 锁文件（v3）

位于 `~/.agents/.skill-lock.json`。关键字段：`skillFolderHash`（GitHub tree SHA，用于文件夹级变更检测）。

### 更新系统

`skills check` 和 `skills update` 都会向 `https://add-skill.vercel.sh/check-updates` 发送 POST 请求，携带已安装技能的哈希值。API 从 GitHub 获取最新内容并比较哈希。

## 添加新代理

1. 在 `src/agents.ts` 添加代理定义
2. 在 `src/types.ts` 的 `AgentType` 联合类型中添加类型
3. 运行 `pnpm run -C scripts validate-agents.ts` 验证
4. 运行 `pnpm run -C scripts sync-agents.ts` 更新 README.md

## 代码风格

- 使用 Prettier 格式化 - 提交前运行 `pnpm format`
- CI 会检查格式问题
- 启用 TypeScript 严格模式
