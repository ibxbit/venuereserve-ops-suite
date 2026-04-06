import { describe, expect, test } from "vitest";
import {
  formatCouponRule,
  validateReservationRequestForm,
} from "../client-helpers.js";

describe("client helpers", () => {
  test("validates booking window and duration constraints", () => {
    const resource = {
      booking_window_days: 1,
      min_duration_minutes: 30,
      max_duration_minutes: 120,
    };
    const tomorrowPlus = new Date();
    tomorrowPlus.setDate(tomorrowPlus.getDate() + 3);

    const errors = validateReservationRequestForm(
      {
        user_id: "",
        date: tomorrowPlus.toISOString().slice(0, 10),
        start_time: "09:15",
        duration_minutes: 25,
      },
      resource,
    );

    expect(errors.join(" ")).toContain("Member/User ID is required");
    expect(errors.join(" ")).toContain("30-minute increments");
    expect(errors.join(" ")).toContain("below minimum");
    expect(errors.join(" ")).toContain("booking window");
  });

  test("formats fixed and percent coupon rules", () => {
    expect(
      formatCouponRule({
        discount_type: "fixed",
        discount_value: 10,
        applies_to_category: "",
        min_subtotal: 75,
        max_discount: null,
      }),
    ).toBe("$10 off | cart-wide | min subtotal $75");

    expect(
      formatCouponRule({
        discount_type: "percent",
        discount_value: 15,
        applies_to_category: "class_pack",
        min_subtotal: 0,
        max_discount: 25,
      }),
    ).toBe("15% off | on class pack | max discount $25");
  });
});
