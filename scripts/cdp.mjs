export const BASE = 'http://127.0.0.1:9223';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function conn(port = 9223) {
  const base = `http://127.0.0.1:${port}`;
  const list = await (await fetch(base + '/json/list')).json();
  const t = list.find((x) => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const wait = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) {
      wait.get(m.id)(m);
      wait.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      wait.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { err: JSON.stringify(r.result.exceptionDetails).slice(0, 400) };
    return r.result?.result?.value;
  };
  return { ws, send, ev };
}

export async function shot(send, file, w = 1440, h = 900, full = false) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  if (r.result?.data) {
    const fs = await import('node:fs');
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(file).size;
  }
  return 0;
}

export const nav = async (send, hash, wait = 2400) => {
  await send('Page.navigate', { url: `http://127.0.0.1:5273/?v=${Date.now()}${hash}` });
  await sleep(wait);
};
