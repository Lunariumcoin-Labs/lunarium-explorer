// JSON-RPC client for the XLN node (lunariumcoind). Supports batches (several commands in one request),
// which is what makes the initial sync fast.
import http from "node:http";

export class RpcError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function createRpc({ url, user, pass }, { timeoutMs = 120000 } = {}) {
  const u = new URL(url);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  let nextId = 1;

  function post(body) {
    return new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(body));
      const req = http.request(
        { host: u.hostname, port: u.port, path: "/", method: "POST", agent, timeout: timeoutMs,
          headers: { "content-type": "application/json", "content-length": data.length, authorization: auth } },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode === 401) return reject(new RpcError("RPC: usuário/senha recusados", 401));
            try { resolve(JSON.parse(text)); } catch { reject(new RpcError(`RPC: resposta inválida (HTTP ${res.statusCode}) ${text.slice(0, 160)}`, res.statusCode)); }
          });
        });
      req.on("timeout", () => req.destroy(new RpcError("RPC: tempo esgotado", -1)));
      req.on("error", reject);
      req.end(data);
    });
  }

  async function call(method, ...params) {
    const r = await post({ jsonrpc: "1.0", id: nextId++, method, params });
    if (r.error) throw new RpcError(r.error.message, r.error.code);
    return r.result;
  }

  // calls = [[method, ...params], ...] → results in the same order. Individual errors become an RpcError in place.
  async function batch(calls) {
    if (!calls.length) return [];
    const base = nextId;
    nextId += calls.length;
    const res = await post(calls.map(([method, ...params], i) => ({ jsonrpc: "1.0", id: base + i, method, params })));
    if (!Array.isArray(res)) throw new RpcError(res?.error?.message || "RPC: lote recusado", res?.error?.code);
    const byId = new Map(res.map((r) => [r.id, r]));
    return calls.map((_, i) => {
      const r = byId.get(base + i);
      if (!r) return new RpcError("RPC: resposta ausente no lote", -2);
      return r.error ? new RpcError(r.error.message, r.error.code) : r.result;
    });
  }

  return { call, batch };
}
