export function createGameLoop({ update, render }) {
  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
