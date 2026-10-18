import type { ProfileMediaCredit, ProfileMediaKind } from './profiles';

export interface ProfileGif {
  readonly id: string;
  readonly url: string;
  readonly preview?: string;
  readonly bytes?: number;
  readonly credit: ProfileMediaCredit;
}
export interface ProfileGifPage {
  readonly items: readonly ProfileGif[];
  readonly next: number | null;
}
export interface GifPickerSnapshot extends ProfileGifPage {
  readonly open: boolean;
  readonly target: ProfileMediaKind;
  readonly query: string;
  readonly link: string;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly failed: readonly string[];
  readonly message: string;
}
export interface GifPickerSelection {
  target: ProfileMediaKind;
  onSelect(file: File, credit: ProfileMediaCredit): Promise<void>;
}
