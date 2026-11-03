# Build from the repository root so the site's datasets are available for seeding:
#   docker build -f classifier/Dockerfile -t anime-filler-classifier .
FROM node:22-slim AS build
WORKDIR /app/classifier
COPY classifier/package.json classifier/package-lock.json ./
RUN npm ci
COPY classifier/tsconfig.json classifier/tsconfig.build.json ./
COPY classifier/src ./src
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/classifier
COPY classifier/package.json classifier/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/classifier/dist ./dist
COPY classifier/migrations ./migrations
COPY classifier/fixtures ./fixtures
COPY src/data/anime /app/src/data/anime
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/readyz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/cli.js", "serve"]
