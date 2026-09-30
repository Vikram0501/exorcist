import * as THREE from 'three'

// Level 3 apocalyptic sky. The source is a 2:1 panorama, so it maps
// directly as an equirectangular scene background: no geometry, no extra
// draw calls, infinite distance, and it follows the camera rotation.
export const RED_SKY_URL =
  '/levels/house/textures/red_sky.png'

// Kept below 1 so the storm stays sombre instead of glaring.
export const RED_SKY_INTENSITY = 0.6

// Turns the panorama's brightest cloud bank toward the driving direction.
// Verify in browser against the chase camera.
export const RED_SKY_ROTATION_Y = Math.PI

// Used when the texture cannot load (including headless test runs): a dark
// crimson that keeps the Level 3 mood without any asset.
export const RED_SKY_FALLBACK_COLOR = 0x1c0708

// The shared-scene default the rest of the game expects.
export const DEFAULT_SCENE_BACKGROUND = 0x1a1a2e


// Dim red image-based lighting so full-metal materials (scientist, barbed
// wire, car bodywork) reflect the apocalypse instead of rendering black.
// Kept low: the sky stays dominant, metals just stop crushing.
export const RED_SKY_ENV_INTENSITY = 0.4


export async function loadHighwayAtmosphere(scene, renderer = null) {
  try {

    const texture =
      await new THREE.TextureLoader().loadAsync(RED_SKY_URL)

    texture.mapping =
      THREE.EquirectangularReflectionMapping
    texture.colorSpace = THREE.SRGBColorSpace

    scene.background = texture
    scene.backgroundIntensity = RED_SKY_INTENSITY
    scene.backgroundRotation.y = RED_SKY_ROTATION_Y

    const envHandle = buildSkyEnvironment(scene, renderer)

    return {
      texture,
      envHandle,
      fallback: false,
    }

  } catch (error) {

    console.warn(
      'Failed to load red_sky.png, using fallback gloom:',
      error
    )

    scene.background = new THREE.Color(
      RED_SKY_FALLBACK_COLOR
    )
    scene.backgroundIntensity = 1

    return {
      texture: null,
      envHandle: null,
      fallback: true,
    }

  }
}


// PMREM needs a real WebGL renderer; headless callers simply get no IBL.
function buildSkyEnvironment(scene, renderer) {
  if (!renderer) return null

  try {

    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()

    const source = scene.background

    if (!source?.isTexture) {
      pmrem.dispose()
      return null
    }

    const envRT = pmrem.fromEquirectangular(source)
    scene.environment = envRT.texture

    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = RED_SKY_ENV_INTENSITY
    }

    pmrem.dispose()

    return { envRT }

  } catch (error) {

    console.warn(
      'Skipping red-sky image lighting:',
      error
    )

    return null

  }
}


function disposeSkyEnvironment(scene, envHandle) {
  if (envHandle?.envRT) {
    if (scene.environment === envHandle.envRT.texture) {
      scene.environment = null
    }
    envHandle.envRT.dispose()
  } else if (scene.environment?.isTexture) {
    scene.environment = null
  }

  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = 1
  }
}


export function disposeHighwayAtmosphere(scene, handle) {
  if (
    handle &&
    handle.texture &&
    scene.background === handle.texture
  ) {
    scene.background = new THREE.Color(
      DEFAULT_SCENE_BACKGROUND
    )
    handle.texture.dispose()
  } else if (scene.background?.isTexture) {
    scene.background.dispose()
    scene.background = new THREE.Color(
      DEFAULT_SCENE_BACKGROUND
    )
  } else if (scene.background?.isColor) {
    scene.background.setHex(DEFAULT_SCENE_BACKGROUND)
  } else {
    scene.background = new THREE.Color(
      DEFAULT_SCENE_BACKGROUND
    )
  }

  disposeSkyEnvironment(scene, handle?.envHandle)

  scene.backgroundIntensity = 1
  scene.backgroundRotation.set(0, 0, 0)
}
