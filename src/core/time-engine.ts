import type { CategoryMetric, InvestmentRecord, TimeAccount, TimeCategory } from './models';
import { CATEGORIES, CATEGORY_META } from './models';

export function totalInvested(records: InvestmentRecord[]): number {
  return records.reduce((sum, item) => sum + item.hours, 0);
}

export function metricsFor(records: InvestmentRecord[]): CategoryMetric[] {
  const total = totalInvested(records);
  return CATEGORIES.map((category) => {
    const hours = records.filter((item) => item.category === category).reduce((sum, item) => sum + item.hours, 0);
    const meta = CATEGORY_META[category];
    return { category, hours, share: total ? hours / total : 0, roi: meta.roi, color: meta.color, icon: meta.icon };
  });
}

export function portfolioScore(metrics: CategoryMetric[], account: TimeAccount): number {
  const invested = metrics.reduce((sum, item) => sum + item.hours * item.roi, 0);
  const available = Math.max(account.weeklyHours, 1);
  return Math.round((invested / available) * 10) / 10;
}

export function balanceSheet(metrics: CategoryMetric[], account: TimeAccount) {
  const assets = metrics.reduce((sum, item) => sum + item.hours * item.roi, 0);
  const invested = metrics.reduce((sum, item) => sum + item.hours, 0);
  return { assets: Math.round(assets * 10) / 10, liabilities: Math.max(0, Math.round((account.weeklyHours - invested) * 10) / 10), equity: Math.round((assets - Math.max(0, account.weeklyHours - invested)) * 10) / 10 };
}

export function suggestions(metrics: CategoryMetric[], account: TimeAccount): string[] {
  const total = Math.max(metrics.reduce((sum, item) => sum + item.hours, 0), 1);
  const lowest = [...metrics].sort((a, b) => a.hours - b.hours)[0];
  const highest = [...metrics].sort((a, b) => b.hours - a.hours)[0];
  const result: string[] = [];
  if (highest.share > 0.35) result.push(`「${highest.category}」占比 ${Math.round(highest.share * 100)}%，建议每周拿出 2 小时投向低配资产。`);
  if (lowest.share < 0.1) result.push(`「${lowest.category}」只有 ${Math.round(lowest.share * 100)}%，这是当前最值得补仓的长期资产。`);
  if (account.weeklyHours - total > 4) result.push(`还有 ${Math.round(account.weeklyHours - total)} 小时未被配置，可以先建立一笔“探索基金”。`);
  if (!result.length) result.push('你的时间组合分布稳定，继续用每周复盘保持动态平衡。');
  return result;
}

export function record(category: TimeCategory, hours: number, note: string, date = new Date().toISOString()): InvestmentRecord {
  return { id: `time-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category, hours: Math.max(0.5, Number(hours) || 0.5), note: note.trim() || '未命名投资', date };
}

export function sampleSnapshot() {
  const account: TimeAccount = { dailyHours: 8, weeklyHours: 56, updatedAt: new Date().toISOString() };
  // 按自然周（周一至周日）生成最近六周的示例记录；更早两周留空，用于展示空周补零。
  const notes: Record<TimeCategory, string> = {
    健康: '力量训练与散步', 学习: '阅读与课程', 关系: '陪伴家人和朋友',
    事业: '产品策略与交付', 娱乐: '电影与游戏', 休息: '睡眠与留白',
  };
  // 每周各类别小时，顺序为 [健康, 学习, 关系, 事业, 娱乐, 休息]
  const weeklySeed: Array<[number, number, number, number, number, number]> = [
    [10, 12, 10, 30, 5, 8], // 距今 5 周：75h，超配
    [8, 10, 8, 24, 5, 9],   // 4 周前：64h，超配
    [7, 8, 7, 18, 4, 9],    // 3 周前：53h
    [6, 9, 6, 14, 4, 8],    // 2 周前：47h
    [5, 10, 7, 10, 3, 9],   // 上周：44h
    [7, 6, 8, 6, 4, 7],     // 本周：38h
  ];
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(day.getTime() - ((day.getDay() || 7) - 1) * 86400000);
  const records: InvestmentRecord[] = [];
  weeklySeed.forEach((hoursByCategory, weekIndex) => {
    // 记录落在该周的周三；距今 5 周那批也均为过去日期
    const recordDate = new Date(monday.getTime() - (weeklySeed.length - 1 - weekIndex) * 7 * 86400000 + 2 * 86400000);
    CATEGORIES.forEach((category, categoryIndex) => {
      const hours = hoursByCategory[categoryIndex];
      if (hours > 0) records.push(record(category, hours, notes[category], recordDate.toISOString()));
    });
  });
  return { account, records };
}
