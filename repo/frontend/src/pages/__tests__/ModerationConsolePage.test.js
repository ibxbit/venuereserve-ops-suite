import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ModerationConsolePage from "../ModerationConsolePage.vue";

const api = vi.hoisted(() => ({
  fetchCommunityModerationQueue: vi.fn(),
  decideCommunityPost: vi.fn(),
  decideCommunityReport: vi.fn(),
  fetchList: vi.fn(),
}));

vi.mock("../../services/api.js", () => api);

describe("Moderation interactions", () => {
  beforeEach(() => {
    api.fetchCommunityModerationQueue.mockResolvedValue({
      held_posts: [
        {
          id: "post-1",
          user_id: "member-a",
          content: "held content",
          hold_reason: "keyword",
        },
      ],
      reports: [],
    });
    api.decideCommunityPost.mockResolvedValue({});
    api.decideCommunityReport.mockResolvedValue({});
    api.fetchList.mockResolvedValue({ data: [] });
  });

  test("accept action submits moderation decision", async () => {
    const wrapper = mount(ModerationConsolePage);
    await flushPromises();

    const accept = wrapper
      .findAll("button")
      .find((node) => node.text() === "Accept");
    await accept.trigger("click");

    expect(api.decideCommunityPost).toHaveBeenCalledWith(
      "post-1",
      expect.objectContaining({ decision: "accept" }),
    );
  });

  test("renders moderation throttle policy panel", async () => {
    api.fetchList
      .mockResolvedValueOnce({
        data: [
          {
            max_posts_per_hour: 10,
            max_device_posts_per_hour: 3,
            max_ip_posts_per_hour: 4,
            captcha_required: true,
            auto_hold_report_threshold: 3,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const wrapper = mount(ModerationConsolePage);
    await flushPromises();

    expect(wrapper.text()).toContain("Moderation Throttles and Safeguards");
    expect(wrapper.text()).toContain("Posts per user per hour: 10");
  });
});
