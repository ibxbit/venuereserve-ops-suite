import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RoleDashboardPage from "../RoleDashboardPage.vue";

const api = vi.hoisted(() => ({
  fetchRoleDashboard: vi.fn(),
  fetchReport: vi.fn(),
}));

vi.mock("../../services/api.js", () => api);

describe("Role dashboard coverage", () => {
  beforeEach(() => {
    api.fetchRoleDashboard.mockResolvedValue({
      role: "member",
      dashboard: {
        title: "Dashboard",
        highlights: ["local highlight"],
      },
      permissions: [],
    });
    api.fetchReport.mockResolvedValue({ ok: 1 });
  });

  test("renders for each role profile without crashing", async () => {
    const roles = ["member", "front-desk", "manager", "moderator", "auditor"];
    for (const role of roles) {
      localStorage.setItem("studio-active-role", role);
      const wrapper = mount(RoleDashboardPage);
      await flushPromises();
      expect(wrapper.text()).toContain("Role Focus");
      wrapper.unmount();
    }
  });
});
