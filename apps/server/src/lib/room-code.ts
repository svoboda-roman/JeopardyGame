import { randomInt } from 'node:crypto'

// SRS FR-G1: avoid ambiguous letters (I/L/O) and vowels (so we don't
// accidentally spell words). Result: 20 letters, 6 chars long.
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ'
export const ROOM_CODE_LENGTH = 6

export function generateRoomCode(): string {
  let out = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

export function isValidRoomCode(s: string): boolean {
  if (s.length !== ROOM_CODE_LENGTH) return false
  for (const c of s) if (!ALPHABET.includes(c)) return false
  return true
}
