# Usar imagem oficial do Python otimizada
FROM python:3.11-slim

# Definir variáveis de ambiente
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

# Diretório de trabalho
WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependências Python
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar código da aplicação
COPY . .

# Comando de execução padrão (para FastAPI, pode ser alterado para Flask se necessário)
# Usa Uvicorn para alta performance
CMD ["uvicorn", "fastapi_app.main:app", "--host", "0.0.0.0", "--port", "10000"]
