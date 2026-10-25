'use client';
import { CrownSimple } from '@phosphor-icons/react/dist/csr/CrownSimple';
import { ChatsCircle } from '@phosphor-icons/react/dist/csr/ChatsCircle';
import { GameController } from '@phosphor-icons/react/dist/csr/GameController';
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree';
import { List } from '@phosphor-icons/react/dist/csr/List';
import { Microphone } from '@phosphor-icons/react/dist/csr/Microphone';
import { MicrophoneSlash } from '@phosphor-icons/react/dist/csr/MicrophoneSlash';
import { SignOut } from '@phosphor-icons/react/dist/csr/SignOut';
import { Headphones } from '@phosphor-icons/react/dist/csr/Headphones';
import { SpeakerHigh } from '@phosphor-icons/react/dist/csr/SpeakerHigh';
import { Hash } from '@phosphor-icons/react/dist/csr/Hash';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { Paperclip } from '@phosphor-icons/react/dist/csr/Paperclip';
import { PaperPlaneRight } from '@phosphor-icons/react/dist/csr/PaperPlaneRight';
import { Smiley } from '@phosphor-icons/react/dist/csr/Smiley';
import { Eye } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlash } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { VideoCamera } from '@phosphor-icons/react/dist/csr/VideoCamera';
import { VideoCameraSlash } from '@phosphor-icons/react/dist/csr/VideoCameraSlash';
import { MonitorArrowUp } from '@phosphor-icons/react/dist/csr/MonitorArrowUp';
import { SquaresFour } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { ArrowsOut } from '@phosphor-icons/react/dist/csr/ArrowsOut';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { DotsThree } from '@phosphor-icons/react/dist/csr/DotsThree';
import { PhoneDisconnect } from '@phosphor-icons/react/dist/csr/PhoneDisconnect';
import { ArrowsClockwise } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
const icons = {
  camera: VideoCamera,
  cameraOff: VideoCameraSlash,
  screen: MonitorArrowUp,
  grid: SquaresFour,
  expand: ArrowsOut,
  settings: SlidersHorizontal,
  more: DotsThree,
  disconnect: PhoneDisconnect,
  swap: ArrowsClockwise,
  crown: CrownSimple,
  chat: ChatsCircle,
  games: GameController,
  members: UsersThree,
  menu: List,
  voice: SpeakerHigh,
  microphone: Microphone,
  microphoneSlash: MicrophoneSlash,
  exit: SignOut,
  headphones: Headphones,
  hash: Hash,
  chevron: CaretDown,
  attach: Paperclip,
  send: PaperPlaneRight,
  emoji: Smiley,
  eye: Eye,
  eyeSlash: EyeSlash,
  arrow: ArrowUpRight,
  back: ArrowLeft,
  close: X,
  check: Check,
};
export function AppIcon({ name, size = 20 }: { name: keyof typeof icons; size?: number }) {
  const Glyph = icons[name];
  return <Glyph size={size} weight="regular" aria-hidden="true" />;
}
