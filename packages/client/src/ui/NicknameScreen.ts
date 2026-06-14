// Pre-game nickname entry. Resolves with the chosen name.
export function nicknameScreen(): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:#11141a;color:#fff;font-family:system-ui,sans-serif;gap:18px;z-index:10;';
    overlay.innerHTML = `
      <div style="font-size:42px;font-weight:800;letter-spacing:1px;">GTA <span style="color:#ffcf4d">PARIS</span></div>
      <div style="opacity:.7;font-size:14px;">Pick a name and join the default instance</div>
    `;
    const input = document.createElement('input');
    input.placeholder = 'Nickname';
    input.maxLength = 16;
    input.value = 'Parisien' + Math.floor(Math.random() * 1000);
    input.style.cssText =
      'padding:12px 16px;font-size:18px;border-radius:8px;border:1px solid #333;background:#1c2027;color:#fff;width:260px;text-align:center;';
    const btn = document.createElement('button');
    btn.textContent = 'PLAY';
    btn.style.cssText =
      'padding:12px 40px;font-size:18px;font-weight:700;border:0;border-radius:8px;background:#ffcf4d;color:#1a1d22;cursor:pointer;';
    overlay.append(input, btn);
    document.body.appendChild(overlay);

    const go = () => {
      const name = (input.value.trim() || 'Anon').slice(0, 16);
      overlay.remove();
      resolve(name);
    };
    btn.onclick = go;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') go();
    };
    setTimeout(() => input.focus(), 0);
  });
}
