# b-note 项目结构规划

## 目标

b-note 是一个 B 站视频笔记 Chrome 扩展。结构优化的目标不是单纯减少行数，而是让不同职责有稳定边界：

- `entrypoints/` 只放扩展入口和与 Chrome 生命周期强相关的胶水代码。
- `entrypoints/sidepanel/` 只负责侧栏页面体验，按 feature 拆组件和 hooks。
- `src/lib/` 放可复用、可测试、与 React 无关的领域逻辑。
- `tests/` 覆盖关键纯逻辑和拆分后容易回归的边界。

## 目标目录

```text
entrypoints/
  background.ts              # 扩展后台消息路由、跨 tab 协调
  content.ts                 # B 站页面内容脚本、视频与截图桥接
  sidepanel/
    App.tsx                  # 顶层状态组装，尽量不承载大块 UI
    main.tsx
    style.css
    components/
      app-shell/             # 顶栏、状态、历史、运行记录等壳层 UI
      note/                  # 笔记阅读、Markdown、关键画面、追问
      settings/              # API/转写/导出/发布/费用设置
      workflow/              # 操作栏、分 P 选择、结果操作
    hooks/
      useKeyFrames.ts        # 关键帧截图、自动抓帧、重抓、删除
      useGenerationFlow.ts   # 单视频生成流程
      useCollectionFlow.ts   # 合集/分 P 批量生成流程
      useSettingsForm.ts     # 设置表单状态与保存
    types.ts                 # Sidepanel 专用 UI 状态类型
src/
  lib/
    messages.ts              # Runtime/Content message 类型
    extensionApi.ts          # browser API 安全访问
    subtitle*.ts             # 字幕与缓存
    summarizer.ts            # AI 总结、流式响应、提示词
    markdown*.ts             # Markdown 解析、时间戳、渲染块
    keyFrames.ts             # 关键帧数据结构
    note*.ts                 # 笔记 Markdown、模板、打包
    publish*.ts              # 发布/导出集成
    settings.ts              # 持久化设置
tests/
  regression.test.ts         # 拆分过程中的核心回归网
```

## 拆分顺序

1. **类型与纯逻辑先行**
   - 消息类型放入 `src/lib/messages.ts`。
   - Markdown 渲染块解析放入 `src/lib/markdownRender.ts`。
   - 这些模块必须能被 `tests/regression.test.ts` 直接验证。

2. **稳定 UI 组件后移**
   - 从 `App.tsx` 移出不直接修改全局状态的展示组件。
   - 优先拆：`StatusPanel`、`HistoryList`、`ActivityLog`、`Header`、`ActivityPanel`。

3. **交互工作流拆 hook**
   - 已拆：`useKeyFrames`。
   - 后续拆：`useGenerationFlow`、`useCollectionFlow`。
   - hook 负责流程和副作用，组件只负责展示和触发动作。

4. **设置面板独立**
   - `ConfigPanel` 行数大、字段多，应拆入 `components/settings/`。
   - 设置保存、provider 切换、价格估算拆到 `useSettingsForm`。

## 当前状态

- 已有 `src/lib/messages.ts`、`src/lib/markdownRender.ts`、`entrypoints/sidepanel/hooks/useKeyFrames.ts`。
- 已迁移壳层 UI：`components/app-shell/`。
- 已迁移设置面板：`components/settings/`。
- 已迁移生成工作流展示层：`components/workflow/`。
- `App.tsx` 现在主要负责顶层状态、生成流程编排和持久化。后续继续拆时，优先抽 `useGenerationFlow` 与 `useCollectionFlow`。

## 验证要求

每一批拆分后至少运行：

```bash
npm test
npm run compile
npm run build
```

涉及侧栏渲染或交互时，再用 Chrome 打开构建产物或扩展侧栏做冒烟验证。
