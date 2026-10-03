<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { LocalTimeRepository } from '../adapters/local-time.repository';
import { CATEGORIES, CATEGORY_META, type TimeCategory } from '../core/models';
import { balanceSheet, metricsFor, portfolioScore, record, sampleSnapshot, suggestions, totalInvested } from '../core/time-engine';
import { buildWeeklyTrend, categorySeries, consecutiveDeclines, recordsInWeek, round1, weekInfoOf, type WeekInfo, type WeekSummary } from '../core/weeks';

const repo = new LocalTimeRepository();
const tab = ref<'总览' | '记录' | '组合' | '趋势' | '分析'>('总览');
const notice = ref('');
const state = reactive(repo.load());
const accountDraft = reactive({ dailyHours: state.account.dailyHours, weeklyHours: state.account.weeklyHours });
const draft = reactive({ category: '事业' as TimeCategory, hours: 2, note: '' });

// 当前时间每分钟刷新一次，跨午夜时账期与周界自动切换
const now = ref(new Date());
let clock: ReturnType<typeof setInterval>;
onMounted(() => { clock = setInterval(() => { now.value = new Date(); }, 60000); });
onUnmounted(() => { clearInterval(clock); });

// 口径：总览 / 组合 / 分析 / 资产负债表均按当周（自然周）投入统计，与每周可配置小时对比
const currentWeek = computed(() => weekInfoOf(now.value));
const weekRecords = computed(() => recordsInWeek(state.records, now.value));
const metrics = computed(() => metricsFor(weekRecords.value));
const invested = computed(() => totalInvested(weekRecords.value));
const allInvested = computed(() => totalInvested(state.records));
const score = computed(() => portfolioScore(metrics.value, state.account));
const sheet = computed(() => balanceSheet(metrics.value, state.account));
const tips = computed(() => suggestions(metrics.value, state.account));
const recent = computed(() => [...state.records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5));

// 顶部账期：按当前日期实时计算的真实周范围，与趋势图共用 weeks.ts 的周界规则
const heroWeek = computed(() => {
  const info = currentWeek.value;
  const pad = (value: number) => String(value).padStart(2, '0');
  const fmt = (date: Date) => `${pad(date.getMonth() + 1)} / ${pad(date.getDate())}`;
  return { ...info, range: `${fmt(info.start)} — ${fmt(info.end)}` };
});

// 趋势视图：最近若干周逐周汇总，无记录的周补零
const trendWeeks = ref(8);
const trend = computed(() => buildWeeklyTrend(state.records, state.account.weeklyHours, trendWeeks.value, now.value));
const trendMax = computed(() => Math.max(state.account.weeklyHours, ...trend.value.weeks.map((week) => week.total), 1));
const budgetFraction = computed(() => Math.min(1, state.account.weeklyHours / trendMax.value));
const activeWeeks = computed(() => trend.value.weeks.filter((week) => week.hasRecords).length);
const overWeeks = computed(() => trend.value.weeks.filter((week) => week.hasRecords && week.delta > 0).length);
const weekAverage = computed(() => round1(trend.value.windowHours / trendWeeks.value));
const reconciled = computed(() => Math.abs(trend.value.totalHours - allInvested.value) < 0.05);

const categoryTrends = computed(() => CATEGORIES.map((category) => {
  const series = categorySeries(trend.value.weeks, category);
  const current = series[series.length - 1] ?? 0;
  const previous = series[series.length - 2] ?? 0;
  const diff = round1(current - previous);
  // 连降只统计已完成周，进行中的本周不参与，避免周一刚开盘就误报下滑
  const declines = consecutiveDeclines(series.slice(0, -1));
  const meta = CATEGORY_META[category];
  return {
    category, series, declines, current,
    color: meta.color, icon: meta.icon,
    max: Math.max(...series, 1),
    deltaText: diff > 0 ? `较上周 +${diff.toFixed(1)}h` : diff < 0 ? `较上周 ${diff.toFixed(1)}h` : '与上周持平',
    deltaClass: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  };
}));

function fmtWeekRange(week: WeekInfo): string {
  return `${week.start.getMonth() + 1}/${week.start.getDate()}—${week.end.getMonth() + 1}/${week.end.getDate()}`;
}

function badgeOf(week: WeekSummary): { text: string; tone: string } {
  if (!week.hasRecords) return week.isCurrent ? { text: '进行中', tone: 'tone-current' } : { text: '无记录', tone: 'tone-empty' };
  if (week.delta > 0) return { text: `超配 +${week.delta.toFixed(1)}h`, tone: 'tone-over' };
  if (week.delta < 0) return { text: `余量 ${Math.abs(week.delta).toFixed(1)}h`, tone: 'tone-left' };
  return { text: '刚好配平', tone: 'tone-even' };
}

function save() { repo.save({ account: state.account, records: state.records }); }
function updateAccount() { state.account.dailyHours = Math.max(1, Number(accountDraft.dailyHours) || 1); state.account.weeklyHours = Math.max(1, Number(accountDraft.weeklyHours) || 1); state.account.updatedAt = new Date().toISOString(); save(); notice.value = '时间账户已更新'; }
function addRecord() { state.records.unshift(record(draft.category, draft.hours, draft.note)); save(); draft.note = ''; notice.value = '一笔时间投资已入账'; tab.value = '记录'; }
function removeRecord(id: string) { state.records = state.records.filter((item) => item.id !== id); save(); }
function resetDemo() { const fresh = sampleSnapshot(); state.account = fresh.account; state.records = fresh.records; save(); notice.value = '已恢复初始示例组合'; }
</script>

<template>
  <div class="app-shell investment-app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">时</div><div><span class="eyebrow">LIFE CAPITAL / 01</span><h1>人生时间投资所</h1></div></div>
      <div class="top-actions"><span class="live-dot">本周账期进行中</span><button class="ghost-button" type="button" @click="resetDemo">↻ 重置演示</button></div>
    </header>
    <main class="page-wrap">
      <section class="hero-row">
        <div><p class="eyebrow accent-text">个人时间资产管理台</p><h2>把今天的小时，<em>配置成明天的底气。</em></h2><p class="hero-copy">你的时间不是被消耗的余额，而是一支每天都在重新开盘的投资组合。</p></div>
        <div class="hero-date"><span>当前周期</span><strong>WEEK {{ heroWeek.week }}</strong><small>{{ heroWeek.year }} · {{ heroWeek.range }}</small></div>
      </section>
      <nav class="tabs" aria-label="功能模块"><button v-for="item in ['总览', '记录', '组合', '趋势', '分析']" :key="item" type="button" :class="{ active: tab === item }" @click="tab = item as typeof tab">{{ item }}<span v-if="item === '记录'" class="tab-count">{{ state.records.length }}</span></button></nav>

      <section v-if="tab === '总览'" class="content-grid overview-grid">
        <article class="panel account-panel"><div class="panel-heading"><div><span class="eyebrow">TIME ACCOUNT</span><h3>时间账户</h3></div><span class="panel-index">01 / 05</span></div><div class="account-number"><strong>{{ state.account.weeklyHours }}</strong><span>可配置小时 / 周</span></div><div class="meter"><span :style="{ width: `${Math.min(100, invested / state.account.weeklyHours * 100)}%` }"></span></div><div class="split-line"><span>本周已配置 <b>{{ invested.toFixed(1) }}h</b></span><span>本周剩余 <b>{{ Math.max(0, state.account.weeklyHours - invested).toFixed(1) }}h</b></span></div><p class="caliber-note">口径：自然周（周一—周日），仅统计本周投入；逐周趋势与累计对账见「趋势」页。</p><div class="account-form"><label>每日可支配<input v-model.number="accountDraft.dailyHours" type="number" min="1" step="0.5" />小时</label><label>每周可配置<input v-model.number="accountDraft.weeklyHours" type="number" min="1" step="1" />小时</label><button class="primary-button" type="button" @click="updateAccount">更新账户 →</button></div></article>
        <article class="panel score-panel"><div class="panel-heading"><div><span class="eyebrow">PORTFOLIO HEALTH</span><h3>组合健康度</h3></div><span class="caliber-pill">当周口径</span></div><div class="score-layout"><div class="score-ring" :style="{ '--score': `${Math.min(100, score * 20)}%` }"><div><strong>{{ score }}</strong><span>/ 10</span></div></div><div><p class="score-label">复利潜力良好</p><p class="muted">基于本周 {{ weekRecords.length }} 笔投资记录与各资产类别的历史回报估算。</p><div class="legend-list"><span><i class="dot green"></i>配置平衡</span><span><i class="dot yellow"></i>可继续优化</span></div></div></div></article>
        <article class="panel chart-panel"><div class="panel-heading"><div><span class="eyebrow">ALLOCATION MAP</span><h3>时间资产配置</h3></div><div class="heading-side"><span class="caliber-pill">当周口径</span><button class="text-button" type="button" @click="tab = '组合'">查看组合 →</button></div></div><div class="allocation-layout"><div class="donut" :style="{ background: `conic-gradient(${metrics.map((item) => `${item.color} ${item.share * 100}%`).join(', ')})` }"><div><strong>{{ Math.round(invested) }}</strong><span>hours</span></div></div><div class="metric-list"><div v-for="item in metrics" :key="item.category" class="metric-row"><i class="category-symbol" :style="{ color: item.color }">{{ item.icon }}</i><span>{{ item.category }}</span><strong>{{ item.hours.toFixed(1) }}h</strong><small>{{ Math.round(item.share * 100) }}%</small></div></div></div></article>
        <article class="panel ledger-panel"><div class="panel-heading"><div><span class="eyebrow">RECENT ACTIVITY</span><h3>最近投资</h3></div><button class="text-button" type="button" @click="tab = '记录'">全部记录 →</button></div><div class="activity-list"><div v-for="item in recent" :key="item.id" class="activity-row"><span class="activity-icon" :style="{ background: CATEGORY_META[item.category].color }">{{ CATEGORY_META[item.category].icon }}</span><div><strong>{{ item.note }}</strong><small>{{ item.category }} · {{ new Date(item.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) }}</small></div><b>+{{ item.hours }}h</b></div></div></article>
      </section>

      <section v-else-if="tab === '记录'" class="content-grid record-grid"><article class="panel form-panel"><div class="panel-heading"><div><span class="eyebrow">NEW INVESTMENT</span><h3>记录一笔时间</h3></div><span class="panel-index">02 / 05</span></div><p class="muted intro">每一次记录，都是在告诉未来的自己：这段时间值得。</p><label>投资到<select v-model="draft.category"><option v-for="item in CATEGORIES" :key="item" :value="item">{{ item }} · {{ CATEGORY_META[item].label }}</option></select></label><label>投入小时<input v-model.number="draft.hours" type="number" min="0.5" step="0.5" /></label><label>这段时间做了什么<textarea v-model="draft.note" rows="4" placeholder="例如：完成了季度复盘"></textarea></label><button class="primary-button full-button" type="button" @click="addRecord">确认入账 →</button><p class="notice">{{ notice }}</p></article><article class="panel table-panel"><div class="panel-heading"><div><span class="eyebrow">INVESTMENT LEDGER</span><h3>投资流水</h3></div><span class="total-pill">{{ state.records.length }} 笔记录</span></div><div class="ledger-table"><div class="table-head"><span>资产类别</span><span>备注</span><span>小时</span><span>日期</span><span></span></div><div v-for="item in recent" :key="item.id" class="table-row"><span class="category-cell"><i :style="{ color: CATEGORY_META[item.category].color }">{{ CATEGORY_META[item.category].icon }}</i>{{ item.category }}</span><span>{{ item.note }}</span><strong>{{ item.hours }}h</strong><span>{{ new Date(item.date).toLocaleDateString('zh-CN') }}</span><button class="delete-button" type="button" title="删除记录" @click="removeRecord(item.id)">×</button></div></div><p class="footnote">流水为全部历史记录，不做周过滤；总览、组合与分析按当周（自然周）口径统计，逐周分布见「趋势」页。</p></article></section>

      <section v-else-if="tab === '组合'" class="content-grid portfolio-grid"><article class="panel wide-panel"><div class="panel-heading"><div><span class="eyebrow">ASSET ALLOCATION</span><h3>投资组合</h3></div><span class="caliber-pill">当周口径</span></div><div class="portfolio-cards"><div v-for="item in metrics" :key="item.category" class="portfolio-card" :style="{ '--category-color': item.color }"><div class="portfolio-card-top"><span class="portfolio-icon">{{ item.icon }}</span><span>{{ Math.round(item.share * 100) }}%</span></div><h4>{{ item.category }}</h4><p>{{ CATEGORY_META[item.category].label }}</p><div class="mini-meter"><i :style="{ width: `${Math.min(100, item.share * 200)}%` }"></i></div><div class="portfolio-card-foot"><strong>{{ item.hours.toFixed(1) }}h</strong><span>ROI {{ item.roi.toFixed(2) }}x</span></div></div></div></article><article class="panel balance-panel"><div class="panel-heading"><div><span class="eyebrow">LIFE BALANCE SHEET</span><h3>人生资产负债表</h3></div><span class="caliber-pill">当周口径</span></div><div class="balance-figure"><div><span>本周时间资产</span><strong>{{ sheet.assets }} <small>价值点</small></strong></div><div><span>本周未配置负债</span><strong class="liability">{{ sheet.liabilities }} <small>小时</small></strong></div><div class="balance-total"><span>本周净人生资产</span><strong>{{ sheet.equity }}</strong></div></div><p class="footnote">资产、负债与净值均按本周投入计算；历史各周资产负债的消长见「趋势」页。</p></article></section>

      <section v-else-if="tab === '趋势'" class="content-grid trend-grid">
        <article class="panel timeline-panel">
          <div class="panel-heading"><div><span class="eyebrow">WEEKLY TIMELINE</span><h3>逐周投入时间线</h3></div><div class="trend-controls"><button v-for="count in [4, 8, 12]" :key="count" type="button" :class="{ active: trendWeeks === count }" @click="trendWeeks = count">近 {{ count }} 周</button></div></div>
          <div class="timeline-scroll">
            <div class="timeline" :style="{ '--budget': budgetFraction }">
              <div class="budget-line"><span>每周预算 {{ state.account.weeklyHours }}h</span></div>
              <div v-for="week in trend.weeks" :key="week.key" class="week-col" :class="{ current: week.isCurrent, empty: !week.hasRecords }" :title="week.key">
                <div class="week-total">{{ week.total.toFixed(1) }}h</div>
                <div class="week-bar"><template v-for="cat in CATEGORIES" :key="cat"><i v-if="week.byCategory[cat] > 0" :style="{ height: `${week.byCategory[cat] / trendMax * 100}%`, background: CATEGORY_META[cat].color }"></i></template></div>
                <div class="week-meta"><strong>W{{ week.week }}<em v-if="week.isCurrent"> · 本周</em></strong><small>{{ fmtWeekRange(week) }}</small><span class="week-badge" :class="badgeOf(week).tone">{{ badgeOf(week).text }}</span></div>
              </div>
            </div>
          </div>
          <p class="footnote">自然周（周一—周日）切分，每笔记录只计入所属那一周，跨周不重复；无记录的周按 0h 补零展示；本周为进行中账期。</p>
        </article>
        <article class="panel cat-trend-panel">
          <div class="panel-heading"><div><span class="eyebrow">CATEGORY TREND</span><h3>分类走势</h3></div><span class="panel-index">06 / 07</span></div>
          <div class="cat-trend-list">
            <div v-for="item in categoryTrends" :key="item.category" class="cat-trend-row">
              <div class="cat-trend-name"><i :style="{ color: item.color }">{{ item.icon }}</i><span>{{ item.category }}</span></div>
              <div class="spark"><i v-for="(value, index) in item.series" :key="index" :class="{ now: index === item.series.length - 1 }" :style="{ height: `${Math.max(6, value / item.max * 100)}%`, background: item.color, opacity: value ? 1 : 0.18 }" :title="`${value.toFixed(1)}h`"></i></div>
              <div class="cat-trend-delta"><strong>{{ item.current.toFixed(1) }}h</strong><small :class="item.deltaClass">{{ item.deltaText }}</small><em v-if="item.declines >= 2" class="decline-tag">连降 {{ item.declines }} 周</em></div>
            </div>
          </div>
          <p class="footnote">迷你柱为最近 {{ trendWeeks }} 周逐周小时，最后一根为本周（进行中）；连降只统计已完成周。</p>
        </article>
        <article class="panel trend-summary-panel">
          <div class="panel-heading"><div><span class="eyebrow">WEEKLY SUMMARY</span><h3>周度汇总与对账</h3></div><span class="panel-index">07 / 07</span></div>
          <div class="trend-stats">
            <div><span>近 {{ trendWeeks }} 周合计</span><strong>{{ trend.windowHours.toFixed(1) }} <small>h</small></strong></div>
            <div><span>周均投入（含补零周）</span><strong>{{ weekAverage.toFixed(1) }} <small>h / 周</small></strong></div>
            <div><span>超配周数</span><strong>{{ overWeeks }} <small>/ {{ activeWeeks }} 个活跃周</small></strong></div>
            <div><span>更早周合计</span><strong>{{ trend.olderHours.toFixed(1) }} <small>h</small></strong></div>
          </div>
          <p class="footnote reconcile">对账：近 {{ trendWeeks }} 周 {{ trend.windowHours.toFixed(1) }}h + 更早 {{ trend.olderHours.toFixed(1) }}h = 累计 {{ trend.totalHours.toFixed(1) }}h，流水总额 {{ allInvested.toFixed(1) }}h {{ reconciled ? '· 一致 ✓' : '· 存在偏差，请检查记录日期' }}</p>
        </article>
      </section>

      <section v-else class="content-grid analysis-grid"><article class="panel suggestions-panel"><div class="panel-heading"><div><span class="eyebrow">REBALANCE SIGNALS</span><h3>配置优化建议</h3></div><span class="caliber-pill">当周口径</span></div><div class="suggestion-list"><div v-for="(tip, index) in tips" :key="tip" class="suggestion"><span>0{{ index + 1 }}</span><p>{{ tip }}</p><b>→</b></div></div></article><article class="panel roi-panel"><div class="panel-heading"><div><span class="eyebrow">RETURN ON INVESTMENT</span><h3>时间 ROI 分析</h3></div></div><div class="roi-list"><div v-for="item in metrics" :key="item.category" class="roi-row"><div class="roi-name"><i :style="{ background: item.color }"></i><span>{{ item.category }}</span></div><div class="roi-bar"><span :style="{ width: `${item.roi / 2.5 * 100}%`, background: item.color }"></span></div><strong>{{ item.roi.toFixed(2) }}x</strong></div></div><p class="footnote">ROI 是基于精力恢复、能力复利、关系质量与长期机会成本的个人化估算，不代表财务回报。</p></article></section>
      <p v-if="notice && tab !== '记录'" class="toast">{{ notice }}</p>
    </main>
  </div>
</template>
