FROM node:24-alpine AS web-build
WORKDIR /app
COPY web-app/package.json web-app/package-lock.json ./
RUN npm ci
COPY web-app/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
