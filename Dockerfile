FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY src ./src
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN echo "DOCKER_IMAGE_CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > ./dist/docker_image_created_at
EXPOSE 3000
CMD ["node", "dist/index.js"]
