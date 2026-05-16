import { defineConfig } from "prisma/config"
import { Pool, neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import ws from "ws"

neonConfig.webSocketConstructor = ws

export default defineConfig({
  earlyAccess: true,
  schema: "./prisma/schema.prisma",
  migrate: {
    adapter: () => {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      })
      return new PrismaNeon(pool)
    },
  },
})