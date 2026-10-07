# Etapa 1: Compilación (Node.js)
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Etapa 2: Servidor Web (Nginx)
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Sin esto, nginx usa su config default (solo estaticos) y "/api"/"/ws" devuelven 404 -- ver
# nginx.conf para el detalle del proxy hacia el contenedor "backend".
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
