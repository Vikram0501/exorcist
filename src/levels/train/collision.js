import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { Octree } from 'three/addons/math/Octree.js'
import { buildTriangleBVH } from './collision-bvh.js'

const templates = new WeakMap()

async function extractTriangles(model, offset) {
  model.updateWorldMatrix(true, true)
  const meshes = []
  let vertexCount = 0
  model.traverse(object => {
    if (!object.isMesh || !object.geometry.attributes.position) return
    meshes.push(object)
    vertexCount += object.geometry.index?.count ?? object.geometry.attributes.position.count
  })
  const packed = new Float32Array(vertexCount * 3)
  const triangle = new THREE.Triangle()
  let length = 0, sinceYield = 0
  for (const mesh of meshes) {
    const { position } = mesh.geometry.attributes
    const indices = mesh.geometry.index
    const count = indices?.count ?? position.count
    for (let i = 0; i + 2 < count; i += 3) {
      triangle.a.fromBufferAttribute(position, indices ? indices.getX(i) : i).applyMatrix4(mesh.matrixWorld).sub(offset)
      triangle.b.fromBufferAttribute(position, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld).sub(offset)
      triangle.c.fromBufferAttribute(position, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld).sub(offset)
      if (triangle.getArea() > 1e-10) {
        triangle.a.toArray(packed, length)
        triangle.b.toArray(packed, length + 3)
        triangle.c.toArray(packed, length + 6)
        length += 9
      }
      // Also give the browser time to paint during geometry extraction.
      if (++sinceYield >= 8192) {
        sinceYield = 0
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
  }
  return packed.slice(0, length)
}

function buildInWorker(triangles) {
  // Node tests exercise the identical builder without a browser worker.
  if (typeof Worker === 'undefined') return Promise.resolve(buildTriangleBVH(triangles))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./collision-worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      worker.terminate()
      if (data.error) reject(new Error(data.error))
      else resolve(data)
    }
    worker.onerror = event => {
      worker.terminate()
      reject(new Error(event.message || 'Train collision worker failed'))
    }
    worker.postMessage(triangles, [triangles.buffer])
  })
}

class TrainCollisionWorld {
  constructor(instances) {
    this.instances = instances
    // Reuse the existing triangle/capsule narrow-phase, without building an Octree.
    this.intersection = new Octree()
    this.capsule = new Capsule()
    this.triangle = new THREE.Triangle()
    this.queryBounds = new THREE.Box3()
    this.stack = []
    this.lastTriangleTests = 0
  }

  capsuleIntersect(capsule) {
    const moved = this.capsule
    moved.copy(capsule)
    this.lastTriangleTests = 0
    for (const { offset, bounds, tree } of this.instances) {
      this.queryBounds.makeEmpty().expandByPoint(moved.start).expandByPoint(moved.end).expandByScalar(moved.radius)
      if (!this.queryBounds.intersectsBox(bounds)) continue
      moved.translate(offset.clone().negate())
      this.queryBounds.translate(offset.clone().negate())
      const { min, max } = this.queryBounds
      const { triangles, order, nodes, bounds: boxes } = tree
      this.stack.length = 0
      if (nodes.length) this.stack.push(0)
      while (this.stack.length) {
        const node = this.stack.pop(), box = node * 6, entry = node * 4
        if (min.x > boxes[box + 3] || max.x < boxes[box] ||
            min.y > boxes[box + 4] || max.y < boxes[box + 1] ||
            min.z > boxes[box + 5] || max.z < boxes[box + 2]) continue
        const count = nodes[entry + 3]
        if (!count) {
          this.stack.push(nodes[entry], nodes[entry + 1])
          continue
        }
        const start = nodes[entry + 2]
        for (let i = start; i < start + count; i++) {
          const at = order[i] * 9
          const triangle = this.triangle
          triangle.a.fromArray(triangles, at)
          triangle.b.fromArray(triangles, at + 3)
          triangle.c.fromArray(triangles, at + 6)
          this.lastTriangleTests++
          let hit = this.intersection.triangleCapsuleIntersect(moved, triangle)
          if (!hit) {
            // Walls, glass, and thin furniture panels must block from either side.
            const swap = triangle.b
            triangle.b = triangle.c
            triangle.c = swap
            hit = this.intersection.triangleCapsuleIntersect(moved, triangle)
          }
          if (hit && hit.depth > 0) moved.translate(hit.normal.multiplyScalar(hit.depth))
        }
      }
      moved.translate(offset)
    }
    const correction = moved.start.clone().sub(capsule.start)
    const depth = correction.length()
    return depth > 1e-8 ? { normal: correction.divideScalar(depth), depth } : false
  }
}

export async function createTrainCollision(carriages) {
  const instances = await Promise.all(carriages.map(async carriage => {
    const { model, group, collisionSource = model } = carriage
    model.updateWorldMatrix(true, true)
    const offset = group ? group.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3()
    const bounds = new THREE.Box3().setFromObject(model)
    if (!templates.has(collisionSource)) {
      const pending = extractTriangles(model, offset).then(buildInWorker).catch(error => {
        templates.delete(collisionSource)
        throw error
      })
      templates.set(collisionSource, pending)
    }
    return { offset, bounds, tree: await templates.get(collisionSource) }
  }))
  return [{ type: 'mesh', world: new TrainCollisionWorld(instances) }]
}
