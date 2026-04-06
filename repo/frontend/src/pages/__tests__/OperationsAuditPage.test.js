import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import OperationsAuditPage from "../OperationsAuditPage.vue";

const api = vi.hoisted(() => ({
  fetchAuditTrails: vi.fn(),
  fetchDailyReconciliation: vi.fn(),
  fetchList: vi.fn(),
  fetchSecurityEvents: vi.fn(),
  fetchShiftReconciliation: vi.fn(),
  submitShiftClose: vi.fn(),
}));

vi.mock("../../services/api.js", () => api);

describe("Operations audit page", () => {
  beforeEach(() => {
    api.fetchAuditTrails.mockResolvedValue({
      data: [
        {
          id: "aud-1",
          entity: "orders",
          action: "checkout",
          entity_id: "grp-1",
          actor_user_id: "manager-1",
          created_at: "2026-04-01T10:00:00.000Z",
        },
      ],
    });
    api.fetchDailyReconciliation.mockResolvedValue({
      date: "2026-04-01",
      overall_total: 120,
      totals_by_method: [{ payment_method: "cash", total: 120 }],
    });
    api.fetchSecurityEvents.mockResolvedValue({
      data: [
        {
          id: "sec-1",
          severity: "critical",
          event_type: "permission_change",
          source_ip: "127.0.0.1",
          created_at: "2026-04-01T09:30:00.000Z",
        },
      ],
    });
    api.fetchList.mockResolvedValue({
      data: [
        {
          id: "fin-1",
          entry_hash: "hash-1",
          previous_hash: null,
          created_at: "2026-04-01T09:00:00.000Z",
        },
        {
          id: "fin-2",
          entry_hash: "hash-2",
          previous_hash: "wrong",
          created_at: "2026-04-01T09:05:00.000Z",
        },
      ],
    });
    api.fetchShiftReconciliation.mockResolvedValue([]);
    api.submitShiftClose.mockResolvedValue({
      shift_key: "shift-a",
      variance_amount: 8,
    });
  });

  test("renders anomaly alerts and audit browser", async () => {
    const wrapper = mount(OperationsAuditPage);
    await Promise.resolve();
    await Promise.resolve();

    expect(wrapper.text()).toContain("Operations Audit and Reconciliation");
    expect(wrapper.text()).toContain("Potential log chain mismatch");
    expect(wrapper.text()).toContain("permission_change");
    expect(wrapper.text()).toContain("Audit Trail Browser");
  });
});
