/**
 * Fixed-step-ish render loop using requestAnimationFrame.
 */
export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.last = performance.now();
  }

  start() {
    const tick = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;

      this.update(dt);
      this.render();

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }
}
