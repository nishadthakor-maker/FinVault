import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error('TOKEN_ENCRYPTION_KEY is not set')
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':')
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
