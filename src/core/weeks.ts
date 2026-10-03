import type { InvestmentRecord, TimeCategory } from './models';
import { CATEGORIES } from './models';

/**
 * 周界规则（顶部账期与趋势视图共用同一套口径）：
 * - 自然周：周一 00:00 为起点，周日 24:00 为终点，按本地时区计算
 * - 周编号：ISO-8601 周（以周四所在年为准），key 形如 2026-W40
 * - 每笔记录按 record.date 归入唯一一个自然周，跨周不重复计入
 * - 没有记录的周在趋势中补零展示，保证时间线连续
 */

export interface WeekInfo {
  year: number;
  week: number;
  key: string;
  start: Date;
  end: Date;
}

export interface WeekSummary extends WeekInfo {
  total: number;
  byCategory: Record<TimeCategory, number>;
  /** total - weeklyHours：> 0 当周超配，< 0 仍有余额 */
  delta: number;
  /** false 表示补零周（该周没有任何记录） */
  hasRecords: boolean;
  isCurrent: boolean;
}

export interface WeeklyTrend {
  /** 最近 weekCount 周（含本周，按时间升序），无记录的周补零 */
  weeks: WeekSummary[];
  /** 展示窗口内各周合计 */
  windowHours: number;
  /** 窗口之前更早各周的合计 */
  olderHours: number;
  /** 全部有效记录合计 = windowHours + olderHours，用于与流水总额对账 */
  totalHours: number;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** 所在自然周的周一 00:00（本地时区） */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** ISO-8601 周编号 */
export function isoWeek(date: Date): { year: number; week: number } {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: day.getUTCFullYear(), week };
}

export function weekInfoOf(date: Date): WeekInfo {
  const start = startOfWeek(date);
  const { year, week } = isoWeek(start);
  return { year, week, key: `${year}-W${String(week).padStart(2, '0')}`, start, end: addDays(start, 6) };
}

/** 与 date 同一自然周内的全部记录 */
export function recordsInWeek(records: InvestmentRecord[], date: Date): InvestmentRecord[] {
  const key = weekInfoOf(date).key;
  return records.filter((item) => {
    const time = new Date(item.date);
    return !Number.isNaN(time.getTime()) && weekInfoOf(time).key === key;
  });
}

function emptyByCategory(): Record<TimeCategory, number> {
  return Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<TimeCategory, number>;
}

/**
 * 把全部记录按自然周分桶，取最近 weekCount 周（含本周）生成时间线。
 * 窗口外更早的记录只汇入 olderHours，保证 windowHours + olderHours = 全部记录合计。
 */
export function buildWeeklyTrend(records: InvestmentRecord[], weeklyHours: number, weekCount: number, now = new Date()): WeeklyTrend {
  const current = weekInfoOf(now);
  const buckets = new Map<string, { total: number; byCategory: Record<TimeCategory, number> }>();
  let totalHours = 0;
  for (const item of records) {
    const time = new Date(item.date);
    if (Number.isNaN(time.getTime())) continue;
    const key = weekInfoOf(time).key;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { total: 0, byCategory: emptyByCategory() };
      buckets.set(key, bucket);
    }
    bucket.total += item.hours;
    bucket.byCategory[item.category] += item.hours;
    totalHours += item.hours;
  }
  const weeks: WeekSummary[] = [];
  for (let index = weekCount - 1; index >= 0; index--) {
    const info = weekInfoOf(addDays(current.start, -index * 7));
    const bucket = buckets.get(info.key);
    const total = round1(bucket?.total ?? 0);
    weeks.push({
      ...info,
      total,
      byCategory: bucket?.byCategory ?? emptyByCategory(),
      delta: round1(total - weeklyHours),
      hasRecords: Boolean(bucket),
      isCurrent: info.key === current.key,
    });
  }
  const windowHours = round1(weeks.reduce((sum, week) => sum + week.total, 0));
  return { weeks, windowHours, olderHours: round1(totalHours - windowHours), totalHours: round1(totalHours) };
}

/** 某类资产在趋势窗口内逐周的小时序列（与 weeks 同序） */
export function categorySeries(weeks: WeekSummary[], category: TimeCategory): number[] {
  return weeks.map((week) => round1(week.byCategory[category]));
}

/** 序列末尾连续严格下滑的周数（传入已完成周序列，进行中的本周不参与） */
export function consecutiveDeclines(series: number[]): number {
  let count = 0;
  for (let index = series.length - 1; index > 0; index--) {
    if (series[index] < series[index - 1]) count++;
    else break;
  }
  return count;
}
