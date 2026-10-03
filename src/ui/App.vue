<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { LocalTimeRepository } from '../adapters/local-time.repository';
import { CATEGORIES, CATEGORY_META, type TimeCategory } from '../core/models';
import { balanceSheet, metricsFor, portfolioScore, record, sampleSnapshot, suggestions, totalInvested } from '../core/time-engine';
import {
  currentWeek, decliningStreaks, formatHours, recordsInWeek,
  sumOfWeeklyHours, weekBucket, weeklyBudgetStatus, weeklyTrend,
  type WeekSummary,
} from '../core/week';

const repo = new LocalTimeRepository();
type Tab = '总览' | '记录' | '组合' | '趋势' | '分析';
const tab = ref<Tab>('总览');
const notice = ref('');
const state = reactive(repo.load());
const accountDraft = reactive({ dailyHours: state.account.dailyHours, weeklyHours: state.account.weeklyHours });
const draft = reactive({ category: '事业' as TimeCategory, hours: 2, note: '' });

/** 口径：当周（本周投入对比周预算）或累计（全部历史，即旧口径） */
type Scope = 'week' | 'all';
const scope = ref<Scope>('week');

/** 每次渲染都以当前日期实时计算，账期与趋势共用同一套周界规则 */
const now = new Date();
const week = currentWeek(now);
const weekOfToday = computed(() => weekBucket(new Date(), now));

/** 本周记录（总览当周口径） */
const currentRecords = computed(() => recordsInWeek(state.records, week));
const weekMetrics = computed(() => metricsFor(currentRecords.value));
const weekInvested = computed(() => totalInvested(currentRecords.value));

/** 全部历史（累计口径，与旧版本计算方式完全一致） */
const allMetrics = computed(() => metricsFor(state.records));
const allInvested = computed(() => totalInvested(state.records));

/** 当前口径下用于进度条 / 配置图 / 资产负债表的数据 */
const activeMetrics = computed(() => (scope.value === 'week' ? weekMetrics.value : allMetrics.value));
const activeInvested = computed(() => (scope.value === 'week' ? weekInvested.value : allInvested.value));
const score = computed(() => portfolioScore(activeMetrics.value, state.account));
const sheet = computed(() => balanceSheet(activeMetrics.value, state.account));
const budgetStatus = computed(() => weeklyBudgetStatus(activeInvested.value, state.account.weeklyHours));
const tips = computed(() => suggestions(allMetrics.value, state.account));
const recent = computed(() => [...state.records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5));

/** 趋势视图：最近 8 周连续时间线（无记录的周补零，不跳过） */
const trendWeekCount = ref(8);
const trend = computed(() => weeklyTrend(state.records, trendWeekCount.value, now));
const maxTrendHours = computed(() =>
  Math.max(state.account.weeklyHours, ...trend.value.map((item) => item.totalHours), 1),
);
const streaks = computed(() => decliningStreaks(state.records, 3, now));
const reconciliation = computed(() => ({
  weeklySum: sumOfWeeklyHours(state.records, now),
  total: allInvested.value,
}));

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const dayProgress = computed(() => {
  const elapsedDays = Math.min(7, Math.max(1, Math.floor((startOfToday().getTime() - week.monday.getTime()) / 86400000) + 1));
  return { name: DAY_NAMES[new Date().getDay()], day: elapsedDays };
});
function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function budgetLabel(item: WeekSummary) {
  const status = weeklyBudgetStatus(item.totalHours, state.account.weeklyHours);
  if (!item.hasRecords) return { text: '未记录', tone: 'empty' as const };
  if (status.over) return { text: `超配 ${formatHours(status.overHours)}`, tone: 'over' as const };
  if (status.balanced) return { text: '刚好配满', tone: 'balanced' as const };
  return { text: `余额 ${formatHours(status.remainingHours)}`, tone: 'under' as const };
}

function deltaLabel(item: WeekSummary) {
  if (item.deltaFromPrevious === null) return { text: '—', cls: 'flat' };
  if (item.deltaFromPrevious > 0) return { text: `▲ ${formatHours(item.deltaFromPrevious)}`, cls: 'up' };
  if (item.deltaFromPrevious < 0) return { text: `▼ ${formatHours(Math.abs(item.deltaFromPrevious))}`, cls: 'down' };
  return { text: '持平', cls: 'flat' };
}

function save() { repo.save({ account: state.account, records: state.records }); }
function updateAccount() { state.account.dailyHours = Math.max(1, Number(accountDraft.dailyHours) || 1); state.account.weeklyHours = Math.max(1, Number(accountDraft.weeklyHours) || 1); state.account.updatedAt = new Date().toISOString(); save(); notice.value = '时间账户已更新'; }
function addRecord() { state.records.unshift(record(draft.category, draft.hours, draft.note)); save(); draft.note = ''; notice.value = '一笔时间投资已入账'; tab.value = '记录'; }
function removeRecord(id: string) { state.records = state.records.filter((item) => item.id !== id); save(); }
function resetDemo() { const fresh = sampleSnapshot(); state.account = fresh.account; state.records = fresh.records; accountDraft.dailyHours = fresh.account.dailyHours; accountDraft.weeklyHours = fresh.account.weeklyHours; save(); notice.value = '已恢复初始示例组合'; }
</script>

<template>
  <div class="app-shell investment-app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">时</div><div><span class="eyebrow">LIFE CAPITAL / 01</span><h1>人生时间投资所</h1></div></div>
      <div class="top-actions"><span class="live-dot">{{ week.label }} 账期进行中 · {{ dayProgress.name }}</span><button class="ghost-button" type="button" @click="resetDemo">↻ 重置演示</button></div>
    </header>
    <main class="page-wrap">
      <section class="hero-row">
        <div><p class="eyebrow accent-text">个人时间资产管理台</p><h2>把今天的小时，<em>配置成明天的底气。</em></h2><p class="hero-copy">你的时间不是被消耗的余额，而是一支每天都在重新开盘的投资组合。</p></div>
        <div class="hero-date"><span>当前自然周 · 周一至周日</span><strong>{{ weekOfToday.label }}</strong><small>{{ weekOfToday.range }}</small><small class="hero-weekday">第 {{ dayProgress.day }} / 7 天 · {{ dayProgress.name }}</small></div>
      </section>
      <nav class="tabs" aria-label="功能模块"><button v-for="item in ['总览', '记录', '组合', '趋势', '分析']" :key="item" type="button" :class="{ active: tab === item }" @click="tab = item as Tab">{{ item }}<span v-if="item === '记录'" class="tab-count">{{ state.records.length }}</span></button></nav>

      <section v-if="tab === '总览'" class="content-grid overview-grid">
        <article class="panel account-panel"><div class="panel-heading"><div><span class="eyebrow">TIME ACCOUNT</span><h3>时间账户</h3></div><span class="panel-index">01 / 06</span></div>
          <div class="scope-switch" role="group" aria-label="统计口径"><button type="button" :class="{ active: scope === 'week' }" @click="scope = 'week'">本周</button><button type="button" :class="{ active: scope === 'all' }" @click="scope = 'all'">累计</button></div>
          <div class="account-number"><strong>{{ state.account.weeklyHours }}</strong><span>可配置小时 / 周</span></div>
          <div class="meter" :class="{ over: budgetStatus.over }"><span :style="{ width: `${Math.min(100, activeInvested / state.account.weeklyHours * 100)}%` }"></span></div>
          <div class="split-line"><span>已配置 <b>{{ activeInvested.toFixed(1) }}h</b></span>
            <span v-if="budgetStatus.over" class="status-over">超配 <b>{{ budgetStatus.overHours.toFixed(1) }}h</b></span>
            <span v-else>剩余 <b>{{ Math.max(0, state.account.weeklyHours - activeInvested).toFixed(1) }}h</b></span>
          </div>
          <p class="scope-hint">{{ scope === 'week' ? `当周口径：仅统计 ${week.shortRange} 本周记录；累计历史 ${allInvested.toFixed(1)}h` : '累计口径：全部历史记录与周预算对比（旧口径）' }}</p>
          <div class="account-form"><label>每日可支配<input v-model.number="accountDraft.dailyHours" type="number" min="1" step="0.5" />小时</label><label>每周可配置<input v-model.number="accountDraft.weeklyHours" type="number" min="1" step="1" />小时</label><button class="primary-button" type="button" @click="updateAccount">更新账户 →</button></div></article>
        <article class="panel score-panel"><div class="panel-heading"><div><span class="eyebrow">PORTFOLIO HEALTH</span><h3>组合健康度</h3></div><span class="panel-index">02 / 06</span></div><div class="score-layout"><div class="score-ring" :style="{ '--score': `${Math.min(100, score * 20)}%` }"><div><strong>{{ score }}</strong><span>/ 10</span></div></div><div><p class="score-label">{{ scope === 'week' ? '本周复利潜力' : '累计复利潜力' }}</p><p class="muted">基于 {{ scope === 'week' ? currentRecords.length : state.records.length }} 笔{{ scope === 'week' ? '本周' : '历史' }}投资记录与各资产类别的历史回报估算。</p><div class="legend-list"><span><i class="dot green"></i>配置平衡</span><span><i class="dot yellow"></i>可继续优化</span></div></div></div></article>
        <article class="panel chart-panel"><div class="panel-heading"><div><span class="eyebrow">ALLOCATION MAP</span><h3>时间资产配置</h3></div><button class="text-button" type="button" @click="tab = '组合'">查看组合 →</button></div><div class="allocation-layout"><div class="donut" :style="{ background: `conic-gradient(${activeMetrics.map((item) => `${item.color} ${item.share * 100}%`).join(', ')})` }"><div><strong>{{ Math.round(activeInvested) }}</strong><span>hours</span></div></div><div class="metric-list"><div v-for="item in activeMetrics" :key="item.category" class="metric-row"><i class="category-symbol" :style="{ color: item.color }">{{ item.icon }}</i><span>{{ item.category }}</span><strong>{{ item.hours.toFixed(1) }}h</strong><small>{{ Math.round(item.share * 100) }}%</small></div></div></div></article>
        <article class="panel ledger-panel"><div class="panel-heading"><div><span class="eyebrow">RECENT ACTIVITY</span><h3>最近投资</h3></div><button class="text-button" type="button" @click="tab = '记录'">全部记录 →</button></div><div class="activity-list"><div v-for="item in recent" :key="item.id" class="activity-row"><span class="activity-icon" :style="{ background: CATEGORY_META[item.category].color }">{{ CATEGORY_META[item.category].icon }}</span><div><strong>{{ item.note }}</strong><small>{{ item.category }} · {{ new Date(item.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) }}</small></div><b>+{{ item.hours }}h</b></div></div></article>
      </section>

      <section v-else-if="tab === '记录'" class="content-grid record-grid"><article class="panel form-panel"><div class="panel-heading"><div><span class="eyebrow">NEW INVESTMENT</span><h3>记录一笔时间</h3></div><span class="panel-index">02 / 06</span></div><p class="muted intro">每一次记录，都是在告诉未来的自己：这段时间值得。</p><label>投资到<select v-model="draft.category"><option v-for="item in CATEGORIES" :key="item" :value="item">{{ item }} · {{ CATEGORY_META[item].label }}</option></select></label><label>投入小时<input v-model.number="draft.hours" type="number" min="0.5" step="0.5" /></label><label>这段时间做了什么<textarea v-model="draft.note" rows="4" placeholder="例如：完成了季度复盘"></textarea></label><button class="primary-button full-button" type="button" @click="addRecord">确认入账 →</button><p class="notice">{{ notice }}</p></article><article class="panel table-panel"><div class="panel-heading"><div><span class="eyebrow">INVESTMENT LEDGER</span><h3>投资流水</h3></div><span class="total-pill">{{ state.records.length }} 笔记录</span></div><div class="ledger-table"><div class="table-head"><span>资产类别</span><span>备注</span><span>小时</span><span>日期</span><span></span></div><div v-for="item in recent" :key="item.id" class="table-row"><span class="category-cell"><i :style="{ color: CATEGORY_META[item.category].color }">{{ CATEGORY_META[item.category].icon }}</i>{{ item.category }}</span><span>{{ item.note }}</span><strong>{{ item.hours }}h</strong><span>{{ new Date(item.date).toLocaleDateString('zh-CN') }}</span><button class="delete-button" type="button" title="删除记录" @click="removeRecord(item.id)">×</button></div></div></article></section>

      <section v-else-if="tab === '组合'" class="content-grid portfolio-grid">
        <article class="panel wide-panel"><div class="panel-heading"><div><span class="eyebrow">ASSET ALLOCATION</span><h3>投资组合</h3><div class="scope-switch compact" role="group" aria-label="统计口径"><button type="button" :class="{ active: scope === 'week' }" @click="scope = 'week'">本周</button><button type="button" :class="{ active: scope === 'all' }" @click="scope = 'all'">累计</button></div></div><span class="panel-index">03 / 06</span></div><div class="portfolio-cards"><div v-for="item in activeMetrics" :key="item.category" class="portfolio-card" :style="{ '--category-color': item.color }"><div class="portfolio-card-top"><span class="portfolio-icon">{{ item.icon }}</span><span>{{ Math.round(item.share * 100) }}%</span></div><h4>{{ item.category }}</h4><p>{{ CATEGORY_META[item.category].label }}</p><div class="mini-meter"><i :style="{ width: `${Math.min(100, item.share * 200)}%` }"></i></div><div class="portfolio-card-foot"><strong>{{ item.hours.toFixed(1) }}h</strong><span>ROI {{ item.roi.toFixed(2) }}x</span></div></div></div></article>
        <article class="panel balance-panel"><div class="panel-heading"><div><span class="eyebrow">LIFE BALANCE SHEET</span><h3>人生资产负债表</h3></div><span class="panel-index">04 / 06</span></div><p class="muted balance-scope">{{ scope === 'week' ? `当周口径（${week.shortRange}）` : '累计口径（全部历史）' }}</p><div class="balance-figure"><div><span>时间资产</span><strong>{{ sheet.assets }} <small>价值点</small></strong></div><div><span>未配置负债</span><strong class="liability">{{ sheet.liabilities }} <small>小时</small></strong></div><div class="balance-total"><span>净人生资产</span><strong>{{ sheet.equity }}</strong></div></div></article>
      </section>

      <section v-else-if="tab === '趋势'" class="content-grid trend-grid">
        <article class="panel trend-head-panel"><div class="panel-heading"><div><span class="eyebrow">WEEKLY TIMELINE</span><h3>周度投入趋势</h3></div><span class="panel-index">05 / 06</span></div>
          <div class="trend-controls"><div class="window-switch" role="group" aria-label="时间线周数"><button v-for="count in [6, 8, 12]" :key="count" type="button" :class="{ active: trendWeekCount === count }" @click="trendWeekCount = count">近 {{ count }} 周</button></div>
            <div class="trend-legend"><span><i class="legend-line budget"></i>周预算 {{ state.account.weeklyHours }}h</span><span><i class="legend-line over"></i>超配周</span><span><i class="legend-line empty"></i>无记录补零</span></div></div>
          <p class="muted">每笔记录按日期归入唯一自然周（周一至周日），不跨周重复计入；时间线内没有记录的周补零并标记。</p>
        </article>

        <article class="panel timeline-panel">
          <div class="week-timeline">
            <div v-for="item in trend" :key="item.bucket.key" class="week-col" :class="{ current: item.bucket.isCurrent, empty: !item.hasRecords }">
              <div class="week-col-head"><span class="week-name">{{ item.bucket.label.replace('WEEK ', 'W') }}</span><span class="week-delta" :class="deltaLabel(item).cls">{{ deltaLabel(item).text }}</span></div>
              <div class="week-stack" :title="`${item.bucket.shortRange} · 合计 ${item.totalHours.toFixed(1)}h`">
                <i class="budget-mark" :style="{ bottom: `${state.account.weeklyHours / maxTrendHours * 100}%` }"></i>
                <span v-for="cat in item.byCategory.filter((c) => c.hours > 0)" :key="cat.category" class="stack-seg" :style="{ height: `${cat.hours / maxTrendHours * 100}%`, background: CATEGORY_META[cat.category].color }" :title="`${cat.category} ${cat.hours}h`"></span>
                <span v-if="!item.hasRecords" class="stack-zero">0h</span>
              </div>
              <div class="week-col-foot"><strong :class="budgetLabel(item).tone">{{ item.totalHours.toFixed(1) }}h</strong><small>{{ item.bucket.shortRange }}</small><span class="budget-tag" :class="budgetLabel(item).tone">{{ budgetLabel(item).text }}</span></div>
            </div>
          </div>
          <div class="reconcile-line"><span class="eyebrow">RECONCILE · 跨周不重复计入</span><p>各周小时合计 <b>{{ reconciliation.weeklySum.toFixed(1) }}h</b> ＝ 全部历史总投入 <b>{{ reconciliation.total.toFixed(1) }}h</b>，每笔记录仅归属一周。</p></div>
        </article>

        <article class="panel streak-panel"><div class="panel-heading"><div><span class="eyebrow">DECLINING ASSETS</span><h3>连续走低的资产</h3></div></div>
          <div v-if="streaks.length" class="streak-list">
            <div v-for="s in streaks" :key="s.category" class="streak-row"><span class="streak-icon" :style="{ color: CATEGORY_META[s.category].color }">{{ CATEGORY_META[s.category].icon }}</span><div class="streak-body"><strong>{{ s.category }}</strong><small>连续 {{ s.weeksDown }} 周走低 · {{ s.previousHours.toFixed(1) }}h → {{ s.latestHours.toFixed(1) }}h</small></div><span class="streak-badge">↓ {{ s.weeksDown }} 周</span></div>
          </div>
          <p v-else class="muted">近几周各类资产没有连续 3 周严格下降的信号。</p>
        </article>

        <article class="panel category-trend-panel"><div class="panel-heading"><div><span class="eyebrow">CATEGORY BY WEEK</span><h3>各类资产逐周小时</h3></div></div>
          <div class="category-trend-rows">
            <div v-for="cat of CATEGORIES" :key="cat" class="cat-trend-row">
              <div class="cat-trend-name"><i :style="{ background: CATEGORY_META[cat].color }"></i><span>{{ cat }}</span></div>
              <div class="cat-trend-cells">
                <span v-for="item in trend" :key="item.bucket.key" class="cat-cell" :class="{ current: item.bucket.isCurrent, zero: !item.hasRecords }"><i :style="{ height: `${(item.byCategory.find((c) => c.category === cat)?.hours ?? 0) / maxTrendHours * 100}%`, background: CATEGORY_META[cat].color }"></i><small>{{ (item.byCategory.find((c) => c.category === cat)?.hours ?? 0).toFixed(0) }}</small></span>
              </div>
            </div>
          </div>
          <p class="footnote">柱顶数字为当周该资产小时；连续三周严格下降的资产会在左侧面板提示。</p>
        </article>
      </section>

      <section v-else class="content-grid analysis-grid"><article class="panel suggestions-panel"><div class="panel-heading"><div><span class="eyebrow">REBALANCE SIGNALS</span><h3>配置优化建议</h3></div><span class="panel-index">06 / 06</span></div><p class="muted analysis-note">按累计口径（全部 {{ state.records.length }} 笔历史记录）评估；想看周度变化请前往「趋势」。</p><div class="suggestion-list"><div v-for="(tip, index) in tips" :key="tip" class="suggestion"><span>0{{ index + 1 }}</span><p>{{ tip }}</p><b>→</b></div></div></article><article class="panel roi-panel"><div class="panel-heading"><div><span class="eyebrow">RETURN ON INVESTMENT</span><h3>时间 ROI 分析</h3></div></div><div class="roi-list"><div v-for="item in allMetrics" :key="item.category" class="roi-row"><div class="roi-name"><i :style="{ background: item.color }"></i><span>{{ item.category }}</span></div><div class="roi-bar"><span :style="{ width: `${item.roi / 2.5 * 100}%`, background: item.color }"></span></div><strong>{{ item.roi.toFixed(2) }}x</strong></div></div><p class="footnote">ROI 是基于精力恢复、能力复利、关系质量与长期机会成本的个人化估算，不代表财务回报。</p></article></section>
      <p v-if="notice && tab !== '记录'" class="toast">{{ notice }}</p>
    </main>
  </div>
</template>
