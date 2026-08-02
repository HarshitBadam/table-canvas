import type { TCreatedPdf, TDocumentDefinitions } from 'pdfmake/interfaces'

type PdfMake = typeof import('pdfmake/build/pdfmake')

/**
 * pdfmake plus its Roboto font data is over a megabyte, so it is loaded on first
 * export only and cached for the rest of the session.
 *
 * Roboto is used in place of the standard WinAnsi fonts because imported CSV and
 * Excel data routinely carries accented and Cyrillic characters, which the
 * standard fonts cannot encode.
 */
let engine: Promise<PdfMake> | null = null

/** UMD builds land under `default` through the bundler's interop shim. */
function unwrap<T>(module: T): T {
  const withDefault = module as { default?: T }
  return withDefault.default ?? module
}

async function loadPdfMake(): Promise<PdfMake> {
  const [pdfMakeModule, vfsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  const pdfMake = unwrap(pdfMakeModule)
  pdfMake.addVirtualFileSystem(vfsModule.default)
  return pdfMake
}

export async function createReportPdf(
  docDefinition: TDocumentDefinitions,
): Promise<TCreatedPdf> {
  engine ??= loadPdfMake().catch((error: unknown) => {
    engine = null
    throw error
  })
  const pdfMake = await engine
  return pdfMake.createPdf(docDefinition)
}
