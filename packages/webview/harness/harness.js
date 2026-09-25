// Mocks the VS Code webview API so the built webview runs in a normal browser tab.
// Query parameters: ?theme=dark&mode=auto&fixture=<name>&locale=es&reduce=1&chrome=0
(function () {
  const params = new URLSearchParams(location.search);
  const posted = [];
  let persisted;
  const byId = (id) => document.getElementById(id);

  const strings = {
    en: {
      'app.loading': 'Loading diagram…',
      'app.lines': '{0} lines',
      'app.canvasPlaceholder': 'The animation appears here.',
      'transport.label': 'Playback controls',
      'transport.first': 'First step',
      'transport.previous': 'Previous step',
      'transport.play': 'Play',
      'transport.pause': 'Pause',
      'transport.next': 'Next step',
      'transport.last': 'Last step',
      'toolbar.label': 'Diagram toolbar',
    },
    es: {
      'transport.play': 'Reproducir',
      'transport.pause': 'Pausar',
      'transport.next': 'Paso siguiente',
      'transport.previous': 'Paso anterior',
      'app.loading': 'Cargando diagrama…',
    },
  };

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
    if (type === 'document/load') Object.assign(payload, { uri: `file:///harness/${name}`, fileName: name });
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
      setState: (state) => (persisted = state),
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
