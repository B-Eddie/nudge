export interface AtlasRect { x: number; y: number; width: number; height: number }
export interface IsolatedFrame extends AtlasRect { components: number[] }
interface Component extends AtlasRect { id: number; area: number; cx: number; cy: number }

/** Find the actual connected artwork. Generated atlases aren't perfectly aligned
 * to their nominal cells; slicing a fixed grid clips ears and includes neighbors. */
export function isolateAtlas(rgba: Uint8ClampedArray, width: number, height: number) {
  const labels = new Uint32Array(width * height);
  const queue = new Int32Array(width * height);
  const components: Component[] = [];
  let nextId = 0;
  for (let seed = 0; seed < labels.length; seed++) {
    if (labels[seed] || rgba[seed * 4 + 3] < 96) continue;
    const id = ++nextId;
    let head = 0, tail = 1, area = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let sumX = 0, sumY = 0;
    queue[0] = seed; labels[seed] = id;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width, y = Math.floor(pixel / width);
      area++; sumX += x; sumY += y;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (!labels[neighbor] && rgba[neighbor * 4 + 3] >= 96) {
          labels[neighbor] = id; queue[tail++] = neighbor;
        }
      }
    }
    components.push({ id, area, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, cx: sumX / area, cy: sumY / area });
  }
  const bodies = [...components].sort((a, b) => b.area - a.area).slice(0, 16);
  if (bodies.length !== 16) throw new Error("Companion atlas must contain sixteen separate poses");
  // Match each body to its nominal pose; rectangles can cross nominal cell edges.
  const ordered: Component[] = [];
  const unused = new Set(bodies);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const x = (col + .5) * width / 4, y = (row + .5) * height / 4;
    const body = [...unused].reduce((best, c) => Math.hypot(c.cx - x, c.cy - y) < Math.hypot(best.cx - x, best.cy - y) ? c : best);
    ordered.push(body); unused.delete(body);
  }
  const groups = ordered.map(body => [body]);
  for (const component of components) {
    if (bodies.includes(component) || component.area < 20) continue;
    const distance = (body: Component) => Math.hypot(
      Math.max(body.x - component.cx, 0, component.cx - body.x - body.width),
      Math.max(body.y - component.cy, 0, component.cy - body.y - body.height));
    let closest = 0;
    for (let i = 1; i < ordered.length; i++) if (distance(ordered[i]) < distance(ordered[closest])) closest = i;
    if (distance(ordered[closest]) <= Math.min(width, height) / 12) groups[closest].push(component);
  }
  const frames: IsolatedFrame[] = groups.map(group => {
    const x = Math.min(...group.map(c => c.x)), y = Math.min(...group.map(c => c.y));
    const right = Math.max(...group.map(c => c.x + c.width)), bottom = Math.max(...group.map(c => c.y + c.height));
    return { x, y, width: right - x, height: bottom - y, components: group.map(c => c.id) };
  });
  return { frames, labels };
}

export function framePixels(rgba: Uint8ClampedArray, atlasWidth: number, labels: Uint32Array, frame: IsolatedFrame) {
  const output = new Uint8ClampedArray(frame.width * frame.height * 4);
  const selected = new Set(frame.components);
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const source = (frame.y + y) * atlasWidth + frame.x + x;
    if (!selected.has(labels[source])) continue;
    const destination = (y * frame.width + x) * 4;
    output.set(rgba.subarray(source * 4, source * 4 + 4), destination);
  }
  return output;
}
