'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// =============================================================================
// SUÍTE DE VALIDAÇÃO: ANIMAÇÕES, EFEITOS E ÁUDIO COM IDENTIDADE DE FANTASIA
// ATALAIA: GUARDIÕES DO CRISTAL
// =============================================================================

const root = path.resolve(__dirname, '..');
const atalaiaDir = path.join(root, 'games/atalaia');
const scriptsDir = path.join(atalaiaDir, 'scripts');
const assetsDir = path.join(atalaiaDir, 'assets');
const audioDir = path.join(assetsDir, 'audio');
const artDir = path.join(assetsDir, 'art');

// -----------------------------------------------------------------------------
// BATERIA 1: ANIMAÇÕES DE ENTIDADES, TORRETAS E TRANSIÇÕES
// -----------------------------------------------------------------------------

test('1.1 - Animações de inimigos: caminhada, ciclos por espécie, bobbing, flutuação e morte', () => {
  const enemyScript = fs.readFileSync(path.join(scriptsDir, 'enemy.gd'), 'utf8');
  const artScript = fs.readFileSync(path.join(scriptsDir, 'art.gd'), 'utf8');

  // Ciclos de caminhada no art.gd
  assert(artScript.includes('mob-walk-v6.webp'), 'Deve usar folha de sprites de caminhada para quadrúpedes/bípedes');
  assert(artScript.includes('creatures-v2.webp'), 'Deve usar folha de criaturas para espíritos, cogumelos e chefes');
  assert(artScript.includes('frames.set_animation_speed("default",8.0)'), 'Velocidade de animação deve ser 8 FPS');

  // Verificação de passadas e variações no enemy.gd
  assert(enemyScript.includes('var stride={"skeleton":28.0,"wolf":40.0,"spider":25.0,"golem":36.0}'),
    'Cada criatura deve possuir passada proporcional à sua anatomia');
  assert(enemyScript.includes('float_offset=12.0+sin(age*3.8)*3.0 if data.type=="spirit" else 0.0'),
    'Espíritos devem possuir flutuação senoidal contínua');
  assert(enemyScript.includes('var bob=absf(sin(step_phase))*1.25'),
    'Marcha deve ter balanço vertical (bobbing) sincronizado com a passada');
  assert(enemyScript.includes('$Walk.flip_h=cos(data.angle)<-0.15'),
    'Sprite deve espelhar horizontalmente com base na direção do movimento');

  // Animação de derrota/morte
  assert(enemyScript.includes('func die():'), 'Deve possuir transição suave de morte');
  assert(enemyScript.includes('tween.tween_property(self,"modulate:a",0.0,0.28)'), 'Morte deve esmaecer transparência');
  assert(enemyScript.includes('tween.tween_property($Walk,"rotation",0.15,0.28)'), 'Morte deve rotacionar sutilmente');
  assert(enemyScript.includes('tween.tween_property($Walk,"scale",$Walk.scale*Vector2(1.1,0.75),0.28)'),
    'Morte deve achatar levemente a criatura');
});

test('1.2 - Animações de torretas: rotação de mira, recuo balístico, escala de disparo e upgrade', () => {
  const towerScript = fs.readFileSync(path.join(scriptsDir, 'tower.gd'), 'utf8');

  // Mira e recuo no tower.gd
  assert(towerScript.includes('$Gimbal/Head.rotation=data.aim'), 'Cabeça da torreta deve rotacionar suavemente para o alvo');
  assert(towerScript.includes('$Gimbal/Head.position=Vector2(-data.recoil*4.0,0).rotated(data.aim)'),
    'Recuo do disparo deve empurrar a cabeça para trás ao longo do vetor de mira');
  assert(towerScript.includes('$Base.scale.y=(104.0/AtalaiaArt.tower(data.type).get_width())*(1.0-data.recoil*0.015)'),
    'Base da torreta deve absorver elasticamente a força do recuo');

  // Efeito e animação de evolução/upgrade
  assert(towerScript.includes('displayed_level=int(data.level);upgrade_flash=0.8'),
    'Mudança de nível deve disparar flash de upgrade');
  assert(towerScript.includes('draw_arc(Vector2.ZERO,37+(0.8-upgrade_flash)*35,0,TAU,64,Color(tint,upgrade_flash),2,true)'),
    'Evolução deve desenhar anel rúnico em expansão com a cor da torreta');

  // Animação de reposicionamento (move)
  assert(towerScript.includes('move_tween.tween_property(self,"position",point,0.38).set_trans(Tween.TRANS_CUBIC)'),
    'Reposicionamento de torreta deve usar transição cúbica suave');
});

// -----------------------------------------------------------------------------
// BATERIA 2: EFEITOS VISUAIS MODERNOS DE FANTASIA (VFX)
// -----------------------------------------------------------------------------

test('2.1 - Efeitos de elementos mágicos: fogo, gelo, eletricidade, veneno e impactos', () => {
  const boardScript = fs.readFileSync(path.join(scriptsDir, 'board.gd'), 'utf8');

  // Fogo (Lança-chamas e Forja de Cinzas)
  assert(boardScript.includes('if AtalaiaCatalog.family(t.type)=="flame" and t.firing:'),
    'Deve detectar torretas de chamas disparando');
  assert(boardScript.includes('var width=17.0-layer*6.0'), 'Jato de fogo deve ser renderizado em camadas');
  assert(boardScript.includes('Color(1,0.18,0.02,0.38),Color(1,0.55,0.06,0.7),Color(1,0.95,0.65,0.9)'),
    'Fogo deve possuir gradação de 3 tons (brasas, chamas, núcleo incandescente)');
  assert(boardScript.includes('AtalaiaArt.glow()'), 'Jato e impactos devem usar halo aditivo de glow');

  // Eletricidade (Tesla e Farol Espectral)
  assert(boardScript.includes('var normal=(to-from).normalized().orthogonal()'),
    'Relâmpago deve calcular vetores ortogonais para ramificação em arco');
  assert(boardScript.includes('points.append(from.lerp(to,k/9.0)+normal*sin(k*17.0+float(b.seed%137)+int(time*24))*8)'),
    'Arco elétrico deve possuir perturbação senoidal orgânica');
  assert(boardScript.includes('c.draw_polyline(points,Color(0.24,0.37,1.0,alpha*0.35),7,true)'),
    'Relâmpago deve ter camada externa azul de descarga');
  assert(boardScript.includes('c.draw_polyline(points,Color(0.93,0.98,1.0,alpha),1.0,true)'),
    'Relâmpago deve ter filamento central brilhante quase branco');

  // Veneno (Alquimista e Poças)
  assert(boardScript.includes('draw_set_transform(center,0,Vector2(1,0.45))'),
    'Poças de veneno devem ser desenhadas com projeção isométrica 2.5D');
  assert(boardScript.includes('draw_circle(Vector2.ZERO,radius,Color(0.13,0.34,0.05,0.50*opacity))'),
    'Poça de veneno deve ter anéis concêntricos de ácido');
  assert(boardScript.includes('draw_arc(pos,2.0+f*5.0,0,TAU,12,Color(0.65,1.0,0.28,(1.0-f)*0.55*opacity)'),
    'Poça deve emitir bolhas químicas efervescentes em expansão');

  // Explosão (Morteiro e Canhão Sísmico)
  assert(boardScript.includes('var is_mortar=e.type=="mortar" or AtalaiaCatalog.family(e.type)=="mortar"'),
    'Canhão Sísmico e Morteiro devem compartilhar física de dispersão de estilhaços');
  assert(boardScript.includes('burst(e.pos,col,26 if is_mortar else 9,115.0 if is_mortar else 50.0)'),
    'Explosão de morteiros deve gerar 26 fragmentos em alta velocidade');
  assert(boardScript.includes('smoke.append('), 'Explosão e trajetória de morteiros devem gerar fumaça física volumétrica');
});

test('2.2 - Acessibilidade visual: perfil de efeitos reduzidos preservando legibilidade tática', () => {
  const boardScript = fs.readFileSync(path.join(scriptsDir, 'board.gd'), 'utf8');

  assert(boardScript.includes('func set_reduced_effects(enabled: bool) -> void:'),
    'Deve haver método explícito para alternar efeitos reduzidos');
  assert(boardScript.includes('background.material=null if enabled else ground_material'),
    'Efeitos reduzidos desativam shader de distorção atmosférica no solo');
  assert(boardScript.includes('haze.visible=not enabled'), 'Efeitos reduzidos desativam névoa volumétrica');
  assert(boardScript.includes('if reduced_effects:count=mini(7,count)'),
    'Efeitos reduzidos limitam contagem de partículas por explosão');

  // Legibilidade de avisos cruciais mantida
  assert(boardScript.includes('PULSO · %.1f s'), 'Avisos e raio de pulso de chefe são preservados para legibilidade de gameplay');
});

// -----------------------------------------------------------------------------
// BATERIA 3: ARQUITETURA DE ÁUDIO E IDENTIDADE DE FANTASIA MODERNA
// -----------------------------------------------------------------------------

test('3.1 - Ausência de estética sonora 8-bit e integridade de amostras PCM/Vorbis', () => {
  const soundScript = fs.readFileSync(path.join(scriptsDir, 'sound.gd'), 'utf8');

  // Verificação dos 19 samples registrados
  const expectedSamples = [
    'ballista', 'mortar', 'launch', 'tesla', 'ice', 'poison', 'impact',
    'hover', 'click', 'reveal', 'upgrade', 'card', 'wave', 'leak',
    'victory', 'defeat', 'music', 'ambience', 'flame_loop'
  ];

  for (const name of expectedSamples) {
    const filePath = path.join(audioDir, `${name}.ogg`);
    assert(fs.existsSync(filePath), `Arquivo de áudio ${name}.ogg deve existir no disco`);
    const stats = fs.statSync(filePath);
    assert(stats.size > 5000, `Áudio ${name}.ogg deve ser uma gravação real de alta fidelidade (>5KB), tamanho: ${stats.size}b`);
  }

  // Música e ambiência são faixas longas de alta resolução
  const musicStats = fs.statSync(path.join(audioDir, 'music.ogg'));
  const ambienceStats = fs.statSync(path.join(audioDir, 'ambience.ogg'));
  assert(musicStats.size > 300000, 'music.ogg deve ser faixa musical orquestral (>300KB)');
  assert(ambienceStats.size > 500000, 'ambience.ogg deve ser paisagem sonora mística (>500KB)');
});

test('3.2 - Processamento dinâmico: barramentos independentes, compressor master e reverb espacial', () => {
  const soundScript = fs.readFileSync(path.join(scriptsDir, 'sound.gd'), 'utf8');

  // Barramentos dedicados
  assert(soundScript.includes('["Music","Effects","Ambience"]'), 'Deve criar barramentos de Music, Effects e Ambience');

  // Compressor no barramento Master (anti-clipping e consistência dinâmica)
  assert(soundScript.includes('var compressor=AudioEffectCompressor.new()'), 'Deve instanciar compressor de áudio');
  assert(soundScript.includes('compressor.threshold=-7'), 'Threshold do compressor deve ser -7dB');
  assert(soundScript.includes('compressor.ratio=3.0'), 'Ratio de compressão deve ser 3:1');

  // Reverb espacial no barramento de Efeitos (acústica de fantasia / mística)
  assert(soundScript.includes('var reverb=AudioEffectReverb.new()'), 'Deve instanciar reverb espacial');
  assert(soundScript.includes('reverb.room_size=0.4'), 'Reverb deve possuir room size de 0.4');
  assert(soundScript.includes('AudioServer.add_bus_effect(AudioServer.get_bus_index("Effects"),reverb)'),
    'Reverb deve ser aplicado diretamente ao barramento Effects');

  // Espacialização 2D e atenuação
  assert(soundScript.includes('p.panning_strength=0.65'), 'Vozes de efeito devem ter panning estéreo 2D de 0.65');
  assert(soundScript.includes('p.attenuation=0.25'), 'Atenuação acústica por distância configurada');

  // Variação orgânica de tom (pitch shifting estocástico)
  assert(soundScript.includes('p.pitch_scale=randf_range(0.96,1.04)'),
    'Disparos devem possuir variação de afinação de 0.96 a 1.04 para evitar monotonia acústica');

  // Proteção contra saturação / cooldown de disparos sonoros
  assert(soundScript.includes('var min_interval=95 if name in ["ballista","impact"] else 70'),
    'Sons percussivos e de impacto devem possuir cadência mínima para evitar saturação');
});

// -----------------------------------------------------------------------------
// BATERIA 4: INTEGRAÇÃO DOS SISTEMAS DE FANTASIA DAS TORRETAS AVANÇADAS
// -----------------------------------------------------------------------------

test('4.1 - Herança visual e sonora das 6 torretas avançadas de fantasia', () => {
  const catalogScript = fs.readFileSync(path.join(scriptsDir, 'catalog.gd'), 'utf8');

  // Validar catálogo das 6 torretas avançadas
  const advancedTowers = ['roots', 'harpoon', 'seismic', 'spectral', 'ash_forge', 'solar'];
  for (const t of advancedTowers) {
    assert(catalogScript.includes(`"${t}":`), `Torreta avançada ${t} deve constar em catalog.gd`);
  }

  // Obelisco Solar: foco concentrado de energia luminosa e bônus contra espíritos
  assert(catalogScript.includes('"solar":'), 'Obelisco Solar catalogado');
  assert(catalogScript.includes('"family":"ballista"'), 'Obelisco Solar deriva de família balística com mira focada');

  // Guardião de Raízes: aprisionamento e controle da floresta
  assert(catalogScript.includes('"roots":'), 'Guardião de Raízes catalogado');
  assert(catalogScript.includes('"color":"83dbac"'), 'Guardião de Raízes tem tom rúnico verde esmeralda');

  // Canhão Sísmico: impacto em área larga
  assert(catalogScript.includes('"seismic":'), 'Canhão Sísmico catalogado');
  assert(catalogScript.includes('"splash":92.0'), 'Canhão Sísmico tem raio de impacto sísmico ampliado de 92');

  // Farol Espectral: desvelar espíritos e quebra de armadura
  assert(catalogScript.includes('"spectral":'), 'Farol Espectral catalogado');
  assert(catalogScript.includes('"family":"tesla"'), 'Farol Espectral deriva de descarga mágica');

  // Forja de Cinzas: fogo térmico concentrado
  assert(catalogScript.includes('"ash_forge":'), 'Forja de Cinzas catalogada');
  assert(catalogScript.includes('"family":"flame"'), 'Forja de Cinzas deriva de jato de fogo');

  // Arpão do Abismo: perfuração especializada
  assert(catalogScript.includes('"harpoon":'), 'Arpão do Abismo catalogado');
  assert(catalogScript.includes('"damage":41.0'), 'Arpão do Abismo possui alto dano perfurante concentrado');
});

console.log('\n======================================================');
console.log('Sucesso! Todas as verificações de animações, efeitos e áudio foram aprovadas.');
console.log('======================================================');
