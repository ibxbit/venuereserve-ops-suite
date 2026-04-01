import {
  calculateStandingScore,
  isPeakHour,
  normalizeStandingPolicy,
} from "../../src/services/account-standing-service.js";

describe("account-standing-service", () => {
  test("calculateStandingScore applies deductions and rewards", () => {
    const score = calculateStandingScore({
      policy: { no_show_penalty_points: 25, check_in_reward_points: 2 },
      attendanceSummary: { no_show_count: 2, check_in_count: 5 },
    });
    expect(score).toBe(60);
  });

  test("calculateStandingScore clamps to [0, 100]", () => {
    const low = calculateStandingScore({
      policy: { no_show_penalty_points: 80, check_in_reward_points: 0 },
      attendanceSummary: { no_show_count: 2, check_in_count: 0 },
    });
    const high = calculateStandingScore({
      policy: { no_show_penalty_points: 0, check_in_reward_points: 50 },
      attendanceSummary: { no_show_count: 0, check_in_count: 2 },
    });
    expect(low).toBe(0);
    expect(high).toBe(100);
  });

  test("isPeakHour works for same-day interval", () => {
    const policy = { peak_start_time: "17:00:00", peak_end_time: "20:00:00" };
    expect(isPeakHour(new Date("2026-01-01T17:30:00"), policy)).toBe(true);
    expect(isPeakHour(new Date("2026-01-01T20:00:00"), policy)).toBe(false);
  });

  test("isPeakHour works for overnight interval", () => {
    const policy = { peak_start_time: "22:00:00", peak_end_time: "02:00:00" };
    expect(isPeakHour(new Date("2026-01-01T23:00:00"), policy)).toBe(true);
    expect(isPeakHour(new Date("2026-01-01T01:00:00"), policy)).toBe(true);
    expect(isPeakHour(new Date("2026-01-01T15:00:00"), policy)).toBe(false);
  });

  test("normalizeStandingPolicy applies defaults", () => {
    const normalized = normalizeStandingPolicy({ id: "x", name: "Y" });
    expect(normalized.lookback_days).toBe(30);
    expect(normalized.low_score_threshold).toBe(60);
    expect(normalized.peak_start_time).toBe("17:00:00");
  });
});
