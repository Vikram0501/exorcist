import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadingManager } from '../../core/loading.js'

const MODEL_URL = '/levels/house/models/priest-player.glb'
const WALK_SUFFIXES = new Set(['F', 'B', 'L', 'R', 'FL', 'FR', 'BL', 'BR'])
// Level 1's collision body is roughly 1 m tall, including its head radius.
const PLAYER_VISUAL_HEIGHT = 1
const CAMERA_DISTANCE = 2.5
const CAMERA_RADIUS = 0.18
const CAMERA_STEP = 0.2

export class HouseAvatar {
  static async load(level, firstPersonCamera) {
    const gltf = await new GLTFLoader(loadingManager).loadAsync(MODEL_URL)
    const avatar = new HouseAvatar(gltf, firstPersonCamera)
    level.add(avatar.root)
    return avatar
  }

  constructor(gltf, firstPersonCamera) {
    this.firstPersonCamera = firstPersonCamera
    this.camera = new THREE.PerspectiveCamera(
      firstPersonCamera.fov, firstPersonCamera.aspect,
      firstPersonCamera.near, firstPersonCamera.far,
    )
    this.root = new THREE.Group()
    this.root.name = 'Priest Player'
    this.visual = gltf.scene
    this.root.add(this.visual)

    const bounds = new THREE.Box3().setFromObject(this.visual)
    const size = bounds.getSize(new THREE.Vector3())
    const scale = size.y > 0 ? PLAYER_VISUAL_HEIGHT / size.y : 1
    this.visual.scale.multiplyScalar(scale)
    this.visual.position.y -= bounds.min.y * scale
    this.visual.traverse((object) => {
      if (object.isMesh) object.castShadow = true
    })

    this.mixer = new THREE.AnimationMixer(this.visual)
    this.actions = new Map()
    for (const clip of gltf.animations) {
      const name = clip.name.split('|').pop()
      if (name === 'HnH_Idle' || (name.startsWith('HnH_Walk_') && WALK_SUFFIXES.has(name.slice(9)))) {
        this.actions.set(name, this.mixer.clipAction(clip))
      }
    }
    this.action = this.actions.get('HnH_Idle') || null
    this.action?.play()
    this.thirdPerson = false
    this.root.visible = false
    this.cameraReady = false
    this.sphere = new THREE.Sphere(new THREE.Vector3(), CAMERA_RADIUS)
  }

  toggleView() {
    this.thirdPerson = !this.thirdPerson
    this.root.visible = this.thirdPerson
    this.cameraReady = false
  }

  get renderCamera() {
    return this.thirdPerson ? this.camera : this.firstPersonCamera
  }

  update(dt, player, collisionWorld) {
    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z)
    const forward = player.getForward()
    const right = player.getRight()
    const along = player.velocity.dot(forward)
    const across = player.velocity.dot(right)
    let clipName = 'HnH_Idle'
    if (horizontalSpeed > 0.18) {
      const frontBack = Math.abs(along) > horizontalSpeed * 0.38 ? (along > 0 ? 'F' : 'B') : ''
      const leftRight = Math.abs(across) > horizontalSpeed * 0.38 ? (across > 0 ? 'R' : 'L') : ''
      clipName = `HnH_Walk_${frontBack}${leftRight}`
    }
    const nextAction = this.actions.get(clipName) || this.actions.get('HnH_Walk_F') || this.action
    if (nextAction && nextAction !== this.action) {
      nextAction.reset().play()
      if (this.action) nextAction.crossFadeFrom(this.action, 0.16, true)
      this.action = nextAction
    }
    if (this.action) this.action.timeScale = clipName === 'HnH_Idle' ? 1 : Math.max(0.65, Math.min(1.6, horizontalSpeed / 2.5))
    this.mixer.update(dt)

    this.root.position.copy(player.position)
    this.root.position.y -= player.eyeHeight
    this.root.rotation.y = player.input.yaw + Math.PI
    this.root.scale.y = player.crouching ? 0.68 : 1

    if (!this.thirdPerson) return

    // The render camera follows the player's aim while the original camera
    // stays at eye height for the torch and all first-person interactions.
    const yaw = player.input.yaw
    const pivot = player.position.clone()
    const offset = new THREE.Vector3(
      Math.sin(yaw) * CAMERA_DISTANCE,
      0.5,
      Math.cos(yaw) * CAMERA_DISTANCE,
    )
    const distance = offset.length()
    const direction = offset.multiplyScalar(1 / distance)
    let safeDistance = distance
    if (collisionWorld) {
      for (let d = CAMERA_STEP; d <= distance; d += CAMERA_STEP) {
        this.sphere.center.copy(pivot).addScaledVector(direction, d)
        if (collisionWorld.sphereIntersect(this.sphere)) {
          safeDistance = Math.max(0.25, d - CAMERA_STEP)
          break
        }
      }
    }
    const targetPosition = pivot.addScaledVector(direction, safeDistance)
    if (!this.cameraReady) {
      this.camera.position.copy(targetPosition)
      this.cameraReady = true
    } else {
      this.camera.position.lerp(targetPosition, 1 - Math.exp(-dt * 12))
    }
    const aim = player.position.clone()
    this.firstPersonCamera.getWorldDirection(direction)
    aim.addScaledVector(direction, 4)
    this.camera.lookAt(aim)
    this.root.visible = safeDistance > 0.8
  }

  resize(aspect, far) {
    this.camera.aspect = aspect
    this.camera.far = far
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.visual)
  }
}
