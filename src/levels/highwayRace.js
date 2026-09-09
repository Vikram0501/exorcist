import * as THREE from 'three'
import { removeGhostNameUI }
  from './highway.js'
import { checkPlayerObstacleCollision }
  from './highwayObstacles.js'


export class HighwayRaceController {

  constructor(
    carController,
    ghostCar,
    finishZ,
    ghostName,
    ghostNameUI,
    scene,
    roadPath,
    arcLengths,
    totalRoadLength
  ) {

    this.carController =
      carController

    this.ghostCar =
      ghostCar

    this.finishZ =
        finishZ

    this.ghostName =
      ghostName

    this.ghostNameUI =
      ghostNameUI

    this.scene =
      scene

    this.roadPath = roadPath
    this.arcLengths = arcLengths
    this.totalRoadLength = totalRoadLength

    this.obstacles = null

    this.raceFinished = false

    this.winner = null

    this.time = 0

    this.raceStarted = false

    this.finishedCountdown = false

    this.ghostSpeed = 5

    // Normal speed the ghost tries to drive at
    this.ghostCruiseSpeed = 27

    // Slowest it is allowed to drive
    this.ghostMinSpeed = 18

    // Fastest it can drive when catching up
    this.ghostMaxSpeed = 38

    // How quickly it speeds up
    this.ghostAcceleration = 8

    // How quickly it slows down
    this.ghostBraking = 10

    // We want the ghost to usually stay
    // about 8 units ahead of the player
    this.ghostTargetLead = 8

    // Ghost path progress
    this.ghostPathProgress = 0

    // Finish distance along path
    this.finishDistance = totalRoadLength - 60


    // ============================================
    // BRAKE CUT SEQUENCE
    // ============================================

    this.brakeCutTriggered = false

    this.brakeCutPhase = 'none'

    this.brakeCutTimer = 0

    this.brakeCutTriggerProgress = 250

    this.brakeCutWarningProgress = 230

    this.brakeCutGhostSavedPos =
      new THREE.Vector3()


    // Make sure car cannot move initially
    this.carController
      .setDrivingEnabled(false)


    this.onFinish = null

    this.frozen = false


    // ============================================
    // COUNTDOWN DISPLAY
    // ============================================

    this.countdownElement =
      document.createElement('div')


    this.countdownElement.style.position =
      'fixed'

    this.countdownElement.style.left =
      '50%'

    this.countdownElement.style.top =
      '35%'

    this.countdownElement.style.transform =
      'translate(-50%, -50%)'

    this.countdownElement.style.zIndex =
      '100'

    this.countdownElement.style.fontSize =
      '100px'

    this.countdownElement.style.fontWeight =
      'bold'

    this.countdownElement.style.color =
      'white'

    this.countdownElement.style.textShadow =
      '0 0 20px black'

    this.countdownElement.style.pointerEvents =
      'none'

    this.countdownElement.textContent =
      '3'


    document.body.appendChild(
      this.countdownElement
    )


    // ============================================
    // BRAKE CUT WARNING
    // ============================================

    this.brakeCutWarningEl =
      document.createElement('div')

    this.brakeCutWarningEl.style.position =
      'fixed'

    this.brakeCutWarningEl.style.left =
      '50%'

    this.brakeCutWarningEl.style.bottom =
      '80px'

    this.brakeCutWarningEl.style.transform =
      'translateX(-50%)'

    this.brakeCutWarningEl.style.zIndex =
      '100'

    this.brakeCutWarningEl.style.fontSize =
      '28px'

    this.brakeCutWarningEl.style.fontWeight =
      'bold'

    this.brakeCutWarningEl.style.color =
      '#ff3333'

    this.brakeCutWarningEl.style.textShadow =
      '0 0 12px #660000'

    this.brakeCutWarningEl.style.pointerEvents =
      'none'

    this.brakeCutWarningEl.style.fontFamily =
      'monospace'

    this.brakeCutWarningEl.style.letterSpacing =
      '2px'

    this.brakeCutWarningEl.style.display =
      'none'

    this.brakeCutWarningEl.textContent =
      'BRAKE FAILURE IMMINENT'


    document.body.appendChild(
      this.brakeCutWarningEl
    )


    // ============================================
    // BRAKE CUT AFTERMATH
    // ============================================

    this.brakeCutAftermathEl =
      document.createElement('div')

    this.brakeCutAftermathEl.style.position =
      'fixed'

    this.brakeCutAftermathEl.style.left =
      '50%'

    this.brakeCutAftermathEl.style.bottom =
      '80px'

    this.brakeCutAftermathEl.style.transform =
      'translateX(-50%)'

    this.brakeCutAftermathEl.style.zIndex =
      '100'

    this.brakeCutAftermathEl.style.fontSize =
      '28px'

    this.brakeCutAftermathEl.style.fontWeight =
      'bold'

    this.brakeCutAftermathEl.style.color =
      '#ff3333'

    this.brakeCutAftermathEl.style.textShadow =
      '0 0 12px #660000'

    this.brakeCutAftermathEl.style.pointerEvents =
      'none'

    this.brakeCutAftermathEl.style.fontFamily =
      'monospace'

    this.brakeCutAftermathEl.style.letterSpacing =
      '2px'

    this.brakeCutAftermathEl.style.display =
      'none'

    this.brakeCutAftermathEl.textContent =
      'BRAKES FAILED - DON\'T STOP NOW'


    document.body.appendChild(
      this.brakeCutAftermathEl
    )

  }



  // ============================================
  // UPDATE
  // ============================================

    update(dt) {

    // ============================================
    // COUNTDOWN
    // ============================================

    if (!this.finishedCountdown) {

        this.time += dt


        // 3
        if (this.time < 1) {

        this.countdownElement.textContent =
            '3'

        }


        // 2
        else if (this.time < 2) {

        this.countdownElement.textContent =
            '2'

        }


        // 1
        else if (this.time < 3) {

        this.countdownElement.textContent =
            '1'

        }


        // GO
        else if (this.time < 4) {

        this.countdownElement.textContent =
            'GO!'


        if (!this.raceStarted) {

            this.raceStarted = true


            // Player can now drive

            this.carController
            .setDrivingEnabled(true)

        }

        }


        // Hide countdown
        else {

        this.finishedCountdown = true

        this.countdownElement.style.display =
            'none'

        }

    }



    // ============================================
    // BRAKE CUT PHASE
    // ============================================

    if (
        this.raceStarted &&
        !this.raceFinished
    ) {

        this.updateBrakeCut(dt)

    }



    // ============================================
    // GHOST RACING
    // ============================================

    if (
        this.raceStarted &&
        !this.raceFinished
        ) {

        this.updateGhost(dt)

        this.checkFinish()

        }

    }

    updateBrakeCut(dt) {

        const playerProgress =
            this.carController.pathProgress


        // ============================================
        // TRIGGER WARNING
        // ============================================

        if (
            !this.brakeCutTriggered &&
            playerProgress >= this.brakeCutWarningProgress
        ) {

            this.brakeCutTriggered = true

            this.brakeCutPhase = 'warning'

            this.brakeCutTimer = 0

            this.brakeCutWarningEl.style.display =
                'block'

        }


        // ============================================
        // PHASE: WARNING
        // ============================================

        if (this.brakeCutPhase === 'warning') {

            this.brakeCutTimer += dt


            // Flicker the warning text
            const flicker =
                Math.sin(
                    this.brakeCutTimer * 12
                ) > 0

            this.brakeCutWarningEl.style.opacity =
                flicker ? '1' : '0.3'


            if (
                this.brakeCutTimer >= 1.5
            ) {

                this.brakeCutPhase = 'cut'

                this.brakeCutTimer = 0

                this.brakeCutWarningEl.style.display =
                    'none'


                // Disable brakes
                this.carController
                    .brakesWorking = false

            }

        }


        // ============================================
        // PHASE: CUT
        // ============================================

        if (this.brakeCutPhase === 'cut') {

            this.brakeCutTimer += dt


            // Brief screen flicker
            if (
                this.brakeCutTimer < 0.5
            ) {

                const flickerOn =
                    Math.sin(
                        this.brakeCutTimer * 30
                    ) > 0

                this.scene.background =
                    new THREE.Color(
                        flickerOn
                            ? 0x2a0a0a
                            : 0x1a1a2e
                    )

            } else {

                this.scene.background =
                    new THREE.Color(0x1a1a2e)

            }


            if (
                this.brakeCutTimer >= 1.0
            ) {

                this.brakeCutPhase =
                    'aftermath'

                this.brakeCutTimer = 0


                // Show aftermath message
                this.brakeCutAftermathEl
                    .style.display = 'block'

            }

        }


        // ============================================
        // PHASE: AFTERMATH
        // ============================================

        if (
            this.brakeCutPhase === 'aftermath'
        ) {

            this.brakeCutTimer += dt


            if (
                this.brakeCutTimer >= 4.0
            ) {

                this.brakeCutPhase = 'done'

                this.brakeCutAftermathEl
                    .style.display = 'none'

            }

        }

    }

    updateGhost(dt) {


        // ============================================
        // PLAYER / GHOST PATH POSITIONS
        // ============================================

        const playerProgress =
            this.carController.pathProgress


        const ghostProgress =
            this.ghostPathProgress


        // ============================================
        // HOW FAR AHEAD IS THE GHOST?
        // ============================================

        const ghostLead =
            playerProgress - ghostProgress



        // ============================================
        // CALCULATE DESIRED SPEED
        // ============================================

        const difference =
            this.ghostTargetLead -
            ghostLead


        let desiredSpeed =
            this.ghostCruiseSpeed +
            difference * 0.8


        desiredSpeed =
            Math.max(
            this.ghostMinSpeed,
            Math.min(
                desiredSpeed,
                this.ghostMaxSpeed
            )
            )



        // ============================================
        // SPEED UP OR SLOW DOWN
        // ============================================

        if (
            this.ghostSpeed <
            desiredSpeed
        ) {

            this.ghostSpeed +=
            this.ghostAcceleration * dt

        }

        else if (
            this.ghostSpeed >
            desiredSpeed
        ) {

            this.ghostSpeed -=
            this.ghostBraking * dt

        }



        // ============================================
        // KEEP SPEED INSIDE LIMITS
        // ============================================

        this.ghostSpeed =
            Math.max(
            0,
            Math.min(
                this.ghostSpeed,
                this.ghostMaxSpeed
            )
            )



        // ============================================
        // MOVE GHOST ALONG PATH
        // ============================================

        const oldGhostProgress =
            this.ghostPathProgress

        this.ghostPathProgress +=
            this.ghostSpeed * dt


        // Check obstacle collision for ghost
        // Ghost drives at lateral offset -2
        if (
            this.obstacles &&
            this.obstacles.length > 0
        ) {
            const ghostHit =
                checkPlayerObstacleCollision(
                    this.obstacles,
                    oldGhostProgress,
                    this.ghostPathProgress,
                    -2
                )

            if (ghostHit) {
                this.ghostPathProgress =
                    ghostHit.progress - 2.5
                this.ghostSpeed =
                    Math.min(
                        this.ghostSpeed,
                        5
                    )
            }
        }


        // Update ghost world position

        if (
            this.roadPath &&
            this.arcLengths
        ) {

            const totalLength =
                this.arcLengths[
                    this.arcLengths.length - 1
                ]

            const clamped =
                Math.min(
                    this.ghostPathProgress,
                    totalLength
                )

            this.ghostPathProgress = clamped

            const sample =
                this.getGhostSample(clamped)

            const perpX =
                -Math.cos(sample.angle)
            const perpZ =
                Math.sin(sample.angle)

            this.ghostCar.position.set(
                sample.position.x +
                    perpX * -2,
                0.2,
                sample.position.z +
                    perpZ * -2
            )

            this.ghostCar.rotation.y =
                sample.angle

        }

        }


    getGhostSample(distance) {

        const points = this.roadPath
        const arcLengths = this.arcLengths
        const totalLength =
            arcLengths[arcLengths.length - 1]

        if (distance <= 0) {
            return {
                position: points[0].clone(),
                angle: 0,
            }
        }

        if (distance >= totalLength) {
            const last = points.length - 1
            return {
                position:
                    points[last].clone(),
                angle: 0,
            }
        }

        let segIndex = 0
        for (
            let i = 0;
            i < arcLengths.length - 1;
            i++
        ) {
            if (
                distance >= arcLengths[i] &&
                distance < arcLengths[i + 1]
            ) {
                segIndex = i
                break
            }
        }

        const segLength =
            arcLengths[segIndex + 1] -
            arcLengths[segIndex]
        const t =
            segLength > 0
                ? (distance -
                    arcLengths[segIndex]) /
                    segLength
                : 0

        const p0 = points[segIndex]
        const p1 = points[segIndex + 1]

        const position =
            new THREE.Vector3(
                p0.x + (p1.x - p0.x) * t,
                0,
                p0.z + (p1.z - p0.z) * t
            )

        const dx = p1.x - p0.x
        const dz = p1.z - p0.z
        const len = Math.sqrt(
            dx * dx + dz * dz
        )

        const angle =
            len > 0.001
                ? Math.atan2(dx, dz)
                : 0

        return { position, angle }

    }

    checkFinish() {

        const playerProgress =
            this.carController.pathProgress


        const playerFinished =
            playerProgress >=
            this.finishDistance


        const ghostFinished =
            this.ghostPathProgress >=
            this.finishDistance



        // Neither has finished yet

        if (
            !playerFinished &&
            !ghostFinished
        ) {

            return

        }



        // ============================================
        // BOTH CROSS ON SAME FRAME
        // ============================================

        if (
            playerFinished &&
            ghostFinished
        ) {

            if (
            playerProgress >
            this.ghostPathProgress
            ) {

            this.finishRace(
                'player'
            )

            }

            else {

            this.finishRace(
                'ghost'
            )

            }


            return

        }



        // ============================================
        // PLAYER FINISHED
        // ============================================

        if (playerFinished) {

            this.finishRace(
            'player'
            )

            return

        }



        // ============================================
        // GHOST FINISHED
        // ============================================

        if (ghostFinished) {

            this.finishRace(
            'ghost'
            )

        }

    }
    
    finishRace(winner) {

        if (this.raceFinished) {

            return

        }


        this.raceFinished = true

        this.winner = winner



        // Stop player car

        this.carController
            .setDrivingEnabled(false)



        // Stop ghost

        this.ghostSpeed = 0



        // Hide brake-cut UI
        this.brakeCutWarningEl.style.display =
            'none'

        this.brakeCutAftermathEl.style.display =
            'none'


        // Hide ghost name UI on ghost win
        if (
            winner === 'ghost' &&
            this.ghostNameUI
        ) {

          this.ghostNameUI.style.display =
            'none'

        }


        // Notify game.js
        if (this.onFinish) {

            this.onFinish(
                winner,
                this.ghostName
            )

        }

        }



  // ============================================
  // CLEANUP
  // ============================================

  dispose() {

    if (this.countdownElement) {

      this.countdownElement.remove()

    }

    if (this.brakeCutWarningEl) {

      this.brakeCutWarningEl.remove()

    }

    if (this.brakeCutAftermathEl) {

      this.brakeCutAftermathEl.remove()

    }

    removeGhostNameUI(
      this.ghostNameUI
    )

  }

}