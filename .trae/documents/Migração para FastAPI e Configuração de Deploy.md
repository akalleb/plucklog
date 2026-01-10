# Plano de Migração para Alta Performance e Deploy (FastAPI)

Este plano descreve como migrar gradualmente do Flask para o **FastAPI**, que é um framework moderno, assíncrono e muito mais eficiente para lidar com bancos de dados como o MongoDB.

## 1. Infraestrutura de Deploy (Pronto)
Arquivos de configuração essenciais já foram criados na raiz do projeto:
*   **`Dockerfile`**: Configurado com Python 3.11 (mais rápido) e servidor Uvicorn para alta performance no Render.
*   **`render.yaml`**: Define a infraestrutura como código para o Render, criando automaticamente o serviço web e configurando variáveis de ambiente.
*   **`vercel.json`**: Configuração para deploy Serverless na Vercel (caso prefira esta opção).

## 2. Núcleo FastAPI (Criado)
Foi criada uma estrutura paralela em `fastapi_app/main.py` que já demonstra o poder do novo framework.
*   **Motor (Async MongoDB)**: Substituímos o PyMongo síncrono pelo `Motor`. Isso permite que o servidor atenda milhares de requisições enquanto aguarda o banco de dados, eliminando travamentos.
*   **Pydantic**: Validação automática de dados de entrada e saída (menos bugs).
*   **Rota de Estoque Otimizada**: Reescrevi a lógica de `/api/estoque/hierarquia` usando `async/await` como prova de conceito.

## 3. Próximos Passos para Migração Completa
Recomendo uma abordagem gradual ("Strangler Fig Pattern"):
1.  **Migrar APIs Críticas**: Mover primeiro as rotas que exigem mais performance (`/api/movimentacoes`, `/api/dashboard`) para o FastAPI.
2.  **Manter Frontend**: O frontend (HTML/JS) pode continuar o mesmo. O FastAPI suporta Jinja2 templates igual ao Flask.
3.  **Autenticação**: Migrar a lógica de login para usar dependências do FastAPI (OAuth2PasswordBearer ou Cookies).

## Como Testar a Nova Versão
Para rodar a versão FastAPI localmente:
```bash
uvicorn fastapi_app.main:app --reload
```
Acesse a documentação interativa automática em: `http://localhost:8000/docs`

Esta estrutura já está pronta para ser enviada ao GitHub e conectada ao Render ou Vercel.