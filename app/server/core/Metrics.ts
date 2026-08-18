/**
 * Metrics — قياس أداء كل Engine
 * يُخزّن الأرقام للمقارنة والتشخيص
 * Radius Pro Local V2
 */

import { Logger } from './Logger';

interface MetricEntry {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes' | 'percent';
  context?: string;
  timestamp: number;
}

interface MetricSummary {
  name: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  last: number;
  unit: string;
}

class MetricsService {
  private entries: MetricEntry[] = [];
  private readonly MAX_ENTRIES = 10_000;

  record(
    name: string,
    value: number,
    options?: { unit?: MetricEntry['unit']; context?: string }
  ): void {
    this.entries.push({
      name,
      value,
      unit: options?.unit ?? 'ms',
      context: options?.context,
      timestamp: Date.now(),
    });

    // تنظيف الإدخالات القديمة
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries = this.entries.slice(-this.MAX_ENTRIES);
    }
  }

  /** وقت تنفيذ دالة وتسجيله */
  async time<T>(name: string, fn: () => Promise<T>, context?: string): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.record(name, Date.now() - start, { unit: 'ms', context });
    }
  }

  /** ملخص إحصائي لمقياس معين */
  summary(name: string): MetricSummary | null {
    const relevant = this.entries.filter(e => e.name === name);
    if (relevant.length === 0) return null;

    const values = relevant.map(e => e.value);
    return {
      name,
      count: values.length,
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
      last: values[values.length - 1] ?? 0,
      unit: relevant[0]?.unit ?? 'ms',
    };
  }

  /** جميع المقاييس المتاحة */
  allSummaries(): MetricSummary[] {
    const names = Array.from(new Set(this.entries.map(e => e.name)));
    return names.map(n => this.summary(n)).filter(Boolean) as MetricSummary[];
  }

  /** طباعة ملخص الأداء */
  printReport(): void {
    const summaries = this.allSummaries();
    Logger.info(`=== Metrics Report (${summaries.length} metrics) ===`, { context: 'Metrics' });
    for (const s of summaries) {
      Logger.info(`  ${s.name}: avg=${s.avg}${s.unit} min=${s.min} max=${s.max} count=${s.count}`, {
        context: 'Metrics',
      });
    }
  }

  clear(): void {
    this.entries = [];
  }
}

export const Metrics = new MetricsService();
