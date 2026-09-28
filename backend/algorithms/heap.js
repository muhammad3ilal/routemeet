// Generic binary min-heap. The comparator returns < 0 for higher priority.
export class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }
  get size() {
    return this.items.length;
  }
  peek() {
    return this.items[0];
  }
  push(value) {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(a[i], a[parent]) >= 0) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    if (!a.length) return undefined;
    const first = a[0],
      last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        for (const child of [2 * i + 1, 2 * i + 2]) {
          if (child < a.length && this.compare(a[child], a[smallest]) < 0)
            smallest = child;
        }
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest], a[i]];
        i = smallest;
      }
    }
    return first;
  }
}

// Retain k best values without sorting the full input: O(n log k), O(k) space.
export function topK(values, k, compare) {
  if (k < 1) return [];
  const worstFirst = new MinHeap((a, b) => compare(b, a));
  for (const value of values) {
    if (worstFirst.size < k) worstFirst.push(value);
    else if (compare(value, worstFirst.peek()) < 0) {
      worstFirst.pop();
      worstFirst.push(value);
    }
  }
  return worstFirst.items.sort(compare);
}
