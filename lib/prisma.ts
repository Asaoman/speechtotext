// Lazy initialization to avoid Prisma 7 build-time errors
let _prisma: any = null

const getPrisma = () => {
  if (_prisma) return _prisma
  
  // Only initialize in server-side context
  if (typeof window !== 'undefined') {
    return null
  }

  const { PrismaClient } = require('@prisma/client')
  const globalForPrisma = globalThis as unknown as {
    prisma: any | undefined
  }

  _prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = _prisma
  }

  return _prisma
}

export const prisma = new Proxy({} as any, {
  get(_target, prop) {
    const instance = getPrisma()
    if (!instance) {
      throw new Error('PrismaClient is not available in this context')
    }
    return instance[prop]
  }
})

export default prisma
