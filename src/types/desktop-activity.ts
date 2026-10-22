export interface DesktopActivityApp {
  readonly id: string;
  readonly name: string;
}

export interface DesktopActivityGame {
  readonly name: string;
  readonly startedAt?: number;
}

export interface DesktopActivityState {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly apps: readonly DesktopActivityApp[];
  readonly game: DesktopActivityGame | null;
  readonly error: string | null;
}

export interface DesktopActivityConfiguration {
  readonly enabled: boolean;
  readonly preferredAppId: string | null;
  readonly name: string;
}

export interface DesktopActivityNative {
  getActivityState?(): Promise<unknown>;
  configureActivity?(configuration: DesktopActivityConfiguration): Promise<unknown>;
  onActivity?(listener: (value: unknown) => void): (() => void) | void;
}

export interface DesktopActivitySnapshot {
  readonly enabled: boolean;
  readonly preferredAppId: string | null;
  readonly name: string;
  readonly available: boolean;
  readonly accountPresent: boolean;
  readonly apps: readonly DesktopActivityApp[];
  readonly currentGame: DesktopActivityGame | null;
  readonly error: string | null;
  readonly status: string;
  readonly configuring: boolean;
}
