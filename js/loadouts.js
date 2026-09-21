/*
  Loadouts manuais.

  Para adicionar um loadout:
  1. Coloque a imagem em assets/loadouts/
  2. Adicione o floor abaixo.

  Exemplo:
  51: {
    image: 'assets/loadouts/floor-51.png',
    title: 'Loadout recomendado',
    note: 'Priorize dano físico e controle.'
  }
*/

const LOADOUTS = {
  // 51: {
  //   image: 'assets/loadouts/floor-51.png',
  //   title: 'Loadout recomendado',
  //   note: 'Adicione suas observações aqui.'
  // }
};

function getLoadout(floor) {
  return LOADOUTS[String(floor)] || LOADOUTS[floor] || null;
}
