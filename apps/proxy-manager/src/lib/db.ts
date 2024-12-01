import { User } from 'next-auth'
import { prisma } from '@/prisma'
import { Prisma } from '@prisma/client'

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email }
  })
}

export async function createUser(data: {
  userName: string
  email: string
  password: string
  role: string
}) {
  return prisma.user.create({
    data: {
      ...data,
    }
  })
}

export async function updateUser(
  id: string, 
  userData: Prisma.UserUpdateInput
) {
  return prisma.user.update({
    where: { id },
    data: userData,
    select: {
      id: true,
      userName: true,
      email: true,
      role: true,
      password: true,
    }
  })
}

export async function deleteUser(id: string) {
  return prisma.user.delete({
    where: { id }
  })
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id }
  })
}

export async function listUsers(skip = 0, take = 10) {
  return prisma.user.findMany({
    skip,
    take,
    orderBy: {
      createdAt: "desc"
    }
  })
}

export async function countUsers() {
  return prisma.user.count()
}
