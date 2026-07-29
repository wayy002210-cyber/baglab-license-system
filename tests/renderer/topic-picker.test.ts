import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TopicPicker from "../../src/renderer/components/copywriting/TopicPicker.vue";

describe("TopicPicker", () => {
  const topics = Array.from({ length: 5 }, (_, index) => ({
    id: String(index),
    title: `选题${index}`,
    angle: `角度${index}`,
    hook: `钩子${index}`
  }));

  it("renders five topics and emits selection", async () => {
    const wrapper = mount(TopicPicker, {
      props: { topics, selectedId: null, loading: false }
    });

    expect(wrapper.findAll('[data-topic-id]')).toHaveLength(5);
    await wrapper.findAll('[data-topic-id]')[2]?.trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["2"]);
  });

  it("requests a fresh batch", async () => {
    const wrapper = mount(TopicPicker, {
      props: { topics, selectedId: "0", loading: false }
    });
    await wrapper.get('[data-action="refresh-topics"]').trigger("click");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
  });
});
