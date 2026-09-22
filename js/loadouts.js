const LOADOUT_BASE_PATH = 'assets/loadouts/';
const loadoutStatus = new Map();

function getLoadout(floor, type = 'trait') {
  const floorNumber = Number(floor);

  if (!Number.isInteger(floorNumber) || floorNumber < 1 || floorNumber > 9999) {
    return null;
  }

  const normalizedType = type === 'traitless' ? 'traitless' : 'trait';
  const filename = normalizedType === 'traitless'
    ? `${floorNumber}-traitless.png`
    : `${floorNumber}.png`;

  return {
    type: normalizedType,
    image: `${LOADOUT_BASE_PATH}${filename}`,
    title: normalizedType === 'traitless' ? 'Traitless Loadout' : 'Trait Loadout',
    note: ''
  };
}

function loadoutKey(floor, type = 'trait') {
  const floorNumber = Number(floor);
  return `${floorNumber}:${type === 'traitless' ? 'traitless' : 'trait'}`;
}

function loadoutExists(floor, type = 'trait') {
  const loadout = getLoadout(floor, type);

  if (!loadout) return Promise.resolve(false);

  const key = loadoutKey(floor, type);
  if (loadoutStatus.has(key)) return Promise.resolve(loadoutStatus.get(key));

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      loadoutStatus.set(key, true);
      resolve(true);
    };

    image.onerror = () => {
      loadoutStatus.set(key, false);
      resolve(false);
    };

    image.src = `${loadout.image}?v=${Date.now()}`;
  });
}

async function detectFloorLoadouts(floor) {
  await Promise.all([
    loadoutExists(floor, 'trait'),
    loadoutExists(floor, 'traitless')
  ]);
}

async function detectLoadouts(floors, concurrency = 16) {
  const queue = [...floors];
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length) {
        const floor = queue.shift();
        if (floor) await detectFloorLoadouts(floor.floor);
      }
    }
  );

  await Promise.all(workers);
  return loadoutStatus;
}

function hasAnyLoadout(floor) {
  const floorNumber = Number(floor);
  return loadoutStatus.get(loadoutKey(floorNumber, 'trait')) === true ||
    loadoutStatus.get(loadoutKey(floorNumber, 'traitless')) === true;
}
