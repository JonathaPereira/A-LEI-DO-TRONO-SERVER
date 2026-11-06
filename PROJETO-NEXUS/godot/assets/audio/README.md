# Áudio original de combate

34 clipes em 17 bancos, com duas variações por material/fase. Arquivos WAV estéreo, 48 kHz, PCM de 16 bits. O Godot mantém PCM na importação (`compress/mode=0`); os arquivos estão incluídos no projeto e não exigem Python para jogar.

Os sons foram gerados para o projeto pelo script [art-source/audio/generate.py](../../../art-source/audio/generate.py), combinando ruído filtrado, transientes, ressonâncias e reflexões curtas. Não usam amostras de jogos ou bibliotecas externas. Para regenerar, instale NumPy e SciPy e execute o script na raiz do repositório.

`godot/scripts/sound.gd` mistura até oito vozes, com variações de forma de onda e afinação. Preparação, arma, elemento, crítico e escudo têm camadas próprias. Um limitador no barramento NexusSFX protege a soma de picos. Silenciar, ajustar o volume e reiniciar interrompem ou atualizam as vozes ativas conforme necessário.
