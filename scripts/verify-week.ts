import { strict as assert } from 'node:assert';
import {
  weekBucket, currentWeek, weeklyTrend, decliningStreaks, sumOfWeeklyHours,
  indexRecordsByWeek, recordsInWeek, weeklyBudgetStatus, startOfWeek,
} from '../src/core/week';
import type { InvestmentRecord } from '../src/core/models';
import { sampleSnapshot } from '../src/core/time-engine';

let pass = 0;
function check(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`✓ ${name}`);
}

// 固定"今天"为 2026-10-03（周六）
const NOW = new Date(2026, 9, 3, 14, 0, 0);

check('本周一为 2026-09-28（周一）', () => {
  const mon = startOfWeek(NOW);
  assert.equal(mon.getFullYear(), 2026);
  assert.equal(mon.getMonth(), 8);
  assert.equal(mon.getDate(), 28);
  assert.equal(mon.getDay(), 1);
});

check('账期范围为 09/28 — 10/04，ISO 周号 40', () => {
  const w = currentWeek(NOW);
  assert.equal(w.key, '2026-W40');
  assert.equal(w.label, 'WEEK 40');
  assert.ok(w.range.includes('09 / 28'));
  assert.ok(w.range.includes('10 / 04'));
  assert.equal(w.isCurrent, true);
});

check('周日(10/04)与下周一(10/05)分属不同周', () => {
  const sunday = weekBucket(new Date(2026, 9, 4), NOW);
  const monday = weekBucket(new Date(2026, 9, 5), NOW);
  assert.equal(sunday.key, '2026-W40');
  assert.equal(monday.key, '2026-W41');
});

check('周一凌晨与周日深夜归入同一周', () => {
  const early = weekBucket(new Date(2026, 9, 5, 0, 1), NOW);
  const late = weekBucket(new Date(2026, 9, 11, 23, 59), NOW);
  assert.equal(early.key, late.key);
  assert.equal(early.key, '2026-W41');
});

check('跨年 ISO 周：2027-01-01（周五）属于 2026-W53', () => {
  const d = new Date(2027, 0, 1);
  const w = weekBucket(d, NOW);
  assert.equal(w.key, '2026-W53');
});

check('跨年另一侧：2027-01-04（周一）属于 2027-W01', () => {
  const w = weekBucket(new Date(2027, 0, 4), NOW);
  assert.equal(w.key, '2027-W01');
});

check('2026-12-28（周一）与 2027-01-03（周日）同属 2026-W53', () => {
  const a = weekBucket(new Date(2026, 11, 28), NOW);
  const b = weekBucket(new Date(2027, 0, 3), NOW);
  assert.equal(a.key, '2026-W53');
  assert.equal(b.key, '2026-W53');
});

check('示例快照 36 笔记录，最近 6 周有数据、更早 2 周补零', () => {
  const snap = sampleSnapshot.call(null);
  // sampleSnapshot 用真实当前日期；这里直接以真实 now 校验
  const trend = weeklyTrend(snap.records, 8);
  assert.equal(snap.records.length, 36);
  assert.equal(trend[0].hasRecords, false);
  assert.equal(trend[1].hasRecords, false);
  for (let i = 2; i < 8; i++) assert.equal(trend[i].hasRecords, true);
  assert.equal(trend[7].bucket.isCurrent, true);
});

check('逐周合计与种子数据一致（75,64,53,47,44,38）', () => {
  const snap = sampleSnapshot.call(null);
  const trend = weeklyTrend(snap.records, 8);
  const totals = trend.map((t) => t.totalHours);
  assert.deepEqual(totals, [0, 0, 75, 64, 53, 47, 44, 38]);
});

check('环比 delta 正确，空周为 0 且可参与环比', () => {
  const snap = sampleSnapshot.call(null);
  const trend = weeklyTrend(snap.records, 8);
  assert.equal(trend[0].deltaFromPrevious, null); // 窗口外更早周无数据
  assert.equal(trend[1].deltaFromPrevious, 0);   // 0 -> 0
  assert.equal(trend[2].deltaFromPrevious, 75);  // 空周 0 -> 75
  assert.equal(trend[3].deltaFromPrevious, -11);
  assert.equal(trend[7].deltaFromPrevious, -6);
});

check('每笔记录只归属一周（不重复计入）且各周之和=总投入', () => {
  const snap = sampleSnapshot.call(null);
  const indexed = indexRecordsByWeek(snap.records);
  let count = 0;
  for (const list of indexed.values()) count += list.length;
  assert.equal(count, snap.records.length);
  assert.equal(sumOfWeeklyHours(snap.records), 321);
  const total = snap.records.reduce((s, r) => s + r.hours, 0);
  assert.equal(sumOfWeeklyHours(snap.records), Math.round(total * 10) / 10);
});

check('事业连续 6 周走低被检出，其他类别不触发(>=3)', () => {
  const snap = sampleSnapshot.call(null);
  const streaks = decliningStreaks(snap.records, 3);
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].category, '事业');
  assert.equal(streaks[0].weeksDown, 6);
  assert.equal(streaks[0].latestHours, 6);
  assert.equal(streaks[0].previousHours, 30);
});

check('预算状态：超配/余额/配满', () => {
  assert.equal(weeklyBudgetStatus(64, 56).over, true);
  assert.equal(weeklyBudgetStatus(64, 56).overHours, 8);
  assert.equal(weeklyBudgetStatus(38, 56).remainingHours, 18);
  assert.equal(weeklyBudgetStatus(56, 56).balanced, true);
});

check('recordsInWeek 边界：周一 00:00 与周日 23:59 均计入', () => {
  const w = currentWeek(NOW);
  const recs: InvestmentRecord[] = [
    { id: '1', category: '学习', hours: 1, note: 'a', date: new Date(2026, 8, 28, 0, 0).toISOString() },
    { id: '2', category: '学习', hours: 2, note: 'b', date: new Date(2026, 9, 4, 23, 59).toISOString() },
    { id: '3', category: '学习', hours: 4, note: 'c', date: new Date(2026, 9, 5, 0, 0).toISOString() },
  ];
  const inside = recordsInWeek(recs, w);
  assert.deepEqual(inside.map((r) => r.id).sort(), ['1', '2']);
});

console.log(`\n全部 ${pass} 项校验通过`);
