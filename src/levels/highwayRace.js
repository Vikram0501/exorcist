import * as THREE from 'three'
import { removeGhostNameUI }
  from './highway.js'


export class HighwayRaceController {

  constructor(
    carController,
    ghostCar,
    finishZ,
    ghostName,
    ghostNameUI,
    scene
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


    // ============================================
    // BRAKE CUT SEQUENCE
    // ============================================

    this.brakeCutTriggered = false

    this.brakeCutPhase = 'none'

    this.brakeCutTimer = 0

    this.brakeCutTriggerZ = -192

    this.brakeCutWarningZ = -172

    this.brakeCutGhostSavedPos =
      new THREE.Vector3()


    // Make sure car cannot move initially
    this.carController
      .setDrivingEnabled(false)


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

        const playerCar =
            this.carController.car

        const playerZ =
            playerCar.position.z


        // ============================================
        // TRIGGER WARNING
        // ============================================

        if (
            !this.brakeCutTriggered &&
            playerZ <= this.brakeCutWarningZ
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


                // Save ghost position and
                // teleport near player
                this.brakeCutGhostSavedPos
                    .copy(
                        this.ghostCar.position
                    )

                this.ghostCar.position.set(
                    playerCar.position.x,
                    playerCar.position.y,
                    playerCar.position.z + 3
                )

                this.ghostCar.visible = true

            }

        }


        // ============================================
        // PHASE: CUT
        // ============================================

        if (this.brakeCutPhase === 'cut') {

            this.brakeCutTimer += dt


            // Ghost drives through the player
            this.ghostCar.position.z -=
                18 * dt


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


                // Restore ghost ahead
                this.ghostCar.position.set(
                    this.brakeCutGhostSavedPos.x,
                    this.brakeCutGhostSavedPos.y,
                    this.brakeCutGhostSavedPos.z -
                        25
                )

                this.ghostCar.visible = true


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

        // Skip normal ghost movement
        // during the cut phase
        if (
            this.brakeCutPhase === 'cut'
        ) {
            return
        }


        // ============================================
        // PLAYER / GHOST POSITIONS
        // ============================================

        const playerCar =
            this.carController.car


        const playerZ =
            playerCar.position.z


        const ghostZ =
            this.ghostCar.position.z



        // ============================================
        // HOW FAR AHEAD IS THE GHOST?
        // ============================================

        // Example:
        //
        // player = -20
        // ghost  = -30
        //
        // lead = 10
        //
        // So the ghost is 10 units ahead.

        const ghostLead =
            playerZ - ghostZ



        // ============================================
        // CALCULATE DESIRED SPEED
        // ============================================

        // We want the ghost to stay roughly
        // ghostTargetLead units ahead.

        const difference =
            this.ghostTargetLead -
            ghostLead


        let desiredSpeed =
            this.ghostCruiseSpeed +
            difference * 0.8



        // Do not let desired speed become ridiculous.

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
        // MOVE GHOST
        // ============================================

        this.ghostCar.position.z -=
            this.ghostSpeed * dt

        }

    checkFinish() {

        const playerCar =
            this.carController.car


        const playerFinished =
            playerCar.position.z <=
            this.finishZ


        const ghostFinished =
            this.ghostCar.position.z <=
            this.finishZ



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

            // Smaller Z means farther down the road.

            if (
            playerCar.position.z <
            this.ghostCar.position.z
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



        // ============================================
        // SHOW RESULT
        // ============================================

        this.countdownElement.style.display =
            'block'


        this.countdownElement.style.fontSize =
            '60px'


        if (this.ghostNameUI) {

          this.ghostNameUI.style.display =
            'none'

        }


        // Hide brake-cut UI
        this.brakeCutWarningEl.style.display =
            'none'

        this.brakeCutAftermathEl.style.display =
            'none'


        if (
            winner === 'player'
        ) {

            this.countdownElement.textContent =
            'YOU RACED ' +
            this.ghostName

        }

        else {

            this.countdownElement.textContent =
            this.ghostName +
            ' WON'

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