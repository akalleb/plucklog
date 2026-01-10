from fastapi import FastAPI, HTTPException, Query, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from typing import List, Optional, Dict, Any
import os
import math
from pydantic import BaseModel, Field
from datetime import datetime

# Configuração
app = FastAPI(title="Almox SMS API", version="2.0.0")

# Cliente Mongo Async
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "almox_db")

class Database:
    client: AsyncIOMotorClient = None
    db = None

db = Database()

@app.on_event("startup")
async def startup_db_client():
    db.client = AsyncIOMotorClient(MONGO_URI)
    db.db = db.client[MONGO_DB]
    print(f"Conectado ao MongoDB Async: {MONGO_DB}")

@app.on_event("shutdown")
async def shutdown_db_client():
    if db.client:
        db.client.close()

# --- Modelos Pydantic (Validação automática) ---
class EstoqueItem(BaseModel):
    produto_nome: str
    produto_codigo: str
    local_nome: str
    local_tipo: str
    quantidade: float
    quantidade_disponivel: float
    status: str

class EstoqueResponse(BaseModel):
    items: List[EstoqueItem]
    pagination: Dict[str, Any]

# --- Rota Otimizada de Estoque (Exemplo de Migração) ---
@app.get("/api/estoque/hierarquia", response_model=EstoqueResponse)
async def get_estoque_hierarquia(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    produto: Optional[str] = None,
    tipo: Optional[str] = None,
    local: Optional[str] = None,
    status: Optional[str] = None
):
    """
    Versão FastAPI assíncrona da rota de estoque.
    Muito mais rápida pois não bloqueia o servidor enquanto busca no banco.
    """
    skip = (page - 1) * per_page
    
    # Construção de Filtros
    query = {}
    if produto:
        # Busca texto ou ID
        prod_query = {"$or": [
            {"nome": {"$regex": produto, "$options": "i"}},
            {"codigo": {"$regex": produto, "$options": "i"}}
        ]}
        # Tenta ObjectId
        if ObjectId.is_valid(produto):
            prod_query["$or"].append({"_id": ObjectId(produto)})
        
        # Buscar IDs de produtos primeiro (Async)
        prods = await db.db.produtos.find(prod_query, {"_id": 1, "id": 1}).to_list(length=100)
        p_ids = []
        for p in prods:
            p_ids.append(p.get("_id"))
            p_ids.append(str(p.get("_id")))
            if p.get("id"): p_ids.append(p.get("id"))
        
        if p_ids:
            query["produto_id"] = {"$in": p_ids}
        else:
            return {"items": [], "pagination": {"total": 0, "page": page}}

    # Filtros de Local
    if tipo:
        norm_tipo = tipo.lower().replace("-", "").replace("_", "")
        if "setor" in norm_tipo: query["setor_id"] = {"$exists": True}
        elif "almox" in norm_tipo: query["almoxarifado_id"] = {"$exists": True}
        elif "central" in norm_tipo: query["central_id"] = {"$exists": True}

    if local:
        query["$or"] = [
            {"local_id": local},
            {"almoxarifado_id": local},
            {"setor_id": local}
        ]

    # Contagem total (Async)
    total = await db.db.estoques.count_documents(query)
    
    # Busca Principal (Async e não bloqueante)
    cursor = db.db.estoques.find(query).skip(skip).limit(per_page)
    estoques = await cursor.to_list(length=per_page)

    # Bulk Resolve (Carregamento em lote Async)
    prod_ids = set()
    loc_ids = {"centrais": set(), "almoxarifados": set(), "setores": set()}

    for e in estoques:
        if e.get("produto_id"): prod_ids.add(e.get("produto_id"))
        # Identificar coleção do local
        if e.get("setor_id"): loc_ids["setores"].add(e.get("setor_id"))
        elif e.get("almoxarifado_id"): loc_ids["almoxarifados"].add(e.get("almoxarifado_id"))
        elif e.get("central_id"): loc_ids["centrais"].add(e.get("central_id"))

    # Executar buscas auxiliares em paralelo (Gather)
    # Nota: Motor não tem gather nativo na query, mas podemos disparar as tasks
    # Para simplicidade aqui, faremos await sequencial, que já é rápido
    
    # Função helper para converter lista de IDs para Dict
    async def fetch_map(coll, ids):
        if not ids: return {}
        q_ids = []
        for i in ids:
            if ObjectId.is_valid(str(i)): q_ids.append(ObjectId(str(i)))
            q_ids.append(i)
            if str(i).isdigit(): q_ids.append(int(i))
            
        docs = await db.db[coll].find({"$or": [{"_id": {"$in": q_ids}}, {"id": {"$in": q_ids}}]}).to_list(length=len(ids))
        mapping = {}
        for d in docs:
            mapping[str(d.get("_id"))] = d
            if d.get("id"): mapping[str(d.get("id"))] = d
        return mapping

    prod_map = await fetch_map("produtos", list(prod_ids))
    loc_maps = {
        "centrais": await fetch_map("centrais", list(loc_ids["centrais"])),
        "almoxarifados": await fetch_map("almoxarifados", list(loc_ids["almoxarifados"])),
        "setores": await fetch_map("setores", list(loc_ids["setores"]))
    }

    # Montar resposta
    results = []
    for e in estoques:
        pid = str(e.get("produto_id"))
        p = prod_map.get(pid, {})
        
        # Resolver local
        l_nome = "Desconhecido"
        l_tipo = e.get("local_tipo", "outro")
        
        if e.get("setor_id"):
            l = loc_maps["setores"].get(str(e.get("setor_id")), {})
            l_nome = l.get("nome", "Setor")
            l_tipo = "setor"
        elif e.get("almoxarifado_id"):
            l = loc_maps["almoxarifados"].get(str(e.get("almoxarifado_id")), {})
            l_nome = l.get("nome", "Almoxarifado")
            l_tipo = "almoxarifado"
        
        qtd = float(e.get("quantidade_atual", 0))
        disp = float(e.get("quantidade_disponivel", qtd))
        inicial = float(e.get("quantidade_inicial", qtd))
        
        status_calc = "Normal"
        if disp <= 0: status_calc = "Zerado"
        elif disp <= (inicial * 0.1): status_calc = "Baixo"

        if status and status.lower() != status_calc.lower():
            continue

        results.append({
            "produto_nome": p.get("nome", "-"),
            "produto_codigo": p.get("codigo", "-"),
            "local_nome": l_nome,
            "local_tipo": l_tipo,
            "quantidade": qtd,
            "quantidade_disponivel": disp,
            "status": status_calc
        })

    return {
        "items": results,
        "pagination": {
            "page": page,
            "total": total,
            "pages": math.ceil(total / per_page)
        }
    }

# Adaptador para Vercel Serverless
from mangum import Mangum
handler = Mangum(app)
