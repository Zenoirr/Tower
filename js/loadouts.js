const LOADOUT_BASE_PATH = 'assets/loadouts/';

function getLoadout(floor) {
  const floorNumber = Number(floor);

  if (!Number.isInteger(floorNumber) || floorNumber < 1 || floorNumber > 9999) {
    return null;
  }

  return {
    image: `${LOADOUT_BASE_PATH}${floorNumber}.png`,
    title: 'Recommended Loadout',
    note: ''
  };
}

function loadoutExists(floor) {
  const loadout = getLoadout(floor);

  if (!loadout) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);

    image.src = `${loadout.image}?v=${Date.now()}`;
  });
}