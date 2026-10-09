import * as THREE from 'three'
import { Input } from './input.js'
import { Player } from './player.js'
import { HauntedHouseAudio } from '../levels/house/audio.js'
import { HouseStory } from '../levels/house/story.js'
import { HouseStoryView } from '../levels/house/story-view.js'
import { HouseAvatar } from '../levels/house/avatar.js'
import { installBathroomMirror } from '../levels/house/mirror.js'
import { getDoorColliders, loadHouse, toggleDoor, updateDoors } from '../levels/house/index.js'

const DOOR_INTERACTION_RANGE = 3

export class Game {
  constructor(container) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500)
    this.scene.add(this.camera)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.container.appendChild(this.renderer.domElement)

    this.input = new Input(this.renderer.domElement)
    this.player = new Player(this.camera, this.input)
    this.houseAudio = new HauntedHouseAudio()
    this.houseStory = null
    this.houseStoryView = null
    this.houseAvatar = null
    this.houseMirror = null
    this.colliders = []
    this.colliderHelpers = []
    this.lightHelpers = []
    this.doors = []
    this.model = null
    this.currentLevel = null
    this.spawnPoint = null
    this.spawnYaw = 0
    this.levelRoot = null
    this.levelLoadId = 0

    // DOOR INTERACTION
    this.raycaster = new THREE.Raycaster()

    this.raycaster.far =
      DOOR_INTERACTION_RANGE


    this.interactionPrompt =
      document.getElementById(
        'interactionPrompt'
      )

    this.investigationItems = []

    this.inspectedEvidence = new Set()

    this.newspaperRead = false

    this.valeFrameInspected = false

    this.bedroomPhoneAnswered = false

    this.newspaperOpen = false

    this.newspaperInspectionObject = null

    this.newspaperDrag = null

    this.newspaperPreview =
      document.getElementById(
        'newspaperTexturePreview'
      )

    this.newspaperPreviewTransform = {
      x: 10,
      y: -14,
      z: -4,
      scale: 1,
    }

    this.evidenceBookOpen = false

    this.newspaperReader =
      document.getElementById(
        'newspaperReader'
      )

    const closeNewspaperButton =
      document.getElementById(
        'closeNewspaperInspectBtn'
      )

    const closeEvidenceButton =
      document.getElementById(
        'closeEvidenceNotepadBtn'
      )

    const evidenceButton =
      document.getElementById(
        'evidenceBtn'
      )

    closeNewspaperButton?.addEventListener(
      'click',
      () => this.closeNewspaperReader()
    )

    closeEvidenceButton?.addEventListener(
      'click',
      () => this.closeEvidenceBook()
    )

    evidenceButton?.addEventListener(
      'click',
      () => this.openEvidenceBook()
    )

    this.newspaperReader?.addEventListener(
      'pointerdown',
      (event) => this.startNewspaperDrag(event)
    )

    this.newspaperReader?.addEventListener(
      'pointermove',
      (event) => this.dragNewspaper(event)
    )

    this.newspaperReader?.addEventListener(
      'pointerup',
      () => this.stopNewspaperDrag()
    )

    this.newspaperReader?.addEventListener(
      'pointercancel',
      () => this.stopNewspaperDrag()
    )

    this.newspaperReader?.addEventListener(
      'wheel',
      (event) => this.zoomNewspaper(event),
      { passive: false },
    )


    // GAME STATE
    this.loaded = false
    this.houseAudioStartFrame = null

    this.started = false

    this.animationRunning = false


    this.clock =
      new THREE.Clock()




    window.addEventListener(
      'resize',
      () => this.onResize()
    )
  }

  start() {
    this.started = true
    this.houseAudio.unlock()
    this.input.lock()
    if (!this.animationRunning) {
      this.animationRunning = true
      this.clock.start()
      this.animate()
    }
    return this.loadLevel('house')
  }

  respawn() {
    if (!this.loaded || !this.spawnPoint) return false
    this.player.reset(this.spawnPoint, this.spawnYaw)
    return true
  }

  animate() {
    if (!this.animationRunning) return
    requestAnimationFrame(() => this.animate())
    const dt = Math.min(this.clock.getDelta(), 0.05)

    if (this.input.consumePressed('Digit1')) this.loadLevel('house')
    if (this.input.consumePressed('KeyR')) this.respawn()
    if (this.loaded && this.input.isLocked && this.input.consumePressed('KeyV')) this.houseAvatar?.toggleView()
    if (this.input.consumePressed('KeyI')) {
      if (this.evidenceBookOpen) this.closeEvidenceBook()
      else if (this.input.isLocked) this.openEvidenceBook()
    }

    if (this.loaded) {
      const active = this.input.isLocked && !this.newspaperOpen && !this.evidenceBookOpen && !this.houseStoryView?.open
      this.houseStoryView?.update(dt, active)
      this.houseAudio.setPaused(!active && !this.newspaperOpen && !this.houseStoryView?.open && !this.houseStory?.jumpScareTime)
      if (active) {
        if (this.houseStory && this.input.consumePressed('KeyT')) this.houseStory.toggleFlashlight()
        updateDoors(this.doors, dt)
        this.model?.updateMatrixWorld(true)
        const door = this.getLookedAtDoor()
        const investigationItem = this.getLookedAtInvestigationItem()
        if (this.input.consumePressed('KeyE') && !(this.houseStory?.jumpScareTime > 0)) {
          if (investigationItem?.story) {
            if (this.houseStory.canInspect(investigationItem.id)) {
              if (investigationItem.id === 'evelyn-grave') this.houseStoryView.openRite()
              else {
                this.houseStory.inspect(investigationItem.id)
                this.openNewspaperReader(investigationItem)
              }
            }
          } else if (investigationItem?.id === 'newspaper') {
            this.openNewspaperReader(investigationItem)
          } else if (investigationItem?.id === 'vale-frame' && this.newspaperRead) {
            this.inspectValeFrame(investigationItem)
          } else if (investigationItem?.id === 'bedroom-phone' && this.valeFrameInspected &&
                     this.houseStory?.isPhoneRinging() && !this.bedroomPhoneAnswered) {
            this.answerBedroomPhone()
          } else if (door) {
            toggleDoor(door, this.player.position)
            this.houseAudio.playDoor(door.isOpen)
          }
        }
        if (this.input.consumePressed('KeyH')) {
          this.colliderHelpers.forEach(helper => { helper.visible = !helper.visible })
        }
        if (this.input.consumePressed('KeyL')) {
          this.lightHelpers.forEach(helper => { helper.visible = !helper.visible })
        }
        if (this.input.consumePressed('KeyJ')) this.logNearbyWallColliders()
        this.updateInteractionPrompt(door, investigationItem)
        this.player.update(dt, [...this.colliders, ...getDoorColliders(this.doors)])
        this.houseAudio.update(this.player)
        if (!this.newspaperOpen && !this.houseStoryView?.open) {
          this.houseStory?.update(dt, this.player, this.valeFrameInspected && !this.bedroomPhoneAnswered)
        }
      } else {
        this.player.velocity.set(0, 0, 0)
        this.interactionPrompt?.classList.add('hidden')
      }
    }

    this.houseStory?.updateJumpScare(dt, this.player)
    this.houseAvatar?.update(
      this.loaded && this.input.isLocked ? dt : 0,
      this.player,
      this.colliders.find(collider => collider.type === 'octree')?.world,
    )
    const scareTime = this.houseStory?.jumpScareTime || 0
    if (scareTime > 0) {
      const strength = Math.min(1, scareTime * 4)
      const x = (Math.random() - 0.5) * 48 * strength
      const y = (Math.random() - 0.5) * 38 * strength
      const roll = (Math.random() - 0.5) * 3.5 * strength
      this.renderer.domElement.style.transform = `translate(${x}px, ${y}px) rotate(${roll}deg) scale(1.12)`
      this.renderer.domElement.style.filter = 'contrast(1.3) brightness(1.15)'
    } else {
      this.renderer.domElement.style.transform = ''
      this.renderer.domElement.style.filter = ''
    }

    const renderCamera = this.houseAvatar && !this.newspaperOpen && !this.houseStoryView?.open &&
      !this.evidenceBookOpen && !scareTime ? this.houseAvatar.renderCamera : this.camera
    const avatarVisible = this.houseAvatar?.root.visible
    if (renderCamera === this.camera && this.houseAvatar?.thirdPerson) this.houseAvatar.root.visible = false
    this.renderer.render(this.scene, renderCamera)
    if (this.houseAvatar) this.houseAvatar.root.visible = avatarVisible
    this.startHouseAudioAfterRender()
    this.updateHud()
  }

  startHouseAudioAfterRender() {
    if (!this.loaded || this.currentLevel !== 'house' || !this.input.isLocked ||
        this.houseAudio.enabled || this.houseAudioStartFrame !== null) return

    const loadId = this.levelLoadId
    // Let the browser present the first rendered scene before starting audio.
    this.houseAudioStartFrame = requestAnimationFrame(() => {
      this.houseAudioStartFrame = null
      if (!this.loaded || loadId !== this.levelLoadId || this.currentLevel !== 'house' ||
          !this.input.isLocked || this.houseAudio.enabled) return
      this.houseAudio.setHouseActive(true, this.model)
    })
  }



  async loadLevel(levelName = 'house') {
    if (levelName !== 'house') return false
    if (this.currentLevel === 'house' && this.loaded) return true
    const loadId = ++this.levelLoadId
    const loadStarted = performance.now()
    this.unloadCurrentLevel()
    this.currentLevel = 'house'
    const levelRoot = new THREE.Group()
    this.levelRoot = levelRoot
    this.scene.add(levelRoot)

    try {
      const { colliders, colliderHelpers, lightHelpers, doors, model, animations,
        spawn, spawnYaw, modelSize, investigationItems } = await loadHouse(levelRoot)
      if (loadId !== this.levelLoadId) {
        disposeLevel(levelRoot)
        return false
      }
      this.colliders = colliders || []
      this.colliderHelpers = colliderHelpers || []
      this.lightHelpers = lightHelpers || []
      this.doors = doors || []
      this.model = model
      this.investigationItems = investigationItems || []
      this.inspectedEvidence = new Set()
      this.newspaperRead = false
      this.valeFrameInspected = false
      this.bedroomPhoneAnswered = false

      const avatar = await HouseAvatar.load(levelRoot, this.camera)
      if (loadId !== this.levelLoadId) {
        avatar.dispose()
        disposeLevel(levelRoot)
        return false
      }
      this.houseAvatar = avatar
      this.houseMirror = installBathroomMirror(model, avatar)
      this.houseStoryView = new HouseStoryView(this)
      this.houseStory = new HouseStory({
        model, animations, level: levelRoot, items: this.investigationItems, doors: this.doors,
        camera: this.camera, audio: this.houseAudio,
        onMessage: (text, duration) => this.houseStoryView.message(text, duration),
      })
      this.spawnPoint = spawn.clone()
      this.spawnYaw = spawnYaw ?? 0
      this.player.reset(this.spawnPoint, this.spawnYaw)
      const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z)
      this.camera.far = Math.max(maxDim * 3, 500)
      this.camera.updateProjectionMatrix()
      avatar.resize(this.camera.aspect, this.camera.far)
      const collisionWorld = this.colliders.find(collider => collider.type === 'octree')?.world
      avatar.update(0, this.player, collisionWorld)

      try {
        const compile = this.renderer.compileAsync
          ? (camera) => this.renderer.compileAsync(this.scene, camera)
          : (camera) => this.renderer.compile(this.scene, camera)
        await compile(this.camera)
        avatar.toggleView()
        avatar.update(0, this.player, collisionWorld)
        try {
          await compile(avatar.camera)
        } finally {
          avatar.toggleView()
        }
      } catch (error) {
        console.warn('Shader warmup failed:', error)
      }
      if (loadId !== this.levelLoadId) {
        disposeLevel(levelRoot)
        return false
      }
      this.loaded = true
      window.dispatchEvent(new CustomEvent('levelloaded', { detail: { levelName: 'house' } }))
      console.debug(`[load:house] total: ${(performance.now() - loadStarted).toFixed(0)}ms`)
      return true
    } catch (error) {
      if (loadId !== this.levelLoadId) return false
      console.error('Level load failed:', error)
      this.unloadCurrentLevel()
      this.currentLevel = null
      return false
    }
  }

  unloadCurrentLevel() {
    if (this.houseAudioStartFrame !== null) {
      cancelAnimationFrame(this.houseAudioStartFrame)
      this.houseAudioStartFrame = null
    }
    this.houseStory?.dispose()
    this.houseStoryView?.dispose()
    this.houseMirror?.dispose()
    this.houseAvatar?.dispose()
    this.houseStory = null
    this.houseStoryView = null
    this.houseMirror = null
    this.houseAvatar = null
    this.houseAudio.setHouseActive(false)
    this.hideNewspaperReader()
    this.closeEvidenceBook(true)
    if (this.levelRoot) disposeLevel(this.levelRoot)
    this.levelRoot = null
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.colliders = []
    this.colliderHelpers = []
    this.lightHelpers = []
    this.doors = []
    this.model = null
    this.investigationItems = []
    this.inspectedEvidence = new Set()
    this.newspaperRead = false
    this.valeFrameInspected = false
    this.bedroomPhoneAnswered = false
    this.spawnPoint = null
    this.spawnYaw = 0
    this.loaded = false
    this.input.clear()
    this.interactionPrompt?.classList.add('hidden')
  }

  updateHud() {
    const objective = document.getElementById('hudObjective')
    if (objective) objective.textContent = this.houseStory?.objective() || 'FIND THE NEWSPAPER ON THE PORCH'
    document.getElementById('evidenceBtn')?.classList.toggle('hidden', !this.loaded)
  }

  setInteractionRay() {
    const camera = this.currentLevel === 'house' && this.houseAvatar?.thirdPerson
      ? this.houseAvatar.camera
      : this.camera
    this.raycaster.far = camera === this.camera
      ? DOOR_INTERACTION_RANGE
      : camera.position.distanceTo(this.player.position) + DOOR_INTERACTION_RANGE
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  }

  getLookedAtInvestigationItem() {

    if (!this.input.isLocked || !this.model) {

      return null
    }

    this.setInteractionRay()

    const targets = [this.model, ...(this.houseStory ? [this.houseStory.root] : [])]

    const hits = this.raycaster.intersectObjects(
      targets, true,
    ).filter(hit => isEffectivelyVisible(hit.object))

    for (const hit of hits) {
      if (hit.point.distanceTo(this.player.position) > DOOR_INTERACTION_RANGE) continue

      let object = hit.object

      while (object) {

        const item = this.investigationItems.find(
          (candidate) => candidate.object === object
        )

        if (item) {

          return item
        }

        object = object.parent
      }
      if (hit.object.isMesh && hit.object.material?.transparent !== true) break
    }

    return null
  }


  openNewspaperReader(investigationItem) {

    if (!this.newspaperReader || this.newspaperOpen) {

      return
    }

    this.newspaperOpen = true

    this.inspectedEvidence.add(
      investigationItem.id,
    )

    if (investigationItem.id === 'newspaper') {
      this.newspaperRead = true
    }

    this.setInspectionPanelContent(
      investigationItem,
    )

    this.newspaperPreviewTransform = {
      x: 10,
      y: -14,
      z: -4,
      scale: 1,
    }

    const inspectionGroup = new THREE.Group()
    inspectionGroup.name = 'newspaper-inspection-view'

    const sourceMesh =
      investigationItem.inspectionMesh || (investigationItem.object.isMesh
        ? investigationItem.object
        : investigationItem.object.getObjectByProperty(
            'isMesh',
            true,
          ))

    if (!sourceMesh) {

      this.hideNewspaperReader()
      return
    }

    this.currentInspectionItemId = investigationItem.id

    const inspectAsObject = investigationItem.inspectionMode === 'object'
    const inspectionObject = inspectAsObject
      ? new THREE.Group()
      : new THREE.Mesh(
          sourceMesh.geometry,
          Array.isArray(sourceMesh.material)
            ? sourceMesh.material.map((material) => createInspectionMaterial(material))
            : createInspectionMaterial(sourceMesh.material),
        )

    if (inspectAsObject) {
      investigationItem.object.updateWorldMatrix(true, true)
      investigationItem.object.traverse(child => {
        if (!child.isMesh || !child.visible) return
        const copy = child.clone(false)
        child.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale)
        copy.material = Array.isArray(child.material)
          ? child.material.map(material => createInspectionMaterial(material, true))
          : createInspectionMaterial(child.material, true)
        copy.visible = true
        inspectionObject.add(copy)
      })
    } else {
      inspectionObject.position.set(0, 0, 0)
      // The porch plane is horizontal in the GLB, so turn it toward the camera.
      inspectionObject.rotation.set(investigationItem.story ? 0 : Math.PI / 2, 0, 0)
      inspectionObject.scale.set(1, 1, 1)
    }
    inspectionObject.updateMatrixWorld(true)

    inspectionObject.visible = true
    inspectionObject.frustumCulled = false

    const inspectionMaterials = []
    inspectionObject.traverse(child => {
      if (child.isMesh) inspectionMaterials.push(...(Array.isArray(child.material) ? child.material : [child.material]))
    })

    for (const material of inspectionMaterials) {

      if (!material?.map) continue

      material.map.anisotropy =
        this.renderer.capabilities.getMaxAnisotropy()

      material.map.magFilter = THREE.LinearFilter
      material.map.minFilter = THREE.LinearMipmapLinearFilter
      material.map.needsUpdate = true
    }

    const sourceMaterial =
      Array.isArray(sourceMesh.material)
        ? sourceMesh.material[0]
        : sourceMesh.material

    if (!inspectAsObject && this.newspaperPreview && sourceMaterial?.map?.image) {

      const image = sourceMaterial.map.image
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height

      const context = canvas.getContext('2d')

      if (context) {

        context.drawImage(image, 0, 0)
        const newspaperImageUrl = canvas.toDataURL('image/png')

        this.newspaperPreview.src = newspaperImageUrl
        this.newspaperPreview.classList.remove('hidden')

        this.updateNewspaperPreviewTransform()
      }
    }

    const bounds = new THREE.Box3().setFromObject(
      inspectionObject,
    )
    const centre = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const largestDimension = Math.max(
      size.x,
      size.y,
      size.z,
      0.001,
    )

    inspectionObject.position.sub(centre)
    if (!inspectAsObject) inspectionObject.scale.setScalar(1.35 / largestDimension)
    inspectionGroup.add(inspectionObject)
    inspectionGroup.position.set(inspectAsObject ? 0.65 : 0, -0.1, -2.15)
    inspectionGroup.rotation.set(0.12, -0.16, -0.08)
    inspectionGroup.scale.setScalar(inspectAsObject ? 1.35 / largestDimension : 1)
    this.camera.add(inspectionGroup)
    this.newspaperInspectionObject = inspectionGroup

    this.newspaperReader.classList.remove('hidden')

    this.newspaperReader.classList.add('inspect-mode')
    this.newspaperReader.classList.toggle('object-mode', inspectAsObject)

    this.input.release()
  }

  setInspectionPanelContent(investigationItem) {

    const foundAt = document.getElementById(
      'inspectionFoundAt',
    )
    const title = document.getElementById(
      'newspaperInspectTitle',
    )
    const storyNote = document.getElementById(
      'inspectionStoryNote',
    )
    const riteNote = document.getElementById(
      'inspectionRiteNote',
    )

    if (foundAt) {
      foundAt.textContent =
        'FOUND: ' +
        (investigationItem.foundAt || 'Vale Manor')
    }

    if (title) {
      title.textContent =
        investigationItem.title || 'Evidence'
    }

    if (storyNote) {
      storyNote.textContent =
        investigationItem.storyNote ||
        'Inspect the evidence carefully.'
    }

    if (riteNote) {
      riteNote.textContent =
        investigationItem.riteNote
          ? 'EXORCISM NOTE — ' +
            investigationItem.riteNote
          : ''
    }

    if (this.newspaperPreview) {
      this.newspaperPreview.alt =
        investigationItem.title || 'Inspectable evidence'
    }
  }


  inspectValeFrame(investigationItem) {

    this.valeFrameInspected = true

    this.openNewspaperReader(investigationItem)
  }


  answerBedroomPhone() {

    this.bedroomPhoneAnswered = true

    // A short ghost vocal accompanies Evelyn's captioned telephone message.
    this.houseStory?.answerPhone()
  }


  closeNewspaperReader() {

    if (!this.newspaperOpen) {

      return
    }

    const inspectionId = this.currentInspectionItemId
    this.hideNewspaperReader()
    this.currentInspectionItemId = null

    this.input.lock()

    if (inspectionId === 'vale-frame' && !this.bedroomPhoneAnswered &&
        this.houseStory?.phoneRingStartsAt === Infinity) this.houseStory.schedulePhoneRing(3)
    this.houseStory?.finishInspection(inspectionId)
  }


  startNewspaperDrag(event) {

    if (!this.newspaperOpen || event.target.closest('button')) {

      return
    }

    this.newspaperDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }

    this.newspaperReader?.setPointerCapture(event.pointerId)
  }


  dragNewspaper(event) {

    if (
      !this.newspaperDrag ||
      !this.newspaperInspectionObject ||
      event.pointerId !== this.newspaperDrag.pointerId
    ) {

      return
    }

    const dx = event.clientX - this.newspaperDrag.x
    const dy = event.clientY - this.newspaperDrag.y

    this.newspaperDrag.x = event.clientX
    this.newspaperDrag.y = event.clientY

    this.newspaperInspectionObject.rotation.y += dx * 0.01
    this.newspaperInspectionObject.rotation.x += dy * 0.01

    this.newspaperPreviewTransform.y += dx * 0.5
    this.newspaperPreviewTransform.x += dy * 0.5
    this.updateNewspaperPreviewTransform()
  }


  stopNewspaperDrag() {

    this.newspaperDrag = null
  }


  zoomNewspaper(event) {

    if (!this.newspaperOpen || !this.newspaperInspectionObject) {

      return
    }

    event.preventDefault()

    const zoom = event.deltaY > 0 ? 0.9 : 1.1
    const nextScale = THREE.MathUtils.clamp(
      this.newspaperInspectionObject.scale.x * zoom,
      0.55,
      3.2,
    )

    this.newspaperInspectionObject.scale.setScalar(nextScale)

    this.newspaperPreviewTransform.scale = THREE.MathUtils.clamp(
      this.newspaperPreviewTransform.scale * zoom,
      0.55,
      3.2,
    )
    this.updateNewspaperPreviewTransform()
  }


  updateNewspaperPreviewTransform() {

    if (!this.newspaperPreview) return

    const transform = this.newspaperPreviewTransform

    this.newspaperPreview.style.transform =
      `translate(-50%, -50%) perspective(900px) ` +
      `rotateX(${transform.x}deg) ` +
      `rotateY(${transform.y}deg) ` +
      `rotateZ(${transform.z}deg) ` +
      `scale(${transform.scale})`
  }


  openEvidenceBook() {

    if (this.evidenceBookOpen || this.newspaperOpen || this.houseStoryView?.outcome) {

      return
    }

    const evidenceBook =
      document.getElementById('evidenceBook')

    if (!evidenceBook) {

      return
    }

    this.evidenceBookOpen = true
    this.houseStoryView?.updateJournal()

    evidenceBook.classList.remove('hidden')
    evidenceBook.style.zIndex = this.houseStoryView?.open ? '111' : ''

    this.input.release()
    document.getElementById('closeEvidenceNotepadBtn')?.focus()
  }


  closeEvidenceBook(fromLevelUnload = false) {

    const evidenceBook =
      document.getElementById('evidenceBook')

    this.evidenceBookOpen = false

    evidenceBook?.classList.add('hidden')
    if (evidenceBook) evidenceBook.style.zIndex = ''

    if (!fromLevelUnload && this.loaded && !this.houseStoryView?.open) {

      this.input.lock()
    } else if (!fromLevelUnload && this.houseStoryView?.open) {
      this.houseStoryView.dialog.querySelector('button')?.focus()
    }
  }


  hideNewspaperReader() {

    this.newspaperOpen = false

    this.newspaperReader?.classList.add('hidden')
    this.newspaperReader?.classList.remove('object-mode')
    this.newspaperPreview?.classList.add('hidden')
    this.newspaperPreview?.removeAttribute('src')

    if (this.newspaperInspectionObject) {

      this.newspaperInspectionObject.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material?.dispose())
      })
      this.camera.remove(this.newspaperInspectionObject)
      this.newspaperInspectionObject = null
    }
  }

  getLookedAtDoor() {

    if (
      !this.input.isLocked ||
      !this.model
    ) {

      return null
    }


    this.setInteractionRay()


    const hits =
      this.raycaster.intersectObject(
        this.model,
        true
      )


    // Check every object hit by the ray,
    // not only the first one.
    for (const hit of hits) {
      if (hit.point.distanceTo(this.player.position) > DOOR_INTERACTION_RANGE) continue

      let object =
        hit.object


      while (object) {

        const door =
          this.doors.find(
            (door) =>
              door.object === object
          )


        if (door) {

          return door

        }


        object =
          object.parent
      }

    }


    return null
  }

  updateInteractionPrompt(door, investigationItem = null) {

    if (!this.interactionPrompt) {

      return

    }


    if (investigationItem) {

      this.interactionPrompt.textContent =
        this.getInvestigationPrompt(
          investigationItem,
        )

      this.interactionPrompt
        .classList
        .remove('hidden')

      return
    }


    if (!door) {

      this.interactionPrompt
        .classList
        .add('hidden')

      return

    }


    this.interactionPrompt.textContent =
      door.isOpen
        ? 'Press E to close'
        : 'Press E to open'


    this.interactionPrompt
      .classList
      .remove('hidden')
  }

  getInvestigationPrompt(investigationItem) {
    if (investigationItem.story) return this.houseStory.prompt(investigationItem)

    switch (investigationItem.id) {
      case 'newspaper':
        return this.newspaperRead
          ? 'Press E to reread the newspaper'
          : investigationItem.prompt

      case 'vale-frame':
        if (!this.newspaperRead) {
          return 'Log the porch newspaper first'
        }

        return this.valeFrameInspected
          ? 'Press E to inspect the scratched family portrait again'
          : investigationItem.prompt

      case 'bedroom-phone':
        if (this.bedroomPhoneAnswered) {
          return 'Evelyn warned you about the voice that imitates Margaret.'
        }
        if (!this.valeFrameInspected || !this.houseStory?.isPhoneRinging()) {
          return 'The telephone is silent'
        }
        return 'Press E to answer the ringing telephone'

      default:
        return investigationItem.prompt
    }
  }



  logNearbyWallColliders() {

    const position =
      this.player.position


    const nearby =
      this.colliders

        .filter(
          (collider) =>
            collider.type === 'wall'
        )

        .filter(
          (collider) => {

            const nearestX =
              THREE.MathUtils.clamp(
                position.x,
                collider.minX,
                collider.maxX
              )


            const nearestZ =
              THREE.MathUtils.clamp(
                position.z,
                collider.minZ,
                collider.maxZ
              )


            return (
              Math.hypot(
                position.x - nearestX,
                position.z - nearestZ
              ) <= 1.5
            )
          }
        )


    console.log(
      'Nearby wall colliders:',
      nearby
    )
  }



  // ============================================
  // WINDOW RESIZE
  // ============================================

  onResize() {

    this.camera.aspect =
      window.innerWidth /
      window.innerHeight


    this.camera.updateProjectionMatrix()
    this.houseAvatar?.resize(this.camera.aspect, this.camera.far)


    this.renderer.setSize(
      window.innerWidth,
      window.innerHeight
    )
  }
}

function isEffectivelyVisible(object) {
  while (object) {
    if (!object.visible) return false
    object = object.parent
  }
  return true
}

function createInspectionMaterial(source, solid = false) {

  return new THREE.MeshBasicMaterial({
    map: source?.map || null,
    color: source?.color || 0xffffff,
    transparent: source?.transparent || false,
    opacity: source?.opacity ?? 1,
    alphaTest: source?.alphaTest || 0,
    side: THREE.DoubleSide,
    depthTest: solid,
    depthWrite: solid,
  })
}

function disposeLevel(levelRoot) {

  if (levelRoot.parent) {

    levelRoot.parent.remove(
      levelRoot
    )
  }


  const geometries =
    new Set()


  const materials =
    new Set()


  levelRoot.traverse(
    (object) => {

      if (object.userData.sharedAsset) return

      if (object.geometry) {

        geometries.add(
          object.geometry
        )
      }


      if (
        Array.isArray(
          object.material
        )
      ) {

        object.material.forEach(
          (material) =>
            materials.add(
              material
            )
        )
      }

      else if (
        object.material
      ) {

        materials.add(
          object.material
        )
      }
    }
  )


  geometries.forEach(
    (geometry) => {

      geometry.dispose()
    }
  )


  materials.forEach(
    (material) => {

      Object.values(
        material
      ).forEach(
        (value) => {

          if (
            value?.isTexture
          ) {

            value.dispose()
          }
        }
      )


      material.dispose()
    }
  )


  levelRoot.clear()
}
