import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { UpstreamWaker } from "./wake-upstream.middleware";

/** A fake downstream whose /health/live answers 503 for the first `bootPolls` calls, then 200. */
function fakeUpstream(bootPolls: number): Promise<{ url: string; hits: () => number; server: Server }> {
  let hits = 0;
  const server = createServer((req, res) => {
    if (req.url === "/health/live") hits++;
    res.statusCode = hits > bootPolls ? 200 : 503;
    res.end();
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, hits: () => hits, server });
    }),
  );
}

const run = (mw: ReturnType<UpstreamWaker["middleware"]>) =>
  new Promise<void>((resolve) => void mw({} as never, {} as never, () => resolve()));

describe("UpstreamWaker", () => {
  const servers: Server[] = [];
  afterAll(() => servers.forEach((s) => s.close()));

  it("holds the first request until a booting downstream reports healthy", async () => {
    const up = await fakeUpstream(2);
    servers.push(up.server);
    const waker = new UpstreamWaker();
    waker.register("/event", up.url);

    await run(waker.middleware("/event"));
    expect(up.hits()).toBe(3); // 503, 503, then 200 — and only then next()
  }, 20_000);

  it("doesn't poll again for a downstream that was just used", async () => {
    const up = await fakeUpstream(0);
    servers.push(up.server);
    const waker = new UpstreamWaker();
    waker.register("/event", up.url);

    await run(waker.middleware("/event"));
    await run(waker.middleware("/event"));
    expect(up.hits()).toBe(1);
  });

  it("wakes the other idle downstreams too, without waiting on them", async () => {
    const event = await fakeUpstream(0);
    const ticket = await fakeUpstream(0);
    servers.push(event.server, ticket.server);
    const waker = new UpstreamWaker();
    waker.register("/event", event.url);
    waker.register("/ticket", ticket.url);

    await run(waker.middleware("/event"));
    await new Promise((r) => setTimeout(r, 200)); // the background wake is fire-and-forget
    expect(ticket.hits()).toBe(1);
  });
});
