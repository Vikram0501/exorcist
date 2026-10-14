import { createServer } from 'vite'

const hostFlag = process.argv.indexOf('--host')
const host = hostFlag >= 0 ? process.argv[hostFlag + 1] || '127.0.0.1' : '127.0.0.1'

const server = await createServer({
  configFile: false,
  server: { host },
  // The dependency scanner cannot traverse parent directories in this
  // Windows workspace. Browser-native modules work without prebundling.
  optimizeDeps: { noDiscovery: true, include: [] },
})

await server.listen()
server.printUrls()
