import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Find admin user in database
          const adminUser = await prisma.adminUser.findUnique({
            where: {
              email: credentials.email,
            },
          })

          if (!adminUser) {
            return null
          }

          // Check if user is enabled
          if (!adminUser.enabled) {
            return null
          }

          // Verify password
          const isValidPassword = await bcrypt.compare(credentials.password, adminUser.password)

          if (!isValidPassword) {
            return null
          }

          // Update last login timestamp
          await prisma.adminUser.update({
            where: { id: adminUser.id },
            data: { lastLogin: new Date() },
          })

          return {
            id: adminUser.id,
            email: adminUser.email,
            name: adminUser.name,
            role: adminUser.role.toLowerCase(), // Convert to lowercase for consistency
          }
        } catch (error) {
          console.error("Authentication error:", error)
          return null
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!
        session.user.role = token.role
      }
      return session
    }
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  secret: process.env.NEXTAUTH_SECRET,
}
