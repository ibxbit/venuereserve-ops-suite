import { mount } from "@vue/test-utils";
import { describe, expect, test, vi, beforeEach } from "vitest";
import AvailabilityPage from "../AvailabilityPage.vue";

const api = vi.hoisted(() => ({
  fetchList: vi.fn(),
  fetchAvailability: vi.fn(),
  createBookingException: vi.fn(),
  createEntity: vi.fn(),
}));

vi.mock("../../services/api.js", () => api);

describe("Availability interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    api.fetchList.mockResolvedValue({
      data: [
        {
          id: "room-1",
          name: "Room 1",
          type: "room",
          booking_window_days: 30,
          min_duration_minutes: 30,
          max_duration_minutes: 240,
          early_check_in_minutes: 10,
          late_check_in_grace_minutes: 15,
          allow_slot_stitching: true,
        },
      ],
    });
    api.fetchAvailability.mockResolvedValue({
      slots: [],
      alternatives: [],
      requested: {
        start_time: "2026-04-01T09:00:00.000Z",
        end_time: "2026-04-01T09:30:00.000Z",
        available: true,
        conflicts: [],
      },
      day_rule: {
        source: "standard",
        open_time: "06:00:00",
        close_time: "22:00:00",
      },
    });
    api.createEntity.mockResolvedValue({ data: { id: "res-new-1" } });
  });

  test("can create reservation from requested slot and stage checkout draft", async () => {
    const wrapper = mount(AvailabilityPage);
    await Promise.resolve();
    await Promise.resolve();
    await wrapper.find("form").trigger("submit.prevent");
    await Promise.resolve();

    const button = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Add requested slot to checkout"));
    expect(button).toBeTruthy();

    await button.trigger("click");

    expect(api.createEntity).toHaveBeenCalledWith("reservations", expect.any(Object));
    const draft = JSON.parse(localStorage.getItem("studio-reservation-cart-draft"));
    expect(draft.reservation_lines[0].reservation_id).toBe("res-new-1");
  });

  test("shows advanced reservation policy notes", async () => {
    const wrapper = mount(AvailabilityPage);
    await Promise.resolve();
    await Promise.resolve();

    expect(wrapper.text()).toContain("Reservation Rules");
    expect(wrapper.text()).toContain("Booking window: 30 day(s)");
    expect(wrapper.text()).toContain("Slot stitching: enabled");
    expect(wrapper.text()).toContain("Late grace before no-show: 15 minutes");
  });
});
