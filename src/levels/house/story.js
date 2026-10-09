import * as THREE from 'three'
import { HousePursuit } from './pursuit.js'
import { findStoryAsset, createAuthoredGhost, createJumpScareGhost, darkenGraves } from './story-assets.js'

import { HOUSE_EVIDENCE, RITE_QUESTIONS } from './story-data.js'
export { HOUSE_EVIDENCE, RITE_QUESTIONS } from './story-data.js'

export class HouseStory {
  constructor({ model, animations = [], level, items, doors = [], camera, audio, onMessage }) {
    this.model = model
    this.doors = doors
    this.camera = camera
    this.audio = audio
    this.onMessage = onMessage
    this.found = new Set()
    this.time = 0
    this.disturbance = 0
    this.riteStep = 0
    this.failureReason = null
    this.released = false
    this.complete = false
    this.releaseTime = 0
    this.nextApparitionAt = Infinity
    this.nextScareAllowedAt = 0
    this.pendingLetterScare = false
    this.pendingEvidenceScare = null
    this.chaseAfterScare = false
    this.jumpScareTime = 0
    this.phoneAnswered = false
    this.nextRing = 0
    this.phoneRingStartsAt = Infinity
    this.pursuit = new HousePursuit()
    this.endingTime = null
    this.root = new THREE.Group()
    this.root.name = 'vale-story'
    level.add(this.root)
    this.lights = []
    level.traverse(object => {
      if (object.isPointLight) this.lights.push({ light: object, intensity: object.intensity })
    })
    this.markers = []
    darkenGraves(this.model)
    this.diaryEntry = findStoryAsset(this.model, ['Diary Entry'])
    if (this.diaryEntry) this.diaryEntry.visible = false
    this.confessionEnvelope = findStoryAsset(this.model, ['Daniel Envelope'])
    this.confessionLetter = findStoryAsset(this.model, ['Daniels Letter'])
    if (this.confessionLetter) this.confessionLetter.visible = false
    for (const evidence of HOUSE_EVIDENCE) {
      const object = this.createEvidence(evidence)
      const inspectionMesh = evidence.id === 'evelyn-diary' && this.diaryEntry
        ? this.firstMesh(this.diaryEntry)
        : evidence.id === 'daniel-confession' && this.confessionLetter
          ? this.firstMesh(this.confessionLetter)
          : object.userData.inspectionMesh || this.firstMesh(object)
      const inspectionMode = evidence.id === 'evelyn-diary' && this.diaryEntry
        ? 'page' : evidence.inspectionMode
      const item = { ...evidence, object, inspectionMesh, inspectionMode, story: true, prompt: evidence.id === 'daniel-confession'
        ? 'E · Open Daniel’s envelope'
        : `E · Inspect ${evidence.title.toLowerCase()}` }
      items.push(item)
      if (evidence.id === 'daniel-confession' && this.confessionLetter) {
        items.push({ ...item, object: this.confessionLetter })
      }
    }
    const grave = this.createGrave()
    this.gravePosition = this.authoredGravePosition?.clone() || grave.position.clone()
    items.push({ id: 'evelyn-grave', object: grave, story: true, title: "Evelyn's unmarked grave" })
    this.ghost = this.createGhost()
    this.root.add(this.ghost)
    this.ghost.visible = false
    this.jumpScareGhost = createJumpScareGhost(this.ghost, camera)
    const evelynSource = findStoryAsset(this.model, ['Evelyn'])
    if (evelynSource) {
      const authoredBounds = new THREE.Box3().setFromObject(evelynSource)
      const authoredPosition = authoredBounds.getCenter(new THREE.Vector3())
      authoredPosition.y = authoredBounds.min.y
      if (Math.hypot(authoredPosition.x - this.gravePosition.x, authoredPosition.z - this.gravePosition.z) < 4) {
        this.evelynFarewellPosition = authoredPosition
      }
    }
    this.evelyn = evelynSource ? createAuthoredGhost(evelynSource, 1.55) : null
    if (this.evelyn) {
      this.root.add(this.evelyn)
      this.evelyn.visible = false
      this.evelyn.traverse(object => {
        if (!object.isMesh) return
        const glowMaterial = original => new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
          depthTest: true,
          blending: THREE.NormalBlending,
          side: THREE.DoubleSide,
          fog: false,
          toneMapped: false,
        })
        object.material = Array.isArray(object.material)
          ? object.material.map(glowMaterial) : glowMaterial(object.material)
        object.renderOrder = 20
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.userData.baseOpacity = material.opacity
        }
      })
      const glowCanvas = document.createElement('canvas')
      glowCanvas.width = glowCanvas.height = 128
      const glowContext = glowCanvas.getContext('2d')
      const halo = glowContext.createRadialGradient(64, 64, 4, 64, 64, 64)
      halo.addColorStop(0, 'rgba(255, 255, 255, 0.42)')
      halo.addColorStop(0.45, 'rgba(235, 245, 255, 0.18)')
      halo.addColorStop(1, 'rgba(235, 245, 255, 0)')
      glowContext.fillStyle = halo
      glowContext.fillRect(0, 0, 128, 128)
      this.evelynHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(glowCanvas), transparent: true,
        opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }))
      this.evelynHalo.position.set(0, 0.8, 0)
      this.evelynHalo.scale.set(2.2, 2.8, 1)
      this.evelyn.add(this.evelynHalo)
      const idle = animations.find(clip => clip.name === 'idle')
      if (idle) {
        this.evelynMixer = new THREE.AnimationMixer(this.evelyn)
        this.evelynMixer.clipAction(idle).play()
        this.evelynMixer.update(0.01)
      }
    }
    this.flashlight = new THREE.SpotLight(0xfff0d5, 9, 28, 0.58, 0.62, 1)
    this.flashlight.castShadow = false
    this.flashlightOn = true
    this.flashlight.position.set(0.18, -0.18, -0.1)
    this.flashlight.target.position.set(0, 0, -8)
    camera.add(this.flashlight, this.flashlight.target)
    this.root.updateMatrixWorld(true)
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn
    this.flashlight.intensity = this.flashlightOn ? 9 : 0
  }

  startHouseApparition() {
    return this.triggerJumpScare(false)
  }

  firstMesh(object) {
    if (object.isMesh) return object
    let mesh = null
    object.traverse(child => { if (!mesh && child.isMesh) mesh = child })
    return mesh
  }

  ground(position) {
    const start = new THREE.Vector3(position[0], position[1] + 0.35, position[2])
    const ray = new THREE.Raycaster(start, new THREE.Vector3(0, -1, 0), 0, 12)
    const surfaces = []
    this.model.traverse(object => {
      if (object.isMesh && object.visible && /floor|yard|ground|garden|backyard/i.test(object.name)) surfaces.push(object)
    })
    const hit = ray.intersectObjects(surfaces, false)[0]
    return new THREE.Vector3(position[0], hit ? hit.point.y + 0.025 : position[1], position[2])
  }

  createEvidence(data) {
    if (data.kind === 'engraving') {
      const authored = findStoryAsset(this.model, ['Annex Scratches', 'Annex_Scratches', 'Evelyn Scratches'])
      return authored || this.createEngravingMarker(data)
    }
    const authored = findStoryAsset(this.model, data.assetNames || [])
    if (authored) return authored
    const group = new THREE.Group()
    group.name = data.id
    if (data.kind === 'confession') {
      const phone = findStoryAsset(this.model, ['Phone'])
      const plateSource = findStoryAsset(this.model, ['Plate'])
      if (phone && plateSource) {
        const phoneBounds = new THREE.Box3().setFromObject(phone)
        const phoneCentre = phoneBounds.getCenter(new THREE.Vector3())
        const plateCentre = new THREE.Vector3(phoneCentre.x + 0.42, phoneBounds.min.y - 0.005, phoneCentre.z + 0.05)
        plateSource.updateWorldMatrix(true, false)
        const plate = plateSource.clone()
        plate.name = 'Kitchen_Single_Plate'
        plateSource.matrixWorld.decompose(plate.position, plate.quaternion, plate.scale)
        this.root.add(plate)
        plate.position.add(plateCentre.sub(new THREE.Box3().setFromObject(plate).getCenter(new THREE.Vector3())))
        const plateBounds = new THREE.Box3().setFromObject(plate)
        group.position.set(plateBounds.max.x + 0.25, plateBounds.min.y - 0.015, plateBounds.getCenter(new THREE.Vector3()).z)
      } else group.position.copy(this.ground(data.position))
    } else group.position.copy(this.ground(data.position))
    const box = data.kind === 'box'
    const base = new THREE.Mesh(new THREE.BoxGeometry(box ? 0.48 : 0.38, box ? 0.26 : 0.055, box ? 0.34 : 0.48), new THREE.MeshStandardMaterial({ color: box ? 0x492923 : 0x453932, roughness: 0.85 }))
    base.position.y = box ? 0.14 : 0.055
    group.add(base)
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = box ? '#4b3028' : '#d5c6a3'
    ctx.fillRect(0, 0, 512, 512)
    ctx.strokeStyle = box ? '#b4a06e' : '#847458'
    ctx.lineWidth = 4
    ctx.strokeRect(25, 25, 462, 462)
    ctx.fillStyle = box ? '#e1c998' : '#382d25'
    ctx.textAlign = 'center'
    ctx.font = '30px Georgia'
    ctx.fillText(data.label, 256, 190)
    ctx.font = '18px Georgia'
    ctx.fillText('VALE HOUSE', 256, 240)
    for (let i = 0; i < 5; i++) ctx.fillRect(75, 290 + i * 24, 330 - i * 17, 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const page = new THREE.Mesh(new THREE.PlaneGeometry(box ? 0.43 : 0.34, box ? 0.3 : 0.44), new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }))
    page.rotation.x = -Math.PI / 2
    page.position.y = box ? 0.275 : 0.085
    group.add(page)
    this.root.add(group)
    this.addClueLight(group.position.clone().add(new THREE.Vector3(0.34, 0, 0)), data.id)
    return group
  }

  createEngravingMarker(data) {
    const group = new THREE.Group()
    group.name = data.id
    // The invisible marker keeps the clue playable until an authored GLB is placed.
    group.position.copy(this.ground(data.position)).y += 1.35
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.85),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    )
    group.add(marker)
    group.userData.inspectionMesh = marker
    this.root.add(group)
    return group
  }

  addClueLight(position, id) {
    const graveMarker = id === 'evelyn-grave'
    const intensity = graveMarker ? 0.006 : 0.7
    const settledIntensity = graveMarker ? 0.002 : 0.25
    const light = new THREE.PointLight(0xffbd79, intensity, graveMarker ? 0.4 : 2, 1.5)
    light.name = `${id}-clue-light`
    light.position.copy(position).add(new THREE.Vector3(0, 0.25, 0))
    this.root.add(light)
    this.markers.push({ id, light, intensity, settledIntensity })
  }

  createGrave() {
    const authored = findStoryAsset(this.model, ['grave.001', 'Grave_Evelyn_Unmarked', 'Evelyn_Grave', 'grave'])
    if (authored) {
      const bounds = new THREE.Box3().setFromObject(authored)
      const position = bounds.getCenter(new THREE.Vector3())
      position.y = bounds.min.y
      this.root.attach(authored)
      const surfaces = []
      this.model.traverse(object => {
        if (object.isMesh && object.visible && /floor|yard|ground|garden|terrain|road/i.test(object.name)) {
          surfaces.push(object)
        }
      })
      const floorHit = new THREE.Raycaster(
        position.clone().add(new THREE.Vector3(0, 2, 0)),
        new THREE.Vector3(0, -1, 0), 0, 5,
      ).intersectObjects(surfaces, false)[0]
      const lowering = (floorHit
        ? Math.min(0.22, Math.max(0, position.y - floorHit.point.y + 0.025))
        : 0.1) + 0.15
      authored.position.y -= lowering
      position.y -= lowering
      this.authoredGravePosition = position
      for (const x of [-0.6, 0.6]) this.addClueLight(position.clone().add(new THREE.Vector3(x, 0, 0.6)), 'evelyn-grave')
      return authored
    }
    const group = new THREE.Group()
    group.name = 'evelyn-grave'
    group.position.copy(this.ground([7.7, 12, -15]))
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 7), new THREE.MeshStandardMaterial({ color: 0x302b25, roughness: 1 }))
    earth.scale.set(0.44, 0.09, 0.86)
    group.add(earth)
    const outline = new THREE.Shape()
    outline.moveTo(-0.24, 0)
    outline.lineTo(0.24, 0)
    outline.lineTo(0.24, 0.36)
    outline.quadraticCurveTo(0, 0.65, -0.24, 0.36)
    outline.closePath()
    const stone = new THREE.MeshStandardMaterial({ color: 0x33332f, roughness: 1 })
    const marker = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1, steps: 1 }), stone)
    marker.position.set(0, -0.05, -0.78)
    marker.rotation.z = -0.12
    group.add(marker)
    for (let index = 0; index < 12; index++) {
      const angle = index * Math.PI / 6
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), stone)
      pebble.position.set(Math.sin(angle) * 0.46, 0.015, Math.cos(angle) * 0.86)
      pebble.scale.set(1.1, 0.45, 0.85)
      pebble.rotation.y = index * 1.7
      group.add(pebble)
    }
    this.root.add(group)
    for (const x of [-0.58, 0.58]) this.addClueLight(group.position.clone().add(new THREE.Vector3(x, 0, -0.5)), 'evelyn-grave')
    return group
  }

  createGhost() {
    const authored = findStoryAsset(this.model, ['Ghost', 'Ghost_Evelyn', 'Evelyn', 'Ghost_Elias', 'Elias'])
    if (authored) return createAuthoredGhost(authored)
    const ghost = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({ color: 0x9aafb2, transparent: true, opacity: 0.3, depthWrite: false })
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.31, 1.4, 10), material)
    torso.position.y = 0.85
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), material)
    head.scale.y = 1.3
    head.position.y = 1.74
    ghost.add(torso, head)
    for (const x of [-0.24, 0.24]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.035, 0.85, 6), material)
      arm.position.set(x, 0.92, 0)
      ghost.add(arm)
    }
    return ghost
  }

  canInspect(id) {
    if (!this.phoneAnswered) return false
    if (id === 'evelyn-grave') return HOUSE_EVIDENCE.every(item => this.found.has(item.id)) && ['chasing', 'safe'].includes(this.pursuit?.state)
    if (!HOUSE_EVIDENCE.some(item => item.id === id)) return false
    if (id === 'daniel-confession') return ['evelyn-diary', 'music-box', 'annex-message', 'caretaker-record'].every(item => this.found.has(item))
    return true
  }

  prompt(item) {
    if (item.id === 'evelyn-grave') {
      if (this.released) return 'Evelyn is free. Elias is gone.'
      return this.canInspect(item.id) ? 'E · Begin the exorcism' : 'An unmarked grave. Find Daniel’s letter and survive Elias.'
    }
    if (this.found.has(item.id)) return item.id === 'daniel-confession'
      ? 'E · Reread Daniel’s letter'
      : `E · Revisit ${item.title.toLowerCase()}`
    if (!this.phoneAnswered) return 'Answer the ringing phone in the upstairs main bedroom.'
    if (!this.canInspect(item.id)) return 'Find the diary, music box, wall scratches and caretaker record first.'
    return item.prompt
  }

  inspect(id) {
    if (!HOUSE_EVIDENCE.some(item => item.id === id) || !this.canInspect(id) || this.found.has(id)) return false
    this.found.add(id)
    this.disturbance = 4
    if (id === 'evelyn-diary' || id === 'annex-message') this.pendingEvidenceScare = id
    if (id === 'daniel-confession') {
      if (this.confessionLetter) this.confessionLetter.visible = true
    }
    const evidence = HOUSE_EVIDENCE.find(item => item.id === id)
    this.onMessage(evidence.response)
    if (id === 'music-box') this.audio.playMelody()
    else this.audio.playCue(id === 'caretaker-record' ? 'ghostBreath' : 'ghostFootsteps')
    if (id === 'daniel-confession') {
      this.pendingLetterScare = true
    }
    return true
  }

  triggerLetterScare() {
    if (!this.pendingLetterScare || !this.camera) return false
    if (this.jumpScareTime > 0) {
      this.pendingLetterScare = false
      this.chaseAfterScare = true
      return true
    }
    if (!this.triggerJumpScare(true)) return false
    this.pendingLetterScare = false
    return true
  }

  finishInspection(id) {
    if (id === 'daniel-confession') return this.triggerLetterScare()
    if (id !== this.pendingEvidenceScare) return false
    this.pendingEvidenceScare = null
    return this.triggerJumpScare(false)
  }

  triggerJumpScare(startChase = false, force = false) {
    if (!this.camera || this.jumpScareTime > 0 || this.released) return false
    // Ambient and clue scares share a cooldown. The confession is the
    // deliberate final scare and must still start the story's chase.
    if (!startChase && !force && this.time < this.nextScareAllowedAt) return false
    this.chaseAfterScare = startChase
    this.jumpScareTime = 0.95
    this.jumpScareEndsAt = performance.now() + 950
    this.nextScareAllowedAt = this.time + 35
    this.nextApparitionAt = this.time + 35 + Math.random() * 25
    this.audio.playJumpScare?.()
    this.ghost.visible = false
    this.jumpScareGhost.visible = true
    return true
  }

  // Runs every rendered frame, including the pointer-lock handoff after
  // inspection. Pausing gameplay cannot leave the face stuck on screen.
  updateJumpScare(dt, player) {
    if (!(this.jumpScareTime > 0)) return
    this.jumpScareTime = Math.max(0, Math.min(
      this.jumpScareTime - dt,
      (this.jumpScareEndsAt - performance.now()) / 1000,
    ))
    this.jumpScareGhost.visible = this.jumpScareTime > 0
    if (this.jumpScareTime === 0 && this.chaseAfterScare) {
      this.chaseAfterScare = false
      this.pursuit.start(player.position)
      this.onMessage('EVELYN · “Run to my grave behind the house!” Hold Shift to sprint.', 10)
    }
  }

  schedulePhoneRing(delay = 3) {
    this.phoneRingStartsAt = this.time + delay
    this.nextRing = this.phoneRingStartsAt
  }

  isPhoneRinging() {
    return !this.phoneAnswered && this.time >= this.phoneRingStartsAt
  }

  answerPhone() {
    if (this.phoneAnswered) return
    this.audio.stopPhoneRing?.()
    this.phoneAnswered = true
    this.disturbance = 3
    this.nextApparitionAt = this.time + 20 + Math.random() * 10
    this.nextScareAllowedAt = this.nextApparitionAt
    this.onMessage('EVELYN ON THE PHONE · “You found my picture. The voice upstairs sounds like Mum, but Mum is gone. My diary is beside my bed. Don’t follow that voice.”', 13)
    this.audio.playCue('ghostOne')
  }

  answerRite(choice) {
    if (!this.canInspect('evelyn-grave') || this.released) return false
    if (choice !== RITE_QUESTIONS[this.riteStep].answer) {
      this.disturbance = 4
      this.riteStep = 0
      this.failPlayer('wrong-answer')
      return false
    }
    this.onMessage(RITE_QUESTIONS[this.riteStep].line, 7)
    this.riteStep++
    if (this.riteStep === RITE_QUESTIONS.length) {
      this.released = true
      this.pursuit.stop()
      this.releaseTime = this.time
      if (this.ghost) this.ghost.visible = false
      this.audio.setCalm(true)
      this.audio.playMelody()
      this.onMessage('EVELYN · “Thank you. I am free now.” Elias is gone. The yard falls quiet.', 12)
    }
    return true
  }

  failPlayer(reason = 'caught') {
    this.failureReason = reason
    this.pursuit.state = 'caught'
    // A failed rite or capture must play even during an ambient scare cooldown.
    this.triggerJumpScare(false, true)
  }

  objective() {
    if (!this.phoneAnswered) return null
    if (this.complete) return 'LEVEL 1 COMPLETE - EVELYN IS FREE'
    if (this.released) return 'EVELYN IS FREE - ELIAS IS GONE'
    if (this.pendingLetterScare || this.chaseAfterScare || this.pursuit?.state === 'chasing') return 'BACKYARD - FACE THE GRAVE AND PRESS E'
    if (!this.found.has('evelyn-diary')) return "UPSTAIRS · FIND EVELYN'S DIARY BESIDE HER BED"
    if (!this.found.has('music-box')) return 'UPSTAIRS · INSPECT THE MUSIC BOX IN THE MAIN BEDROOM'
    if (!this.found.has('annex-message')) return 'UPSTAIRS · READ THE SCRATCHES IN THE ANNEX'
    if (!this.found.has('caretaker-record')) return 'KITCHEN · READ THE VALE ESTATE SERVICE RECORD'
    if (!this.found.has('daniel-confession')) return 'DINING ROOM - OPEN DANIELS ENVELOPE ON THE TABLE'
    return 'BACKYARD · FIND EVELYN’S UNMARKED GRAVE'
  }

  update(dt, player, ringing) {
    this.time += dt
    this.disturbance = Math.max(0, this.disturbance - dt)
    if (ringing && this.isPhoneRinging() && this.time >= this.nextRing) {
      this.audio.playPhoneRing()
      this.nextRing = this.time + 6
    }
    for (const { light, intensity } of this.lights) {
      light.intensity = intensity * (this.disturbance > 0 ? 0.55 + 0.45 * Math.sin(this.time * 15) ** 2 : 1)
    }
    for (const { id, light, intensity, settledIntensity } of this.markers) {
      const settled = this.found.has(id) || this.released
      light.intensity = (settled ? settledIntensity : intensity) *
        (0.9 + 0.1 * Math.sin(this.time * 7 + light.id))
    }
    if (this.jumpScareTime > 0) return
    const haunting = this.found.has('daniel-confession') && this.pursuit.state === 'chasing' && !this.released
    if (this.phoneAnswered && this.pursuit.state === 'idle' && !this.released &&
        this.audio.isInside?.(player.position) && this.time >= this.nextApparitionAt) {
      if (this.startHouseApparition()) return
    }
    this.ghost.visible = haunting
    if (haunting) {
      this.pursuit.update(dt, player.position)
      if (this.pursuit.state === 'caught') {
        this.failPlayer()
        return
      }
      this.ghost.position.copy(this.pursuit.state === 'chasing' || this.pursuit.state === 'caught'
        ? this.pursuit.position.clone().add(new THREE.Vector3(0, -1, 0))
        : this.gravePosition.clone().add(new THREE.Vector3(-3, 0, -2)))
      this.ghost.visible = this.pursuit.grace <= 0
      this.ghost.lookAt(player.position.x, this.ghost.position.y, player.position.z)
    }
    if (this.released && !this.complete) {
      const farewell = this.time - this.releaseTime
      this.ghost.visible = false
      if (this.evelyn) {
        this.evelynMixer?.update(dt)
        this.evelyn.visible = farewell < 18
        const towardPlayer = player.position.clone().sub(this.gravePosition).setY(0).normalize().multiplyScalar(0.9)
        this.evelyn.position.copy(this.evelynFarewellPosition || this.gravePosition.clone().add(towardPlayer))
        this.evelyn.position.y += 0.12 + farewell * 0.025
        if (!this.evelynFarewellPosition) this.evelyn.lookAt(player.position.x, this.evelyn.position.y, player.position.z)
        const opacity = Math.max(0, 0.88 * (1 - farewell / 18))
        this.evelyn.traverse(object => {
          if (!object.isMesh) return
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            material.opacity = opacity * (material.userData.baseOpacity / 0.88)
          }
        })
        if (this.evelynHalo) this.evelynHalo.material.opacity = opacity * 0.85
      }
    }
    if (this.released && !this.complete && this.time - this.releaseTime >= 18) {
      this.complete = true
      this.endingTime = this.time
      if (this.evelyn) this.evelyn.visible = false
      this.onMessage('LEVEL 1 COMPLETE - Evelyn Vale is free. Elias Wren is gone.', 18)
    }
    if (this.complete) this.ghost.visible = false
  }

  retryPursuit(player, spawn = this.pursuit.checkpoint, yaw = player.input.yaw) {
    if (this.pursuit.state !== 'caught') return false
    player.reset(this.pursuit.retry(spawn), yaw)
    this.failureReason = null
    this.onMessage('EVELYN · “Keep moving. My grave is behind the house.”', 8)
    return true
  }

  dispose() {
    this.evelynMixer?.stopAllAction()
    this.evelynHalo?.material.map?.dispose()
    for (const { light, intensity } of this.lights) light.intensity = intensity
    this.camera.remove(this.flashlight, this.flashlight.target)
    this.camera.remove(this.jumpScareGhost)
    this.jumpScareGhost.traverse(object => {
      if (!object.isMesh) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    })
    this.flashlight.dispose()
  }
}
