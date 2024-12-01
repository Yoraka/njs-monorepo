import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import crypto from 'crypto'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function saltAndHashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedPassword: string) {
  const [salt, hash] = storedPassword.split(':')
  const newHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  console.log(newHash, hash)
  return hash === newHash
}