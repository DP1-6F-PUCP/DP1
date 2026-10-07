#!/usr/bin/env bash
# ==============================================================================
# Script de Configuración y Despliegue de Servidor para PaqRap (DP1)
# Repositorio: https://github.com/DP1-6F-PUCP/DP1
#
# Este script realiza la configuración completa de un servidor Linux nuevo:
#  1. Verificación de privilegios de administrador (root / sudo).
#  2. Detección del sistema operativo (Ubuntu, Debian, RHEL, CentOS, Rocky, Fedora).
#  3. Creación automática de Swap si el servidor tiene < 4GB de RAM (evita OOM).
#  4. Instalación de paquetes base y Docker Engine + Docker Compose v2 oficial.
#  5. Configuración del cortafuegos (UFW) para SSH (22), HTTP (80), HTTPS (443) y API (8080).
#  6. Creación y protección de archivos de configuración Docker (/root/.docker/config.json).
#  7. Detección o clonado del repositorio en el servidor (/opt/dp1).
#  8. Autenticación opcional en GitHub Container Registry (ghcr.io) para paquetes privados.
#  9. Configuración del archivo .env con contraseñas seguras autogeneradas.
# 10. Despliegue de contenedores (PostgreSQL, Backend, Frontend y Watchtower).
# 11. Activación de Watchtower para auto-actualización continua con cada nuevo Release.
# 12. Verificación de estado de los servicios y resumen final.
# ==============================================================================

set -euo pipefail

# Paleta de colores para salidas en terminal
CLR_RESET="\033[0m"
CLR_INFO="\033[1;34m"
CLR_SUCCESS="\033[1;32m"
CLR_WARN="\033[1;33m"
CLR_ERROR="\033[1;31m"
CLR_BOLD="\033[1m"

log_info() {
    echo -e "${CLR_INFO}[INFO]${CLR_RESET} $1"
}

log_success() {
    echo -e "${CLR_SUCCESS}[OK]${CLR_RESET} $1"
}

log_warn() {
    echo -e "${CLR_WARN}[ADVERTENCIA]${CLR_RESET} $1"
}

log_error() {
    echo -e "${CLR_ERROR}[ERROR]${CLR_RESET} $1" >&2
}

# ------------------------------------------------------------------------------
# 1. Verificación de Privilegios
# ------------------------------------------------------------------------------
if [[ "${EUID}" -ne 0 ]]; then
    log_error "Este script debe ejecutarse como root o con sudo."
    echo "Uso: sudo bash $0"
    exit 1
fi

ACTUAL_USER="${SUDO_USER:-$(id -u -n)}"
REPO_URL="https://github.com/DP1-6F-PUCP/DP1.git"
DEFAULT_INSTALL_DIR="/opt/dp1"

echo -e "${CLR_BOLD}==============================================================================${CLR_RESET}"
echo -e "${CLR_BOLD}       Aprovisionamiento y Despliegue Automático - PaqRap (DP1)              ${CLR_RESET}"
echo -e "${CLR_BOLD}==============================================================================${CLR_RESET}"

# ------------------------------------------------------------------------------
# 2. Detección del Sistema Operativo
# ------------------------------------------------------------------------------
if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_NAME="${NAME:-Linux}"
else
    log_error "No se pudo determinar la distribución de Linux (/etc/os-release no encontrado)."
    exit 1
fi

log_info "Sistema operativo detectado: ${OS_NAME} (${OS_ID})"

# ------------------------------------------------------------------------------
# 3. Configuración de Memoria Swap (Prevención de Out-Of-Memory)
# ------------------------------------------------------------------------------
configure_swap() {
    local total_ram_mb
    total_ram_mb=$(free -m | awk '/^Mem:/{print $2}')
    local total_swap_mb
    total_swap_mb=$(free -m | awk '/^Swap:/{print $2}')

    log_info "Memoria RAM: ${total_ram_mb} MB | Swap existente: ${total_swap_mb} MB"

    if (( (total_ram_mb + total_swap_mb) < 3800 )); then
        if [[ -f /swapfile ]]; then
            log_warn "Existe un archivo /swapfile pero la memoria total es baja. Continuando..."
        else
            log_info "Memoria insuficiente para compilación/ejecución (< 4GB). Creando Swap de 2GB..."
            if command -v fallocate &>/dev/null; then
                fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
            else
                dd if=/dev/zero of=/swapfile bs=1M count=2048
            fi
            chmod 600 /swapfile
            mkswap /swapfile
            swapon /swapfile

            if ! grep -q "/swapfile" /etc/fstab; then
                echo "/swapfile none swap sw 0 0" >> /etc/fstab
            fi
            log_success "Swap de 2GB creado y activado permanentemente."
        fi
    else
        log_info "Capacidad de memoria adecuada. No se requiere swap adicional."
    fi
}

configure_swap

# ------------------------------------------------------------------------------
# 4. Actualización del Sistema e Instalación de Dependencias Base
# ------------------------------------------------------------------------------
log_info "Instalando paquetes básicos del sistema..."

case "${OS_ID}" in
    ubuntu|debian)
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -y
        apt-get install -y --no-install-recommends \
            ca-certificates \
            curl \
            gnupg \
            git \
            ufw \
            openssl \
            tar
        ;;
    centos|rhel|almalinux|rocky)
        dnf update -y
        dnf install -y \
            ca-certificates \
            curl \
            git \
            openssl \
            tar
        ;;
    fedora)
        dnf install -y \
            ca-certificates \
            curl \
            git \
            openssl \
            tar
        ;;
    *)
        log_warn "Distribución no estándar. Continuando con herramientas disponibles..."
        ;;
esac

# ------------------------------------------------------------------------------
# 5. Instalación de Docker y Docker Compose v2
# ------------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
    log_info "Instalando Docker Engine mediante el script oficial de Docker..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
    log_success "Docker Engine instalado correctamente."
else
    log_info "Docker ya está instalado: $(docker --version)"
fi

# Habilitar e iniciar servicio Docker
systemctl enable --now docker

# Agregar el usuario al grupo docker para permitir comandos sin sudo
if [[ "${ACTUAL_USER}" != "root" ]]; then
    if ! groups "${ACTUAL_USER}" | grep -q '\bdocker\b'; then
        usermod -aG docker "${ACTUAL_USER}"
        log_info "Usuario '${ACTUAL_USER}' añadido al grupo docker."
    fi
fi

# Verificar plugin de Docker Compose
if ! docker compose version &>/dev/null; then
    log_info "Instalando Docker Compose v2..."
    if [[ "${OS_ID}" =~ ^(ubuntu|debian)$ ]]; then
        apt-get update -y && apt-get install -y docker-compose-plugin
    else
        dnf install -y docker-compose-plugin || true
    fi
fi

log_success "Docker Compose activo: $(docker compose version)"

# ------------------------------------------------------------------------------
# 6. Preparación de Credenciales de Docker (Evita conflicto de directorio en volumen)
# ------------------------------------------------------------------------------
# Si docker compose monta /root/.docker/config.json y este no existe como archivo,
# Docker crearía un directorio con ese nombre rompiendo el login posterior.
mkdir -p /root/.docker
if [[ ! -f /root/.docker/config.json ]]; then
    echo "{}" > /root/.docker/config.json
    chmod 600 /root/.docker/config.json
fi

if [[ "${ACTUAL_USER}" != "root" ]]; then
    USER_HOME=$(eval echo "~${ACTUAL_USER}")
    mkdir -p "${USER_HOME}/.docker"
    if [[ ! -f "${USER_HOME}/.docker/config.json" ]]; then
        echo "{}" > "${USER_HOME}/.docker/config.json"
        chown -R "${ACTUAL_USER}:${ACTUAL_USER}" "${USER_HOME}/.docker"
    fi
fi

# ------------------------------------------------------------------------------
# 7. Configuración del Firewall (UFW)
# ------------------------------------------------------------------------------
if command -v ufw &>/dev/null; then
    log_info "Configurando reglas de firewall..."
    ufw allow 22/tcp comment 'SSH' || true
    ufw allow 80/tcp comment 'HTTP Frontend' || true
    ufw allow 443/tcp comment 'HTTPS' || true
    ufw allow 8080/tcp comment 'API Backend' || true

    if ! ufw status | grep -q "Status: active"; then
        log_info "Activando cortafuegos UFW..."
        echo "y" | ufw enable || true
    fi
    log_success "Firewall configurado (puertos 22, 80, 443, 8080 permitidos)."
fi

# ------------------------------------------------------------------------------
# 8. Obtención del Proyecto
# ------------------------------------------------------------------------------
PROJECT_DIR=""

if [[ -f "./docker-compose.yml" && -d "./backend" ]]; then
    PROJECT_DIR="$(pwd)"
    log_info "Utilizando repositorio en el directorio actual: ${PROJECT_DIR}"
elif [[ -d "${DEFAULT_INSTALL_DIR}" && -f "${DEFAULT_INSTALL_DIR}/docker-compose.yml" ]]; then
    PROJECT_DIR="${DEFAULT_INSTALL_DIR}"
    log_info "Directorio de proyecto existente: ${PROJECT_DIR}"
else
    PROJECT_DIR="${DEFAULT_INSTALL_DIR}"
    log_info "Clonando repositorio en ${PROJECT_DIR}..."
    mkdir -p "${PROJECT_DIR}"
    git clone "${REPO_URL}" "${PROJECT_DIR}"
fi

cd "${PROJECT_DIR}"

if [[ "${ACTUAL_USER}" != "root" ]]; then
    chown -R "${ACTUAL_USER}:${ACTUAL_USER}" "${PROJECT_DIR}" || true
fi

# ------------------------------------------------------------------------------
# 9. Autenticación en GitHub Container Registry (ghcr.io)
# ------------------------------------------------------------------------------
# Si los paquetes de Docker en GitHub son privados, se necesita autenticación
# para que Docker y Watchtower puedan descargar las nuevas imágenes.
GHCR_LOGIN_OK=false

if grep -q "ghcr.io" /root/.docker/config.json 2>/dev/null; then
    log_info "Credenciales de ghcr.io ya registradas en /root/.docker/config.json."
    GHCR_LOGIN_OK=true
else
    # Si se pasan variables de entorno GHCR_USER y GHCR_TOKEN
    if [[ -n "${GHCR_USER:-}" && -n "${GHCR_TOKEN:-}" ]]; then
        log_info "Iniciando sesión en ghcr.io con variables de entorno proporcionadas..."
        if echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin; then
            GHCR_LOGIN_OK=true
            log_success "Autenticación en ghcr.io exitosa."
        fi
    elif [ -t 0 ]; then
        echo ""
        echo -e "${CLR_BOLD}¿Los paquetes de Docker en GitHub (ghcr.io) son privados?${CLR_RESET}"
        read -r -p "Ingresar credenciales de GitHub (Personal Access Token) [s/N]: " RESP_AUTH
        if [[ "${RESP_AUTH}" =~ ^[sSyY]$ ]]; then
            read -r -p "Usuario de GitHub: " INPUT_USER
            read -r -s -p "GitHub Personal Access Token (con permiso read:packages): " INPUT_TOKEN
            echo ""
            if echo "${INPUT_TOKEN}" | docker login ghcr.io -u "${INPUT_USER}" --password-stdin; then
                GHCR_LOGIN_OK=true
                log_success "Autenticación en ghcr.io guardada en Docker config."
            else
                log_warn "Error de autenticación en ghcr.io. Se intentará continuar con acceso público."
            fi
        fi
    fi
fi

# ------------------------------------------------------------------------------
# 10. Configuración del Archivo .env
# ------------------------------------------------------------------------------
if [[ ! -f ".env" ]]; then
    log_info "Creando archivo .env a partir de .env.example..."
    if [[ -f ".env.example" ]]; then
        cp .env.example .env
    else
        cat << 'EOF' > .env
DB_NAME=sysmile_db
DB_USER=sysmile_user
DB_PASSWORD=sysmile_password
DB_PORT=5432
DOCKER_CONFIG_PATH=/root/.docker/config.json
WATCHTOWER_INTERVAL=60
EOF
    fi

    # Generar contraseña aleatoria para la base de datos
    SECURE_PWD=$(openssl rand -hex 16)
    sed -i "s/DB_PASSWORD=sysmile_password/DB_PASSWORD=${SECURE_PWD}/" .env || true
    log_success "Archivo .env creado con credenciales seguras."
else
    log_info "Archivo .env detectado. Se conserva la configuración existente."
fi

# Asegurar que DOCKER_CONFIG_PATH apunte al archivo correcto
if ! grep -q "DOCKER_CONFIG_PATH" .env; then
    echo "DOCKER_CONFIG_PATH=/root/.docker/config.json" >> .env
fi

# ------------------------------------------------------------------------------
# 11. Descarga o Compilación y Despliegue de Contenedores
# ------------------------------------------------------------------------------
log_info "Preparando imágenes de Docker..."

PULL_SUCCESS=false
log_info "Consultando imágenes de release en ghcr.io (backend y frontend)..."
if docker compose pull backend frontend; then
    PULL_SUCCESS=true
    log_success "Imágenes de release descargadas directamente desde ghcr.io."
else
    log_warn "No se pudieron descargar imágenes precompiladas de GHCR."
    log_info "Se procederá a compilar localmente desde el código fuente..."
fi

log_info "Iniciando servicios con Docker Compose..."
if [[ "${PULL_SUCCESS}" == "true" ]]; then
    # Inicia usando las imágenes descargadas y compila solo si algo faltara
    docker compose up -d
else
    # Compila desde el código fuente
    docker compose up -d --build
fi

# ------------------------------------------------------------------------------
# 12. Verificación de Salud del Despliegue
# ------------------------------------------------------------------------------
log_info "Verificando inicio de contenedores (espera máxima: 60 segundos)..."

MAX_RETRIES=12
COUNT=0
ALL_UP=false

while (( COUNT < MAX_RETRIES )); do
    sleep 5
    COUNT=$((COUNT + 1))
    
    RUNNING_COUNT=$(docker compose ps --filter "status=running" -q | wc -l)
    if (( RUNNING_COUNT >= 4 )); then
        ALL_UP=true
        break
    fi
    echo -n "."
done
echo ""

# Detección de IP Pública del Servidor
SERVER_IP=$(curl -s --max-time 3 https://ifconfig.me 2>/dev/null || ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || echo "IP_DEL_SERVIDOR")

echo -e "\n${CLR_BOLD}==============================================================================${CLR_RESET}"
if [[ "${ALL_UP}" == "true" ]]; then
    log_success "¡Servidor aprovisionado y aplicación corriendo correctamente!"
else
    log_warn "Los servicios se están inicializando. Estado actual reportado por Docker:"
fi
echo -e "${CLR_BOLD}==============================================================================${CLR_RESET}\n"

docker compose ps

echo ""
echo -e "${CLR_BOLD}Acceso al Sistema:${CLR_RESET}"
echo "  - Frontend Web:        http://${SERVER_IP}/"
echo "  - Backend API:         http://${SERVER_IP}:8080/"
echo "  - Ubicación del Repo:  ${PROJECT_DIR}"
echo ""
echo -e "${CLR_BOLD}Actualización Automática (Watchtower):${CLR_RESET}"
echo "  - El servicio 'watchtower' está activo y revisa GHCR cada 60 segundos."
echo "  - Cuando GitHub Actions genera un nuevo Release y sube las imágenes 'latest',"
echo "    el servidor descargará la nueva versión, recreará el contenedor y eliminará"
echo "    la versión anterior automáticamente sin intervención manual."
echo ""
echo -e "${CLR_BOLD}Comandos de Administración:${CLR_RESET}"
echo "  - Ver logs en vivo:            cd ${PROJECT_DIR} && docker compose logs -f"
echo "  - Forzar actualización manual: cd ${PROJECT_DIR} && docker compose pull && docker compose up -d"
echo "  - Reiniciar aplicación:        cd ${PROJECT_DIR} && docker compose restart"
echo "  - Detener aplicación:          cd ${PROJECT_DIR} && docker compose down"
echo "=============================================================================="
