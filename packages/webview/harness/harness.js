// Mocks the VS Code webview API so the built webview runs in a normal browser tab.
// Query parameters: ?theme=dark&mode=auto&fixture=<name>&locale=es&reduce=1&chrome=0
// Settings: any `s.<key>=<value>` parameter, e.g. ?s.display.futureSteps=ghosted&s.playback.autoplay=true
(function () {
  const params = new URLSearchParams(location.search);
  const posted = [];
  const settings = {};
  for (const [key, value] of params) {
    if (!key.startsWith('s.')) continue;
    settings[key.slice(2)] = value === 'true' ? true : value === 'false' ? false : Number.isFinite(Number(value)) && value.trim() !== '' ? Number(value) : value;
  }
  window.harnessSettings = Object.assign({}, window.harnessSettings || {}, settings);
  // Webview state survives reloads like VS Code's getState/setState (session storage per tab).
  let persisted;
  try {
    persisted = JSON.parse(sessionStorage.getItem('harness-state') || 'null') || undefined;
  } catch {
    persisted = undefined;
  }
  const byId = (id) => document.getElementById(id);

  // English comes from the webview's built-in catalogue; Spanish from the real l10n bundle.
  const strings = { en: {}, es: window.harnessStringsEs || {} };


  // Fixtures registered by later milestones (window.harnessFixtures) or a trivial default.
  const fixtures = Object.assign(
    { 'hello.mmd': 'sequenceDiagram\n    Alice->>Bob: Hello Bob\n    Bob-->>Alice: Hi Alice\n' },
    window.harnessFixtures || {},
  );

  function send(type, payload) {
    window.postMessage({ v: 1, type, payload }, '*');
  }

  function settingsPayload() {
    return {
      settings: Object.assign({ themeMode: byId('themeMode').value }, window.harnessSettings || {}),
      themeKind: byId('themeKind').value,
      reduceMotion: byId('reduceMotion').checked ? true : null,
    };
  }

  function sendDocument(type) {
    const name = byId('fixture').value;
    const source = fixtures[name];
    const payload = { source, version: Date.now(), origin: { line: 0, character: 0 } };
    if (type === 'document/load') Object.assign(payload, { uri: `file:///harness/${name}`, fileName: name.split('/').pop(), diagramIndex: 0 });
    send(type, Object.assign(payload, window.harnessDocumentExtras ? window.harnessDocumentExtras(name, source) : {}));
  }

  window.harness = { posted, send, sendDocument, fixtures };

  window.acquireVsCodeApi = function () {
    return {
      postMessage(message) {
        posted.push(message);
        const log = byId('log');
        if (log) log.textContent = `${message.type}\n${log.textContent}`.slice(0, 600);
        if (message.type === 'ready') {
          const locale = byId('locale').value;
          send('init', Object.assign(settingsPayload(), { locale, strings: Object.assign({}, window.harnessStrings || {}, strings[locale] || {}) }));
          sendDocument('document/load');
        }
        if (window.harnessOnMessage) window.harnessOnMessage(message);
      },
      getState: () => persisted,
      setState: (state) => {
        persisted = state;
        try {
          sessionStorage.setItem('harness-state', JSON.stringify(state));
        } catch {
          /* storage unavailable */
        }
      },
    };
  };

  // The script tag sits after the controls, so they already exist; module scripts run later.
  (function wire() {
    const select = byId('fixture');
    for (const name of Object.keys(fixtures)) select.add(new Option(name, name));
    if (params.get('theme')) byId('themeKind').value = params.get('theme');
    if (params.get('mode')) byId('themeMode').value = params.get('mode');
    if (params.get('fixture') && fixtures[params.get('fixture')]) select.value = params.get('fixture');
    if (params.get('locale')) byId('locale').value = params.get('locale');
    if (params.get('reduce') === '1') byId('reduceMotion').checked = true;
    if (params.get('chrome') === '0') document.body.classList.add('harness-hidden');
    for (const id of ['themeKind', 'themeMode', 'reduceMotion']) byId(id).addEventListener('change', () => send('settings/changed', settingsPayload()));
    select.addEventListener('change', () => sendDocument('document/load'));
    byId('reload').addEventListener('click', () => sendDocument('document/update'));
  })();
})();
