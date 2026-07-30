#!/bin/sh
set -e

export RECORDINGS_CONTAINER_PATH="${RECORDINGS_CONTAINER_PATH:?RECORDINGS_CONTAINER_PATH is required}"
export SERVER_PORT="${SERVER_PORT:?SERVER_PORT is required}"
export GO2RTC_API_PORT="${GO2RTC_API_PORT:?GO2RTC_API_PORT is required}"
export NGINX_HTTP_PORT="${NGINX_HTTP_PORT:?NGINX_HTTP_PORT is required}"

envsubst '${RECORDINGS_CONTAINER_PATH} ${SERVER_PORT} ${GO2RTC_API_PORT} ${NGINX_HTTP_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec "$@"
