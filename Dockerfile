FROM node:20-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ gcc

COPY package*.json ./

RUN npm ci --include=optional

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]