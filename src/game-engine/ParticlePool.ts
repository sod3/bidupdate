export class ParticlePool<T extends { active: boolean }> {
  constructor(private readonly create: () => T, private readonly maximum = 180) {}

  private readonly items: T[] = [];

  acquire() {
    const reusable = this.items.find((item) => !item.active);
    if (reusable) {
      reusable.active = true;
      return reusable;
    }
    if (this.items.length >= this.maximum) return null;
    const item = this.create();
    item.active = true;
    this.items.push(item);
    return item;
  }

  active() {
    return this.items.filter((item) => item.active);
  }

  clear() {
    this.items.forEach((item) => { item.active = false; });
  }
}
