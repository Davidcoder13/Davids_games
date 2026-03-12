export function createUIState() {
  return {
    selectedTile: null,
    hoveredTile: null
  };
}

export function getTopBarText(state) {
  return `Stone: ${state.inventory.stone}   |   Colonists: ${state.colonists.length}`;
}
