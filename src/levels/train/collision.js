import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

const BVH_OPTIONS = { targetLeafSize: 12 }

export function createTrainCollision(level, carriages) {
  const templates = new Map()
  const resources = new THREE.Group()
  resources.name = 'trainCollisionResources'
  resources.visible = false

  for (const carriage of carriages) {
    if (templates.has(carriage.carriageType)) continue
    const template = createCollisionTemplate(carriage)
    templates.set(carriage.carriageType, template)
    resources.add(template.resource)
  }

  level.add(resources)

  const instances = carriages.map(carriage => {
    carriage.group.updateMatrixWorld(true)
    const template = templates.get(carriage.carriageType)
    const matrixWorld = carriage.group.matrixWorld.clone()
    return {
      bounds: template.bounds.clone().applyMatrix4(matrixWorld),
      bvh: template.bvh,
      inverseMatrix: matrixWorld.clone().invert(),
      matrixWorld,
    }
  })

  return {
    type: 'meshBvh',
    instances,
    snapDistance: 0.32,
    stepHeight: 0.32,
  }
}

function createCollisionTemplate(carriage) {
  const vertices = []
  const indices = []
  const vertexIndices = new Map()
  const triangleIndices = new Set()
  const groupInverse = carriage.group.matrixWorld.clone().invert()
  const transform = new THREE.Matrix4()
  const point = new THREE.Vector3()

  carriage.model.traverse(mesh => {
    if (!mesh.isMesh) return

    transform.multiplyMatrices(groupInverse, mesh.matrixWorld)
    const position = mesh.geometry.getAttribute('position')
    const index = mesh.geometry.getIndex()
    const getVertexIndex = (sourceIndex) => {
      point.fromBufferAttribute(position, sourceIndex).applyMatrix4(transform)
      const key = `${Math.round(point.x * 100000)}:${Math.round(point.y * 100000)}:${Math.round(point.z * 100000)}`
      let vertexIndex = vertexIndices.get(key)
      if (vertexIndex !== undefined) return vertexIndex

      vertexIndex = vertices.length / 3
      vertexIndices.set(key, vertexIndex)
      vertices.push(point.x, point.y, point.z)
      return vertexIndex
    }

    const elementCount = index ? index.count : position.count
    for (let i = 0; i < elementCount; i += 3) {
      const a = getVertexIndex(index ? index.getX(i) : i)
      const b = getVertexIndex(index ? index.getX(i + 1) : i + 1)
      const c = getVertexIndex(index ? index.getX(i + 2) : i + 2)
      if (a === b || b === c || c === a) continue

      const triangle = [a, b, c].sort((left, right) => left - right).join(':')
      if (triangleIndices.has(triangle)) continue

      triangleIndices.add(triangle)
      indices.push(a, b, c)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingBox()

  const bvh = new MeshBVH(geometry, BVH_OPTIONS)
  geometry.boundsTree = bvh

  const resource = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial(),
  )
  resource.name = `trainCollision${carriage.carriageType}`
  resource.visible = false

  return {
    bounds: geometry.boundingBox,
    bvh,
    resource,
  }
}
