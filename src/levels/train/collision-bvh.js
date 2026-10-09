// Each triangle belongs to exactly one leaf. Long walls cannot multiply across
// branches as they did in the spatial Octree. The browser runs this in a worker.
export function buildTriangleBVH(triangles) {
  const count = triangles.length / 9
  const order = Uint32Array.from({ length: count }, (_, i) => i)
  const centres = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      centres[i * 3 + axis] = (triangles[i * 9 + axis] + triangles[i * 9 + axis + 3] + triangles[i * 9 + axis + 6]) / 3
    }
  }
  const bounds = []
  const nodes = []

  function median(start, end, target, axis) {
    let low = start, high = end - 1
    while (low < high) {
      const pivot = centres[order[(low + high) >>> 1] * 3 + axis]
      let left = low, right = high
      while (left <= right) {
        while (centres[order[left] * 3 + axis] < pivot) left++
        while (centres[order[right] * 3 + axis] > pivot) right--
        if (left <= right) {
          const swap = order[left]
          order[left++] = order[right]
          order[right--] = swap
        }
      }
      if (target <= right) high = right
      else if (target >= left) low = left
      else return
    }
  }

  function build(start, end) {
    const node = nodes.length / 4
    nodes.push(-1, -1, start, end - start)
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    const centreMin = [...min], centreMax = [...max]
    for (let i = start; i < end; i++) {
      const id = order[i]
      for (let axis = 0; axis < 3; axis++) {
        const centre = centres[id * 3 + axis]
        centreMin[axis] = Math.min(centreMin[axis], centre)
        centreMax[axis] = Math.max(centreMax[axis], centre)
        for (let vertex = 0; vertex < 3; vertex++) {
          const value = triangles[id * 9 + vertex * 3 + axis]
          min[axis] = Math.min(min[axis], value)
          max[axis] = Math.max(max[axis], value)
        }
      }
    }
    bounds.push(...min, ...max)
    if (end - start > 16) {
      let axis = 0
      for (let candidate = 1; candidate < 3; candidate++) {
        if (centreMax[candidate] - centreMin[candidate] > centreMax[axis] - centreMin[axis]) axis = candidate
      }
      const middle = (start + end) >>> 1
      median(start, end, middle, axis)
      nodes[node * 4] = build(start, middle)
      nodes[node * 4 + 1] = build(middle, end)
      nodes[node * 4 + 3] = 0
    }
    return node
  }

  if (count) build(0, count)
  return { triangles, order, bounds: new Float32Array(bounds), nodes: new Int32Array(nodes) }
}
