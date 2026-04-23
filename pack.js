import * as fs from 'node:fs'
import archiver from 'archiver'

const output = fs.createWriteStream('plugin.zip')
const archive = archiver('zip', { zlib: { level: 9 } })

archive.on('error', (error) => {
  throw error
})

archive.pipe(output)
archive.directory('dist', false)
archive.finalize()
