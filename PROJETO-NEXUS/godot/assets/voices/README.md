# Elenco sintético em português brasileiro

96 falas originais para os 24 heróis ativos: seleção, técnica, supremo e vitória. O texto foi escrito para os personagens deste projeto; não imita pessoas reais. É uma primeira dublagem sintética de protótipo, não uma gravação de atores profissionais.

As gravações foram geradas localmente com Kokoro-82M v1.0 (Apache 2.0), utilizando as bases pt-BR `pf_dora`, `pm_alex` e `pm_santa`, com ritmo, afinação e ambiência por personagem. Conversão final por FFmpeg: Vorbis mono, 24 kHz, normalização de volume e controle de pico. O jogo inclui somente as gravações comprimidas, sem modelo de IA, conexão de síntese, conta ou serviço de fala do navegador.

- Roteiro e direção: `godot/data/voice-lines.json`.
- Geração reproduzível: `scripts/art/build-voices.py`; `--only auren elyra solen zaya` amplia o elenco preservando as gravações anteriores.
- Integridade, duração e transcrição: `manifest.json`.
- Créditos: [Kokoro](https://github.com/hexgrad/kokoro), [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx).
- Licenças do modelo e da ferramenta: `Kokoro-APACHE-2.0.txt` e `kokoro-onnx-MIT.txt`.

O canal de voz é separado dos efeitos, permite legendas mesmo com vozes silenciadas, impede repetição por clique e reduz os efeitos em 5 dB durante uma fala. Sair/reiniciar cancela o áudio e restaura a mixagem.
