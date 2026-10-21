// Vault-scoped WebSocket client.Single connection per shim instance.
// Multiple consumers attach via subscribe/channel.

const RECONNECT_DELAY_MS = 2000;

export function createWsClient() {
  let ws = null;
  let vaultId = null;
  let reconnectTimer = null;
  let manuallyClosed = false;
  let state = "closed"; // "closed" | "connecting" | "open"

  // @@IGNIS_SSE_PATCH@@ SSE fallback, used when the socket never manages to open
  // (gateways that reject `Upgrade: websocket`). See openEvents() below.
  let es = null;
  let usingSse = false;
  let sseClientId = null;
  let socketEverOpened = false;

  const globalSubs = new Map(); // type -> Set<handler>
  const channelSubs = new Map(); // channelName -> Map<type, Set<handler>>
  const channelSubCount = new Map(); // channelName -> integer
  const stateSubs = new Set(); // handler(state)
  const openSubs = new Set(); // handler() fired on each socket open

  function setState(next) {
    if (state === next) {
      return;
    }

    state = next;

    for (const fn of stateSubs) {
      try {
        fn(state);
      } catch (e) {
        console.error("[ws] state subscriber threw:", e);
      }
    }
  }

  function postRaw(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return;
    }

    // @@IGNIS_SSE_PATCH@@ SSE is one-way; upstream messages go over HTTP.
    if (usingSse && sseClientId) {
      try {
        fetch(`/api/events/send?cid=${encodeURIComponent(sseClientId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
          keepalive: true,
        }).catch(() => {});
      } catch (e) {
        console.warn("[sse] post failed:", e);
      }
    }
  }

  function sendSubscribeChannel(name) {
    postRaw({ type: "subscribe-channel", channel: name });
  }

  function sendUnsubscribeChannel(name) {
    postRaw({ type: "unsubscribe-channel", channel: name });
  }

  function dispatch(msg) {
    if (msg.channel) {
      const types = channelSubs.get(msg.channel);
      const handlers = types && types.get(msg.type);

      if (handlers) {
        for (const fn of handlers) {
          try {
            fn(msg);
          } catch (e) {
            console.error(
              `[ws] channel subscriber for ${msg.channel}:${msg.type} threw:`,
              e,
            );
          }
        }
      }

      return;
    }

    const handlers = globalSubs.get(msg.type);

    if (handlers) {
      for (const fn of handlers) {
        try {
          fn(msg);
        } catch (e) {
          console.error(`[ws] subscriber for ${msg.type} threw:`, e);
        }
      }
    }
  }

  function openSocket() {
    if (ws) {
      return;
    }

    // @@IGNIS_SSE_PATCH@@ Once the socket has proven unusable, go straight to SSE.
    if (usingSse) {
      openEvents();
      return;
    }

    setState("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws?vault=${encodeURIComponent(vaultId)}`;

    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error("[ws] failed to create WebSocket:", e);
      ws = null;
      setState("closed");
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log("[ws] connected");
      socketEverOpened = true;
      setState("open");

      // Re-establish channel subscriptions on the new connection.
      for (const name of channelSubCount.keys()) {
        sendSubscribeChannel(name);
      }

      for (const fn of openSubs) {
        try {
          fn();
        } catch (e) {
          console.error("[ws] open subscriber threw:", e);
        }
      }
    };

    ws.onmessage = (event) => {
      let msg;

      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.error("[ws] failed to parse message:", e);
        return;
      }

      dispatch(msg);
    };

    ws.onclose = () => {
      ws = null;
      setState("closed");

      if (manuallyClosed) {
        return;
      }

      // @@IGNIS_SSE_PATCH@@ A socket that never opened means the upgrade was
      // refused, not that the network blipped - stop retrying it and stream
      // events over HTTP instead.
      if (!socketEverOpened && !usingSse) {
        console.warn("[ws] upgrade refused; falling back to SSE");
        usingSse = true;
        es = null;
        openEvents();
        return;
      }

      scheduleReconnect();
    };

    ws.onerror = (e) => {
      console.error("[ws] error:", e);
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer || manuallyClosed) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      console.log("[ws] reconnecting...");
      openSocket();
    }, RECONNECT_DELAY_MS);
  }

  // @@IGNIS_SSE_PATCH@@ Server-Sent Events transport. Same message shape and the
  // same dispatch table as the socket, so consumers do not need to care which
  // transport is in use.
  function openEvents() {
    if (es) {
      return;
    }

    if (typeof EventSource === "undefined") {
      console.warn("[sse] EventSource unavailable; staying on reconnect loop");
      usingSse = false;
      scheduleReconnect();
      return;
    }

    if (!sseClientId) {
      sseClientId = makeClientId();
    }

    const params = new URLSearchParams({
      vault: vaultId,
      cid: sseClientId,
    });
    const channels = Array.from(channelSubCount.keys());

    if (channels.length > 0) {
      params.set("channels", channels.join(","));
    }

    try {
      es = new EventSource(`/api/events?${params.toString()}`);
    } catch (e) {
      console.error("[sse] failed to create EventSource:", e);
      es = null;
      usingSse = false;
      scheduleReconnect();
      return;
    }

    es.onopen = () => {
      console.log("[sse] connected");
      setState("open");

      for (const fn of openSubs) {
        try {
          fn();
        } catch (e) {
          console.error("[sse] open subscriber threw:", e);
        }
      }
    };

    es.onmessage = (event) => {
      let msg;

      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.error("[sse] failed to parse message:", e);
        return;
      }

      dispatch(msg);
    };

    es.onerror = () => {
      if (manuallyClosed || !es) {
        return;
      }

      // EventSource reconnects on its own; only a hard close needs rebuilding.
      if (es.readyState === 2) {
        es.close();
        es = null;
        setState("closed");
        scheduleReconnect();
      }
    };
  }

  function makeClientId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch {
      // Fall through to the random id below.
    }

    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  function connect(id) {
    if (!id) {
      console.warn("[ws] no vault id; skipping connect");
      return;
    }

    vaultId = id;
    manuallyClosed = false;
    // @@IGNIS_SSE_PATCH@@ Give the socket another chance on a fresh connect.
    usingSse = false;
    socketEverOpened = false;
    openSocket();
  }

  function disconnect() {
    manuallyClosed = true;

    // @@IGNIS_SSE_PATCH@@
    if (es) {
      es.close();
      es = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (ws) {
      ws.close();
      ws = null;
    }

    setState("closed");
  }

  function subscribe(type, handler) {
    if (!globalSubs.has(type)) {
      globalSubs.set(type, new Set());
    }

    globalSubs.get(type).add(handler);

    return () => {
      globalSubs.get(type)?.delete(handler);
    };
  }

  function send(type, payload) {
    postRaw({ type, ...payload });
  }

  function channel(name) {
    return {
      subscribe(type, handler) {
        if (!channelSubs.has(name)) {
          channelSubs.set(name, new Map());
        }

        const types = channelSubs.get(name);

        if (!types.has(type)) {
          types.set(type, new Set());
        }

        types.get(type).add(handler);

        // First subscriber for this channel: upgrade the server-side gate.
        const prevCount = channelSubCount.get(name) || 0;
        channelSubCount.set(name, prevCount + 1);

        if (prevCount === 0) {
          sendSubscribeChannel(name);
        }

        return () => {
          const set = types.get(type);

          if (!set || !set.has(handler)) {
            return;
          }

          set.delete(handler);

          const newCount = (channelSubCount.get(name) || 0) - 1;

          if (newCount <= 0) {
            channelSubCount.delete(name);
            sendUnsubscribeChannel(name);
          } else {
            channelSubCount.set(name, newCount);
          }
        };
      },

      send(type, payload) {
        postRaw({ channel: name, type, ...payload });
      },
    };
  }

  function isOpen() {
    return state === "open";
  }

  function onStateChange(handler) {
    stateSubs.add(handler);

    return () => {
      stateSubs.delete(handler);
    };
  }

  function onOpen(handler) {
    openSubs.add(handler);

    return () => {
      openSubs.delete(handler);
    };
  }

  return {
    connect,
    disconnect,
    subscribe,
    send,
    channel,
    isOpen,
    onStateChange,
    onOpen,
  };
}

// Singleton instance. The shim has one WebSocket per page; consumers all share it.
export const wsClient = createWsClient();
