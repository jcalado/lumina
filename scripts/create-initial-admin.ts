import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

async function createInitialAdmin() {
  // Check if any admin users exist
  const existingAdmins = await prisma.adminUser.count()
  
  if (existingAdmins > 0) {
    console.log("Admin users already exist. Skipping initial admin creation.")
    return
  }

  // Get admin credentials from environment variables
  const adminEmail = process.env.ADMIN_EMAIL || "admin@lumina.local"
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123"
  const adminName = process.env.ADMIN_NAME || "Super Administrator"

  // Hash the password
  const hashedPassword = await bcrypt.hash(adminPassword, 12)

  try {
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: adminName,
        password: hashedPassword,
        role: "SUPERADMIN",
        enabled: true,
      },
    })

    console.log(`✅ Initial superadmin created successfully:`)
    console.log(`   Email: ${admin.email}`)
    console.log(`   Name: ${admin.name}`)
    console.log(`   Role: ${admin.role}`)
    console.log(`   ID: ${admin.id}`)
    
    if (process.env.NODE_ENV === "development") {
      console.log(`   Password: ${adminPassword} (only shown in development)`)
    }
  } catch (error) {
    console.error("❌ Failed to create initial admin:", error)
    throw error
  }
}

if (require.main === module) {
  createInitialAdmin()
    .then(() => {
      console.log("Initial admin setup completed")
      process.exit(0)
    })
    .catch((error) => {
      console.error("Failed to setup initial admin:", error)
      process.exit(1)
    })
}

export { createInitialAdmin }
