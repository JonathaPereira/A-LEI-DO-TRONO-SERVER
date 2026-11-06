import { getCard, type ThemeId } from './catalog.ts';
export interface CardInfo {
  context: string;
  summary: string;
  traits: string[];
}
type Entry = readonly [string, string, string];
const entries: Record<ThemeId, readonly Entry[]> = {
  animals: [
    [
      'Vulpes vulpes',
      'Raposa-vermelha: adapta-se a florestas, campos e até cidades.',
      'Mamífero|Onívoro|Canídeo',
    ],
    [
      'Tyto furcata',
      'Suindara, uma referência de coruja: caça sobretudo pequenos roedores.',
      'Ave|Carnívoro|Rapinante',
    ],
    [
      'Felis catus',
      'O gato doméstico mantém hábitos de caça e usa bigodes para explorar o espaço.',
      'Mamífero|Carnívoro|Felino',
    ],
    [
      'Canis lupus',
      'O lobo-cinzento vive em grupos familiares e se comunica por vocalizações.',
      'Mamífero|Carnívoro|Canídeo',
    ],
    [
      'Rhinella marina',
      'Sapo-cururu: anfíbio de pele glandular. Sua fase jovem se desenvolve na água.',
      'Anfíbio|Carnívoro adulto|Anuro',
    ],
    [
      'Cervus elaphus',
      'Cervo-vermelho: os machos renovam suas galhadas, feitas de osso, a cada ano.',
      'Mamífero|Herbívoro|Cervídeo',
    ],
    [
      'Ursus arctos',
      'Urso-pardo: pode comer raízes, frutos, insetos, peixes e outros animais.',
      'Mamífero|Onívoro|Ursídeo',
    ],
    [
      'Oryctolagus cuniculus',
      'Coelho-europeu: vive em tocas e seus dentes crescem continuamente.',
      'Mamífero|Herbívoro|Lagomorfo',
    ],
    [
      'Corvus corax',
      'Corvo-comum: aprende com a experiência e resolve problemas complexos.',
      'Ave|Onívoro|Corvídeo',
    ],
    [
      'Panthera tigris',
      'O tigre costuma caçar sozinho; as listras variam entre indivíduos.',
      'Mamífero|Carnívoro|Felino',
    ],
    [
      'Ailuropoda melanoleuca',
      'Apesar de pertencer à ordem Carnivora, o panda come principalmente bambu.',
      'Mamífero|Herbívoro predominante|Ursídeo',
    ],
    [
      'Chamaeleo chamaeleon',
      'Camaleão-comum: os olhos se movem de modo independente e a língua captura presas.',
      'Réptil|Insetívoro|Escamado',
    ],
    [
      'Chelonia mydas',
      'Tartaruga-verde: adultos comem sobretudo algas e plantas marinhas; jovens variam a dieta.',
      'Réptil|Herbívoro adulto|Marinho',
    ],
    [
      'Equus caballus',
      'O cavalo é um herbívoro social domesticado há milhares de anos.',
      'Mamífero|Herbívoro|Equídeo',
    ],
    [
      'Octopus vulgaris',
      'Polvo-comum: tem oito braços, três corações e grande capacidade de camuflagem.',
      'Molusco|Carnívoro|Cefalópode',
    ],
    [
      'Aptenodytes forsteri',
      'Pinguim-imperador: ave que não voa e se reproduz no gelo antártico.',
      'Ave|Carnívoro|Marinho',
    ],
    [
      'Loxodonta africana',
      'Elefante-africano-da-savana: a tromba serve para respirar, sentir cheiros e manipular objetos.',
      'Mamífero|Herbívoro|Proboscídeo',
    ],
    [
      'Panthera leo',
      'O leão é um felino social que vive em grupos familiares, chamados de bandos.',
      'Mamífero|Carnívoro|Felino',
    ],
    [
      'Sciurus vulgaris',
      'Esquilo-vermelho: guarda sementes; algumas esquecidas podem germinar.',
      'Mamífero|Onívoro|Roedor',
    ],
    [
      'Balaenoptera musculus',
      'A baleia-azul filtra pequenos crustáceos, sobretudo krill, usando barbatanas bucais.',
      'Mamífero|Carnívoro|Cetáceo',
    ],
    [
      'Pavo cristatus',
      'Pavão-indiano: a cauda ornamental mais conhecida é exibida pelos machos no cortejo.',
      'Ave|Onívoro|Galiforme',
    ],
    [
      'Erinaceus europaeus',
      'Ouriço-europeu: os espinhos são pelos modificados; pode se enrolar para se proteger.',
      'Mamífero|Onívoro / insetívoro|Eulipotiflo',
    ],
    [
      'Pteropus vampyrus',
      'Raposa-voadora-grande: morcego frugívoro. Morcegos de outras espécies têm dietas diferentes.',
      'Mamífero|Frugívoro|Quiróptero',
    ],
    [
      'Phoenicopterus roseus',
      'Flamingo-comum: pigmentos obtidos na alimentação contribuem para a plumagem rosada.',
      'Ave|Onívoro filtrador|Aquático',
    ],
  ],
  history: [
    [
      '69–30 a.C. · Egito ptolomaico',
      'Cleópatra VII foi a última governante da dinastia ptolomaica do Egito.',
      'Rainha|Antiguidade|Política',
    ],
    [
      '1452–1519 · Renascimento',
      'Pintor e estudioso italiano, deixou obras como a Mona Lisa e cadernos sobre ciência.',
      'Arte|Ciência|Itália',
    ],
    [
      'c. 1412–1431 · Idade Média',
      'Joana d’Arc participou de campanhas francesas na Guerra dos Cem Anos.',
      'França|Liderança|Guerra',
    ],
    [
      '1879–1955 · Século XX',
      'Físico conhecido pela relatividade; recebeu o Nobel de 1921 por trabalhos sobre o efeito fotoelétrico.',
      'Física|Ciência|Nobel',
    ],
    [
      '1815–1852 · Revolução Industrial',
      'Ada Lovelace escreveu notas sobre a Máquina Analítica, incluindo um algoritmo para ela.',
      'Matemática|Computação|Reino Unido',
    ],
    [
      '1769–1821 · Era napoleônica',
      'Napoleão Bonaparte foi militar e imperador dos franceses no início do século XIX.',
      'França|Imperador|Estratégia',
    ],
    [
      '1867–1934 · Séculos XIX–XX',
      'Marie Curie pesquisou a radioatividade e recebeu prêmios Nobel de Física e de Química.',
      'Ciência|Nobel|Polônia / França',
    ],
    [
      '1873–1932 · Aviação pioneira',
      'Santos Dumont projetou dirigíveis e realizou o voo público do 14-bis em Paris, em 1906.',
      'Brasil|Aviação|Invenção',
    ],
    [
      '1907–1954 · Arte moderna',
      'Frida Kahlo explorou identidade e experiência pessoal em pinturas e autorretratos.',
      'México|Pintura|Autorretrato',
    ],
    [
      '1839–1908 · Literatura brasileira',
      'Machado de Assis escreveu Dom Casmurro e foi o primeiro presidente da Academia Brasileira de Letras.',
      'Brasil|Romance|Literatura',
    ],
    [
      '1819–1901 · Era vitoriana',
      'Vitória reinou no Reino Unido de 1837 a 1901, período de grandes transformações industriais.',
      'Monarquia|Reino Unido|Século XIX',
    ],
    [
      'c. 1303–1213 a.C. · Egito antigo',
      'Ramsés II foi um faraó do Reino Novo, associado a grandes monumentos e longo reinado.',
      'Faraó|Antiguidade|Arquitetura',
    ],
    [
      'Nascimento c. 350–370; morte em 415 · Alexandria',
      'Hipátia ensinou filosofia e matemática em Alexandria; seu ano de nascimento é incerto.',
      'Alexandria|Matemática|Filosofia',
    ],
    [
      '1642/1643–1727 · Revolução Científica',
      'Newton formulou leis do movimento e da gravitação e trabalhou no desenvolvimento do cálculo.',
      'Física|Matemática|Inglaterra',
    ],
    [
      '1564–1642 · Revolução Científica',
      'Galileu estudou o movimento e usou o telescópio para observar luas de Júpiter.',
      'Astronomia|Física|Itália',
    ],
    [
      'c. 1162–1227 · Idade Média',
      'Genghis Khan unificou tribos mongóis e fundou o Império Mongol.',
      'Mongólia|Império|Liderança',
    ],
    [
      'Século XIV a.C. · Egito antigo',
      'Nefertiti foi rainha no período de Aquenáton; é conhecida também por seu célebre busto.',
      'Rainha|Antiguidade|Amarna',
    ],
    [
      '1756–1791 · Classicismo',
      'Wolfgang Amadeus Mozart compôs óperas, sinfonias e concertos desde muito jovem.',
      'Áustria|Música|Composição',
    ],
    [
      '1746–1792 · Brasil colonial',
      'Tiradentes participou da Inconfidência Mineira e tornou-se símbolo republicano no Brasil.',
      'Brasil|Inconfidência|Século XVIII',
    ],
    [
      '1564–1616 · Renascimento inglês',
      'William Shakespeare escreveu peças como Hamlet, Macbeth e Romeu e Julieta.',
      'Teatro|Poesia|Inglaterra',
    ],
    [
      '1792–1853 · Independência do Brasil',
      'Maria Quitéria lutou nas forças favoráveis à independência na Bahia.',
      'Brasil|Bahia|Militar',
    ],
    [
      '1809–1882 · Século XIX',
      'Charles Darwin desenvolveu a teoria da evolução por seleção natural.',
      'Biologia|Evolução|Reino Unido',
    ],
    [
      'c. 1280–c. 1337 · Império do Mali',
      'Mansa Musa foi soberano do Mali e ficou conhecido por sua peregrinação a Meca.',
      'África Ocidental|Comércio|Monarquia',
    ],
    [
      '1897–desaparecida em 1937 · Aviação',
      'Amelia Earhart foi a primeira mulher a cruzar o Atlântico sozinha de avião, em 1932.',
      'Aviação|Estados Unidos|Pioneirismo',
    ],
  ],
  tales: [
    [
      'Perrault, 1697; Grimm, 1812',
      'Uma menina atravessa a floresta para visitar a avó e encontra um lobo enganador.',
      'Floresta|Lobo|Cuidado',
    ],
    [
      'Tradição oral; versões dos séculos XVII–XIX',
      'O lobo antagonista aparece em contos como Chapeuzinho Vermelho e Os Três Porquinhos.',
      'Predador|Disfarce|Contos populares',
    ],
    [
      'Perrault, 1697; Grimm, 1812',
      'Uma jovem maltratada pela família recebe ajuda para ir ao baile e deixa um sapato para trás.',
      'Transformação|Baile|Realeza',
    ],
    [
      'Irmãos Grimm, 1812',
      'Uma princesa perseguida pela rainha encontra abrigo com sete anões e uma maçã perigosa.',
      'Espelho|Maçã|Floresta',
    ],
    [
      'Irmãos Grimm, 1812',
      'Uma jovem de cabelos muito longos vive isolada em uma torre.',
      'Torre|Cabelo|Encantamento',
    ],
    [
      'Hans Christian Andersen, 1837',
      'Uma sereia deseja viver entre humanos e faz um acordo que lhe custa a voz.',
      'Mar|Transformação|Sacrifício',
    ],
    [
      'Carlo Collodi, 1881–1883',
      'Um boneco de madeira enfrenta aventuras e aprende sobre responsabilidade para se tornar menino.',
      'Madeira|Mentira|Aprendizado',
    ],
    [
      'Charles Perrault, 1697',
      'Um gato astuto usa botas e artimanhas para mudar a fortuna de seu dono.',
      'Astúcia|Animal falante|Botas',
    ],
    [
      'Lewis Carroll, 1865',
      'Alice segue um coelho e entra num mundo de criaturas e situações absurdas.',
      'Maravilhas|Curiosidade|Fantasia',
    ],
    [
      'Lewis Carroll, 1865',
      'O Chapeleiro participa de um chá interminável e de conversas ilógicas no País das Maravilhas.',
      'Chá|Tempo|Absurdo',
    ],
    [
      'Lewis Carroll, 1865',
      'A Rainha de Copas governa com ordens impulsivas e ameaças num reino de cartas.',
      'Cartas|Realeza|Autoridade',
    ],
    [
      'J. M. Barrie: peça de 1904; romance de 1911',
      'O menino que não quer crescer vive aventuras com crianças e piratas na Terra do Nunca.',
      'Voo|Infância|Piratas',
    ],
    [
      'J. M. Barrie, 1904 / 1911',
      'Sininho é a pequena fada ligada a Peter Pan e à magia da Terra do Nunca.',
      'Fada|Magia|Voo',
    ],
    [
      'Tradição inglesa; versão impressa em 1807',
      'João troca uma vaca por feijões e sobe por um pé de feijão até a morada de um gigante.',
      'Gigante|Céu|Aventura',
    ],
    [
      'Villeneuve, 1740; Beaumont, 1756',
      'Bela vai viver num castelo encantado e conhece quem se esconde por trás de uma aparência assustadora.',
      'Livros|Castelo|Encantamento',
    ],
    [
      'Villeneuve, 1740; Beaumont, 1756',
      'Um príncipe transformado em Fera habita um castelo e precisa romper um encantamento.',
      'Transformação|Castelo|Príncipe',
    ],
    [
      'Irmãos Grimm, 1812',
      'Dois irmãos perdidos na floresta encontram uma casa de doces e uma bruxa.',
      'Irmãos|Doces|Floresta',
    ],
    [
      'Cinderela de Perrault, 1697',
      'Uma ajudante mágica transforma objetos e roupas para que Cinderela possa ir ao baile.',
      'Magia|Ajuda|Transformação',
    ],
    [
      'Irmãos Grimm, 1812',
      'Uma princesa faz uma promessa a um sapo; as versões variam na forma de quebrar o feitiço.',
      'Promessa|Sapo|Encantamento',
    ],
    [
      'Hans Christian Andersen, 1838',
      'Um soldadinho de brinquedo com uma só perna atravessa perigos e deseja uma bailarina de papel.',
      'Brinquedo|Coragem|Bailarina',
    ],
    [
      'Hans Christian Andersen, 1843',
      'Uma ave rejeitada por parecer diferente cresce e descobre que é um cisne.',
      'Animal|Identidade|Crescimento',
    ],
    [
      'Lenda medieval de Hamelin; Grimm, 1816',
      'Um músico livra a cidade dos ratos e, sem receber, leva embora suas crianças.',
      'Música|Promessa|Lenda',
    ],
    [
      'Hans Christian Andersen, 1844',
      'Gerda viaja para resgatar Kai, cujo coração foi afetado por um espelho mágico.',
      'Neve|Amizade|Jornada',
    ],
    [
      'Antoine Galland, 1712, a partir de Hanna Diyab',
      'Aladim encontra uma lâmpada com um gênio e enfrenta disputas por seu poder mágico.',
      'Gênio|Lâmpada|Desejos',
    ],
  ],
  monsters: [
    [
      'Folclore europeu; Drácula, 1897',
      'Ser noturno associado ao sangue e à imortalidade; regras variam entre tradições.',
      'Noite|Sangue|Morto-vivo',
    ],
    [
      'Lendas europeias antigas',
      'Pessoa que se transforma em lobo; a associação obrigatória à lua cheia varia por versão.',
      'Transformação|Lobo|Maldição',
    ],
    [
      'Egito antigo; horror moderno',
      'Corpo preservado que, na ficção, pode retornar à vida sob uma maldição.',
      'Egito|Tumba|Morto-vivo',
    ],
    [
      'Mary Shelley, Frankenstein, 1818',
      'Criatura feita e animada por Victor Frankenstein; o romance discute criação, solidão e responsabilidade.',
      'Ciência|Criação|Literatura',
    ],
    [
      'Tradições de muitas culturas',
      'Aparição associada a alguém que morreu, frequentemente ligada a um lugar ou assunto inacabado.',
      'Espírito|Assombração|Memória',
    ],
    [
      'Folclore e contos europeus',
      'Figura associada à magia; pode ser antagonista, curandeira ou personagem ambígua.',
      'Magia|Feitiço|Folclore',
    ],
    [
      'Tradições haitianas; releituras do cinema',
      'A figura de origem haitiana difere do morto-vivo contagioso popularizado no horror moderno.',
      'Morto-vivo|Horror|Transformação',
    ],
    [
      'Imaginário do fantástico',
      'Ossos animados aparecem como guardiões e adversários em histórias de magia.',
      'Ossos|Magia|Morto-vivo',
    ],
    [
      'Halloween; tradição do jack-o’-lantern',
      'A abóbora iluminada ganhou interpretações como criatura travessa ou ameaçadora.',
      'Outono|Lanterna|Halloween',
    ],
    [
      'Arquitetura medieval; fantasia posterior',
      'Gárgulas escoam água de edifícios; a fantasia as transforma em guardiãs de pedra vivas.',
      'Pedra|Asas|Guardião',
    ],
    [
      'Contos europeus; Perrault, século XVII',
      'Gigante ameaçador de muitos contos, frequentemente apresentado como devorador de gente.',
      'Gigante|Força|Contos',
    ],
    [
      'Folclore europeu',
      'Pequeno ser travesso ou hostil que habita lugares sombrios em muitas versões.',
      'Travessura|Pequeno|Fantasia',
    ],
    [
      'Folclore escandinavo',
      'Criatura de montanhas, florestas ou cavernas; forma e tamanho variam muito.',
      'Montanha|Pedra|Escandinávia',
    ],
    [
      'Tradições religiosas e fantasia',
      'Espírito ou criatura sobrenatural; a aparência com chifres é uma convenção de parte da iconografia.',
      'Sobrenatural|Chifres|Fantasia',
    ],
    [
      'Folclore marítimo escandinavo',
      'Monstro marinho gigantesco, frequentemente representado como polvo ou lula.',
      'Mar|Tentáculos|Gigante',
    ],
    [
      'Horror e histórias de monstros aquáticos',
      'Criatura fictícia anfíbia que vive em águas misteriosas; esta carta usa um desenho original.',
      'Água|Anfíbio fictício|Mistério',
    ],
    [
      'Washington Irving, 1820; lendas anteriores',
      'Em A Lenda de Sleepy Hollow, um cavaleiro sem cabeça assombra uma comunidade.',
      'Cavaleiro|Assombração|Noite',
    ],
    [
      'Tradição agrícola; fantasia posterior',
      'Boneco feito para afastar aves das plantações, aqui imaginado como ser vivo.',
      'Palha|Campo|Guardião',
    ],
    [
      'Folclore de tradição oral',
      'Figura usada em histórias para personificar medos infantis; não tem uma aparência única.',
      'Medo|Noite|Folclore',
    ],
    [
      'Tradições do Himalaia',
      'Ser lendário associado às montanhas nevadas; sua existência não foi demonstrada.',
      'Neve|Montanha|Lenda',
    ],
    [
      'Folclore norte-americano moderno',
      'Criatura peluda e esquiva de relatos populares; sua existência não foi demonstrada.',
      'Floresta|Gigante|Lenda',
    ],
    [
      'Mitologia grega antiga',
      'Gigante de um olho só; algumas tradições os apresentam como ferreiros divinos.',
      'Um olho|Gigante|Forja',
    ],
    [
      'Mitologia grega antiga',
      'Ser alado com traços humanos e de ave, associado a ventos e arrebatamentos.',
      'Asas|Vento|Híbrido',
    ],
    [
      'Folclore irlandês',
      'Figura sobrenatural cujo lamento anuncia uma morte em certas tradições familiares.',
      'Espírito|Lamento|Irlanda',
    ],
  ],
  myths: [
    [
      'Grécia antiga · Olimpo',
      'Zeus é associado ao céu, ao trovão e à autoridade entre os deuses olímpicos.',
      'Raio|Céu|Soberania',
    ],
    [
      'Grécia antiga · Olimpo',
      'Atena é ligada à sabedoria, aos ofícios e à estratégia; a coruja é um de seus símbolos.',
      'Sabedoria|Estratégia|Coruja',
    ],
    [
      'Grécia antiga · Olimpo',
      'Poseidon rege os mares e se associa também a terremotos e cavalos.',
      'Mar|Tridente|Cavalos',
    ],
    [
      'Grécia antiga · Mundo dos mortos',
      'Hades governa o mundo dos mortos; não é o equivalente grego de um demônio.',
      'Submundo|Riquezas|Reino',
    ],
    [
      'Grécia antiga · Olimpo',
      'Afrodite é associada ao amor, à beleza e ao desejo.',
      'Amor|Beleza|Mar',
    ],
    [
      'Grécia antiga · Olimpo',
      'Hermes é mensageiro divino e protetor de viajantes, fronteiras e comércio.',
      'Mensagem|Viagem|Astúcia',
    ],
    [
      'Grécia antiga · Olimpo',
      'Ártemis se relaciona à caça e à vida selvagem; é irmã de Apolo.',
      'Arco|Caça|Natureza',
    ],
    [
      'Grécia antiga · Olimpo',
      'Apolo é ligado à música, à profecia e à cura, e também à luz em muitas tradições.',
      'Lira|Profecia|Cura',
    ],
    [
      'Tradição nórdica · Asgard',
      'Thor maneja o martelo Mjölnir e é associado ao trovão e à proteção.',
      'Martelo|Trovão|Força',
    ],
    [
      'Tradição nórdica',
      'Loki é uma figura astuta e mutável que ajuda e prejudica os deuses em diferentes narrativas.',
      'Astúcia|Transformação|Ambiguidade',
    ],
    [
      'Tradição nórdica · Asgard',
      'Odin busca conhecimento e se liga à poesia, à guerra e aos mortos.',
      'Sabedoria|Corvos|Um olho',
    ],
    [
      'Tradição nórdica · Vanir',
      'Freya se associa ao amor, à fertilidade e à magia; recebe parte dos mortos em batalha.',
      'Magia|Amor|Gatos',
    ],
    [
      'Egito antigo',
      'Anúbis se associa ao embalsamamento e ao cuidado dos mortos, com cabeça de canídeo.',
      'Canídeo|Ritos funerários|Proteção',
    ],
    [
      'Egito antigo',
      'Ísis é ligada à magia, à maternidade e à proteção e tem papel central no mito de Osíris.',
      'Magia|Maternidade|Proteção',
    ],
    [
      'Egito antigo',
      'Rá é uma divindade solar, frequentemente representada com cabeça de falcão e disco solar.',
      'Sol|Falcão|Criação',
    ],
    [
      'Egito antigo',
      'Bastet é ligada à proteção e tem representações felinas, incluindo formas de gata e leoa.',
      'Gato|Proteção|Divindade',
    ],
    [
      'Mitologia grega antiga',
      'Medusa é uma górgona de cabelos de serpente cujo olhar petrifica.',
      'Serpentes|Petrificação|Górgona',
    ],
    [
      'Mitologia grega · Creta',
      'O Minotauro, com corpo humano e cabeça de touro, vive no labirinto de Creta.',
      'Touro|Labirinto|Híbrido',
    ],
    [
      'Mitologia grega antiga',
      'Pégaso é um cavalo alado associado a Belerofonte e a aventuras heroicas.',
      'Cavalo|Asas|Voo',
    ],
    [
      'Tradições antigas; releituras posteriores',
      'Ave lendária de renovação; a versão que renasce das cinzas é uma das mais difundidas.',
      'Fogo|Renascimento|Ave',
    ],
    [
      'Múltiplas tradições culturais',
      'Dragões variam entre culturas: podem ser monstros alados ou seres ligados à água e à prosperidade.',
      'Réptil lendário|Poder|Variações culturais',
    ],
    [
      'Tradições antigas e medievais',
      'Ser lendário de um único chifre, frequentemente associado à pureza no imaginário europeu.',
      'Um chifre|Cavalo lendário|Magia',
    ],
    [
      'Tradição marítima; fusões do imaginário',
      'A figura de mulher com cauda de peixe difere das sereias gregas antigas, que tinham traços de ave.',
      'Mar|Canto|Híbrido',
    ],
    [
      'Mesoamérica · Tradições nahuas',
      'Quetzalcóatl, a Serpente Emplumada, se associa ao vento e ao conhecimento, entre outros domínios.',
      'Serpente|Penas|Conhecimento',
    ],
  ],
};
/** Common animal cards use a named reference species; portraits do not establish taxonomy. */
export function cardInfo(id: string): CardInfo {
  const c = getCard(id),
    [context, summary, traits] = entries[c.theme][c.position];
  return {
    context: c.theme === 'animals' ? 'Espécie de referência: ' + context : context,
    summary,
    traits: traits.split('|'),
  };
}
