# Este Dockerfile se construye con el contexto en la RAÍZ del repo (no en backend/),
# porque backend/ depende del módulo "algoritmo" -- ver docker-compose.yml
# (build.context: . , dockerfile: backend/Dockerfile) y .github/workflows/deploy.yml.

# Etapa 1: Compilación (Maven + JDK 21)
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app

COPY pom.xml .
COPY algoritmo/pom.xml algoritmo/pom.xml
COPY backend/pom.xml backend/pom.xml

COPY algoritmo/src algoritmo/src
COPY backend/src backend/src
RUN mvn -pl backend -am clean package -DskipTests

# Etapa 2: Entorno de Ejecución Ligero (JRE 21)
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

COPY --from=builder /app/backend/target/*.jar app.jar
# Datos oficiales del curso (ventas/bloqueos/mantenimiento) -- PaqRapConfig.cargadorRecursos()
# los lee de "data" (ruta relativa al WORKDIR) para la carga automática por lote de
# OrquestadorOperacion; ver com.paqrap.exposicion.ServicioPlanificacionImpl.
COPY algoritmo/data data

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
