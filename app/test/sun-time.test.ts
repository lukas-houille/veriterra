import { describe, expect, it } from 'vitest';
import { dateForDayOfYear, dayOfYear, seasonLabel, timestampFor } from '@/lib/sun/sun-time';

describe('sun-time', () => {
  it('timestampFor : epoch ms local depuis une date et des minutes du jour', () => {
    const d = new Date(timestampFor('2026-06-21', 12 * 60 + 30));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // juin (0-indexé)
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(30);
  });

  it('dateForDayOfYear et dayOfYear sont réciproques et bornés (0..364)', () => {
    expect(dateForDayOfYear(2026, 0)).toBe('2026-01-01');
    expect(dayOfYear('2026-01-01')).toBe(0);
    expect(dayOfYear(dateForDayOfYear(2026, 180))).toBe(180);
    expect(dayOfYear(dateForDayOfYear(2026, 999))).toBe(364); // borné en haut
    expect(dayOfYear(dateForDayOfYear(2026, -5))).toBe(0); // borné en bas
  });

  it('seasonLabel : hémisphère nord', () => {
    expect(seasonLabel('2026-01-15')).toBe('Hiver');
    expect(seasonLabel('2026-04-15')).toBe('Printemps');
    expect(seasonLabel('2026-07-15')).toBe('Été');
    expect(seasonLabel('2026-10-15')).toBe('Automne');
    expect(seasonLabel('2026-12-15')).toBe('Hiver');
  });
});
