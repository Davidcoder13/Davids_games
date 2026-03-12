export class ResourceSystem {
  constructor() {
    this.inventory = {
      stone: 0
    };
  }

  addStone(amount = 1) {
    this.inventory.stone += amount;
  }
}
