import { google } from "googleapis"

type ServiceAccountCredentials = { client_email: string; private_key: string }

function getCredentials(): ServiceAccountCredentials {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON belum diset di .env")
  let parsed: ServiceAccountCredentials
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON bukan JSON yang valid")
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON tidak punya client_email/private_key")
  }
  return parsed
}

export function getServiceAccountEmail(): string {
  return getCredentials().client_email
}

function getSheetsClient() {
  const { client_email, private_key } = getCredentials()
  const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  return google.sheets({ version: "v4", auth })
}

export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim()
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (fromUrl) return fromUrl[1]
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed
  return null
}

function toFriendlyGoogleSheetsError(err: unknown): Error {
  const status = (err as { code?: number; response?: { status?: number } })?.code
    ?? (err as { response?: { status?: number } })?.response?.status
  if (status === 403) {
    let email = "(gagal baca email Service Account)"
    try {
      email = getServiceAccountEmail()
    } catch {
      // ignore, pakai fallback text di atas
    }
    return new Error(
      `Sheet ini belum di-share ke Service Account (${email}). Buka sheet di Google Sheets → Share → tambahkan email tersebut sebagai Viewer.`
    )
  }
  if (status === 404) {
    return new Error("Spreadsheet tidak ditemukan — cek lagi URL/ID-nya.")
  }
  const message = err instanceof Error ? err.message : String(err)
  return new Error(`Gagal mengambil data dari Google Sheets: ${message}`)
}

export async function listSheetTabs(spreadsheetId: string): Promise<{ sheetId: number; title: string }[]> {
  try {
    const sheets = getSheetsClient()
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" })
    return (meta.data.sheets ?? [])
      .map((s) => ({ sheetId: s.properties?.sheetId ?? 0, title: s.properties?.title ?? "" }))
      .filter((s) => s.title)
  } catch (err) {
    throw toFriendlyGoogleSheetsError(err)
  }
}

function colLetter(n: number): string {
  let s = ""
  let num = n
  while (num > 0) {
    const rem = (num - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    num = Math.floor((num - 1) / 26)
  }
  return s
}

export async function readSheetTabValues(
  spreadsheetId: string,
  tabTitle: string,
  opts?: { maxRows?: number; maxCols?: number }
): Promise<{ headers: string[]; rows: string[][]; truncated: boolean }> {
  const maxRows = opts?.maxRows ?? 500
  const maxCols = opts?.maxCols ?? 50
  try {
    const sheets = getSheetsClient()
    const range = `'${tabTitle}'!A1:${colLetter(maxCols)}${maxRows + 1}`
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "FORMATTED_VALUE",
    })
    const values = res.data.values ?? []
    const [headerRow, ...dataRows] = values
    const headers = (headerRow ?? []).map((h) => String(h ?? ""))
    const width = headers.length || Math.max(0, ...dataRows.map((r) => r.length))
    const rows = dataRows.map((r) => {
      const padded = [...r]
      while (padded.length < width) padded.push("")
      return padded.slice(0, width).map((c) => String(c ?? ""))
    })
    const truncated = dataRows.length >= maxRows || width >= maxCols
    return { headers, rows, truncated }
  } catch (err) {
    throw toFriendlyGoogleSheetsError(err)
  }
}
