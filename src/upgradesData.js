export const UPGRADE_DEFINITIONS = [
  {
    key: 'speed',
    name: 'Engine Tuning',
    short: 'Increase engine thrust and responsiveness.',
    description: 'Improves engine power and acceleration by increasing thrust multiplier. Higher levels provide diminishing returns.',
    maxLevel: 10,
    baseCost: 100
  },
  {
    key: 'bullets',
    name: 'Ballistics',
    short: 'Upgrade ammunition to deal more damage per shot.',
    description: 'Increases bullet damage. Useful for taking down tougher targets quicker.',
    maxLevel: 10,
    baseCost: 120
  },
  {
    key: 'range',
    name: 'Long-Range Rounds',
    short: 'Increase bullet speed and lifetime so you can hit distant targets.',
    description: 'Rounds travel faster and last longer in flight, increasing effective range and accuracy at distance.',
    maxLevel: 10,
    baseCost: 90
  },
  {
    key: 'fuel',
    name: 'Fuel Capacity',
    short: 'Increase onboard fuel capacity for longer flights.',
    description: 'Raises maximum fuel reserve. Combine with efficiency systems later to extend endurance.',
    maxLevel: 10,
    baseCost: 80
  }
];
