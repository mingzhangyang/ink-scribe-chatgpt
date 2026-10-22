# 墨语笔记 · InkScribe

将文章、课程笔记和思想碎片变成可编辑、可导出的手写视觉笔记。一个基于 **Cloudflare Workers + Workers AI** 的隐私优先 Web Studio，无账号、无服务器数据库、无第三方前端 JS 依赖。

## 当前功能

- 中文／英文：粘贴文本，调用 Workers AI 将内容整理为标题、关键词、正文、亮点和总结；未启用 AI 时可选择**仅本地排版**。
- 混合康奈尔、经典康奈尔、自由手账、简约手札布局；6 种纸张、5 种墨水与 3 种系统字体回退方案。
- 6 种内置贴纸：点击添加、触控/鼠标拖拽、键盘方向键微调、缩放、旋转、删除与调整层级。
- 自动分页，页面预览与 PNG / JPG 导出共用 Canvas 渲染器，支持 1×/2×/3×、多页 ZIP 打包、当前页剪贴板复制。
- Worker 输入校验、请求体大小限制、部署级限流绑定、AI 超时和错误规范、模型输出校验及仅记录指标的日志。
- 用户原始内容默认不保存到任何应用数据库或浏览器本地持久化存储。**使用 AI 时，原文会发送至 Cloudflare Workers AI 进行推理。**

## Acceptance fixes (2026-10-22)

- Local formatting keeps all source characters in the editable body; it no longer treats the first line as disposable metadata. Long content is split into full sections and paginated, never silently sliced. The AI input limit remains 8,000 characters; local-only formatting allows up to 30,000 and returns a visible error beyond that.
- Manual editing is not constrained by the generated AI schema. Model output is validated strictly against the limited JSON Schema; oversized model fields are rejected, never truncated.
- Stale AI requests are invalidated and aborted when the source or document changes. A late result cannot erase a newer note or sticker edits.
- Every layout preserves keyword descriptions; classic Cornell now has its own dedicated full-width summary band. Multi-page exports and clipboard images freeze a complete document/settings/layout snapshot before async encoding.
- Mobile swipe-to-scroll works on empty paper, touch dragging still works when a gesture starts on a sticker, and mobile inputs use 16px text to avoid Safari auto-zoom.
- `GLM-4.7 Flash` uses `chat_template_kwargs.enable_thinking=false` when the dedicated config option is enabled. Small real-account samples returned valid JSON in roughly 16-19 seconds, but the model still requires broader quality/cost/error-rate benchmarking and deployed Worker tests.

`npm run check` covers code syntax, contracts, layout, exports, generation lifecycle and Worker API behavior. Browser QA additionally checked Chromium desktop/mobile, sticker gestures, long-content page navigation and export consistency; native iOS Safari and production HTTPS remain unverified.

## 启动与验证

运行环境：Node.js **22+**。

```bash
npm run dev       # 无需依赖的本地工作台预览（AI 功能不可用）
npm test          # 数据契约、分页、ZIP、Worker API 等自动测试
npm run check     # 模块静态检查 + 测试
```

本地联调真实 AI，需要已登录 Cloudflare 且账户已开通 Workers AI：

```bash
npx wrangler@latest dev --remote
```

部署：

```bash
npm run check
npx wrangler@latest deploy --dry-run
npx wrangler@latest deploy
```

`wrangler.jsonc` 将静态文件 `public/`、路由 `/api/*`、原生 Workers AI binding `AI`、限流 binding `STRUCTURE_LIMITER` 配置在同一 Worker 中。不需要 Vite 代理，也不需要常驻 Express。

### 生产环境配置

在 `wrangler.jsonc` 的 `vars` 中维护：

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `AI_MODEL` | `@cf/zai-org/glm-4.7-flash` | Workers AI 文本模型，可配置切换 |
| `AI_MAX_TOKENS` | `1700` | 生成输出上限（Worker 将其钳制为 400~2600） |
| `AI_DISABLE_THINKING` | `true` | Disable GLM-4.7 Flash reasoning to save time and tokens (not applied to other models) |
| `AI_TIMEOUT_MS` | `45000` | API 等待时限（Worker 钳制为 5~45 秒） |

**注意**：模型能力、可用套餐、JSON 模式支持、中文质量与费用会变化。当前默认模型已通过 Cloudflare 实际账户的基本 JSON 结构试跑，但尚未进行完整中英质量、延迟、成本基准，不能作为已验证最佳模型。生产启用前核实 [Cloudflare 模型目录](https://developers.cloudflare.com/workers-ai/models/) 和 [定价](https://developers.cloudflare.com/workers-ai/platform/pricing/)，完成中英混合素材的端到端试跑。

限流为 Cloudflare 原生 `ratelimits` binding：每边缘区域、每请求来源 IP 8 次/60 秒，**不是全局严格防刷**。正式公开发布需要结合账户 WAF/Turnstile、每日预算和用量告警，并避免敏感材料使用共享用户机器。

## 结构

```text
public/           静态页面和无依赖 ES 模块
  assets/app.js    工作台状态与事件
  assets/renderer.js  单一 Canvas 渲染与分页
  assets/export.js    PNG/JPG、剪贴板、ZIP
  assets/offline.js   无 AI 本地排版与示例
  assets/contracts.js API 模式、验证与清理（与 Worker 共用）
worker/           Cloudflare Worker API
scripts/          本地启动与静态校验
tests/            Node 原生测试
.github/workflows/ci.yml  GitHub Actions
```

所有模型字符串必须经过严格 `normalizeNote` 校验；画布只使用 Canvas 绘图，不插入模型生成的任意 HTML/SVG。修改笔记正文时会重新分页；贴纸坐标在 820×1160 页面坐标系内。

## 隐私及限制

- 没有自动保存：关闭标签页或刷新会丢失未下载的编辑数据；点击「下载笔记图片」保留作品。
- 由于使用系统字体，中文楷体的字形和英文手写样式在不同操作系统/浏览器上存在差异。同一设备上的预览与导出保持一致；对跨设备完全统一字形的需求，需要引入明确授权的自托管字体及跨浏览器测试。
- 多页 3× 大图可能消耗较多内存；超过 12 页时会阻止 3× 导出。剪贴板需安全上下文和浏览器支持。
- 本地预览不包含真实 AI 服务；自动测试使用模拟 AI 响应，不能替代上线后的 Workers AI 实测。
- 首期没有账号、历史存档、生成式贴纸/任意 SVG、`/api/doodle` 或计费网关；后者需经风险与质量评估再开发。

完整方案见 [`docs/implementation-plan.md`](docs/implementation-plan.md)。
