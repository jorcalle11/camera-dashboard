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

# Build stage: compiles TypeScript
FROM dev AS builder
RUN npm run build

# Production stage: slim image with only runtime deps
FROM base AS prod
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
