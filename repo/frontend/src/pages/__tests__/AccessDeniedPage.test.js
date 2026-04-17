import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import AccessDeniedPage from "../AccessDeniedPage.vue";

describe("AccessDeniedPage.vue (unit)", () => {
  test("renders the access-denied heading and guidance", () => {
    const wrapper = mount(AccessDeniedPage);
    expect(wrapper.find("h2").text()).toBe("Access Denied");
    expect(wrapper.text()).toContain("Your current role does not include permission");
    expect(wrapper.text()).toMatch(/sidebar/i);
  });
});
