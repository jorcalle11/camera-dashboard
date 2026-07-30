# Base image with Node + ffmpeg
FROM node:24-alpine AS base
RUN apk add --no-cache ffmpeg
WORKDIR /app

# Development stage: includes build tools, dev deps, tsx watch
FROM base AS dev
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

# Build stage: compiles TypeScript and production node_modules (native deps built here)
FROM dev AS builder
RUN npm run build
RUN npm prune --omit=dev

# Production stage: slim image with compiled app + runtime deps only
FROM base AS prod
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
