const codePattern = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/

export function normalizeJoinCode(value: string): string | undefined {
  const code = value.trim().toUpperCase()
  return codePattern.test(code) ? code : undefined
}

export function joinCodeFromUrl(url: string): string | undefined {
  try {
    return normalizeJoinCode(new URL(url).searchParams.get('join') ?? '')
  } catch {
    return undefined
  }
}

export function createJoinLink(url: string, codeValue: string): string {
  const code = normalizeJoinCode(codeValue)
  if (!code) throw new Error('Invalid join code.')
  const result = new URL(url)
  result.searchParams.set('join', code)
  result.hash = ''
  return result.toString()
}
