export type RemoteGamepadStateTuple = [number, number, number, number, number, number, number];

export interface StandardGamepadLike {
  mapping?: string;
  connected?: boolean;
  buttons: ReadonlyArray<{ pressed?: boolean; value?: number } | undefined>;
  axes: ReadonlyArray<number | undefined>;
}

const bits = [
  0x1000, 0x2000, 0x4000, 0x8000, 0x100, 0x200, 0, 0, 0x20, 0x10, 0x40, 0x80, 1, 2, 4, 8,
] as const;

export const neutral = (): RemoteGamepadStateTuple => [0, 0, 0, 0, 0, 0, 0];

const axis = (v: number | undefined): number => {
  const safe = Number.isFinite(v) ? (v as number) : 0;
  return Math.round(Math.max(-1, Math.min(1, safe)) * (safe < 0 ? 32768 : 32767));
};

export function snapshot(pad: StandardGamepadLike | null | undefined): RemoteGamepadStateTuple {
  if (!pad || pad.mapping !== 'standard' || !pad.connected) return neutral();
  let buttons = 0;
  for (let i = 0; i < bits.length; i++) {
    if (pad.buttons[i]?.pressed) buttons |= bits[i];
  }
  const trigger = (i: number) =>
    Math.round(Math.max(0, Math.min(1, pad.buttons[i]?.value || 0)) * 255);
  return [
    buttons,
    trigger(6),
    trigger(7),
    axis(pad.axes[0]),
    axis(-(pad.axes[1] || 0)),
    axis(pad.axes[2]),
    axis(-(pad.axes[3] || 0)),
  ];
}

const keyMap: Record<string, number> = {
  Space: 0x1000,
  KeyJ: 0x1000,
  KeyK: 0x2000,
  KeyX: 0x4000,
  KeyU: 0x4000,
  KeyI: 0x8000,
  Enter: 0x10,
  Backspace: 0x20,
  KeyQ: 0x100,
  KeyE: 0x200,
  ArrowUp: 1,
  ArrowDown: 2,
  ArrowLeft: 4,
  ArrowRight: 8,
};

export function keyboard(keys: ReadonlySet<string>): RemoteGamepadStateTuple {
  let b = 0;
  for (const [key, bit] of Object.entries(keyMap)) {
    if (keys.has(key)) b |= bit;
  }
  return [
    b,
    keys.has('Digit1') ? 255 : 0,
    keys.has('Digit2') ? 255 : 0,
    axis(Number(keys.has('KeyD')) - Number(keys.has('KeyA'))),
    axis(Number(keys.has('KeyW')) - Number(keys.has('KeyS'))),
    0,
    0,
  ];
}

export const keyboardKeys: ReadonlySet<string> = new Set([
  'Space',
  'KeyJ',
  'KeyK',
  'KeyX',
  'KeyU',
  'KeyI',
  'Enter',
  'Backspace',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Digit1',
  'Digit2',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

export const RemoteGamepad = Object.freeze({
  snapshot,
  keyboard,
  neutral,
  keyboardKeys,
});

declare global {
  interface Window {
    TronoRemoteGamepad?: typeof RemoteGamepad;
  }
}

if (typeof window !== 'undefined') {
  window.TronoRemoteGamepad = RemoteGamepad;
}
