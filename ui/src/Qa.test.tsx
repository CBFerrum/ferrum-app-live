// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Ask, Moderate } from "./Qa";
import { fakeServer, json, mount, press, type } from "./testing";

afterEach(() => vi.unstubAllGlobals());

const FEED = "POST /api/app/live/broadcasts/b1/feed";

describe("questions and polls for a viewer", () => {
  it("shows the shown questions and the open poll, asks, and votes once", async () => {
    let mine: number | null = null;
    const server = fakeServer({
      [FEED]: () => ({
        questions: [{ id: "q1", text: "When is the next one?", name: "Lee", status: "Shown" }],
        poll: { id: "p1", question: "Which day?", options: ["Monday", "Friday"], counts: [0, mine === null ? 0 : 1], mine },
      }),
      "POST /api/app/live/broadcasts/b1/ask": () => ({ question: "q2", status: "Waiting" }),
      "POST /api/app/live/broadcasts/b1/vote": () => {
        mine = 1;
        return { counted: true };
      },
    });
    const page = await mount(<Ask id="b1" />);
    expect(page.text()).toContain("When is the next one?");
    expect(page.text()).toContain("Which day?");
    await type(page.el.querySelector<HTMLTextAreaElement>("#lv-ask")!, "Is it recorded?");
    await press(page.button("Send"));
    expect(server.last("POST /api/app/live/broadcasts/b1/ask")?.body).toEqual({ text: "Is it recorded?" });
    expect(page.text()).toContain("The presenter decides whether to show it");
    expect(page.el.querySelector<HTMLTextAreaElement>("#lv-ask")!.value).toBe("");
    await press(page.button("Friday"));
    expect(server.last("POST /api/app/live/broadcasts/b1/vote")?.body).toEqual({ poll: "p1", option: 1 });
    expect(page.button("Friday")!.getAttribute("aria-pressed")).toBe("true");
    expect(page.button("Monday")!.hasAttribute("disabled")).toBe(true);
    await page.unmount();
  });

  it("says the server's words when a question is refused", async () => {
    fakeServer({
      [FEED]: () => ({ questions: [], poll: null }),
      "POST /api/app/live/broadcasts/b1/ask": () => json({ error: "conflict", message: "wait a moment before asking again" }, 409),
    });
    const page = await mount(<Ask id="b1" />);
    expect(page.text()).toContain("No questions shown yet.");
    await type(page.el.querySelector<HTMLTextAreaElement>("#lv-ask")!, "Again?");
    await press(page.button("Send"));
    expect(page.text()).toContain("wait a moment before asking again");
    await page.unmount();
  });
});

describe("questions and polls for a presenter", () => {
  it("lists every question with only the moves it allows, moves one, and opens and closes a poll", async () => {
    const server = fakeServer({
      "POST /api/v1/Broadcast/b1/actions/questions": () => ({
        questions: [
          { id: "q1", text: "First?", name: null, status: "Waiting" },
          { id: "q2", text: "Gone?", name: null, status: "Hidden" },
        ],
      }),
      "POST /api/v1/Broadcast/b1/actions/moderate_question": () => ({ question: "q1", status: "Shown" }),
      "POST /api/v1/Broadcast/b1/actions/open_poll": () => ({ poll: "p9", status: "Open" }),
      "POST /api/v1/Broadcast/b1/actions/close_poll": () => ({ poll: "p9", closed: true }),
    });
    const page = await mount(<Moderate id="b1" />);
    expect(page.text()).toContain("First?");
    expect(page.text()).toContain("Gone?");
    // Three moves for a waiting question, none for a hidden one.
    expect([...page.el.querySelectorAll("li")].map((li) => li.querySelectorAll("button").length)).toEqual([3, 0]);
    await press(page.button("Show"));
    expect(server.last("POST /api/v1/Broadcast/b1/actions/moderate_question")?.body).toEqual({ question: "q1", to: "Shown" });
    await type(page.el.querySelector<HTMLInputElement>("#lv-poll-q")!, "Which day?");
    await type(page.el.querySelector<HTMLTextAreaElement>("#lv-poll-a")!, "Monday\nFriday");
    await press(page.button("Open the poll"));
    expect(server.last("POST /api/v1/Broadcast/b1/actions/open_poll")?.body).toEqual({ question: "Which day?", options: "Monday\nFriday" });
    await press(page.button("Close the poll"));
    expect(server.last("POST /api/v1/Broadcast/b1/actions/close_poll")?.body).toEqual({ poll: "p9" });
    await page.unmount();
  });
});
