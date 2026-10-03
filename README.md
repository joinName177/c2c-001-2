# c2c-001 · 人生时间投资所

Vue 3 + TypeScript + Vite 纯前端时间资产配置工具。用户可以设置每日/每周时间预算，将时间投入健康、学习、关系、事业、娱乐、休息六类资产，查看组合配置、ROI、人生资产负债表与再平衡建议。数据保存在浏览器 `localStorage`。

## 周口径（统一规则）

- 自然周为**本地时区周一 00:00 至周日 23:59**，周编号采用 ISO-8601（跨年自动处理 W53）。
- 顶部账期、总览当周口径、「趋势」时间线全部复用 `src/core/week.ts`，不存在第二套周界规则。
- **总览 / 组合的进度条、配置图、资产负债表**默认按**当周投入**对比每周可配置小时，可切换「本周 / 累计」；「累计」即旧口径（全部历史记录），旧数据在两种口径下都能对账。
- 每笔记录按日期归入**唯一**一周，不跨周重复计入；趋势时间线内没有记录的周**补零并标记**（不跳过）。趋势页底部展示「各周合计 ＝ 历史总投入」的对账等式。
- 「趋势」页逐周展示总投入、环比上周增减、超配/余额标签、连续走低资产（连续 ≥3 周严格下降）与各类资产逐周小时。

## 分层

- 核心层 `src/core`：时间账户、投资记录、组合指标、ROI、资产负债表与建议规则；`week.ts` 为统一周界（ISO 周）与周趋势汇总
- 端口层 `src/ports`：时间快照仓储接口
- 适配器层 `src/adapters`：浏览器本地存储实现
- 界面层 `src/ui`：Vue 页面与原生 CSS 视图

## 校验

```bash
node_modules/.bin/esbuild scripts/verify-week.ts --bundle --platform=node --format=esm --outfile=/tmp/verify-week.mjs && node /tmp/verify-week.mjs
```

## 命令

```bash
npm install
npm run dev
npm run build
docker compose up --build
```

访问 `http://localhost:8101`。
