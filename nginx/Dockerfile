FROM node:24-alpine AS web-build
WORKDIR /app
COPY web-app/package.json web-app/package-lock.json ./
RUN npm ci
COPY web-app/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=web-build /app/dist /usr/share/nginx/html
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
