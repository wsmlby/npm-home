FROM node:23-slim

WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn install
COPY public .
COPY . .
ENTRYPOINT [ "node", "index.js" ]
EXPOSE 3000