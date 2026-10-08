/** Drops inactive items in place, keeping order and the array identity. */
export function removeInactive<T extends { active: boolean }>(items: T[]): void {
  let write = 0;
  for (const item of items) {
    if (item.active) items[write++] = item;
  }
  items.length = write;
}
