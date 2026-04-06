import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import CommunityFeedPage from "../CommunityFeedPage.vue";

const api = vi.hoisted(() => ({
  createCommunityCaptchaChallenge: vi.fn(),
  createCommunityPost: vi.fn(),
  fetchList: vi.fn(),
  fetchCommunityFeed: vi.fn(),
  fetchMyCommunityReports: vi.fn(),
  reportCommunityPost: vi.fn(),
}));

vi.mock("../../services/api.js", () => api);

describe("Community feed interactions", () => {
  beforeEach(() => {
    api.fetchCommunityFeed.mockResolvedValue([
      {
        id: "post-1",
        user_id: "member-a",
        content: "hello",
        status: "published",
        replies: [],
      },
    ]);
    api.fetchMyCommunityReports.mockResolvedValue([]);
    api.fetchList.mockResolvedValue({ data: [] });
    api.createCommunityCaptchaChallenge.mockResolvedValue({
      id: "cap-1",
      challenge_text: "What is 2 + 2?",
    });
    api.createCommunityPost.mockResolvedValue({ status: "published" });
    api.reportCommunityPost.mockResolvedValue({ status: "open" });
  });

  test("shows validation error when post content is empty", async () => {
    const wrapper = mount(CommunityFeedPage);
    await flushPromises();

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("Post content is required");
  });
});
