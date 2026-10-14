import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { Octree } from 'three/addons/math/Octree.js'
import { buildTriangleBVH } from './collision-bvh.js'

const templates = new WeakMap()
const TRAIN_MAX_STEP_HEIGHT = 0.3
// The flattened carriage asset stores the U-stair treads and risers in a broad
// shared mesh, so these measured bounds replace only that walkable volume.
const TRAIN_STAIR_MESH = 'Material2004_49'
const TRAIN_STAIR_MIN = new THREE.Vector3(0.85, 0.37, -24.33)
const TRAIN_STAIR_MAX = new THREE.Vector3(2.83, 3.16, -22.14)
const TRAIN_STAIR_SEGMENTS = [
  { start: [2.307217, 0.380919, -22.616014], end: [1.550114, 1.391157, -22.616014], width: 0.919243 },
  { start: [0.854858, 1.391157, -22.561497], end: [1.550114, 1.391157, -22.561497], width: 0.810208 },
  { start: [1.202486, 1.391157, -22.966601], end: [1.202486, 1.892393, -24.316482], width: 0.695256 },
  { start: [0.854858, 1.892393, -23.791295], end: [1.550114, 1.892393, -23.791295], width: 1.050375 },
  { start: [1.550114, 1.892393, -23.791295], end: [2.817039, 3.152594, -23.791295], width: 1.050375 },
]

function isStairTriangle(triangle) {
  return [triangle.a, triangle.b, triangle.c].every(vertex =>
    vertex.x >= TRAIN_STAIR_MIN.x && vertex.x <= TRAIN_STAIR_MAX.x &&
    vertex.y >= TRAIN_STAIR_MIN.y && vertex.y <= TRAIN_STAIR_MAX.y &&
    vertex.z >= TRAIN_STAIR_MIN.z && vertex.z <= TRAIN_STAIR_MAX.z,
  )
}

async function extractTriangles(model, offset) {
  model.updateWorldMatrix(true, true)
  const meshes = []
  let vertexCount = 0
  const hasStairs = Boolean(model.getObjectByName(TRAIN_STAIR_MESH))
  model.traverse(object => {
    if (!object.isMesh || object.userData.dynamicDoor || object.name === TRAIN_STAIR_MESH || !object.geometry.attributes.position) return
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
        if (hasStairs && isStairTriangle(triangle)) continue
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
    this.stepRay = new THREE.Ray()
    this.stepPoint = new THREE.Vector3()
    this.stepNormal = new THREE.Vector3()
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

  findWalkableStepSurface(x, z, minY, maxY) {
    let surface = null
    const ray = this.stepRay
    ray.direction.set(0, -1, 0)

    for (const { offset, bounds, tree } of this.instances) {
      if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z ||
          maxY < bounds.min.y || minY > bounds.max.y) continue

      const localX = x - offset.x
      const localZ = z - offset.z
      const localMinY = minY - offset.y
      const localMaxY = maxY - offset.y
      ray.origin.set(localX, localMaxY + 0.0001, localZ)

      const { triangles, order, nodes, bounds: boxes } = tree
      this.stack.length = 0
      if (nodes.length) this.stack.push(0)

      while (this.stack.length) {
        const node = this.stack.pop(), box = node * 6, entry = node * 4
        if (localX < boxes[box] || localX > boxes[box + 3] ||
            localMaxY < boxes[box + 1] || localMinY > boxes[box + 4] ||
            localZ < boxes[box + 2] || localZ > boxes[box + 5]) continue
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
          triangle.getNormal(this.stepNormal)
          if (Math.abs(this.stepNormal.y) < 0.7) continue
          if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, this.stepPoint)) continue
          const y = this.stepPoint.y + offset.y
          if (y > minY + 0.0001 && y <= maxY + 0.0001 && (surface === null || y > surface)) {
            surface = y
          }
        }
      }
    }

    return surface
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
    return {
      offset,
      bounds,
      tree: await templates.get(collisionSource),
      hasStairs: Boolean(model.getObjectByName(TRAIN_STAIR_MESH)),
    }
  }))
  const stairSegments = instances.flatMap(instance => instance.hasStairs
    ? TRAIN_STAIR_SEGMENTS.map(({ start, end, width }) => ({
      start: [start[0] + instance.offset.x, start[1] + instance.offset.y, start[2] + instance.offset.z],
      end: [end[0] + instance.offset.x, end[1] + instance.offset.y, end[2] + instance.offset.z],
      width,
    }))
    : [])
  const colliders = [{
    type: 'mesh',
    world: new TrainCollisionWorld(instances),
    maxStepHeight: TRAIN_MAX_STEP_HEIGHT,
    groundSnapDistance: TRAIN_MAX_STEP_HEIGHT,
    lockVerticalOnGround: true,
  }]
  if (stairSegments.length > 0) colliders.push({ type: 'meshRamp', segments: stairSegments })
  return colliders
}
