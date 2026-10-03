import type { InvestmentRecord, TimeCategory } from './models';
import { CATEGORIES } from './models';

/**
 * 周界规则（全应用唯一口径）：
 * - 本地时区，自然周 = 周一 00:00 至周日 23:59
 * - 周编号采用 ISO-8601（week 1 为包含首个周四的那一周）
 * - weekKey 使用 ISO 周年与周数，避免跨年时周序混乱
 * 顶部账期、周趋势、周汇总均通过本模块计算，禁止各视图另写一套日期规则。
 */

const DAY_MS = 86_400_000;

/** 取本地日期（去掉时分秒） */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** ISO 周几：周一=1 … 周日=7 */
function isoWeekday(date: Date): number {
  return date.getDay() || 7;
}

/** 所在自然周的周一（本地 00:00） */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return new Date(day.getTime() - (isoWeekday(day) - 1) * DAY_MS);
}

/** 所在自然周的周日（本地 00:00） */
export function endOfWeek(date: Date): Date {
  return new Date(startOfWeek(date).getTime() + 6 * DAY_MS);
}

/** ISO 周年与周数：以该周周四所在日历年为周年（标准算法，自动处理跨年与第 53 周） */
function isoYearAndWeek(monday: Date): { year: number; week: number } {
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getFullYear();
  // ISO 第 1 周的周一 = 当年 1 月 4 日所在周的周一
  const jan4 = new Date(year, 0, 4);
  const week1Monday = new Date(jan4.getTime() - ((jan4.getDay() || 7) - 1) * DAY_MS);
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * DAY_MS)) + 1;
  return { year, week };
}

/** ISO-8601 周年号（年初年末可能与日历年不一致） */
function isoWeekYear(monday: Date): number {
  return isoYearAndWeek(monday).year;
}

/** 该周一对应的 ISO 周序号（1-53） */
export function isoWeekNumber(date: Date): number {
  return isoYearAndWeek(startOfWeek(date)).week;
}

export interface WeekBucket {
  /** ISO 周键，如 2026-W40，全应用唯一分组键 */
  key: string;
  year: number;
  weekNumber: number;
  monday: Date;
  sunday: Date;
  label: string;
  range: string;
  shortRange: string;
  isCurrent: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function weekBucket(date: Date, now: Date = new Date()): WeekBucket {
  const monday = startOfWeek(date);
  const sunday = endOfWeek(date);
  const year = isoWeekYear(monday);
  const weekNumber = isoWeekNumber(date);
  const currentMonday = startOfWeek(now);
  return {
    key: `${year}-W${pad(weekNumber)}`,
    year,
    weekNumber,
    monday,
    sunday,
    label: `WEEK ${weekNumber}`,
    range: `${monday.getFullYear()} · ${pad(monday.getMonth() + 1)} / ${pad(monday.getDate())} — ${pad(sunday.getMonth() + 1)} / ${pad(sunday.getDate())}`,
    shortRange: `${pad(monday.getMonth() + 1)}/${pad(monday.getDate())} – ${pad(sunday.getMonth() + 1)}/${pad(sunday.getDate())}`,
    isCurrent: monday.getTime() === currentMonday.getTime(),
  };
}

/** 某笔记录所属的周（按记录日期归入唯一一周，不跨周重复） */
export function weekOfRecord(item: InvestmentRecord, now: Date = new Date()): WeekBucket {
  return weekBucket(new Date(item.date), now);
}

export function currentWeek(now: Date = new Date()): WeekBucket {
  return weekBucket(now, now);
}

/** 取从当前周向前连续 weekCount 周（含本周），无记录的周也补零，不跳过 */
export function recentWeeks(weekCount: number, now: Date = new Date()): WeekBucket[] {
  const currentMonday = startOfWeek(now);
  const weeks: WeekBucket[] = [];
  for (let offset = weekCount - 1; offset >= 0; offset -= 1) {
    const monday = new Date(currentMonday.getTime() - offset * 7 * DAY_MS);
    weeks.push(weekBucket(monday, now));
  }
  return weeks;
}

/** 记录按周归集的索引：每条记录只计入一个周键 */
export function indexRecordsByWeek(
  records: InvestmentRecord[],
  now: Date = new Date(),
): Map<string, InvestmentRecord[]> {
  const map = new Map<string, InvestmentRecord[]>();
  for (const item of records) {
    const key = weekOfRecord(item, now).key;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export interface WeekCategoryHours {
  category: TimeCategory;
  hours: number;
}

export interface WeekSummary {
  bucket: WeekBucket;
  totalHours: number;
  /** 与上一周（窗口内或历史中紧邻的那一周）总投入之差 */
  deltaFromPrevious: number | null;
  hasRecords: boolean;
  byCategory: WeekCategoryHours[];
}

function summarize(bucket: WeekBucket, items: InvestmentRecord[], previousTotal: number | null): WeekSummary {
  const byCategory = CATEGORIES.map((category) => ({
    category,
    hours: items
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + item.hours, 0),
  }));
  const totalHours = items.reduce((sum, item) => sum + item.hours, 0);
  return {
    bucket,
    totalHours,
    deltaFromPrevious: previousTotal === null ? null : Math.round((totalHours - previousTotal) * 10) / 10,
    hasRecords: items.length > 0,
    byCategory,
  };
}

/**
 * 最近若干周的逐周汇总。无记录的周补零；delta 沿周序对齐，
 * 最早展示周的上一周若在历史中有数据也会参与环比计算。
 */
export function weeklyTrend(
  records: InvestmentRecord[],
  weekCount: number,
  now: Date = new Date(),
): WeekSummary[] {
  const indexed = indexRecordsByWeek(records, now);
  const weeks = recentWeeks(weekCount, now);
  return weeks.map((bucket, index) => {
    const items = indexed.get(bucket.key) ?? [];
    let previousTotal: number | null = null;
    if (index > 0) {
      previousTotal = (indexed.get(weeks[index - 1].key) ?? []).reduce((sum, item) => sum + item.hours, 0);
    } else {
      const previousMonday = new Date(bucket.monday.getTime() - 7 * DAY_MS);
      const previousKey = weekBucket(previousMonday, now).key;
      if (indexed.has(previousKey)) {
        previousTotal = (indexed.get(previousKey) ?? []).reduce((sum, item) => sum + item.hours, 0);
      }
    }
    return summarize(bucket, items, previousTotal);
  });
}

/** 某一指定周内的记录（总览当周口径使用） */
export function recordsInWeek(records: InvestmentRecord[], bucket: WeekBucket): InvestmentRecord[] {
  const start = bucket.monday.getTime();
  const end = bucket.sunday.getTime() + DAY_MS - 1;
  return records.filter((item) => {
    const time = new Date(item.date).getTime();
    return time >= start && time <= end;
  });
}

export interface CategoryStreak {
  category: TimeCategory;
  /** 连续走低的周数（含开始下降的那一周）；严格下降，持平不计 */
  weeksDown: number;
  /** 最近一周该类别小时 */
  latestHours: number;
  /** 上一周该类别小时（streak 起点的前一周） */
  previousHours: number;
}

/**
 * 检测各类资产连续走低的周数：基于全部历史按周排列（无记录周按 0），
 * 从最近一周向前回溯，遇到非严格下降即停止。只在 >=3 周走低时提示。
 */
export function decliningStreaks(
  records: InvestmentRecord[],
  minWeeksDown = 3,
  now: Date = new Date(),
): CategoryStreak[] {
  if (!records.length) return [];
  const indexed = indexRecordsByWeek(records, now);
  const earliest = records.reduce((min, item) => Math.min(min, new Date(item.date).getTime()), Infinity);
  const firstMonday = startOfWeek(new Date(earliest));
  const currentMonday = startOfWeek(now);
  const spanWeeks = Math.round((currentMonday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;
  const allKeys: string[] = [];
  for (let offset = spanWeeks - 1; offset >= 0; offset -= 1) {
    allKeys.push(weekBucket(new Date(currentMonday.getTime() - offset * 7 * DAY_MS), now).key);
  }
  const result: CategoryStreak[] = [];
  for (const category of CATEGORIES) {
    const series = allKeys.map((key) =>
      (indexed.get(key) ?? []).filter((item) => item.category === category).reduce((sum, item) => sum + item.hours, 0),
    );
    let weeksDown = 1;
    for (let i = series.length - 1; i > 0; i -= 1) {
      if (series[i] < series[i - 1]) weeksDown += 1;
      else break;
    }
    if (weeksDown >= minWeeksDown && series[series.length - 1] < series[series.length - 1 - (weeksDown - 1)]) {
      result.push({
        category,
        weeksDown,
        latestHours: series[series.length - 1],
        previousHours: series[series.length - 1 - (weeksDown - 1)],
      });
    }
  }
  // 走低最久的排前面
  return result.sort((a, b) => b.weeksDown - a.weeksDown);
}

/** 对账：各周小时之和（不重复计入），应等于全部历史总投入 */
export function sumOfWeeklyHours(records: InvestmentRecord[], now: Date = new Date()): number {
  const indexed = indexRecordsByWeek(records, now);
  let total = 0;
  for (const items of indexed.values()) {
    total += items.reduce((sum, item) => sum + item.hours, 0);
  }
  return Math.round(total * 10) / 10;
}

/** 周预算对比结果：超配为正，余额为负 */
export function weeklyBudgetStatus(totalHours: number, weeklyHours: number) {
  const diff = Math.round((totalHours - weeklyHours) * 10) / 10;
  return {
    over: diff > 0,
    balanced: diff === 0,
    /** 超配小时（超配时 > 0，否则 0） */
    overHours: Math.max(0, diff),
    /** 剩余小时（有余额时 > 0，否则 0） */
    remainingHours: Math.max(0, -diff),
    ratio: weeklyHours > 0 ? Math.min(1, totalHours / weeklyHours) : 0,
  };
}

export function formatHours(value: number): string {
  return `${value.toFixed(1)}h`;
}
