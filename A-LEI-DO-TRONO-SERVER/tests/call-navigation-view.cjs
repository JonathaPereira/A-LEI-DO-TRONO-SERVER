'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/lib/voice/navigation-view.ts');

async function setup(t) {
  const { createCallNavigationView } = await modulePromise;
  const doc = new EventTarget(),
    viewport = new EventTarget(),
    calls = [];
  let modal = false,
    diagnostic = false;
  const state = {
    hub: true,
    drawerOpen: false,
    panelAvailable: true,
    panelOpen: true,
    gameCommunicationOpen: false,
    textRoom: null,
  };
  doc.body = { classList: { toggle() {} } };
  doc.getElementById = () => null;
  doc.querySelector = () => (modal ? {} : null);
  viewport.innerWidth = 1200;
  const client = createCallNavigationView({
    document: doc,
    window: viewport,
    navigation: {
      getSnapshot: () => state,
      subscribe: () => () => {},
      toggleTextChat: (value) => calls.push(['text', value]),
    },
    applyGeometry() {},
    openMosaic() {},
    closeDiagnostics() {
      calls.push('diagnostics');
      return diagnostic;
    },
    closeSettings() {
      calls.push('settings');
    },
  });
  client.start();
  t.after(client.dispose);
  return {
    calls,
    state,
    client,
    modal(value) {
      modal = value;
    },
    diagnostic(value) {
      diagnostic = value;
    },
    escape(prevented = false) {
      const event = new Event('keydown', { cancelable: true });
      event.key = 'Escape';
      if (prevented) event.preventDefault();
      doc.dispatchEvent(event);
      return event;
    },
  };
}

test('a foreground dialog or popover retains Escape for its native dismiss action', async (t) => {
  const { modal, escape, calls, state } = await setup(t);
  modal(true);
  state.drawerOpen = true;
  assert.equal(escape().defaultPrevented, false);
  assert.deepEqual(calls, [], 'background diagnostics, text and settings must remain untouched');
});

test('without another dialog, Escape preserves diagnostics, drawer and settings priority', async (t) => {
  const { diagnostic, escape, calls, state } = await setup(t);
  diagnostic(true);
  escape();
  assert.deepEqual(calls.splice(0), ['diagnostics']);
  diagnostic(false);
  state.drawerOpen = true;
  escape();
  assert.deepEqual(calls.splice(0), ['diagnostics', ['text', false]]);
  state.drawerOpen = false;
  escape();
  assert.deepEqual(calls.splice(0), ['diagnostics', 'settings']);
});

test('already consumed Escape and disposed navigation do not close another surface', async (t) => {
  const { escape, calls, client } = await setup(t);
  escape(true);
  client.dispose();
  escape();
  assert.deepEqual(calls, []);
});
