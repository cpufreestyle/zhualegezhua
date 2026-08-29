function createBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => this.off(type, fn);
    },
    off(type, fn) {
      const list = listeners.get(type);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(type, payload) {
      const list = listeners.get(type);
      if (!list) return;
      list.slice().forEach((fn) => fn(payload));
    },
  };
}
module.exports = { createBus };
