import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import HomePage from "../HomePage.vue";
import { createRouter, createMemoryHistory } from "vue-router";

describe("HomePage.vue (unit)", () => {
  test("renders the core architecture headline", () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div>home</div>" } },
        {
          path: "/:pathMatch(.*)*",
          component: { template: "<div>other</div>" },
        },
      ],
    });
    const wrapper = mount(HomePage, {
      global: { plugins: [router] },
    });
    expect(wrapper.find("h2").text()).toMatch(/Core Platform Architecture/);
  });

  test("renders navigation tiles for core domains", () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div>home</div>" } },
        { path: "/reservations", component: { template: "<div>r</div>" } },
        { path: "/resources", component: { template: "<div>r</div>" } },
        { path: "/users", component: { template: "<div>u</div>" } },
        { path: "/orders", component: { template: "<div>o</div>" } },
        { path: "/refunds", component: { template: "<div>r</div>" } },
        { path: "/audit-trails", component: { template: "<div>a</div>" } },
      ],
    });
    const wrapper = mount(HomePage, {
      global: { plugins: [router] },
    });
    const tiles = wrapper.findAll("a.tile");
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    const labels = tiles.map((t) => t.text());
    expect(labels.some((t) => /reservations/i.test(t))).toBe(true);
    expect(labels.some((t) => /audit trail/i.test(t))).toBe(true);
  });
});
