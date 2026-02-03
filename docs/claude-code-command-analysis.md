# Claude Code Command 支持方案分析

## 一、`--agent` 参数运行原理

### 1. 参数解析

在 `src/add.ts:1995-2004` 中解析参数：

```typescript
} else if (arg === '-a' || arg === '--agent') {
  options.agent = options.agent || [];
  i++;
  let nextArg = args[i];
  while (i < args.length && nextArg && !nextArg.startsWith('-')) {
    options.agent.push(nextArg);  // 支持多个代理名称
    i++;
    nextArg = args[i];
  }
  i--;
}
```

### 2. 代理验证与选择流程

```
用户指定 --agent?
    │
    ├─ 是 → 验证代理名称是否有效（在 agents 对象中）
    │       ├─ 有效 → targetAgents = options.agent
    │       └─ 无效 → 报错退出
    │
    └─ 否 → 自动检测已安装代理 (detectInstalledAgents)
            │
            ├─ 检测到 0 个 → 提示用户选择或安装到所有代理
            ├─ 检测到 1 个 → 自动选择该代理
            └─ 检测到多个 → 交互式选择
```

### 3. 代理检测原理 (`src/agents.ts`)

每个代理配置包含 `detectInstalled` 函数：

```typescript
'claude-code': {
  name: 'claude-code',
  displayName: 'Claude Code',
  skillsDir: '.claude/skills',           // 项目级
  globalSkillsDir: '~/.claude/skills',   // 全局级
  detectInstalled: async () => {
    return existsSync(claudeHome);       // 检查 ~/.claude 是否存在
  },
}
```

### 4. 安装流程

```
对于每个 targetAgent:
    │
    ├─ 获取代理配置 agents[agentType]
    │
    ├─ 确定安装路径：
    │   ├─ 全局: agent.globalSkillsDir (~/.claude/skills)
    │   └─ 项目: agent.skillsDir (.claude/skills)
    │
    ├─ symlink 模式:
    │   1. 复制到规范目录 .agents/skills/<skill>/
    │   2. 创建符号链接到代理目录
    │
    └─ copy 模式:
        直接复制到代理目录
```

---

## 二、关键发现：Claude Code 已原生支持通过 Skills 定义 Slash Command

根据 Claude Code 官方文档（https://code.claude.com/docs/en/skills）：

> **Custom slash commands have been merged into skills.** A file at `.claude/commands/review.md` and a skill at `.claude/skills/review/SKILL.md` both create `/review` and work the same way.

这意味着当前的 `skills` CLI 已经完全兼容 Claude Code 的 command 机制。

---

## 三、SKILL.md 完整 Frontmatter 规范

```yaml
---
# 基础字段
name: my-skill                    # 可选，默认使用目录名，成为 /slash-command
description: 技能描述              # 推荐，帮助 Claude 决定何时使用
argument-hint: [issue-number]     # 可选，自动补全时的参数提示

# 调用控制
disable-model-invocation: true    # 禁止 Claude 自动调用，仅用户可触发
user-invocable: false             # 隐藏出 / 菜单，仅 Claude 可调用

# 工具限制
allowed-tools: Read, Grep, Glob   # 技能激活时允许的工具列表

# 执行环境
model: opus                       # 指定使用的模型
context: fork                     # 在独立子代理中运行
agent: Explore                    # context: fork 时使用的子代理类型

# 钩子
hooks:                            # 技能生命周期钩子
  post-tool-call:
    - match: Edit
      run: echo "File edited"
---
```

### Frontmatter 字段详解

| 字段 | 必需 | 描述 |
|------|------|------|
| `name` | 否 | 技能显示名称，省略时使用目录名。小写字母、数字、连字符（最多64字符） |
| `description` | 推荐 | 技能功能和使用场景。Claude 用此决定何时应用技能 |
| `argument-hint` | 否 | 自动补全时显示的参数提示，如 `[issue-number]` |
| `disable-model-invocation` | 否 | 设为 `true` 防止 Claude 自动加载，仅用户可通过 `/name` 触发 |
| `user-invocable` | 否 | 设为 `false` 从 `/` 菜单隐藏，用于用户不应直接调用的背景知识 |
| `allowed-tools` | 否 | 技能激活时 Claude 可使用的工具，无需逐一请求权限 |
| `model` | 否 | 技能激活时使用的模型 |
| `context` | 否 | 设为 `fork` 在分叉的子代理上下文中运行 |
| `agent` | 否 | `context: fork` 时使用的子代理类型 |
| `hooks` | 否 | 技能生命周期钩子 |

### 字符串替换变量

| 变量 | 描述 |
|------|------|
| `$ARGUMENTS` | 调用技能时传递的所有参数 |
| `$ARGUMENTS[N]` | 按索引访问特定参数（从 0 开始） |
| `$N` | `$ARGUMENTS[N]` 的简写，如 `$0` 表示第一个参数 |
| `${CLAUDE_SESSION_ID}` | 当前会话 ID |
| `!`command`` | 执行 shell 命令并替换为输出（预处理） |

---

## 四、支持 Claude Code Command 的具体方案

### 方案 A：直接使用现有 skills CLI（推荐）

当前 `skills` CLI 已经完全兼容 Claude Code 的 command 机制。只需：

1. **创建带有 `name` 字段的 SKILL.md**：

```yaml
---
name: deploy
description: 部署应用到生产环境
disable-model-invocation: true   # 仅用户可通过 /deploy 调用
---

# Deploy Workflow

1. 运行测试套件
2. 构建应用
3. 推送到部署目标
```

2. **使用 skills CLI 安装**：

```bash
npx skills add my-org/my-skills --skill deploy -a claude-code -g
```

3. **在 Claude Code 中使用**：

```
/deploy production
```

### 方案 B：扩展 skills CLI 以更好支持 command 特性

如果要让 `skills` CLI 更好地支持 Claude Code 特有的 command 功能，可以考虑：

#### 1. 添加 command 验证

在 `src/skills.ts` 中扩展解析逻辑：

```typescript
// 扩展 Skill 类型
export interface Skill {
  name: string;
  description: string;
  path: string;
  rawContent?: string;
  metadata?: Record<string, unknown>;
  // 新增 Claude Code 特有字段
  commandConfig?: {
    disableModelInvocation?: boolean;
    userInvocable?: boolean;
    allowedTools?: string[];
    argumentHint?: string;
    context?: 'fork';
    agent?: string;
  };
}
```

#### 2. 添加 command 列表功能

```bash
# 新命令：列出所有可用的 slash commands
npx skills commands

# 输出示例：
# /deploy     - 部署应用到生产环境 (user-only)
# /review-pr  - 审查 Pull Request
# /commit     - 创建 git commit (user-only)
```

#### 3. 添加 command 测试功能

```bash
# 验证 SKILL.md 是否符合 Claude Code command 规范
npx skills validate ./my-skill/SKILL.md --agent claude-code
```

---

## 五、Claude Code Command 的完整工作流

```
用户输入 /deploy production
       │
       ▼
Claude Code 检测到 slash command
       │
       ▼
查找匹配的 skill（按优先级）
  1. enterprise skills
  2. personal skills (~/.claude/skills/)
  3. project skills (.claude/skills/)
  4. plugin skills
       │
       ▼
找到 ~/.claude/skills/deploy/SKILL.md
       │
       ▼
检查 frontmatter:
  - disable-model-invocation: true ✓ 用户可调用
  - context: fork? → 是否在子代理中运行
  - allowed-tools? → 限制可用工具
       │
       ▼
替换变量:
  - $ARGUMENTS → "production"
  - $0 → "production"
  - !`command` → 执行并替换
       │
       ▼
执行 skill 内容
```

---

## 六、实际示例：创建 Claude Code Command

### 示例 1：PR 审查命令

```yaml
---
name: review-pr
description: 审查当前 Pull Request，检查代码质量和潜在问题
argument-hint: [--focus=security|performance|all]
disable-model-invocation: true
allowed-tools: Bash(gh *), Read, Grep, Glob
---

# PR Review

审查当前分支的 Pull Request。

## PR 上下文
- PR 差异: !`gh pr diff`
- PR 评论: !`gh pr view --comments`
- 变更文件: !`gh pr diff --name-only`

## 审查要点

1. **代码质量**: 检查命名、结构、可读性
2. **安全性**: 检查潜在的安全漏洞
3. **性能**: 检查性能问题
4. **测试**: 确保有适当的测试覆盖

## 参数
$ARGUMENTS
```

### 示例 2：自动提交命令

```yaml
---
name: commit
description: 分析变更并创建有意义的 git commit
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Bash(git *)
---

# Auto Commit

分析当前变更并创建 commit。

## 当前变更
!`git diff --staged`

## 任务

1. 分析暂存的变更
2. 生成简洁的 commit message
3. 执行 `git commit -m "message"`

遵循 Conventional Commits 规范。
```

### 示例 3：代码解释命令

```yaml
---
name: explain-code
description: 使用可视化图表和类比解释代码。当解释代码工作原理、教授代码库或用户问"这是如何工作的"时使用
---

解释代码时，始终包括：

1. **从类比开始**: 将代码比作日常生活中的事物
2. **绘制图表**: 使用 ASCII 艺术展示流程、结构或关系
3. **代码走查**: 逐步解释发生了什么
4. **强调陷阱**: 常见的错误或误解是什么？

保持解释对话式。对于复杂概念，使用多个类比。
```

---

## 七、技能存放位置

| 位置 | 路径 | 适用范围 |
|------|------|----------|
| Enterprise | 通过管理设置配置 | 组织内所有用户 |
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` | 所有项目 |
| Project | `.claude/skills/<skill-name>/SKILL.md` | 仅当前项目 |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` | 启用插件的地方 |

优先级：enterprise > personal > project

---

## 八、调用控制矩阵

| Frontmatter 设置 | 用户可调用 | Claude 可调用 | 何时加载到上下文 |
|------------------|-----------|--------------|-----------------|
| (默认) | 是 | 是 | 描述始终在上下文中，调用时加载完整技能 |
| `disable-model-invocation: true` | 是 | 否 | 描述不在上下文中，用户调用时加载 |
| `user-invocable: false` | 否 | 是 | 描述始终在上下文中，调用时加载完整技能 |

---

## 九、对 skills CLI 的改进建议

| 改进项 | 描述 | 优先级 |
|--------|------|--------|
| `skills commands` | 列出所有可用的 slash commands | 高 |
| `skills validate` | 验证 SKILL.md 是否符合目标代理规范 | 高 |
| `skills create --command` | 快速创建 command 类型的 skill | 中 |
| frontmatter 解析扩展 | 解析并验证 Claude Code 特有字段 | 中 |
| 文档更新 | 添加 Claude Code command 使用指南 | 高 |

---

## 十、总结

1. **当前 skills CLI 已完全兼容** Claude Code 的 slash command 机制
2. **只需正确设置 SKILL.md frontmatter** 即可创建 command
3. **关键字段**：
   - `name` → 定义 `/slash-command` 名称
   - `disable-model-invocation: true` → 仅用户可调用
   - `allowed-tools` → 限制工具访问
   - `context: fork` → 在子代理中运行
4. **无需修改 skills CLI** 即可使用 Claude Code command 功能

---

## 参考资料

- [Claude Code Skills 文档](https://code.claude.com/docs/en/skills)
- [Agent Skills 规范](https://agentskills.io)
- [skills CLI 源码](https://github.com/vercel-labs/skills)
