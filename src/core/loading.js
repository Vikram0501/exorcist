import * as THREE from 'three'

// Shared LoadingManager: every level asset loader passes this in, so the UI
// can show real download progress instead of an endless "LOADING..." label.
export const loadingManager = new THREE.LoadingManager()

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  window.dispatchEvent(
    new CustomEvent('assetprogress', {
      detail: { url, itemsLoaded, itemsTotal },
    }),
  )
}
