export function createMockProject(id: string, name: string) {
  return {
    id,
    name,
    nodes: {},
    edges: {},
    patches: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export function createMockFile(content: string, name: string, type: string) {
  const file = new File([new Blob([content], { type })], name, { type })
  if (!file.arrayBuffer) {
    file.arrayBuffer = () => Promise.resolve(new TextEncoder().encode(content).buffer)
  }
  return file
}
