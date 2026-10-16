'use strict';
// New vector cards, with exact text and no raster editing or external fonts.
const fs = require('node:fs'),
  path = require('node:path');
const shapes = {
  ordem:
    '<path d="M48 12v78M18 32h60M24 32 9 61h30L24 32Zm48 0L57 61h30L72 32ZM36 90h24M9 61q15 18 30 0M57 61q15 18 30 0"/><circle cx="48" cy="17" r="6"/>',
  estandarte:
    '<path d="M25 12v78M25 18h53l-9 18 9 18H25M16 90h18"/><path d="m42 25 5 11 12 1-9 8 3 12-10-7-10 7 2-12-9-8 12-1Z" transform="translate(7 -6) scale(.8)"/>',
  revolta:
    '<path d="M21 76 70 25M16 60l23 23M23 68l-8 10M63 19l18-7-7 19M76 76 26 25M58 83l24-23M75 69l9 10M19 19l-4-7 20 7"/><path d="M40 8 36 18M56 8l4 10"/>',
  anarquia:
    '<path d="m48 9 9 24 25-6-16 21 17 19-26-2-10 25-10-25-25 3 17-21-16-20 25 7 10-25Z"/><circle cx="48" cy="49" r="14"/><path d="M42 46q6-10 12 0M42 54q6 9 12 0"/>',
  usurpacao:
    '<rect x="13" y="24" width="28" height="42" rx="4" transform="rotate(-8 27 45)"/><rect x="55" y="26" width="28" height="42" rx="4" transform="rotate(8 69 47)"/><path d="M30 14q30-14 49 6l-12-2M79 20l-2-11M68 80Q34 97 16 75l12 3M16 75l2 13"/><path d="m21 44 6-9 6 9-6 9-6-9ZM62 46l7-9 7 9-7 9-7-9Z"/>',
};
const info = {
  ordem: [
    'ORDEM',
    '#95733a',
    [
      'Siga o naipe inicial.',
      'Coroa: maior desse naipe.',
      'Sombra: menor dos demais desse naipe.',
      'Sem outro: menor carta dos demais.',
    ],
  ],
  estandarte: [
    'ESTANDARTE',
    '#41668b',
    [
      'A Sombra anterior declara o trunfo.',
      'Dois ou mais: maior / menor trunfo.',
      'Um: Coroa; Sombra é menor dos demais.',
      'Nenhum trunfo: aplica-se Ordem.',
    ],
  ],
  revolta: [
    'REVOLTA',
    '#a74437',
    [
      'Siga o naipe inicial.',
      'Coroa: menor desse naipe.',
      'Sombra: maior carta dos demais.',
      'O poder muda de lado.',
    ],
  ],
  anarquia: [
    'ANARQUIA',
    '#6f5193',
    [
      'Todos os naipes são livres.',
      'Coroa: maior carta.',
      'Sombra: menor carta dos demais.',
      'Só o valor efetivo importa.',
    ],
  ],
  usurpacao: [
    'USURPAÇÃO',
    '#495e63',
    [
      'A Sombra escolhe qualquer adversário.',
      'Separa uma carta e escolhe às cegas.',
      'A própria carta nunca retorna.',
      'Depois, joga-se como Ordem.',
    ],
  ],
};
for (const [id, [name, color, lines]] of Object.entries(info)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="504" viewBox="0 0 360 504" role="img" aria-labelledby="title desc"><title id="title">${name} · A Lei do Trono</title><desc id="desc">${lines.join(' ')}</desc><defs><linearGradient id="paper" x2=".8" y2="1"><stop stop-color="#faf0d5"/><stop offset="1" stop-color="#e6cfa0"/></linearGradient><radialGradient id="seal"><stop stop-color="#fff7df"/><stop offset="1" stop-color="#dac18d"/></radialGradient></defs><rect x="2" y="2" width="356" height="500" rx="22" fill="url(#paper)" stroke="#785b2f" stroke-width="4"/><rect x="14" y="14" width="332" height="476" rx="15" fill="none" stroke="#b79754" stroke-width="1.5"/><path d="M28 73V28h45M287 28h45v45M28 431v45h45M287 476h45v-45" fill="none" stroke="${color}" stroke-width="2"/><path d="m32 36 9 0-4 8-5-8Zm296 0-9 0 4 8 5-8Zm-296 432 9 0-4-8-5 8Zm296 0-9 0 4-8 5 8Z" fill="${color}"/><text x="180" y="44" text-anchor="middle" font-family="Georgia,serif" font-size="9" letter-spacing="3" fill="#73592c">A LEI DO TRONO</text><text x="180" y="82" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="25" letter-spacing="1" fill="${color}">${name}</text><path d="M60 100h240" stroke="#b79754"/><circle cx="180" cy="236" r="91" fill="url(#seal)" stroke="${color}" stroke-width="1.5"/><circle cx="180" cy="236" r="84" fill="none" stroke="${color}" stroke-dasharray="2 8" opacity=".7"/><g transform="translate(109 165) scale(1.48)" stroke="${color}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round">${shapes[id]}</g><path d="M60 355h240" stroke="#b79754"/>${lines.map((line, i) => `<text x="180" y="${382 + i * 20}" text-anchor="middle" font-family="Georgia,serif" font-size="12" fill="#3c3528">${line}</text>`).join('')}<text x="180" y="471" text-anchor="middle" font-family="Georgia,serif" font-size="8" letter-spacing="2" fill="#826832">REGRAS 0.9.0 · LEI DA VAZA</text></svg>`;
  fs.writeFileSync(path.resolve(__dirname, `../public/assets/laws/${id}.svg`), svg);
}
