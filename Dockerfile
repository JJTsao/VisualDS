# Minimal container for any Docker-based host (Fly.io, Koyeb, Railway, a VPS…).
# No dependencies to install — the server uses only Node built-ins.
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0
EXPOSE 8090
CMD ["node", "server/server.js"]
