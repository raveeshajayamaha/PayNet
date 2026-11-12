/* PayNet web client - plain JavaScript, no frameworks.
 * Talks to the Java WebServer: JSON REST API + Server-Sent Events (/api/stream). */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  // ---------------------------------------------------------------- state
  var session = {
    token: sessionStorage.getItem('paynet.token'),   // survives reload, dies with the tab
    user: sessionStorage.getItem('paynet.user')
  };
  var source = null;            // the EventSource (live stream)
  var shownIds = new Set();     // transaction ids already in the table (avoid duplicates)

  // ---------------------------------------------------------------- helpers
  /** cents (number) -> "12.50" with thousands separators */
  function money(cents) {
    var neg = cents < 0, abs = Math.abs(cents);
    var whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + whole + '.' + String(abs % 100).padStart(2, '0');
  }

  /** "12.5" -> 1250. Returns null when the text is not a valid amount. */
  function toCents(text) {
    var m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(text);
    if (!m) return null;
    var cents = parseInt(m[1], 10) * 100 + (m[2] ? parseInt((m[2] + '0').slice(0, 2), 10) : 0);
    return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
  }

  /** Calls the API. Throws Error(serverMessage) on failure so the UI can show it. */
  async function api(path, method, body, useToken) {
    var headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (useToken !== false && session.token) headers['Authorization'] = 'Bearer ' + session.token;
    var res;
    try {
      res = await fetch(path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error('Cannot reach the PayNet server. Is it running?');
    }
    var data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401 && session.token) { endSession(); location.hash = '#login'; }
      throw new Error(data.message || ('Request failed (' + res.status + ')'));
    }
    return data;
  }

  function toast(text, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' err' : '');
    el.textContent = text;                                  // textContent = safe against HTML injection
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 5000);
  }

  function setBusy(form, busy) { $('button[type=submit]', form).disabled = busy; }
  function showFormError(form, msg) { $('.form-error', form).textContent = msg || ''; }

  // ---------------------------------------------------------------- routing
  var views = ['home', 'auth', 'dashboard', 'about'];

  function route() {
    var h = (location.hash || '#home').slice(1);
    var view = h;
    if (h === 'login' || h === 'register') view = 'auth';
    if (views.indexOf(view) < 0) view = 'home';
    if (view === 'dashboard' && !session.token) { location.hash = '#login'; return; }
    if (view === 'auth' && session.token) { location.hash = '#dashboard'; return; }

    views.forEach(function (v) { $('#view-' + v).hidden = (v !== view); });
    if (view === 'auth') showTab(h === 'register' ? 'register' : 'login');
    document.querySelectorAll('nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === view);
    });
    if (view === 'dashboard') openDashboard();
    else closeStream();
    window.scrollTo(0, 0);
  }

  function showTab(name) {
    $('#form-login').hidden = name !== 'login';
    $('#form-register').hidden = name !== 'register';
    $('#tab-login').classList.toggle('active', name === 'login');
    $('#tab-register').classList.toggle('active', name === 'register');
  }

  function renderNav() {
    var on = !!session.token;
    $('#nav-login').hidden = on;
    $('#nav-dash').hidden = !on;
    $('#btn-logout').hidden = !on;
  }

  function startSession(token, user) {
    session.token = token; session.user = user;
    sessionStorage.setItem('paynet.token', token);
    sessionStorage.setItem('paynet.user', user);
    renderNav();
  }

  function endSession() {
    session.token = null; session.user = null;
    sessionStorage.removeItem('paynet.token');
    sessionStorage.removeItem('paynet.user');
    closeStream();
    renderNav();
  }

  // ---------------------------------------------------------------- landing stats
  async function refreshStats() {
    if ($('#view-home').hidden) return;
    try {
      var s = await api('/api/stats', 'GET', null, false);
      $('#stat-online').textContent = s.online;
      $('#stat-tx').textContent = s.transactions;
      $('#stat-vol').textContent = money(s.volume);
    } catch (e) { /* landing page stays quiet if the API is down */ }
  }

  // ---------------------------------------------------------------- dashboard
  function setBalance(cents, bump) {
    var el = $('#balance');
    el.textContent = money(cents);
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  async function refreshBalance(bump) {
    try { setBalance((await api('/api/balance')).balance, bump); } catch (e) { /* ignore */ }
  }

  /** Builds one <tr> for a transaction, from the point of view of the logged-in user. */
  function txRow(t, fresh) {
    var incoming = t.to === session.user;
    var other = incoming ? t.from : t.to;
    var tr = document.createElement('tr');
    if (fresh) tr.className = 'fresh';
    function cell(text, cls) {
      var td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    cell(t.id, 'id');
    cell(new Date(t.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
    cell((incoming ? 'from ' : 'to ') + (other === 'SYSTEM' ? 'PayNet deposit' : other));
    cell(t.note || '');
    cell((incoming ? '+' : '-') + money(t.amount), 'num ' + (incoming ? 'in' : 'out'));
    return tr;
  }

  /** Adds a transaction at the TOP of the table (newest first). */
  function addTx(t, fresh) {
    if (shownIds.has(t.id)) return false;
    shownIds.add(t.id);
    $('#tx-body').insertBefore(txRow(t, fresh), $('#tx-body').firstChild);
    $('#tx-empty').hidden = true;
    return true;
  }

  async function openDashboard() {
    $('#who').textContent = session.user;
    $('#live-badge').className = 'live off';
    $('#live-badge span').textContent = 'connecting...';
    try {
      var results = await Promise.all([api('/api/balance'), api('/api/history?limit=50')]);
      setBalance(results[0].balance, false);
      $('#tx-body').innerHTML = '';
      shownIds.clear();
      // history is newest-first; we prepend, so insert oldest first
      results[1].transactions.slice().reverse().forEach(function (t) { addTx(t, false); });
      $('#tx-empty').hidden = shownIds.size > 0;
    } catch (e) { toast(e.message, true); return; }
    openStream();
  }

  // ---------------------------------------------------------------- live stream (SSE)
  function openStream() {
    closeStream();
    if (!session.token) return;
    source = new EventSource('/api/stream?token=' + encodeURIComponent(session.token));
    source.onopen = function () {
      $('#live-badge').className = 'live';
      $('#live-badge span').textContent = 'live';
    };
    source.onerror = function () {                     // browser retries automatically
      $('#live-badge').className = 'live off';
      $('#live-badge span').textContent = 'reconnecting...';
    };
    source.addEventListener('tx', function (e) {
      var t = JSON.parse(e.data);
      var isNew = addTx(t, true);
      refreshBalance(true);
      if (isNew && t.to === session.user && t.from !== session.user) {
        var who = t.from === 'SYSTEM' ? 'PayNet' : t.from;
        toast('You received ' + money(t.amount) + ' from ' + who, false);
      }
    });
    source.addEventListener('ping', function () { /* keep-alive, nothing to do */ });
  }

  function closeStream() {
    if (source) { source.close(); source = null; }
  }

  // ---------------------------------------------------------------- forms
  function bindForm(sel, handler) {
    var form = $(sel);
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      showFormError(form, '');
      setBusy(form, true);
      try { await handler(form, Object.fromEntries(new FormData(form))); }
      catch (e) { showFormError(form, e.message); }
      finally { setBusy(form, false); }
    });
  }

  bindForm('#form-login', async function (form, v) {
    var r = await api('/api/login', 'POST', { username: v.username.trim(), password: v.password }, false);
    startSession(r.token, r.username);
    form.reset();
    location.hash = '#dashboard';
  });

  bindForm('#form-register', async function (form, v) {
    var username = v.username.trim();
    await api('/api/register', 'POST', { username: username, password: v.password, fullName: v.fullName.trim() }, false);
    var r = await api('/api/login', 'POST', { username: username, password: v.password }, false);
    startSession(r.token, r.username);
    form.reset();
    toast('Welcome, ' + r.username + '! Your account is ready.');
    location.hash = '#dashboard';
  });

  bindForm('#form-send', async function (form, v) {
    var cents = toCents(v.amount);
    if (cents === null) throw new Error('Enter a valid amount such as 12.50');
    var r = await api('/api/transfer', 'POST', { to: v.to.trim(), amount: cents, note: v.note || '' });
    setBalance(r.balance, true);
    addTx(r.transaction, true);
    toast('Sent ' + money(cents) + ' to ' + v.to.trim());
    form.reset();
  });

  bindForm('#form-deposit', async function (form, v) {
    var cents = toCents(v.amount);
    if (cents === null) throw new Error('Enter a valid amount such as 50.00');
    var r = await api('/api/deposit', 'POST', { amount: cents });
    setBalance(r.balance, true);
    addTx(r.transaction, true);
    toast('Deposited ' + money(cents));
    form.reset();
  });

  $('#btn-logout').addEventListener('click', async function () {
    try { await api('/api/logout', 'POST'); } catch (e) { /* ignore */ }
    endSession();
    location.hash = '#home';
  });

  $('#tab-login').addEventListener('click', function () { location.hash = '#login'; });
  $('#tab-register').addEventListener('click', function () { location.hash = '#register'; });

  // ---------------------------------------------------------------- start
  window.addEventListener('hashchange', route);
  renderNav();
  route();
  refreshStats();
  setInterval(refreshStats, 4000);
})();
