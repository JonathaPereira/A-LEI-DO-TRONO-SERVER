# Áudio — edição 0.5

Quatro composições originais em ciclos de 16 compassos: floresta (76 BPM), cripta (64), forja (94) e chefes (116). Pads estéreo, baixos, melodias tipo flauta/cordas dedilhadas e percussão metálica. Transição de volume entre ambientes; música reduz na pausa e para quando a aba fica oculta.

`produce-audio.py` usa NumPy, SciPy e FFmpeg para gerar os arquivos MP3 locais. Apenas a reprodução dos arquivos e a síntese Web Audio são necessárias no navegador; Python não é uma dependência do jogo. Três reações de dor são voz sintetizada por harmônicos/formantes e ruído de respiração. Nenhuma gravação de ator ou música comercial foi usada.

`audio.js` combina ruído filtrado, envelopes, frequências, panorâmica e reverberação curta para golpes físicos, metal, flechas, fogo, gelo, eletricidade, veneno, passos, queda, esquiva e recompensas. Há limite de fontes e espaçamento mínimo por efeito. Volume de música e de efeitos/voz são separados e persistem neste navegador.

Verificação técnica: todos os sete MP3 foram decodificados; picos inferiores a 1.0 e RMS acima de 0.02. As composições duram aproximadamente 33 a 60 segundos, com repetição. A qualidade auditiva não foi avaliada em navegador/dispositivo físico nesta sessão.
