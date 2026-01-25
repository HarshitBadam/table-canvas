# Backend Dockerfile (Express + TypeScript)
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose server port
EXPOSE 3001

# Start development server with tsx watch
CMD ["npm", "run", "dev"]
