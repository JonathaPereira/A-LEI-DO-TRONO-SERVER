import type { GameDestination } from '../games/library';

export type MenGameCategory = 'strategy' | 'action' | 'card' | 'rpg' | 'tabletop' | 'deduction';

export type MenGameLaunchMode =
  | 'embedded-stage' // Jogo de mesa integrado na superfície da Corte
  | 'isolated-iframe' // Jogo executado em sandbox de iframe sob demanda
  | 'external-window' // Jogo executado em janela dedicada (Electron/Web tab)
  | 'standalone-web'; // Aplicação web independente

export interface MenGameManifest {
  /** Identificador canônico do jogo (compatível com a rota do Trono) */
  readonly id: GameDestination;
  /** Identificador de rota de destino do MeN Trono */
  readonly destination: GameDestination;
  /** Nome de exibição principal */
  readonly title: string;
  /** Rótulo secundário / etiqueta de gênero e capacidade de jogadores */
  readonly tag: string;
  /** Resumo / sinopse do jogo */
  readonly description: string;
  /** Versão semântica oficial do jogo */
  readonly version: string;
  /** Categoria temática do jogo */
  readonly category: MenGameCategory;
  /** Modo de execução arquitetural */
  readonly launchMode: MenGameLaunchMode;
  /** URL de entrada do pacote do jogo (local ou CDN) */
  readonly entryUrl: string;
  /** Imagem de capa / thumbnail no catálogo */
  readonly image: string;
  /** Tamanho estimado dos ativos (bytes) */
  readonly assetsSize?: number;
  /** Requer autenticação MeN Trono / Supabase */
  readonly authRequired: boolean;
  /** Suporta e recomenda modo tela cheia */
  readonly fullscreen: boolean;
  /** Modo multiplayer habilitado */
  readonly multiplayer: boolean;
  /** Status de disponibilidade */
  readonly status: 'available' | 'maintenance' | 'preview';
}
