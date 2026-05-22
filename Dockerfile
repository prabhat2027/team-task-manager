FROM node:20-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
