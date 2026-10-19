import type { ThroneChoiceRules, ThroneLaw, ThroneSuit } from '../../types/throne-choices';
import type { ThroneCourtState } from '../../types/throne-table';

export const throneSuitDetails: Readonly<
  Record<ThroneSuit, { name: string; glyph: string; color: string }>
> = {
  cetro: { name: 'Cetro', color: '#d4a63f', glyph: '♜' },
  chave: { name: 'Chave', color: '#2f8a5f', glyph: '⚿' },
  lamina: { name: 'Lâmina', color: '#b13939', glyph: '⚔' },
  mascara: { name: 'Máscara', color: '#8050a0', glyph: '◉' },
};
export function throneLawTooltip(
  rules: ThroneChoiceRules,
  game: ThroneCourtState | null,
  id: ThroneLaw,
) {
  const law = rules.laws[id];
  if (!law) return '';
  const used = game?.lawUsage?.[id] ?? 0;
  let extra = game ? ` Usos consumidos nesta rodada: ${used}/2.` : '';
  if (game?.currentLaw === id) {
    extra += ` Esta é a Lei ativa da vaza ${game.trick}.`;
    if (id === 'estandarte')
      extra += game.trump
        ? ` Trunfo atual: ${throneSuitDetails[game.trump].name}.`
        : ' O Trunfo será declarado antes da abertura.';
  }
  return `${law.name}: ${law.description}${extra}`;
}
export function throneDecreeTooltip(rules: ThroneChoiceRules, game: ThroneCourtState | null) {
  const d = rules.decrees.find((d) => d.id === game?.decree);
  if (!d || !game) return 'O Decreto altera a estrutura estratégica da rodada inteira.';
  let moment = '';
  if (d.id === 'reserva')
    moment =
      game.trick < 10
        ? ` Momento atual: a Reserva continua protegida e será obrigatória na 10ª vaza.`
        : ` Momento atual: a carta de Reserva deve ser jogada nesta 10ª vaza.`;
  if (d.id === 'rotacao')
    moment =
      game.trick < 7
        ? ` Momento atual: a Rotação ainda não começou; haverá trocas após as vazas 7, 8 e 9.`
        : game.trick <= 9
          ? ` Momento atual: ao fim desta vaza haverá uma troca simultânea para a esquerda.`
          : ` Momento atual: as rotações desta rodada já terminaram.`;
  if (d.id === 'corte')
    moment =
      ' Momento atual: as cartas escolhidas pela Corte Aberta permanecem expostas até serem utilizadas.';
  if (d.id === 'desafio')
    moment =
      ' Momento atual: uma primeira Coroa, ou uma nova Coroa consecutiva, pode obrigar o vencedor a revelar uma carta.';
  if (d.id === 'silencio')
    moment =
      game.trick <= 3
        ? ` Momento atual: gastar Influência está BLOQUEADO nesta vaza (${game.trick}/3).`
        : ' Momento atual: o período de Silêncio terminou; Influência pode ser usada normalmente.';
  if (d.id === 'sucessao')
    moment = game.previousWinningSuit
      ? ` Momento atual: o próximo líder não poderá abrir com ${throneSuitDetails[game.previousWinningSuit].name}, salvo se não possuir outro naipe.`
      : ' Momento atual: ainda não existe um naipe vencedor anterior a restringir.';
  return `${d.name}: ${d.text}${moment}`;
}
