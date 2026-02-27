import os
import re
import shutil
from datetime import datetime

# Configuração
FRONTEND_DIR = r"f:\python\plucklog_docker\frontend\src"
BACKUP_DIR = r"f:\python\plucklog_docker\frontend_backup_" + datetime.now().strftime("%Y%m%d_%H%M%S")

# Regex Patterns
# 1. Importação: Adicionar apiFetch se não existir
REGEX_IMPORT = r"(import.*from ['\"]@/lib/api['\"];?)"

# 2. Padrão simples: fetch(apiUrl(...), { headers: { 'X-User-Id': ... } })
# Captura: fetch(apiUrl(URL), { headers: { 'X-User-Id': ... } }) -> apiFetch(URL)
# Isso é complexo com regex puro devido ao aninhamento. Vamos fazer substituições mais seguras e manuais onde necessário.

def backup_files():
    print(f"Criando backup em {BACKUP_DIR}...")
    shutil.copytree(FRONTEND_DIR, BACKUP_DIR)
    print("Backup concluído.")

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    modified = False
    
    # 1. Adicionar import apiFetch se necessário e se houver fetch para substituir
    if "fetch(" in content and "apiFetch" not in content:
        if "@/lib/api" in content:
            content = content.replace("import { apiUrl } from '@/lib/api';", "import { apiUrl, apiFetch } from '@/lib/api';")
            content = content.replace("import { apiUrl } from '@/lib/api'", "import { apiUrl, apiFetch } from '@/lib/api'")
        else:
            # Tentar inserir logo após 'use client' ou imports
            lines = content.splitlines()
            last_import_idx = -1
            for i, line in enumerate(lines):
                if line.strip().startswith("import "):
                    last_import_idx = i
            
            if last_import_idx != -1:
                lines.insert(last_import_idx + 1, "import { apiFetch } from '@/lib/api';")
                content = "\n".join(lines)
            else:
                content = "import { apiFetch } from '@/lib/api';\n" + content
        modified = True

    # 2. Substituições Inteligentes
    
    # Caso: fetch(apiUrl(...), { headers: { 'X-User-Id': ... } }) (GET simples)
    # Regex tenta capturar o fetch até o fechamento dos headers
    # Substitui por apiFetch(...)
    
    # Estratégia: Substituir linha a linha ou blocos conhecidos
    
    # Padrão: headers = { 'X-User-Id': ... }
    # Remover essa linha se for usada apenas no fetch
    
    # Substituição 1: fetch(apiUrl(...), { headers: { 'X-User-Id': ... } })
    # Vamos simplificar: procurar fetch(apiUrl e substituir por apiFetch(
    # E remover o options se tiver apenas X-User-Id
    
    # Como regex é arriscado para multiline e aninhamento, vamos fazer uma abordagem assistida.
    # Este script vai listar os arquivos e fazer substituições óbvias.
    
    # Substituir `fetch(apiUrl(` por `apiFetch(`
    if "fetch(apiUrl(" in content:
        content = content.replace("fetch(apiUrl(", "apiFetch(")
        modified = True
        
    # Substituir `fetch(url` se `url` for string template ou variável local definida com apiUrl
    # Isso é contextual.
    
    # Limpeza de headers manuais
    # Procurar: headers: { 'X-User-Id': ... }
    # Se estiver dentro de um apiFetch, deve ser removido? O apiFetch ignora ou mescla?
    # O apiFetch mescla. Mas o ideal é remover.
    
    if modified:
        # Salvar
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Modificado: {filepath}")
        return True
    return False

def scan_and_migrate():
    files_migrated = 0
    for root, dirs, files in os.walk(FRONTEND_DIR):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                if file == "api.ts": continue
                path = os.path.join(root, file)
                if process_file(path):
                    files_migrated += 1
    
    print(f"\nTotal de arquivos tocados: {files_migrated}")
    print("\n⚠️ IMPORTANTE: Este script fez o básico (imports e troca de nome da função).")
    print("Você AINDA PRECISA verificar manualmente os headers 'X-User-Id' e removê-los,")
    print("pois removê-los automaticamente via regex é arriscado sem um parser AST completo.")

if __name__ == "__main__":
    backup_files()
    scan_and_migrate()
