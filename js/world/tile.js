export const TILE_SIZE = 16;

/**
 * Static tile definitions. Each map cell stores one of these tile type keys.
 */
export const TILE_DEFS = {
  grass: { type: 'grass', walkable: true, mineable: false, hardness: 0, color: '#4a9f40' },
  soil: { type: 'soil', walkable: true, mineable: false, hardness: 0, color: '#8f6f4c' },
  rock: { type: 'rock', walkable: false, mineable: true, hardness: 3, color: '#636363' },
  water: { type: 'water', walkable: false, mineable: false, hardness: 0, color: '#2e6cb6' }
};
