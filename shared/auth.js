// ============================================================
// Password gate for write actions (shared by index.html + map.html).
//
// Two valid passwords live in the Apps Script "Config" sheet:
//   • communaute → autorise la création d'un signalement
//   • comite     → autorise tout (statut, suivi, position)
//
// The client never knows which password does what — it only stores the
// one the user typed and forwards it with each write. The SERVER decides
// what that password authorizes (see checkRole() in code.gs). The role is
// re-checked on every request, so faking it client-side achieves nothing.
//
// UX rule (decided with the team): we only prompt at the moment of a write
// when nothing is stored yet. Browsing the map / filling the form stays
// 100% open — no password to read anything.
// ============================================================
(function () {
  const KEY      = 'orford.auth';
  const ENDPOINT = (window.ORFORD && window.ORFORD.ENDPOINT_URL) || '';

  function getStored() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function setStored(pw) {
    try { localStorage.setItem(KEY, pw); } catch (e) { /* ignore */ }
  }
  function clearStored() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  // --- One-off styles for the modal (injected once) ---------------------
  function ensureStyles() {
    if (document.getElementById('orford-auth-styles')) return;
    const css = document.createElement('style');
    css.id = 'orford-auth-styles';
    css.textContent = [
      '.orford-auth-overlay{position:fixed;inset:0;z-index:10000;display:flex;',
      'align-items:center;justify-content:center;padding:1rem;',
      'background:rgba(20,30,25,.55);backdrop-filter:blur(2px);}',
      '.orford-auth-card{background:#fff;border-radius:14px;max-width:24rem;width:100%;',
      'padding:1.5rem;box-shadow:0 12px 40px rgba(0,0,0,.25);',
      'font-family:"IBM Plex Sans",system-ui,sans-serif;}',
      '.orford-auth-card h3{margin:0 0 .5rem;font-family:"Fraunces",serif;',
      'font-size:1.25rem;color:#1f3a2e;}',
      '.orford-auth-card p{margin:0 0 1rem;color:#445;line-height:1.4;font-size:.95rem;}',
      '.orford-auth-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem;}'
    ].join('');
    document.head.appendChild(css);
  }

  // Promise-based password prompt. Resolves to the typed string, or null if
  // the user cancelled. Built on webawesome inputs/buttons for visual
  // consistency, with our own overlay so show/hide stays simple.
  function promptPassword(opts) {
    opts = opts || {};
    ensureStyles();
    return new Promise(function (resolve) {
      const overlay = document.createElement('div');
      overlay.className = 'orford-auth-overlay';
      overlay.innerHTML =
        '<div class="orford-auth-card" role="dialog" aria-modal="true">' +
        '  <h3></h3>' +
        '  <p></p>' +
        '  <wa-input type="password" size="large" autocomplete="off" ' +
        '            placeholder="Mot de passe" autofocus></wa-input>' +
        '  <div class="orford-auth-actions">' +
        '    <wa-button class="orford-auth-cancel" appearance="outlined">Annuler</wa-button>' +
        '    <wa-button class="orford-auth-ok" appearance="filled" variant="brand">Valider</wa-button>' +
        '  </div>' +
        '</div>';

      overlay.querySelector('h3').textContent = opts.title || 'Mot de passe';
      const p = overlay.querySelector('p');
      if (opts.message) { p.textContent = opts.message; } else { p.remove(); }

      const input  = overlay.querySelector('wa-input');
      const okBtn  = overlay.querySelector('.orford-auth-ok');
      const noBtn  = overlay.querySelector('.orford-auth-cancel');

      function close(value) {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(value);
      }
      function submit() { close((input.value || '').trim() || null); }
      function onKey(e) {
        if (e.key === 'Escape') close(null);
        else if (e.key === 'Enter') { e.preventDefault(); submit(); }
      }

      okBtn.addEventListener('click', submit);
      noBtn.addEventListener('click', function () { close(null); });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(null); // click outside the card cancels
      });
      input.addEventListener('keydown', onKey);
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      // Custom elements upgrade asynchronously — focus once it's ready.
      requestAnimationFrame(function () { try { input.focus(); } catch (e) {} });
    });
  }

  // POST a write action with the stored/typed password attached. Handles the
  // whole auth dance: prompt when needed, re-prompt on rejection (wrong code
  // OR insufficient role, e.g. a resident attempting a committee action), and
  // only persist a password once the server has accepted it.
  //
  // Returns the parsed server JSON ({ ok, ... }), or { ok:false, cancelled:true }
  // if the user backed out of the prompt. Never overwrites a working stored
  // password until a new one succeeds.
  async function post(payload, opts) {
    opts = opts || {};
    let pw      = getStored();
    let message = opts.message || '';
    let attempts = 0;

    while (true) {
      if (!pw) {
        pw = await promptPassword({ title: opts.title, message: message });
        if (!pw) return { ok: false, cancelled: true };
      }

      const body = Object.assign({}, payload, { password: pw });
      const res  = await fetch(ENDPOINT, {
        method:  'POST',
        // text/plain avoids a CORS preflight to Apps Script
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify(body),
      });
      const data = await res.json().catch(function () { return {}; });

      if (res.ok && data.ok) {
        setStored(pw); // remember the password that actually worked
        return data;
      }

      if (data && data.authError) {
        if (++attempts >= 3) {
          return { ok: false, error: data.error || 'Mot de passe refusé.' };
        }
        // Wrong / insufficient: re-prompt, but keep the previously stored
        // password intact until a new one is accepted.
        message = data.error || 'Mot de passe incorrect. Réessayez.';
        pw = '';
        continue;
      }

      // Non-auth failure (bad params, network, …): bubble it up unchanged.
      return { ok: false, error: (data && data.error) || ('HTTP ' + res.status) };
    }
  }

  window.ORFORD_AUTH = {
    post:    post,
    stored:  getStored,
    clear:   clearStored,
  };
})();
