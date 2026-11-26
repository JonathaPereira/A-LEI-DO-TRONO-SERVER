'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('AndroidManifest declares background call, battery exemption, wifi lock, and Bluetooth permissions', () => {
  const manifest = fs.readFileSync(
    path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  for (const perm of [
    'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    'android.permission.ACCESS_WIFI_STATE',
    'android.permission.CHANGE_WIFI_STATE',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.WAKE_LOCK',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.POST_NOTIFICATIONS',
  ]) {
    assert(manifest.includes(perm), `Missing manifest permission: ${perm}`);
  }
});

test('CallService acquires AudioFocus, supports output routing, and exposes lock-screen Mute/Leave actions', () => {
  const service = fs.readFileSync(
    path.join(ROOT, 'android/app/src/main/java/br/com/mntrono/app/CallService.java'),
    'utf8',
  );
  assert(service.includes('AudioFocusRequest'), 'CallService must acquire AudioFocusRequest');
  assert(
    service.includes('USAGE_VOICE_COMMUNICATION'),
    'CallService must request voice communication audio focus',
  );
  assert(
    service.includes('ACTION_TOGGLE_MUTE') && service.includes('ACTION_LEAVE_CALL'),
    'CallService must expose Mute and Leave lock-screen notification actions',
  );
  assert(
    service.includes('setAudioRoute') && service.includes('getAudioRoute'),
    'CallService must expose native audio route switching (speaker/earpiece/bluetooth)',
  );
  assert(
    service.includes('ACTION_AUDIO_BECOMING_NOISY'),
    'CallService must handle headset unplug cleanly',
  );
});

test('MainActivity keeps WebView timers and WebRTC alive when screen turns off during active call', () => {
  const activity = fs.readFileSync(
    path.join(ROOT, 'android/app/src/main/java/br/com/mntrono/app/MainActivity.java'),
    'utf8',
  );
  assert(
    activity.includes('keepCallWebViewAlive'),
    'MainActivity must keep WebView resumed while CallService holds an active lease',
  );
  assert(
    activity.includes('postDelayed'),
    'MainActivity must re-assert WebView resume after screen-off window visibility transition',
  );
});

test('TronoAndroidPlugin exposes backgroundStatus, requestBackgroundPermissions, requestBatteryExemption, and setAudioRoute', () => {
  const plugin = fs.readFileSync(
    path.join(ROOT, 'android/app/src/main/java/br/com/mntrono/app/TronoAndroidPlugin.java'),
    'utf8',
  );
  for (const symbol of [
    'public void backgroundStatus(',
    'public void requestBackgroundPermissions(',
    'public void requestBatteryExemption(',
    'public void setAudioRoute(',
    'public void updateCallNotification(',
    'ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    'isIgnoringBatteryOptimizations',
  ]) {
    assert(plugin.includes(symbol), `TronoAndroidPlugin missing ${symbol}`);
  }
});

test('createAndroidPermissionsGuard prompts automatically on launch when any background permission is missing', async () => {
  const { createAndroidPermissionsGuard } = await import(
    '../src/lib/mobile/background-permissions.ts'
  );
  const calls = [];
  let state = {
    microphone: false,
    notifications: false,
    batteryUnrestricted: false,
    bluetooth: true,
    audioRoute: 'speaker',
    bluetoothAvailable: false,
    allReady: false,
  };

  const guard = createAndroidPermissionsGuard({
    host: {
      getBackgroundStatus: async () => ({ ...state }),
      requestBackgroundPermissions: async () => {
        calls.push('runtime');
        state = { ...state, microphone: true, notifications: true };
        return { ...state };
      },
      requestBatteryExemption: async () => {
        calls.push('battery');
        state = { ...state, batteryUnrestricted: true, allReady: true };
        return { ...state };
      },
      setAudioRoute: async (route) => {
        calls.push(`route:${route}`);
        state = { ...state, audioRoute: route };
        return { audioRoute: route };
      },
    },
  });

  await guard.refresh();
  let snap = guard.getSnapshot();
  assert.equal(snap.supported, true);
  assert.equal(snap.allReady, false);
  assert.equal(snap.modalOpen, true, 'Startup modal must open automatically on Android when missing permissions');

  await guard.configureAll();
  assert.deepEqual(calls, ['runtime', 'battery']);
  snap = guard.getSnapshot();
  assert.equal(snap.allReady, true);
  assert.equal(snap.modalOpen, false, 'Modal closes automatically once all permissions are granted');

  const route = await guard.cycleAudioRoute();
  assert.equal(route, 'earpiece');
  assert.equal(guard.getSnapshot().audioRoute, 'earpiece');
});

test('createAndroidPermissionsGuard stays closed on startup when all permissions are already granted or on non-Android', async () => {
  const { createAndroidPermissionsGuard } = await import(
    '../src/lib/mobile/background-permissions.ts'
  );

  const webGuard = createAndroidPermissionsGuard({ host: null });
  await webGuard.refresh();
  assert.equal(webGuard.getSnapshot().supported, false);
  assert.equal(webGuard.getSnapshot().modalOpen, false);

  const readyGuard = createAndroidPermissionsGuard({
    host: {
      getBackgroundStatus: async () => ({
        microphone: true,
        notifications: true,
        batteryUnrestricted: true,
        bluetooth: true,
        audioRoute: 'speaker',
        bluetoothAvailable: true,
        allReady: true,
      }),
      requestBackgroundPermissions: async () => {
        throw new Error('should not be called');
      },
      requestBatteryExemption: async () => {
        throw new Error('should not be called');
      },
      setAudioRoute: async (route) => ({ audioRoute: route }),
    },
  });
  await readyGuard.refresh();
  assert.equal(readyGuard.getSnapshot().allReady, true);
  assert.equal(readyGuard.getSnapshot().modalOpen, false);

  // Explicit open and dismiss still work cleanly.
  readyGuard.openModal();
  assert.equal(readyGuard.getSnapshot().modalOpen, true);
  readyGuard.dismissModal();
  assert.equal(readyGuard.getSnapshot().modalOpen, false);
});
