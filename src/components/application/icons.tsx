'use client';
import { CrownSimpleIcon } from '@phosphor-icons/react/dist/csr/CrownSimple';
import { ChatsCircleIcon } from '@phosphor-icons/react/dist/csr/ChatsCircle';
import { GameControllerIcon } from '@phosphor-icons/react/dist/csr/GameController';
import { UsersThreeIcon } from '@phosphor-icons/react/dist/csr/UsersThree';
import { ListIcon } from '@phosphor-icons/react/dist/csr/List';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/csr/Microphone';
import { MicrophoneSlashIcon } from '@phosphor-icons/react/dist/csr/MicrophoneSlash';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { HeadphonesIcon } from '@phosphor-icons/react/dist/csr/Headphones';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/csr/SpeakerHigh';
import { HashIcon } from '@phosphor-icons/react/dist/csr/Hash';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { PaperclipIcon } from '@phosphor-icons/react/dist/csr/Paperclip';
import { PaperPlaneRightIcon } from '@phosphor-icons/react/dist/csr/PaperPlaneRight';
import { SmileyIcon } from '@phosphor-icons/react/dist/csr/Smiley';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { VideoCameraIcon } from '@phosphor-icons/react/dist/csr/VideoCamera';
import { VideoCameraSlashIcon } from '@phosphor-icons/react/dist/csr/VideoCameraSlash';
import { MonitorArrowUpIcon } from '@phosphor-icons/react/dist/csr/MonitorArrowUp';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { ArrowsOutIcon } from '@phosphor-icons/react/dist/csr/ArrowsOut';
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree';
import { PhoneDisconnectIcon } from '@phosphor-icons/react/dist/csr/PhoneDisconnect';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { MusicNotesIcon } from '@phosphor-icons/react/dist/csr/MusicNotes';
import { ScissorsIcon } from '@phosphor-icons/react/dist/csr/Scissors';
import { DesktopTowerIcon } from '@phosphor-icons/react/dist/csr/DesktopTower';
import { RecordIcon } from '@phosphor-icons/react/dist/csr/Record';
import { StopIcon } from '@phosphor-icons/react/dist/csr/Stop';
import { BellIcon } from '@phosphor-icons/react/dist/csr/Bell';
import { BellSlashIcon } from '@phosphor-icons/react/dist/csr/BellSlash';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
const icons = {
  search: MagnifyingGlassIcon,
  bellOff: BellSlashIcon,
  music: MusicNotesIcon,
  clips: ScissorsIcon,
  pc: DesktopTowerIcon,
  record: RecordIcon,
  stop: StopIcon,
  bell: BellIcon,
  camera: VideoCameraIcon,
  cameraOff: VideoCameraSlashIcon,
  screen: MonitorArrowUpIcon,
  grid: SquaresFourIcon,
  expand: ArrowsOutIcon,
  settings: SlidersHorizontalIcon,
  more: DotsThreeIcon,
  disconnect: PhoneDisconnectIcon,
  swap: ArrowsClockwiseIcon,
  crown: CrownSimpleIcon,
  chat: ChatsCircleIcon,
  games: GameControllerIcon,
  members: UsersThreeIcon,
  menu: ListIcon,
  voice: SpeakerHighIcon,
  microphone: MicrophoneIcon,
  microphoneSlash: MicrophoneSlashIcon,
  exit: SignOutIcon,
  headphones: HeadphonesIcon,
  hash: HashIcon,
  chevron: CaretDownIcon,
  attach: PaperclipIcon,
  send: PaperPlaneRightIcon,
  emoji: SmileyIcon,
  eye: EyeIcon,
  eyeSlash: EyeSlashIcon,
  arrow: ArrowUpRightIcon,
  back: ArrowLeftIcon,
  close: XIcon,
  check: CheckIcon,
};
export function AppIcon({ name, size = 20 }: { name: keyof typeof icons; size?: number }) {
  const Glyph = icons[name];
  return <Glyph size={size} weight="regular" aria-hidden="true" />;
}
