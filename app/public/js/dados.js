const TIPOS=[
  {id:'adt',nome:'Caminhão articulado',plural:'ADTs',sigla:'ADT'},
  {id:'escavadeira',nome:'Escavadeira',plural:'Escavadeiras',sigla:'EX'},
  {id:'carregadeira',nome:'Pá carregadeira',plural:'Carregadeiras',sigla:'WL'},
  {id:'trator',nome:'Trator de esteira',plural:'Dozers',sigla:'DZ'},
  {id:'motoniveladora',nome:'Motoniveladora',plural:'Motoniveladoras',sigla:'GR'},
  {id:'bomba',nome:'Bomba',plural:'Bombas',sigla:'PMP'},
  {id:'perfuratriz',nome:'Perfuratriz',plural:'Perfuratrizes',sigla:'DR'},
  {id:'comboio',nome:'Caminhão comboio',plural:'Comboios',sigla:'FT'}
];
const FROTA=[
  {id:'adt',nome:'Caminhões articulados',prefixo:'ADT',n:10,tipo:'adt',modelo:'Volvo A40G',area:'Cava Norte'},
  {id:'bb',nome:'Bombas',prefixo:'PMP',n:6,tipo:'bomba',modelo:'Godwin HL160M',area:'Drenagem Cava Norte'},
  {id:'eg',nome:'Escavadeiras grandes',prefixo:'EX',n:5,tipo:'escavadeira',porte:'G',modelo:'CAT 374F',area:'Cava Norte'},
  {id:'ep',nome:'Escavadeiras pequenas',prefixo:'EX',inicio:6,n:5,tipo:'escavadeira',porte:'P',modelo:'CAT 320',area:'Cava Sul'},
  {id:'pc',nome:'Pás carregadeiras',prefixo:'WL',n:5,tipo:'carregadeira',modelo:'CAT 980L',area:'Pátio de ROM'},
  {id:'te',nome:'Tratores de esteira',prefixo:'DZ',n:5,tipo:'trator',modelo:'CAT D8T',area:'Pilha de estéril'},
  {id:'mn',nome:'Motoniveladoras',prefixo:'GR',n:3,tipo:'motoniveladora',modelo:'CAT 16M',area:'Acessos'},
  {id:'pf',nome:'Perfuratriz',prefixo:'DR',n:1,tipo:'perfuratriz',modelo:'Sandvik DX800',area:'Cava Sul'},
  {id:'cc',nome:'Comboios',prefixo:'FT',n:2,tipo:'comboio',modelo:'Comboio diesel 15 m³',area:'Posto de abastecimento'}
];
const MOTIVOS=['Mecânica','Hidráulica','Elétrica','Pneu / rodante','Preventiva','Avaria / acidente','Outro'];
const ACAO={aguardando:'Parada aberta',em_manutencao:'Atendimento iniciado',aguardando_peca:'Aguardando peça',liberado:'Liberado pela manutenção',operando:'Recebido pela operação'};
function pad2(n){return String(n).padStart(2,'0')}
function frotasPadrao(){return FROTA.map(f=>({id:f.id,nome:f.nome,prefixo:f.prefixo,tipo:f.tipo,porte:f.porte||''}))}
