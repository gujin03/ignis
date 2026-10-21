import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWsClient } from "./ws-client.js";

let sockets;

beforeEach(() => {
  sockets = [];

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
    }
    send() {}
    close() {}
  }

  FakeWebSocket.OPEN = 1;
  globalThis.WebSocket = FakeWebSocket;
  globalThis.window = { location: { protocol: "http:", host: "localhost" } };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.WebSocket;
  delete globalThis.window;
});

describe("ws-client onOpen", () => {
  it("fires on the first open and again on a re-open", () => {
    const client = createWsClient();
    const onOpen = vi.fn();
    client.onOpen(onOpen);

    client.connect("v1");
    sockets[0].onopen();
    expect(onOpen).toHaveBeenCalledTimes(1);

    sockets[0].onclose();
    vi.advanceTimersByTime(2000);
    sockets[1].onopen();

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("stops firing after unsubscribe", () => {
    const client = createWsClient();
    const onOpen = vi.fn();
    const off = client.onOpen(onOpen);

    client.connect("v1");
    sockets[0].onopen();
    off();

    sockets[0].onclose();
    vi.advanceTimersByTime(2000);
    sockets[1].onopen();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("ws-client channels", () => {
  const SUBSCRIBE = JSON.stringify({
    type: "subscribe-channel",
    channel: "metadata",
  });

  function open(socket) {
    socket.readyState = 1;
    socket.send = vi.fn();
    socket.onopen();
  }

  it("subscribes on the first open and again on a re-open", () => {
    const client = createWsClient();
    client.channel("metadata").subscribe("revision", vi.fn());

    client.connect("v1");
    open(sockets[0]);

    expect(sockets[0].send).toHaveBeenCalledWith(SUBSCRIBE);

    sockets[0].onclose();
    vi.advanceTimersByTime(2000);
    open(sockets[1]);

    expect(sockets[1].send).toHaveBeenCalledWith(SUBSCRIBE);
  });

  it("routes a channel message to its subscriber", () => {
    const client = createWsClient();
    const handler = vi.fn();
    client.channel("metadata").subscribe("revision", handler);

    client.connect("v1");
    open(sockets[0]);
    sockets[0].onmessage({
      data: JSON.stringify({
        channel: "metadata",
        type: "revision",
        etag: '"a-1"',
      }),
    });

    expect(handler).toHaveBeenCalledWith({
      channel: "metadata",
      type: "revision",
      etag: '"a-1"',
    });
  });
});

describe("ws-client SSE fallback @@IGNIS_SSE_PATCH@@", () => {
  let streams;
  let fetchMock;

  beforeEach(() => {
    streams = [];

    class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        streams.push(this);
      }
      close() {
        this.readyState = 2;
      }
    }

    globalThis.EventSource = FakeEventSource;
    fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete globalThis.EventSource;
    delete globalThis.fetch;
  });

  it("switches to SSE when the socket never opens", () => {
    const client = createWsClient();

    client.connect("v1");
    expect(streams).toHaveLength(0);

    sockets[0].onclose(); // closed without ever opening
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toContain("/api/events?");
    expect(streams[0].url).toContain("vault=v1");
  });

  it("stops retrying the socket once SSE took over", () => {
    const client = createWsClient();

    client.connect("v1");
    sockets[0].onclose();
    vi.advanceTimersByTime(10000);

    expect(sockets).toHaveLength(1);
  });

  it("still retries the socket when it did open once", () => {
    const client = createWsClient();

    client.connect("v1");
    sockets[0].onopen();
    sockets[0].onclose();
    vi.advanceTimersByTime(2000);

    expect(sockets).toHaveLength(2);
    expect(streams).toHaveLength(0);
  });

  it("opens the stream, reports open state and delivers messages", () => {
    const client = createWsClient();
    const onOpen = vi.fn();
    const handler = vi.fn();

    client.onOpen(onOpen);
    client.subscribe("file-changed", handler);
    client.connect("v1");
    sockets[0].onclose();

    streams[0].readyState = 1;
    streams[0].onopen();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(client.isOpen()).toBe(true);

    streams[0].onmessage({
      data: JSON.stringify({ type: "file-changed", path: "a.md" }),
    });

    expect(handler).toHaveBeenCalledWith({ type: "file-changed", path: "a.md" });
  });

  it("posts upstream messages to /api/events/send", () => {
    const client = createWsClient();

    client.connect("v1");
    sockets[0].onclose();
    streams[0].readyState = 1;
    streams[0].onopen();

    client.send("ping", { n: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/events/send?cid=");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      type: "ping",
      n: 1,
    });
  });
});
