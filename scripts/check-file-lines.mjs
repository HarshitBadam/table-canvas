import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const LINE_LIMIT = 400
const root = process.cwd()
const codeExtensions = new Set(['.css', '.cjs', '.js', '.jsx', '.json', '.mjs', '.sh', '.ts', '.tsx'])
const documentationExtensions = new Set(['.md', '.yaml', '.yml'])
const ignoredDirectories = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])
const ignoredFiles = new Set(['npm-shrinkwrap.json', 'package-lock.json'])

function isCheckedFile(fileName, extensions) {
  return !ignoredFiles.has(fileName)
    && [...extensions].some((extension) => fileName.endsWith(extension))
}

function countPhysicalLines(content) {
  if (content.length === 0) return 0

  const lineBreaks = content.match(/\r\n|\r|\n/g)?.length ?? 0
  return lineBreaks + (/\r\n|\r|\n$/.test(content) ? 0 : 1)
}

async function collectFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await collectFiles(path, extensions))
      }
    } else if (entry.isFile() && isCheckedFile(entry.name, extensions)) {
      files.push(path)
    }
  }

  return files
}

async function collectRootFiles() {
  const entries = await readdir(root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => (
      isCheckedFile(entry.name, documentationExtensions)
      || (
        isCheckedFile(entry.name, codeExtensions)
        && (entry.name === 'package.json' || entry.name.includes('config'))
      )
    ))
    .map((entry) => resolve(root, entry.name))
}

const sourceDirectories = ['src', 'server', 'e2e', 'scripts']
const documentationDirectories = ['.github', 'docs']
const sourceFiles = await Promise.all(
  sourceDirectories.map(async (directory) => {
    const path = resolve(root, directory)
    return (await stat(path).catch(() => null))?.isDirectory()
      ? collectFiles(path, codeExtensions)
      : []
  }),
)
const documentationFiles = await Promise.all(
  documentationDirectories.map(async (directory) => {
    const path = resolve(root, directory)
    return (await stat(path).catch(() => null))?.isDirectory()
      ? collectFiles(path, documentationExtensions)
      : []
  }),
)
const files = [
  ...sourceFiles.flat(),
  ...documentationFiles.flat(),
  ...await collectRootFiles(),
].sort()
const violations = []

for (const file of files) {
  const lineCount = countPhysicalLines(await readFile(file, 'utf8'))
  if (lineCount >= LINE_LIMIT) {
    violations.push(`${file.slice(root.length + 1)}: ${lineCount} lines`)
  }
}

if (violations.length > 0) {
  console.error(`Files must contain fewer than ${LINE_LIMIT} physical lines:`)
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Checked ${files.length} files: all contain fewer than ${LINE_LIMIT} physical lines.`)
}
