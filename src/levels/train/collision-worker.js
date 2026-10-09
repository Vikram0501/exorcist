import { buildTriangleBVH } from './collision-bvh.js'

self.onmessage = ({ data }) => {
  try {
    const result = buildTriangleBVH(data)
    self.postMessage(result, [result.triangles.buffer, result.order.buffer, result.bounds.buffer, result.nodes.buffer])
  } catch (error) {
    self.postMessage({ error: error.message })
  }
}
