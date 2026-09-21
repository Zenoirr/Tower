/*
  Manual loadouts.

  To add a loadout:
  1. Place the image in assets/loadouts/
  2. Register the floor below.

  Exemplo:
  51: {
    image: 'assets/loadouts/floor-51.png',
    title: 'Recommended loadout',
    note: 'Priorize dano físico e controle.'
  }
*/

const LOADOUTS = {
  // 51: {
  //   image: 'assets/loadouts/floor-51.png',
  //   title: 'Recommended loadout',
  //   note: 'Adicione suas observações aqui.'
  // }
};

function getLoadout(floor) {
  return LOADOUTS[String(floor)] || LOADOUTS[floor] || null;
}
