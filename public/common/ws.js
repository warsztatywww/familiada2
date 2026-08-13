// public/common/ws.js
export function connectGame(onSnapshot) {
  let ws = null;

  function open() {
    ws = new WebSocket(`ws://${location.host}`);
    ws.onopen = () => document.body.classList.remove('disconnected');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') onSnapshot(msg);
    };
    ws.onclose = () => {
      document.body.classList.add('disconnected');
      setTimeout(open, 1000);
    };
    ws.onerror = () => ws.close();
  }
  open();

  return {
    send(cmd) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'command', cmd }));
      }
    },
  };
}
