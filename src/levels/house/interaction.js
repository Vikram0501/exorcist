import * as THREE from 'three'

const blockerPoint = new THREE.Vector3()
const rayTriangles = []

function isVisible(object) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}

function blockedByHouse(world, ray, distance) {
  if (!world?.getRayTriangles) return false
  rayTriangles.length = 0
  world.getRayTriangles(ray, rayTriangles)
  const clearDistanceSq = Math.max(0, distance - 0.08) ** 2
  let blocked = false
  for (const triangle of rayTriangles) {
    // The house has thin, two-sided panels. Octree.rayIntersect checks only
    // the front winding, so check both sides here for interaction occlusion.
    if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, blockerPoint) &&
        blockerPoint.distanceToSquared(ray.origin) < clearDistanceSq) {
      blocked = true
      break
    }
  }
  rayTriangles.length = 0
  return blocked
}

// Raycast the handful of inspectable props, not every visible and hidden mesh
// in the manor. The full GLB includes a 480k-triangle chair; intersecting it
// during each 80 ms interaction sample causes periodic movement hitches.
export function findHouseInvestigationItem(raycaster, items, doors, collisionWorld, playerPosition, range) {
  const byObject = new Map()
  for (const item of items) {
    if (item.object && isVisible(item.object)) byObject.set(item.object, item)
  }
  if (byObject.size === 0) return null

  const hits = raycaster.intersectObjects([...byObject.keys()], true)
  for (const hit of hits) {
    if (!isVisible(hit.object) || hit.point.distanceTo(playerPosition) > range) continue
    let node = hit.object
    while (node && !byObject.has(node)) node = node.parent
    const item = byObject.get(node)
    if (!item) continue

    if (blockedByHouse(collisionWorld, raycaster.ray, hit.distance)) return null
    if (doors.length) {
      const doorHits = raycaster.intersectObjects(doors.map(door => door.object), true)
      if (doorHits.some(doorHit => isVisible(doorHit.object) && doorHit.distance < hit.distance - 0.08)) return null
    }
    return item
  }
  return null
}
