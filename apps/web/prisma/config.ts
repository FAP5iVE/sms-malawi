import { defineConfig } from 'prisma/config'
import {neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

export default defineConfig({
  schema: './prisma/schema.prisma',
})