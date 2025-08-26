import { prisma } from "@/lib/prisma"

async function checkAdminUsers() {
  try {
    console.log("🔍 Checking admin users in the database...\n")

    // Get all admin users
    const adminUsers = await prisma.adminUser.findMany({
      orderBy: [
        { role: 'desc' }, // SUPERADMIN first, then ADMIN
        { createdAt: 'asc' }
      ],
      include: {
        creator: {
          select: {
            name: true,
            email: true
          }
        }
      }
    })

    if (adminUsers.length === 0) {
      console.log("❌ No admin users found in the database")
      console.log("💡 Run 'npx tsx scripts/create-initial-admin.ts' to create the first admin user")
      return
    }

    console.log(`✅ Found ${adminUsers.length} admin user(s):\n`)

    // Display table header
    console.log("┌─────────────────────────────────────┬──────────────────────────┬─────────────┬─────────┬──────────────────────────┬─────────────────────────┐")
    console.log("│ ID                                  │ Email                    │ Name        │ Role    │ Status                   │ Created                 │")
    console.log("├─────────────────────────────────────┼──────────────────────────┼─────────────┼─────────┼──────────────────────────┼─────────────────────────┤")

    // Display each admin user
    adminUsers.forEach(user => {
      const id = user.id.padEnd(35, ' ')
      const email = user.email.padEnd(24, ' ')
      const name = (user.name || '').substring(0, 11).padEnd(11, ' ')
      const role = user.role.padEnd(7, ' ')
      const status = user.enabled ? '✅ Enabled  ' : '❌ Disabled '
      const createdAt = user.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).padEnd(23, ' ')

      console.log(`│ ${id} │ ${email} │ ${name} │ ${role} │ ${status}         │ ${createdAt} │`)
    })

    console.log("└─────────────────────────────────────┴──────────────────────────┴─────────────┴─────────┴──────────────────────────┴─────────────────────────┘")

    // Show additional details
    console.log("\n📊 Summary:")
    const superAdmins = adminUsers.filter(user => user.role === 'SUPERADMIN')
    const regularAdmins = adminUsers.filter(user => user.role === 'ADMIN')
    const enabledUsers = adminUsers.filter(user => user.enabled)
    const disabledUsers = adminUsers.filter(user => !user.enabled)

    console.log(`   • Total admin users: ${adminUsers.length}`)
    console.log(`   • Super Admins: ${superAdmins.length}`)
    console.log(`   • Regular Admins: ${regularAdmins.length}`)
    console.log(`   • Enabled: ${enabledUsers.length}`)
    console.log(`   • Disabled: ${disabledUsers.length}`)

    // Show recent activity
    const recentLogins = adminUsers
      .filter(user => user.lastLogin)
      .sort((a, b) => new Date(b.lastLogin!).getTime() - new Date(a.lastLogin!).getTime())
      .slice(0, 3)

    if (recentLogins.length > 0) {
      console.log("\n🕐 Recent login activity:")
      recentLogins.forEach(user => {
        const timeAgo = getTimeAgo(new Date(user.lastLogin!))
        console.log(`   • ${user.name} (${user.email}) - ${timeAgo}`)
      })
    }

    // Show detailed info for each user
    console.log("\n📋 Detailed information:")
    adminUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name} (${user.email})`)
      console.log(`   • ID: ${user.id}`)
      console.log(`   • Role: ${user.role}`)
      console.log(`   • Status: ${user.enabled ? 'Enabled' : 'Disabled'}`)
      console.log(`   • Created: ${user.createdAt.toLocaleString()}`)
      if (user.lastLogin) {
        console.log(`   • Last Login: ${user.lastLogin.toLocaleString()}`)
      } else {
        console.log(`   • Last Login: Never`)
      }
      if (user.creator) {
        console.log(`   • Created by: ${user.creator.name} (${user.creator.email})`)
      }
      console.log(`   • Updated: ${user.updatedAt.toLocaleString()}`)
    })

    // Warnings and recommendations
    console.log("\n⚠️  Security checks:")
    
    if (superAdmins.length === 0) {
      console.log("   🚨 WARNING: No Super Admins found! This should not happen.")
    } else if (superAdmins.length === 1) {
      console.log("   ⚠️  Only one Super Admin exists. Consider creating a backup Super Admin.")
    }

    if (disabledUsers.length > 0) {
      console.log(`   ℹ️  ${disabledUsers.length} user(s) are disabled`)
    }

    const neverLoggedIn = adminUsers.filter(user => !user.lastLogin)
    if (neverLoggedIn.length > 0) {
      console.log(`   ℹ️  ${neverLoggedIn.length} user(s) have never logged in`)
    }

  } catch (error) {
    console.error("❌ Error checking admin users:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffDays > 0) {
    return `${diffDays} day(s) ago`
  } else if (diffHours > 0) {
    return `${diffHours} hour(s) ago`
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute(s) ago`
  } else {
    return 'Just now'
  }
}

if (require.main === module) {
  checkAdminUsers()
    .then(() => {
      console.log("\n✅ Admin user check completed")
      process.exit(0)
    })
    .catch((error) => {
      console.error("💥 Script failed:", error)
      process.exit(1)
    })
}

export { checkAdminUsers }
