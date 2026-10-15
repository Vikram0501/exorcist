// Public assets live beside index.html in both the dev server and the
// department's group subdirectory. Node tests have no document URL.
export function assetUrl(path) {
  const relativePath = path.replace(/^\/+/, '')
  if (typeof document === 'undefined' || !document.baseURI) return `/${relativePath}`
  return new URL(relativePath, document.baseURI).href
}
