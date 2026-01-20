from fastapi import FastAPI, HTTPException, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from typing import List, Optional, Dict, Any
import os
import math
import mongomock
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo.errors import DuplicateKeyError

# Carregar variáveis de ambiente
load_dotenv()

# Configuração
app = FastAPI(title="Almox SMS API", version="2.0.0")

# CORS (Permitir acesso do Next.js)
cors_allow_origins = (os.getenv("CORS_ALLOW_ORIGINS") or "").strip()
allow_origins = [o.strip().rstrip("/") for o in cors_allow_origins.split(",") if o.strip()] or ["*"]
cors_allow_origin_regex = os.getenv(
    "CORS_ALLOW_ORIGIN_REGEX",
    r"http://(localhost|127\.0\.0\.1)(:\d+)?|https?://.*\.onrender\.com",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=cors_allow_origin_regex if allow_origins == ["*"] else None,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cliente Mongo Async
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "almox_db")

class Database:
    client: AsyncIOMotorClient = None
    db = None
    is_mock: bool = False

db = Database()

class _AsyncMockCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def sort(self, key_or_list, direction=None):
        if direction is None:
            self._cursor = self._cursor.sort(key_or_list)
        else:
            self._cursor = self._cursor.sort(key_or_list, direction)
        return self

    def skip(self, n: int):
        self._cursor = self._cursor.skip(n)
        return self

    def limit(self, n: int):
        self._cursor = self._cursor.limit(n)
        return self

    async def to_list(self, length: Optional[int] = None):
        items = list(self._cursor)
        if length is None:
            return items
        return items[:length]


class _AsyncMockCollection:
    def __init__(self, collection):
        self._collection = collection

    async def find_one(self, *args, **kwargs):
        return self._collection.find_one(*args, **kwargs)

    def find(self, *args, **kwargs):
        return _AsyncMockCursor(self._collection.find(*args, **kwargs))

    def aggregate(self, pipeline, *args, **kwargs):
        return _AsyncMockCursor(self._collection.aggregate(pipeline, *args, **kwargs))

    async def insert_one(self, *args, **kwargs):
        return self._collection.insert_one(*args, **kwargs)

    async def update_one(self, *args, **kwargs):
        return self._collection.update_one(*args, **kwargs)

    async def delete_one(self, *args, **kwargs):
        return self._collection.delete_one(*args, **kwargs)

    async def count_documents(self, *args, **kwargs):
        return self._collection.count_documents(*args, **kwargs)


class _AsyncMockDatabase:
    def __init__(self, database):
        self._database = database

    def __getitem__(self, name: str):
        return _AsyncMockCollection(self._database[name])

    def __getattr__(self, name: str):
        return _AsyncMockCollection(getattr(self._database, name))

async def _ensure_super_admin() -> None:
    email = str(os.getenv("SUPER_ADMIN_EMAIL") or "admin@pluck.local").strip().lower()
    password = str(os.getenv("SUPER_ADMIN_PASSWORD") or "Admin@123")
    if not email or not password:
        return

    existing = await db.db.usuarios.find_one({"$or": [{"username": email}, {"email": email}]})
    if existing:
        await db.db.usuarios.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "nome": existing.get("nome") or "Administrador",
                    "email": existing.get("email") or email,
                    "username": existing.get("username") or email,
                    "cargo": existing.get("cargo") or "Administrador",
                    "role": "super_admin",
                    "scope_id": None,
                    "password_hash": generate_password_hash(password),
                    "ativo": True,
                }
            },
        )
        return

    doc: Dict[str, Any] = {
        "nome": "Administrador",
        "email": email,
        "username": email,
        "cargo": "Administrador",
        "role": "super_admin",
        "scope_id": None,
        "categoria_ids": None,
        "password_hash": generate_password_hash(password),
        "created_at": datetime.now(timezone.utc),
        "ativo": True,
    }

    try:
        await db.db.usuarios.insert_one(doc)
    except DuplicateKeyError:
        return

def _norm_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(value)

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _dt_to_utc_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        out = dt.isoformat()
        if out.endswith("+00:00"):
            out = out[:-6] + "Z"
        return out
    if isinstance(value, str):
        return value
    return str(value)

def _is_expired(validade: Any, now: Optional[datetime] = None) -> bool:
    if not validade:
        return False
    if now is None:
        now = _now_utc()
    try:
        if isinstance(validade, datetime):
            vdt = validade
            if vdt.tzinfo is None:
                vdt = vdt.replace(tzinfo=timezone.utc)
            else:
                vdt = vdt.astimezone(timezone.utc)
            return vdt < now
        vdate = getattr(validade, "date", None)
        if callable(vdate):
            return vdate() < now.date()
        return str(validade) < now.date().isoformat()
    except Exception:
        return False

def _public_id(doc: Optional[Dict[str, Any]]) -> Optional[str]:
    if not doc:
        return None
    if doc.get("id") is not None:
        return str(doc.get("id"))
    if doc.get("_id") is not None:
        return str(doc.get("_id"))
    return None

def _build_id_query(value: str) -> Dict[str, Any]:
    value = str(value)
    ors: List[Dict[str, Any]] = [{"id": value}, {"_id": value}]
    if value.isdigit():
        ors.append({"id": int(value)})
    if ObjectId.is_valid(value):
        ors.append({"_id": ObjectId(value)})
    return {"$or": ors}

async def _find_one_by_id(coll: str, value: str) -> Optional[Dict[str, Any]]:
    return await db.db[coll].find_one(_build_id_query(value))

async def get_current_user(x_user_id: Optional[str] = Header(default=None, alias="X-User-Id")) -> Dict[str, Any]:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Usuário não autenticado")
    u = await _find_one_by_id("usuarios", x_user_id)
    if not u or not u.get("ativo", True):
        raise HTTPException(status_code=401, detail="Usuário não autenticado")
    return {
        "id": str(u.get("_id")),
        "role": u.get("role") or "operador",
        "scope_id": _norm_id(u.get("scope_id")),
    }

def _require_roles(allowed: List[str]):
    async def _dep(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") == "super_admin":
            return user
        if user.get("role") not in allowed:
            raise HTTPException(status_code=403, detail="Acesso negado")
        return user
    return _dep

async def _resolve_parent_chain_from_setor(setor: Dict[str, Any]) -> Dict[str, Optional[str]]:
    almox_id = _norm_id(setor.get("almoxarifado_id"))
    sub_id = _norm_id(setor.get("sub_almoxarifado_id"))
    if not sub_id and setor.get("sub_almoxarifado_ids"):
        try:
            sub_id = _norm_id((setor.get("sub_almoxarifado_ids") or [None])[0])
        except Exception:
            sub_id = None

    if not almox_id and sub_id:
        sub = await _find_one_by_id("sub_almoxarifados", sub_id)
        almox_id = _norm_id(sub.get("almoxarifado_id")) if sub else None

    central_id = None
    if almox_id:
        almox = await _find_one_by_id("almoxarifados", almox_id)
        central_id = _norm_id(almox.get("central_id")) if almox else None

    return {"central_id": central_id, "almoxarifado_id": almox_id, "sub_almoxarifado_id": sub_id}

async def _infer_setor_links(item: "SetorItem") -> Dict[str, Any]:
    almox_id = _norm_id(item.almoxarifado_id)
    sub_id = _norm_id(item.sub_almoxarifado_id)
    sub_ids = [str(s) for s in (item.sub_almoxarifado_ids or []) if s]
    parent_id = _norm_id(item.parent_id)

    if not almox_id and not sub_id and parent_id:
        sub = await _find_one_by_id("sub_almoxarifados", parent_id)
        if sub:
            sub_id = parent_id
            sub_ids = [parent_id]
        else:
            almox = await _find_one_by_id("almoxarifados", parent_id)
            if almox:
                almox_id = parent_id
            else:
                raise HTTPException(status_code=400, detail="Local pai não encontrado")

    if sub_ids and not sub_id:
        sub_id = sub_ids[0]

    resolved_subs: List[str] = []
    if sub_ids or sub_id:
        candidate_ids = sub_ids or ([sub_id] if sub_id else [])
        for sid in candidate_ids:
            sub = await _find_one_by_id("sub_almoxarifados", sid)
            if not sub:
                raise HTTPException(status_code=400, detail="Sub-Almoxarifado pai não encontrado")
            resolved_subs.append(_public_id(sub) or sid)
            sub_almox_id = _norm_id(sub.get("almoxarifado_id"))
            if not almox_id:
                almox_id = sub_almox_id
            elif almox_id != sub_almox_id:
                raise HTTPException(status_code=400, detail="Sub-Almoxarifados devem pertencer ao mesmo Almoxarifado")

    resolved_subs = list(dict.fromkeys([_norm_id(s) for s in resolved_subs if s]))
    sub_id = resolved_subs[0] if resolved_subs else None

    return {
        "almoxarifado_id": almox_id,
        "sub_almoxarifado_id": sub_id,
        "sub_almoxarifado_ids": resolved_subs or None,
        "parent_id": parent_id,
    }

@app.on_event("startup")
async def startup_db_client():
    env = (os.getenv("FLASK_ENV") or os.getenv("ENV") or "development").strip().lower()
    allow_mock_db = env != "production"
    db.is_mock = False

    try:
        db.client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db.db = db.client[MONGO_DB]
        await db.client.admin.command("ping")
        print(f"Conectado ao MongoDB Async: {MONGO_DB}")
    except Exception as exc:
        if db.client:
            db.client.close()
        db.client = None
        if not allow_mock_db:
            raise
        db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
        db.is_mock = True
        print(f"Falha ao conectar no MongoDB Async: {exc}")
        print("Usando banco mock em memória (mongomock)")

    await _ensure_super_admin()
    setor_nome = "ALMOX - Hospital Municipal de Angicos"
    try:
        existing = await db.db.setores.find_one({"nome": setor_nome})
        if existing:
            await db.db.setores.update_one(
                {"_id": existing["_id"]},
                {"$set": {"can_receive_inter_central": True}},
            )
    except Exception:
        pass

@app.on_event("shutdown")
async def shutdown_db_client():
    if db.client:
        db.client.close()

from werkzeug.security import generate_password_hash, check_password_hash

# --- Modelos Pydantic (Validação automática) ---
class UserItem(BaseModel):
    id: Optional[str] = None
    nome: str
    email: str
    cargo: Optional[str] = None
    role: str = "operador" # super_admin, admin_central, gerente_almox, resp_sub_almox, operador_setor
    scope_id: Optional[str] = None # ID do local que o usuário gerencia (Central, Almox, Setor)
    central_id: Optional[str] = None
    categoria_ids: Optional[List[str]] = None
    ativo: bool = True

class UserCreate(BaseModel):
    nome: str
    email: str
    password: str
    cargo: Optional[str] = None
    role: str = "operador"
    scope_id: Optional[str] = None
    central_id: Optional[str] = None
    categoria_ids: Optional[List[str]] = None

class UserUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    cargo: Optional[str] = None
    role: Optional[str] = None
    scope_id: Optional[str] = None
    central_id: Optional[str] = None
    categoria_ids: Optional[List[str]] = None
    ativo: Optional[bool] = None

class LoginRequest(BaseModel):
    email: str
    password: str

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

class MovimentacaoItem(BaseModel):
    id: str
    produto_nome: str
    tipo: str
    quantidade: float
    data: datetime
    origem: str
    destino: str
    usuario: Optional[str] = None
    nota_fiscal: Optional[str] = None

class MovimentacaoResponse(BaseModel):
    items: List[MovimentacaoItem]
    pagination: Dict[str, Any]

class ProdutoDetalhes(BaseModel):
    id: str
    nome: str
    codigo: str
    descricao: Optional[str] = None
    unidade: Optional[str] = None
    categoria: Optional[str] = None
    observacao: Optional[str] = None
    estoque_total: float
    estoque_locais: List[Dict[str, Any]]
    historico_recente: List[Dict[str, Any]]
    lotes: List[Dict[str, Any]] = []

async def _allowed_central_ids_for_user(user: Dict[str, Any]) -> List[Any]:
    role = (user.get("role") or "").strip()
    scope_id = _norm_id(user.get("scope_id"))
    if role not in ("admin_central", "gerente_almox", "resp_sub_almox"):
        return []
    central_id = await _compute_user_central_id(role, scope_id, None, strict=False)
    values: List[Any] = []
    for v in [central_id, scope_id]:
        if not v:
            continue
        values.append(v)
        if str(v).isdigit():
            values.append(int(str(v)))
        if ObjectId.is_valid(str(v)):
            values.append(ObjectId(str(v)))
    return list(dict.fromkeys(values))

class LoteUpdate(BaseModel):
    numero_lote: Optional[str] = None
    data_validade: Optional[datetime] = None
    quantidade_atual: Optional[float] = None
    preco_unitario: Optional[float] = None

@app.get("/api/produtos/search")
async def search_produtos(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    user: Dict[str, Any] = Depends(get_current_user),
):
    q = q.strip()
    role = user.get("role")
    ors: List[Dict[str, Any]] = [
        {"nome": {"$regex": q, "$options": "i"}},
        {"codigo": {"$regex": q, "$options": "i"}},
    ]
    if q.isdigit():
        ors.append({"id": int(q)})
        ors.append({"id": q})
    if ObjectId.is_valid(q):
        ors.append({"_id": ObjectId(q)})
    base_query: Dict[str, Any] = {"$or": ors}
    if role in ("admin_central", "gerente_almox", "resp_sub_almox"):
        allowed = await _allowed_central_ids_for_user(user)
        if not allowed:
            return []
        base_query = {"$and": [base_query, {"central_id": {"$in": allowed}}]}
    cursor = db.db.produtos.find(base_query, {"nome": 1, "codigo": 1, "unidade_medida": 1, "categoria": 1, "id": 1}).limit(limit)
    docs = await cursor.to_list(length=limit)
    results = []
    for p in docs:
        pid = _public_id(p) or str(p.get("_id"))
        results.append({
            "id": pid,
            "nome": p.get("nome"),
            "codigo": p.get("codigo"),
            "unidade": p.get("unidade_medida"),
            "categoria": p.get("categoria"),
        })
    return results

# --- Rota de Detalhes do Produto ---
@app.get("/api/produtos/{produto_id}", response_model=ProdutoDetalhes)
async def get_produto_detalhes(produto_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    # 1. Buscar Produto
    q = {}
    if ObjectId.is_valid(produto_id):
        q = {"_id": ObjectId(produto_id)}
    elif produto_id.isdigit():
        q = {"id": int(produto_id)}
    else:
        # Suportar busca por ID string (legado/importado)
        q = {"$or": [{"id": produto_id}, {"codigo": produto_id}]}

    role = user.get("role")
    if role in ("admin_central", "gerente_almox", "resp_sub_almox"):
        allowed = await _allowed_central_ids_for_user(user)
        if not allowed:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        q = {"$and": [q, {"central_id": {"$in": allowed}}]}
        
    produto = await db.db.produtos.find_one(q)
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
        
    pid = produto.get("id") if produto.get("id") else str(produto.get("_id"))
    
    # Resolver Categoria (se houver ID)
    cat_nome = "Sem Categoria"
    if produto.get("categoria_id"):
        cat_q = {}
        cid = produto.get("categoria_id")
        if ObjectId.is_valid(cid): cat_q = {"_id": ObjectId(cid)}
        else: cat_q = {"id": cid}
        
        cat = await db.db.categorias.find_one(cat_q)
        if cat: cat_nome = cat.get("nome")

    # 2. Buscar Estoque por Local
    estoque_cursor = db.db.estoques.find({"produto_id": pid})
    estoques = await estoque_cursor.to_list(length=100)
    
    total = 0.0
    locais = []
    
    # Prepara IDs para resolver nomes dos locais
    loc_ids = {"centrais": set(), "almoxarifados": set(), "setores": set(), "sub_almoxarifados": set()}
    for e in estoques:
        if e.get("sub_almoxarifado_id") or e.get("local_tipo") == "sub_almoxarifado":
            loc_ids["sub_almoxarifados"].add(e.get("sub_almoxarifado_id") or e.get("local_id"))
        elif e.get("setor_id") or e.get("local_tipo") == "setor":
            loc_ids["setores"].add(e.get("setor_id") or e.get("local_id"))
        elif e.get("almoxarifado_id") or e.get("local_tipo") == "almoxarifado":
            loc_ids["almoxarifados"].add(e.get("almoxarifado_id") or e.get("local_id"))
        elif e.get("central_id") or e.get("local_tipo") == "central":
            loc_ids["centrais"].add(e.get("central_id") or e.get("local_id"))
        
    # Helper fetch_map_simple deve estar no escopo global ou redefinido
    async def fetch_map_simple(coll, ids):
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

    loc_maps = {
        "centrais": await fetch_map_simple("centrais", list(loc_ids["centrais"])),
        "almoxarifados": await fetch_map_simple("almoxarifados", list(loc_ids["almoxarifados"])),
        "setores": await fetch_map_simple("setores", list(loc_ids["setores"])),
        "sub_almoxarifados": await fetch_map_simple("sub_almoxarifados", list(loc_ids["sub_almoxarifados"])),
    }
    
    for e in estoques:
        qtd = float(e.get("quantidade_atual", 0) or e.get("quantidade", 0))
        disp = float(e.get("quantidade_disponivel", qtd) or 0)
        total += qtd
        
        l_nome = "Desconhecido"
        l_tipo = e.get("local_tipo", "outro")
        l_id = e.get("local_id")
        
        if e.get("sub_almoxarifado_id") or l_tipo == "sub_almoxarifado":
            sid = e.get("sub_almoxarifado_id") or e.get("local_id")
            l = loc_maps["sub_almoxarifados"].get(str(sid), {})
            l_nome = l.get("nome", "Sub-Almoxarifado")
            l_tipo = "sub_almoxarifado"
            l_id = sid
        elif e.get("setor_id") or l_tipo == "setor":
            sid = e.get("setor_id") or e.get("local_id")
            l = loc_maps["setores"].get(str(sid), {})
            l_nome = l.get("nome", "Setor")
            l_tipo = "setor"
            l_id = sid
        elif e.get("almoxarifado_id") or l_tipo == "almoxarifado":
            aid = e.get("almoxarifado_id") or e.get("local_id")
            l = loc_maps["almoxarifados"].get(str(aid), {})
            l_nome = l.get("nome", "Almoxarifado")
            l_tipo = "almoxarifado"
            l_id = aid
            
        locais.append({
            "local_id": str(l_id) if l_id is not None else None,
            "local_nome": l_nome,
            "local_tipo": l_tipo,
            "quantidade": qtd,
            "quantidade_disponivel": disp,
            "updated_at": _dt_to_utc_iso(e.get("updated_at") or e.get("created_at") or _now_utc())
        })
        
    # 3. Buscar Histórico Recente
    hist_cursor = db.db.movimentacoes.find({"produto_id": pid}).sort("data_movimentacao", -1).limit(5)
    historico = await hist_cursor.to_list(length=5)
    hist_formatado = []
    
    for h in historico:
        dt = h.get("data_movimentacao") or h.get("created_at") or _now_utc()
        hist_formatado.append({
            "data": _dt_to_utc_iso(dt),
            "tipo": h.get("tipo"),
            "quantidade": float(h.get("quantidade", 0)),
            "origem": h.get("origem_nome", "-"),
            "destino": h.get("destino_nome", "-")
        })

    # 4. Buscar Lotes (se houver coleção de lotes)
    lotes_list = []
    try:
        lotes_cursor = db.db.lotes.find({"produto_id": pid}).sort("updated_at", -1).limit(50)
        lotes_docs = await lotes_cursor.to_list(length=20)
        for l in lotes_docs:
            validade = l.get("data_validade")
            lotes_list.append({
                "id": _public_id(l) or str(l.get("_id")),
                "numero": l.get("numero_lote"),
                "validade": _dt_to_utc_iso(validade),
                "quantidade": l.get("quantidade_atual"),
                "preco_unitario": l.get("preco_unitario"),
                "status": "Vencido" if _is_expired(validade) else "Ok"
            })
    except Exception:
        pass # Coleção pode não existir ainda

    return {
        "id": str(produto.get("_id")),
        "nome": produto.get("nome"),
        "codigo": produto.get("codigo"),
        "descricao": produto.get("descricao"),
        "unidade": produto.get("unidade_medida"),
        "categoria": cat_nome,
        "observacao": produto.get("observacoes"),
        "estoque_total": total,
        "estoque_locais": locais,
        "historico_recente": hist_formatado,
        "lotes": lotes_list
    }

@app.put("/api/lotes/{lote_id}")
async def update_lote(lote_id: str, item: LoteUpdate, user: Dict[str, Any] = Depends(_require_roles(["super_admin", "admin_central", "gerente_almox", "resp_sub_almox"]))):
    q = _build_id_query(lote_id)
    existing = await db.db.lotes.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Lote não encontrado")

    update_data: Dict[str, Any] = {}
    changed = False
    if item.numero_lote is not None:
        numero = (item.numero_lote or "").strip()
        if not numero:
            raise HTTPException(status_code=400, detail="Número do lote inválido")
        update_data["numero_lote"] = numero
        changed = True
    if item.data_validade is not None:
        update_data["data_validade"] = item.data_validade
        changed = True
    if item.quantidade_atual is not None:
        try:
            qv = float(item.quantidade_atual)
        except Exception:
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        if qv < 0:
            raise HTTPException(status_code=400, detail="Quantidade deve ser maior ou igual a zero")
        update_data["quantidade_atual"] = qv
        changed = True
    if item.preco_unitario is not None:
        try:
            pv = float(item.preco_unitario)
        except Exception:
            raise HTTPException(status_code=400, detail="Preço inválido")
        if pv < 0:
            raise HTTPException(status_code=400, detail="Preço deve ser maior ou igual a zero")
        update_data["preco_unitario"] = pv
        changed = True

    if not changed:
        raise HTTPException(status_code=400, detail="Nada para atualizar")

    update_data["updated_at"] = _now_utc()

    if not update_data:
        raise HTTPException(status_code=400, detail="Nada para atualizar")

    try:
        res = await db.db.lotes.update_one(q, {"$set": update_data})
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Número do lote já existe para este produto")
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lote não encontrado")
    return {"status": "success", "message": "Lote atualizado"}

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(user: Dict[str, Any] = Depends(get_current_user)):
    try:
        if db.db is None:
            return {
                "total_produtos": 0,
                "baixo_estoque": 0,
                "locais_ativos": 0,
                "status_sistema": "Offline",
            }

        role = user.get("role")
        scope_id = user.get("scope_id")

        if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
            raise HTTPException(status_code=403, detail="Acesso negado")

        def _id_values(ids: List[Any]) -> List[Any]:
            out: List[Any] = []
            for raw in ids:
                if raw is None:
                    continue
                s = str(raw)
                out.append(s)
                if s.isdigit():
                    out.append(int(s))
                if ObjectId.is_valid(s):
                    out.append(ObjectId(s))
            return list(dict.fromkeys(out))

        allowed_central = await _allowed_central_ids_for_user(user) if role != "super_admin" else []

        allowed_almox: List[Any] = []
        allowed_sub: List[Any] = []

        if role == "super_admin":
            pass
        elif role == "admin_central" and scope_id:
            if not allowed_central:
                return {"total_produtos": 0, "baixo_estoque": 0, "locais_ativos": 0, "status_sistema": "Online"}
            almox_docs = await db.db.almoxarifados.find({"central_id": {"$in": allowed_central}}, {"id": 1, "_id": 1}).to_list(length=5000)
            allowed_almox = [_public_id(a) or str(a.get("_id")) for a in almox_docs if a]
            if allowed_almox:
                subs = await db.db.sub_almoxarifados.find({"almoxarifado_id": {"$in": _id_values(allowed_almox)}}, {"id": 1, "_id": 1}).to_list(length=10000)
                allowed_sub = [_public_id(s) or str(s.get("_id")) for s in subs if s]
        elif role == "gerente_almox" and scope_id:
            allowed_almox = [scope_id]
            subs = await db.db.sub_almoxarifados.find({"almoxarifado_id": {"$in": _id_values([scope_id])}}, {"id": 1, "_id": 1}).to_list(length=10000)
            allowed_sub = [_public_id(s) or str(s.get("_id")) for s in subs if s]
        elif role == "resp_sub_almox" and scope_id:
            allowed_sub = [scope_id]
        else:
            return {"total_produtos": 0, "baixo_estoque": 0, "locais_ativos": 0, "status_sistema": "Online"}

        total_prod_query: Dict[str, Any] = {}
        if role != "super_admin":
            if not allowed_central:
                return {"total_produtos": 0, "baixo_estoque": 0, "locais_ativos": 0, "status_sistema": "Online"}
            total_prod_query = {"central_id": {"$in": allowed_central}}
        total_produtos = await db.db.produtos.count_documents(total_prod_query)

        estoque_ors: List[Dict[str, Any]] = []
        if role == "super_admin":
            estoque_query = {"quantidade_disponivel": {"$lt": 10}}
        else:
            almox_vals = _id_values(allowed_almox)
            sub_vals = _id_values(allowed_sub)
            cent_vals = _id_values(allowed_central)
            if almox_vals:
                estoque_ors += [{"almoxarifado_id": {"$in": almox_vals}}, {"local_tipo": "almoxarifado", "local_id": {"$in": almox_vals}}]
            if sub_vals:
                estoque_ors += [{"sub_almoxarifado_id": {"$in": sub_vals}}, {"local_tipo": "sub_almoxarifado", "local_id": {"$in": sub_vals}}]
            if cent_vals:
                estoque_ors += [{"central_id": {"$in": cent_vals}}, {"local_tipo": "central", "local_id": {"$in": cent_vals}}]
            if not estoque_ors:
                return {"total_produtos": total_produtos, "baixo_estoque": 0, "locais_ativos": 0, "status_sistema": "Online"}
            estoque_query = {"$and": [{"quantidade_disponivel": {"$lt": 10}}, {"$or": estoque_ors}]}
        baixo_estoque = await db.db.estoques.count_documents(estoque_query)

        if role == "super_admin":
            locais_count = await db.db.almoxarifados.count_documents({}) + await db.db.setores.count_documents({})
        else:
            almox_vals = _id_values(allowed_almox)
            sub_vals = _id_values(allowed_sub)
            almox_count = await db.db.almoxarifados.count_documents({"$or": [{"id": {"$in": almox_vals}}, {"_id": {"$in": [v for v in almox_vals if isinstance(v, ObjectId)]}}]}) if almox_vals else 0
            setor_q_ors: List[Dict[str, Any]] = []
            if almox_vals:
                setor_q_ors.append({"almoxarifado_id": {"$in": almox_vals}})
            if sub_vals:
                setor_q_ors += [{"sub_almoxarifado_id": {"$in": sub_vals}}, {"sub_almoxarifado_ids": {"$in": sub_vals}}]
            setores_count = await db.db.setores.count_documents({"$or": setor_q_ors}) if setor_q_ors else 0
            locais_count = int(almox_count) + int(setores_count)

        return {
            "total_produtos": total_produtos,
            "baixo_estoque": baixo_estoque,
            "locais_ativos": locais_count,
            "status_sistema": "Online",
        }
    except HTTPException:
        raise
    except Exception:
        return {
            "total_produtos": 0,
            "baixo_estoque": 0,
            "locais_ativos": 0,
            "status_sistema": "Offline",
        }

# --- Rota de Movimentações ---
@app.get("/api/movimentacoes", response_model=MovimentacaoResponse)
async def get_movimentacoes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    tipo: Optional[str] = None,
    produto: Optional[str] = None
):
    skip = (page - 1) * per_page
    query = {}
    
    if tipo:
        query["tipo"] = tipo
        
    if produto:
         # Busca produto primeiro para filtrar por ID
        prod_query = {"$or": [
            {"nome": {"$regex": produto, "$options": "i"}},
            {"codigo": {"$regex": produto, "$options": "i"}}
        ]}
        if ObjectId.is_valid(produto):
            prod_query["$or"].append({"_id": ObjectId(produto)})
            
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

    total = await db.db.movimentacoes.count_documents(query)
    # Ordenar por data decrescente (mais recente primeiro)
    cursor = db.db.movimentacoes.find(query).sort("data_movimentacao", -1).skip(skip).limit(per_page)
    movs = await cursor.to_list(length=per_page)
    
    # Resolver Nomes de Produtos (Bulk)
    prod_ids = set()
    for m in movs:
        if m.get("produto_id"): prod_ids.add(m.get("produto_id"))
        
    # Helper fetch_map já definido no escopo global ou reutilizar lógica
    async def fetch_map_simple(coll, ids):
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

    prod_map = await fetch_map_simple("produtos", list(prod_ids))
    
    results = []
    for m in movs:
        pid = str(m.get("produto_id"))
        p = prod_map.get(pid, {})
        
        # Data
        dt = m.get("data_movimentacao") or m.get("created_at") or _now_utc()
        
        results.append({
            "id": str(m.get("_id")),
            "produto_nome": p.get("nome", "Produto Removido"),
            "tipo": m.get("tipo", "outros"),
            "quantidade": float(m.get("quantidade", 0)),
            "data": _dt_to_utc_iso(dt),
            "origem": m.get("origem_nome", "-"),
            "destino": m.get("destino_nome", "-"),
            "usuario": m.get("usuario_responsavel"),
            "nota_fiscal": m.get("nota_fiscal")
        })
        
    return {
        "items": results,
        "pagination": {
            "page": page,
            "total": total,
            "pages": math.ceil(total / per_page)
        }
    }

@app.get("/api/movimentacoes/setor/{setor_id}", response_model=MovimentacaoResponse)
async def get_movimentacoes_por_setor(
    setor_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    produto_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user),
):
    setor = await _find_one_by_id("setores", setor_id)
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    sid = _public_id(setor) or setor_id

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "operador_setor":
        if not scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
        scope_setor = await _find_one_by_id("setores", scope_id)
        scope_sid = _public_id(scope_setor) if scope_setor else None
        if _norm_id(scope_sid or scope_id) != _norm_id(sid):
            raise HTTPException(status_code=403, detail="Acesso negado")

    sid_values: List[Any] = [sid]
    if str(sid).isdigit():
        sid_values.append(int(str(sid)))

    setor_nome = (setor.get("nome") or "").strip()
    setor_ors: List[Dict[str, Any]] = [
        {"local_destino_tipo": "setor", "local_destino_id": {"$in": sid_values}},
        {"local_origem_tipo": "setor", "local_origem_id": {"$in": sid_values}},
        {"local_tipo": "setor", "local_id": {"$in": sid_values}},
    ]
    if setor_nome:
        setor_ors += [{"destino_nome": setor_nome}, {"origem_nome": setor_nome}]

    query: Dict[str, Any] = {"$or": setor_ors}

    if produto_id:
        prod_query = {"$or": [{"_id": produto_id}, {"id": produto_id}, {"codigo": produto_id}]}
        if ObjectId.is_valid(produto_id):
            prod_query["$or"].append({"_id": ObjectId(produto_id)})
        elif produto_id.isdigit():
            prod_query["$or"].append({"id": int(produto_id)})
        produto = await db.db.produtos.find_one(prod_query, {"_id": 1, "id": 1})
        if not produto:
            return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}
        p_ids: List[Any] = []
        p_ids.append(produto.get("_id"))
        p_ids.append(str(produto.get("_id")))
        if produto.get("id") is not None:
            p_ids.append(produto.get("id"))
            p_ids.append(str(produto.get("id")))
        query = {"$and": [query, {"produto_id": {"$in": p_ids}}]}

    skip = (page - 1) * per_page
    total = await db.db.movimentacoes.count_documents(query)
    cursor = db.db.movimentacoes.find(query).sort("data_movimentacao", -1).skip(skip).limit(per_page)
    movs = await cursor.to_list(length=per_page)

    prod_ids = set()
    for m in movs:
        if m.get("produto_id") is not None:
            prod_ids.add(m.get("produto_id"))

    async def fetch_map_simple(coll, ids):
        if not ids:
            return {}
        q_ids = []
        for i in ids:
            if ObjectId.is_valid(str(i)):
                q_ids.append(ObjectId(str(i)))
            q_ids.append(i)
            if str(i).isdigit():
                q_ids.append(int(i))
        docs = await db.db[coll].find({"$or": [{"_id": {"$in": q_ids}}, {"id": {"$in": q_ids}}]}).to_list(length=len(ids))
        mapping = {}
        for d in docs:
            mapping[str(d.get("_id"))] = d
            if d.get("id") is not None:
                mapping[str(d.get("id"))] = d
        return mapping

    prod_map = await fetch_map_simple("produtos", list(prod_ids))

    results = []
    for m in movs:
        pid = str(m.get("produto_id"))
        p = prod_map.get(pid, {})
        dt = m.get("data_movimentacao") or m.get("created_at") or _now_utc()
        results.append({
            "id": str(m.get("_id")),
            "produto_nome": p.get("nome", "Produto Removido"),
            "tipo": m.get("tipo", "outros"),
            "quantidade": float(m.get("quantidade", 0)),
            "data": _dt_to_utc_iso(dt),
            "origem": m.get("origem_nome", "-"),
            "destino": m.get("destino_nome", "-"),
            "usuario": m.get("usuario_responsavel"),
            "nota_fiscal": m.get("nota_fiscal"),
        })

    return {"items": results, "pagination": {"page": page, "total": total, "pages": math.ceil(total / per_page)}}

# --- Rota Otimizada de Estoque (Exemplo de Migração) ---
@app.get("/api/estoque/hierarquia", response_model=EstoqueResponse)
async def get_estoque_hierarquia(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    produto: Optional[str] = None,
    tipo: Optional[str] = None,
    local: Optional[str] = None,
    status: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Versão FastAPI assíncrona da rota de estoque.
    Muito mais rápida pois não bloqueia o servidor enquanto busca no banco.
    """
    skip = (page - 1) * per_page

    if db.db is None:
        return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}
    
    role = user.get("role")
    scope_id = user.get("scope_id")

    if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if role != "super_admin" and not scope_id:
        return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}

    def _id_values(ids: List[Any]) -> List[Any]:
        out: List[Any] = []
        for raw in ids:
            if raw is None:
                continue
            s = str(raw)
            out.append(s)
            if s.isdigit():
                out.append(int(s))
            if ObjectId.is_valid(s):
                out.append(ObjectId(s))
        return list(dict.fromkeys(out))

    allowed_central = await _allowed_central_ids_for_user(user) if role != "super_admin" else []

    allowed_almox: List[Any] = []
    allowed_sub: List[Any] = []

    if role == "super_admin":
        pass
    elif role == "resp_sub_almox" and scope_id:
        allowed_sub = [scope_id]
    elif role == "gerente_almox" and scope_id:
        allowed_almox = [scope_id]
        subs = await db.db.sub_almoxarifados.find({"almoxarifado_id": {"$in": _id_values([scope_id])}}, {"id": 1, "_id": 1}).to_list(length=10000)
        allowed_sub = [_public_id(s) or str(s.get("_id")) for s in subs if s]
    elif role == "admin_central" and scope_id:
        if not allowed_central:
            return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}
        almox_docs = await db.db.almoxarifados.find({"central_id": {"$in": allowed_central}}, {"id": 1, "_id": 1}).to_list(length=5000)
        allowed_almox = [_public_id(a) or str(a.get("_id")) for a in almox_docs if a]
        if allowed_almox:
            subs = await db.db.sub_almoxarifados.find({"almoxarifado_id": {"$in": _id_values(allowed_almox)}}, {"id": 1, "_id": 1}).to_list(length=10000)
            allowed_sub = [_public_id(s) or str(s.get("_id")) for s in subs if s]
    else:
        return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}

    base_query: Dict[str, Any] = {}
    if produto:
        # Busca texto ou ID
        prod_query: Dict[str, Any] = {"$or": [
            {"nome": {"$regex": produto, "$options": "i"}},
            {"codigo": {"$regex": produto, "$options": "i"}}
        ]}
        # Tenta ObjectId
        if ObjectId.is_valid(produto):
            prod_query["$or"].append({"_id": ObjectId(produto)})

        # Buscar IDs de produtos primeiro (Async)
        if role != "super_admin":
            if not allowed_central:
                return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}
            prod_query = {"$and": [prod_query, {"central_id": {"$in": allowed_central}}]}
        prods = await db.db.produtos.find(prod_query, {"_id": 1, "id": 1}).to_list(length=100)
        p_ids = []
        for p in prods:
            p_ids.append(p.get("_id"))
            p_ids.append(str(p.get("_id")))
            if p.get("id"): p_ids.append(p.get("id"))

        if p_ids:
            base_query["produto_id"] = {"$in": p_ids}
        else:
            return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}

    # Filtros de Local
    if tipo:
        norm_tipo = tipo.lower().replace("-", "").replace("_", "")
        if "setor" in norm_tipo: base_query["setor_id"] = {"$exists": True}
        elif "almox" in norm_tipo: base_query["almoxarifado_id"] = {"$exists": True}
        elif "central" in norm_tipo: base_query["central_id"] = {"$exists": True}

    if local:
        base_query["$or"] = [
            {"local_id": local},
            {"almoxarifado_id": local},
            {"setor_id": local}
        ]

    query: Dict[str, Any] = base_query
    if role != "super_admin":
        scope_ors: List[Dict[str, Any]] = []
        almox_vals = _id_values(allowed_almox)
        sub_vals = _id_values(allowed_sub)
        cent_vals = _id_values(allowed_central)
        if almox_vals:
            scope_ors += [{"almoxarifado_id": {"$in": almox_vals}}, {"local_tipo": "almoxarifado", "local_id": {"$in": almox_vals}}]
        if sub_vals:
            scope_ors += [{"sub_almoxarifado_id": {"$in": sub_vals}}, {"local_tipo": "sub_almoxarifado", "local_id": {"$in": sub_vals}}]
        if cent_vals:
            scope_ors += [{"central_id": {"$in": cent_vals}}, {"local_tipo": "central", "local_id": {"$in": cent_vals}}]
        if not scope_ors:
            return {"items": [], "pagination": {"total": 0, "page": page, "pages": 1}}
        scope_filter: Dict[str, Any] = {"$or": scope_ors}
        query = {"$and": [base_query, scope_filter]} if base_query else scope_filter

    # Contagem total (Async)
    total = await db.db.estoques.count_documents(query)
    
    # Busca Principal (Async e não bloqueante)
    cursor = db.db.estoques.find(query).skip(skip).limit(per_page)
    estoques = await cursor.to_list(length=per_page)

    # Bulk Resolve (Carregamento em lote Async)
    prod_ids = set()
    loc_ids = {"centrais": set(), "almoxarifados": set(), "setores": set(), "sub_almoxarifados": set()}

    for e in estoques:
        if e.get("produto_id"): prod_ids.add(e.get("produto_id"))
        # Identificar coleção do local
        if e.get("setor_id"): loc_ids["setores"].add(e.get("setor_id"))
        elif e.get("sub_almoxarifado_id"): loc_ids["sub_almoxarifados"].add(e.get("sub_almoxarifado_id"))
        elif e.get("almoxarifado_id"): loc_ids["almoxarifados"].add(e.get("almoxarifado_id"))
        elif e.get("central_id"): loc_ids["centrais"].add(e.get("central_id"))
        elif (e.get("local_tipo") or "").strip().lower() == "sub_almoxarifado" and e.get("local_id"):
            loc_ids["sub_almoxarifados"].add(e.get("local_id"))

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
        "setores": await fetch_map("setores", list(loc_ids["setores"])),
        "sub_almoxarifados": await fetch_map("sub_almoxarifados", list(loc_ids["sub_almoxarifados"]))
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
        elif e.get("sub_almoxarifado_id") or (l_tipo or "").strip().lower() == "sub_almoxarifado":
            sid = e.get("sub_almoxarifado_id") or e.get("local_id")
            l = loc_maps["sub_almoxarifados"].get(str(sid), {}) if sid is not None else {}
            l_nome = l.get("nome", "Sub-Almoxarifado")
            l_tipo = "sub_almoxarifado"
        elif e.get("almoxarifado_id"):
            l = loc_maps["almoxarifados"].get(str(e.get("almoxarifado_id")), {})
            l_nome = l.get("nome", "Almoxarifado")
            l_tipo = "almoxarifado"
        elif e.get("central_id"):
            l = loc_maps["centrais"].get(str(e.get("central_id")), {})
            l_nome = l.get("nome", "Central")
            l_tipo = "central"
        
        qtd_raw = e.get("quantidade_atual")
        if qtd_raw is None:
            qtd_raw = e.get("quantidade")
        try:
            qtd = float(qtd_raw or 0)
        except (TypeError, ValueError):
            qtd = 0.0

        disp_raw = e.get("quantidade_disponivel")
        try:
            disp = float(qtd if disp_raw is None else (disp_raw or 0))
        except (TypeError, ValueError):
            disp = qtd

        inicial_raw = e.get("quantidade_inicial")
        try:
            inicial = float(qtd if inicial_raw is None else (inicial_raw or 0))
        except (TypeError, ValueError):
            inicial = qtd
        
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

@app.get("/api/estoque/local")
async def get_estoque_por_local(
    local_tipo: str = Query(..., min_length=1),
    local_id: str = Query(..., min_length=1),
    user: Dict[str, Any] = Depends(get_current_user),
):
    lt = (local_tipo or "").strip().lower()
    if lt not in ("almoxarifado", "sub_almoxarifado"):
        raise HTTPException(status_code=400, detail="Tipo de local inválido")

    coll = "almoxarifados" if lt == "almoxarifado" else "sub_almoxarifados"
    local_doc = await db.db[coll].find_one(_build_id_query(local_id))
    if not local_doc:
        raise HTTPException(status_code=404, detail="Local não encontrado")
    local_id_out = _public_id(local_doc) or local_id
    local_nome = local_doc.get("nome") or "Local"

    role = user.get("role")
    scope_id = user.get("scope_id")

    if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if role == "resp_sub_almox" and scope_id:
        if lt != "sub_almoxarifado":
            raise HTTPException(status_code=403, detail="Acesso negado")
        if _norm_id(_public_id(local_doc) or str(local_doc.get("_id")) or local_doc.get("id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    if role == "gerente_almox" and scope_id:
        if lt == "almoxarifado":
            if _norm_id(_public_id(local_doc) or str(local_doc.get("_id")) or local_doc.get("id")) != scope_id:
                raise HTTPException(status_code=403, detail="Acesso negado")
        else:
            parent_almox = _norm_id(local_doc.get("almoxarifado_id"))
            if parent_almox != scope_id:
                raise HTTPException(status_code=403, detail="Acesso negado")

    if role == "admin_central" and scope_id:
        if lt == "almoxarifado":
            if _norm_id(local_doc.get("central_id")) != scope_id:
                raise HTTPException(status_code=403, detail="Acesso negado")
        else:
            parent_almox = await _find_one_by_id("almoxarifados", str(local_doc.get("almoxarifado_id") or ""))
            if not parent_almox or _norm_id(parent_almox.get("central_id")) != scope_id:
                raise HTTPException(status_code=403, detail="Acesso negado")

    ids: List[Any] = [local_id_out]
    if str(local_id_out).isdigit():
        ids.append(int(str(local_id_out)))

    if lt == "almoxarifado":
        query = {
            "$or": [
                {"almoxarifado_id": {"$in": ids}},
                {"local_tipo": "almoxarifado", "local_id": {"$in": ids}},
                {"local_id": {"$in": ids}, "$or": [{"local_tipo": {"$exists": False}}, {"local_tipo": "almoxarifado"}]},
            ]
        }
    else:
        query = {
            "$or": [
                {"sub_almoxarifado_id": {"$in": ids}},
                {"local_tipo": "sub_almoxarifado", "local_id": {"$in": ids}},
                {"local_id": {"$in": ids}, "$or": [{"local_tipo": {"$exists": False}}, {"local_tipo": "sub_almoxarifado"}]},
            ]
        }

    docs = await db.db.estoques.find(query).to_list(length=20000)
    prod_ids = list({str(d.get("produto_id")) for d in docs if d.get("produto_id") is not None})
    prod_oid = [ObjectId(x) for x in prod_ids if ObjectId.is_valid(x)]
    prod_int = [int(x) for x in prod_ids if str(x).isdigit()]
    prod_docs = await db.db.produtos.find(
        {"$or": [{"_id": {"$in": prod_oid}}, {"id": {"$in": prod_ids + prod_int}}]},
        {"nome": 1, "codigo": 1, "id": 1}
    ).to_list(length=5000)
    prod_lookup: Dict[str, Dict[str, Any]] = {}
    for p in prod_docs:
        pid = _public_id(p) or str(p.get("_id"))
        prod_lookup[str(pid)] = p
        prod_lookup[str(p.get("_id"))] = p
        if p.get("id") is not None:
            prod_lookup[str(p.get("id"))] = p

    grouped: Dict[str, float] = {}
    for e in docs:
        pid = _norm_id(e.get("produto_id"))
        if not pid:
            continue
        disp = float(e.get("quantidade_disponivel", e.get("quantidade", 0)) or 0)
        grouped[pid] = float(grouped.get(pid, 0.0)) + disp

    items = []
    for pid, disp in grouped.items():
        p = prod_lookup.get(pid, {})
        items.append({
            "produto_id": pid,
            "produto_nome": p.get("nome") or "-",
            "produto_codigo": p.get("codigo") or "-",
            "quantidade_disponivel": float(disp),
        })
    items.sort(key=lambda x: (x.get("produto_nome") or "").lower())
    return {"local_tipo": lt, "local_id": str(local_id_out), "local_nome": local_nome, "items": items}

@app.get("/api/estoque/origens")
async def get_estoque_por_origens(
    produto_ids: str = Query("", description="IDs separados por vírgula"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    role = user.get("role")
    scope_id = user.get("scope_id")
    if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    pids_in = [p.strip() for p in (produto_ids or "").split(",") if p.strip()]
    if not pids_in:
        return {"items": []}

    pid_values: List[Any] = []
    for pid in pids_in:
        pid_values.append(pid)
        if pid.isdigit():
            pid_values.append(int(pid))
        if ObjectId.is_valid(pid):
            pid_values.append(ObjectId(pid))

    allowed_almox: set[str] = set()
    allowed_sub: set[str] = set()

    if role == "super_admin":
        pass
    elif role == "resp_sub_almox" and scope_id:
        allowed_sub = {scope_id}
    elif role == "gerente_almox" and scope_id:
        allowed_almox = {scope_id}
        sid_values: List[Any] = [scope_id]
        if str(scope_id).isdigit():
            sid_values.append(int(str(scope_id)))
        subs = await db.db.sub_almoxarifados.find({"almoxarifado_id": {"$in": sid_values}}, {"id": 1, "_id": 1}).to_list(length=5000)
        for s in subs:
            allowed_sub.add(_public_id(s) or str(s.get("_id")))
    elif role == "admin_central" and scope_id:
        cids: List[Any] = [scope_id]
        if str(scope_id).isdigit():
            cids.append(int(str(scope_id)))
        alms = await db.db.almoxarifados.find({"central_id": {"$in": cids}}, {"id": 1, "_id": 1}).to_list(length=5000)
        for a in alms:
            allowed_almox.add(_public_id(a) or str(a.get("_id")))
        if allowed_almox:
            a_values: List[Any] = list(allowed_almox)
            a_values += [int(x) for x in allowed_almox if str(x).isdigit()]
            subs = await db.db.sub_almoxarifados.find({"almoxarifado_id": {"$in": a_values}}, {"id": 1, "_id": 1}).to_list(length=10000)
            for s in subs:
                allowed_sub.add(_public_id(s) or str(s.get("_id")))
    else:
        raise HTTPException(status_code=403, detail="Acesso negado")

    almox_values: List[Any] = list(allowed_almox)
    almox_values += [int(x) for x in allowed_almox if str(x).isdigit()]
    sub_values: List[Any] = list(allowed_sub)
    sub_values += [int(x) for x in allowed_sub if str(x).isdigit()]

    base_q: Dict[str, Any] = {"produto_id": {"$in": pid_values}}
    if role == "super_admin":
        query = {
            **base_q,
            "$or": [
                {"local_tipo": "almoxarifado"},
                {"local_tipo": "sub_almoxarifado"},
                {"almoxarifado_id": {"$exists": True}},
                {"sub_almoxarifado_id": {"$exists": True}},
            ],
        }
    else:
        ors: List[Dict[str, Any]] = []
        if almox_values:
            ors += [
                {"local_tipo": "almoxarifado", "local_id": {"$in": almox_values}},
                {"almoxarifado_id": {"$in": almox_values}},
                {"local_id": {"$in": almox_values}, "$or": [{"local_tipo": {"$exists": False}}, {"local_tipo": "almoxarifado"}]},
            ]
        if sub_values:
            ors += [
                {"local_tipo": "sub_almoxarifado", "local_id": {"$in": sub_values}},
                {"sub_almoxarifado_id": {"$in": sub_values}},
                {"local_id": {"$in": sub_values}, "$or": [{"local_tipo": {"$exists": False}}, {"local_tipo": "sub_almoxarifado"}]},
            ]
        query = {**base_q, "$or": ors} if ors else {**base_q, "_id": {"$exists": False}}

    docs = await db.db.estoques.find(query).to_list(length=50000)

    grouped: Dict[str, Dict[str, float]] = {}
    for e in docs:
        disp = float(e.get("quantidade_disponivel", e.get("quantidade", 0)) or 0)
        if disp <= 0:
            continue
        pid = _norm_id(e.get("produto_id"))
        if not pid:
            continue
        origem_tipo = None
        origem_id = None
        if e.get("local_tipo") == "sub_almoxarifado" or e.get("sub_almoxarifado_id"):
            origem_tipo = "sub_almoxarifado"
            origem_id = _norm_id(e.get("sub_almoxarifado_id") or e.get("local_id"))
        elif e.get("local_tipo") == "almoxarifado" or e.get("almoxarifado_id"):
            origem_tipo = "almoxarifado"
            origem_id = _norm_id(e.get("almoxarifado_id") or e.get("local_id"))
        if not origem_tipo or not origem_id:
            continue
        k = f"{origem_tipo}:{origem_id}"
        by_origin = grouped.get(pid) or {}
        by_origin[k] = float(by_origin.get(k, 0.0)) + disp
        grouped[pid] = by_origin

    almox_ids_needed = set()
    sub_ids_needed = set()
    for pid, by_origin in grouped.items():
        for k in by_origin.keys():
            ot, oid = k.split(":", 1)
            if ot == "almoxarifado":
                almox_ids_needed.add(oid)
            else:
                sub_ids_needed.add(oid)

    def _id_values_set(ids: set[str]) -> List[Any]:
        vals: List[Any] = []
        for i in ids:
            vals.append(i)
            if str(i).isdigit():
                vals.append(int(str(i)))
            if ObjectId.is_valid(str(i)):
                vals.append(ObjectId(str(i)))
        return vals

    almox_docs = await db.db.almoxarifados.find({"$or": [{"_id": {"$in": _id_values_set(almox_ids_needed)}}, {"id": {"$in": _id_values_set(almox_ids_needed)}}]}, {"nome": 1, "id": 1}).to_list(length=5000) if almox_ids_needed else []
    sub_docs = await db.db.sub_almoxarifados.find({"$or": [{"_id": {"$in": _id_values_set(sub_ids_needed)}}, {"id": {"$in": _id_values_set(sub_ids_needed)}}]}, {"nome": 1, "id": 1}).to_list(length=10000) if sub_ids_needed else []

    almox_name: Dict[str, str] = {}
    for a in almox_docs:
        aid = _public_id(a) or str(a.get("_id"))
        almox_name[str(aid)] = a.get("nome") or str(aid)
        almox_name[str(a.get("_id"))] = a.get("nome") or str(aid)
        if a.get("id") is not None:
            almox_name[str(a.get("id"))] = a.get("nome") or str(aid)

    sub_name: Dict[str, str] = {}
    for s in sub_docs:
        sid = _public_id(s) or str(s.get("_id"))
        sub_name[str(sid)] = s.get("nome") or str(sid)
        sub_name[str(s.get("_id"))] = s.get("nome") or str(sid)
        if s.get("id") is not None:
            sub_name[str(s.get("id"))] = s.get("nome") or str(sid)

    out = []
    for pid, by_origin in grouped.items():
        for k, disp in by_origin.items():
            ot, oid = k.split(":", 1)
            nome = almox_name.get(str(oid)) if ot == "almoxarifado" else sub_name.get(str(oid))
            out.append({
                "produto_id": pid,
                "origem_tipo": ot,
                "origem_id": oid,
                "origem_nome": nome or oid,
                "quantidade_disponivel": float(disp),
            })
    out.sort(key=lambda x: (x.get("produto_id") or "", x.get("origem_tipo") or "", -(x.get("quantidade_disponivel") or 0)))
    return {"items": out}

@app.get("/api/estoque/setor/{setor_id}")
async def get_estoque_por_setor(setor_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    setor = await _find_one_by_id("setores", setor_id)
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    sid = _public_id(setor) or setor_id
    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "operador_setor" and scope_id:
        scope_setor = await _find_one_by_id("setores", scope_id)
        scope_sid = _public_id(scope_setor) if scope_setor else None
        if _norm_id(scope_sid or scope_id) != _norm_id(sid):
            raise HTTPException(status_code=403, detail="Acesso negado")
    sid_values: List[Any] = [sid]
    if str(sid).isdigit():
        sid_values.append(int(str(sid)))
    query = {
        "$or": [
            {"setor_id": {"$in": sid_values}},
            {"local_tipo": "setor", "local_id": {"$in": sid_values}},
        ]
    }
    docs = await db.db.estoques.find(query).to_list(length=5000)
    prod_ids = list({str(d.get("produto_id")) for d in docs if d.get("produto_id")})
    prod_oid = [ObjectId(x) for x in prod_ids if ObjectId.is_valid(x)]
    prod_int = [int(x) for x in prod_ids if str(x).isdigit()]
    prod_map = await db.db.produtos.find(
        {"$or": [{"_id": {"$in": prod_oid}}, {"id": {"$in": prod_ids + prod_int}}]},
        {"nome": 1, "codigo": 1, "id": 1}
    ).to_list(length=5000)
    prod_lookup: Dict[str, Dict[str, Any]] = {}
    for p in prod_map:
        pid = _public_id(p) or str(p.get("_id"))
        prod_lookup[str(pid)] = p
        prod_lookup[str(p.get("_id"))] = p
        if p.get("id") is not None:
            prod_lookup[str(p.get("id"))] = p

    grouped: Dict[str, Dict[str, Any]] = {}
    for e in docs:
        pid = _norm_id(e.get("produto_id"))
        if not pid:
            continue
        disp = float(e.get("quantidade_disponivel", e.get("quantidade", 0)) or 0)
        g = grouped.get(pid) or {"produto_id": pid, "quantidade_disponivel": 0.0}
        g["quantidade_disponivel"] = float(g["quantidade_disponivel"]) + disp
        grouped[pid] = g
    items = []
    for pid, g in grouped.items():
        if float(g.get("quantidade_disponivel") or 0) <= 0:
            continue
        p = prod_lookup.get(pid, {})
        items.append({
            "produto_id": pid,
            "produto_nome": p.get("nome") or "-",
            "produto_codigo": p.get("codigo") or "-",
            "quantidade_disponivel": float(g["quantidade_disponivel"]),
        })
    items.sort(key=lambda x: (x.get("produto_nome") or "").lower())
    return {"setor_id": sid, "items": items}

@app.get("/api/estoque/central/{central_id}")
async def get_estoque_por_central(central_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    cids: List[Any] = [central_id]
    if str(central_id).isdigit():
        cids.append(int(str(central_id)))
    almox_docs = await db.db.almoxarifados.find({"central_id": {"$in": cids}}, {"id": 1, "_id": 1, "nome": 1, "central_id": 1}).to_list(length=2000)
    almox_ids = [_public_id(a) or str(a.get("_id")) for a in almox_docs]
    almox_ids_all: List[Any] = list(dict.fromkeys(almox_ids + [int(x) for x in almox_ids if str(x).isdigit()]))
    subs_docs = await db.db.sub_almoxarifados.find(
        {"almoxarifado_id": {"$in": almox_ids_all}},
        {"id": 1, "_id": 1, "nome": 1, "almoxarifado_id": 1}
    ).to_list(length=5000)
    sub_ids = [_public_id(s) or str(s.get("_id")) for s in subs_docs]
    sub_ids_all: List[Any] = list(dict.fromkeys(sub_ids + [int(x) for x in sub_ids if str(x).isdigit()]))

    query = {
        "$or": [
            {"almoxarifado_id": {"$in": almox_ids_all}},
            {"local_tipo": "almoxarifado", "local_id": {"$in": almox_ids_all}},
            {"sub_almoxarifado_id": {"$in": sub_ids_all}},
            {"local_tipo": "sub_almoxarifado", "local_id": {"$in": sub_ids_all}},
        ]
    }
    docs = await db.db.estoques.find(query).to_list(length=20000)

    prod_ids = list({str(d.get("produto_id")) for d in docs if d.get("produto_id")})
    prod_oid = [ObjectId(x) for x in prod_ids if ObjectId.is_valid(x)]
    prod_int = [int(x) for x in prod_ids if str(x).isdigit()]
    prod_map = await db.db.produtos.find(
        {"$or": [{"_id": {"$in": prod_oid}}, {"id": {"$in": prod_ids + prod_int}}]},
        {"nome": 1, "codigo": 1, "id": 1}
    ).to_list(length=5000)
    prod_lookup: Dict[str, Dict[str, Any]] = {}
    for p in prod_map:
        pid = _public_id(p) or str(p.get("_id"))
        prod_lookup[str(pid)] = p
        prod_lookup[str(p.get("_id"))] = p
        if p.get("id") is not None:
            prod_lookup[str(p.get("id"))] = p

    almox_name = {(_public_id(a) or str(a.get("_id"))): a.get("nome") for a in almox_docs}
    sub_name = {(_public_id(s) or str(s.get("_id"))): s.get("nome") for s in subs_docs}

    grouped: Dict[str, Dict[str, Any]] = {}
    for e in docs:
        pid = _norm_id(e.get("produto_id"))
        if not pid:
            continue
        disp = float(e.get("quantidade_disponivel", e.get("quantidade", 0)) or 0)
        if disp <= 0:
            continue
        local_tipo = e.get("local_tipo")
        local_id = _norm_id(e.get("local_id"))
        almox_id = _norm_id(e.get("almoxarifado_id"))
        sub_id = _norm_id(e.get("sub_almoxarifado_id"))

        origem_tipo = None
        origem_id = None
        origem_nome = e.get("nome_local")

        if local_tipo == "sub_almoxarifado" or sub_id:
            origem_tipo = "sub_almoxarifado"
            origem_id = sub_id or local_id
            origem_nome = origem_nome or sub_name.get(str(origem_id))
        else:
            origem_tipo = "almoxarifado"
            origem_id = almox_id or local_id
            origem_nome = origem_nome or almox_name.get(str(origem_id))

        g = grouped.get(pid)
        if not g:
            p = prod_lookup.get(pid, {})
            g = {
                "produto_id": pid,
                "produto_nome": p.get("nome") or "-",
                "produto_codigo": p.get("codigo") or "-",
                "total_disponivel": 0.0,
                "origens": {}
            }
        g["total_disponivel"] = float(g["total_disponivel"]) + disp
        key = f"{origem_tipo}:{origem_id}"
        g["origens"][key] = {
            "tipo": origem_tipo,
            "id": str(origem_id),
            "nome": origem_nome or str(origem_id),
            "quantidade_disponivel": float(g["origens"].get(key, {}).get("quantidade_disponivel", 0.0)) + disp
        }
        grouped[pid] = g

    items = []
    for pid, g in grouped.items():
        items.append({
            "produto_id": pid,
            "produto_nome": g["produto_nome"],
            "produto_codigo": g["produto_codigo"],
            "total_disponivel": float(g["total_disponivel"]),
            "origens": list(g["origens"].values()),
        })
    items.sort(key=lambda x: (x.get("produto_nome") or "").lower())
    return {"central_id": str(central_id), "items": items}

class EntradaRequest(BaseModel):
    produto_id: str
    quantidade: float
    preco_unitario: Optional[float] = None
    destino_tipo: Optional[str] = "almoxarifado"  # almoxarifado | sub_almoxarifado
    destino_id: Optional[str] = None
    almoxarifado_id: Optional[str] = None  # legado
    fornecedor: Optional[str] = None
    nota_fiscal: Optional[str] = None
    observacoes: Optional[str] = None
    lote: str
    data_validade: datetime

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

# --- Rota de Entrada (Recebimento) ---
@app.post("/api/movimentacoes/entrada")
async def post_entrada(req: EntradaRequest, user: Dict[str, Any] = Depends(get_current_user)):
    if req.quantidade <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")
    if not (req.lote or "").strip():
        raise HTTPException(status_code=400, detail="Lote é obrigatório")
    if req.preco_unitario is not None and float(req.preco_unitario) < 0:
        raise HTTPException(status_code=400, detail="Preço deve ser maior ou igual a zero")

    # 1. Validar Produto
    prod_query = {"$or": [{"_id": req.produto_id}, {"id": req.produto_id}, {"codigo": req.produto_id}]}
    if ObjectId.is_valid(req.produto_id):
        prod_query["$or"].append({"_id": ObjectId(req.produto_id)})
    elif req.produto_id.isdigit():
        prod_query["$or"].append({"id": int(req.produto_id)})
        
    produto = await db.db.produtos.find_one(prod_query)
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    pid_out = produto.get('id') if produto.get('id') is not None else str(produto.get('_id'))

    # 2. Validar Destino (hierárquico)
    destino_tipo = (req.destino_tipo or "almoxarifado").strip()
    destino_id = req.destino_id or req.almoxarifado_id
    if not destino_id:
        raise HTTPException(status_code=400, detail="Destino não informado")

    destino_nome = "Destino"
    destino_out = None
    almox_id_out = None
    sub_id_out = None

    if destino_tipo == "almoxarifado":
        almox = await db.db.almoxarifados.find_one(_build_id_query(destino_id))
        if not almox:
            raise HTTPException(status_code=404, detail="Almoxarifado não encontrado")
        destino_out = _public_id(almox) or destino_id
        almox_id_out = destino_out
        destino_nome = almox.get("nome") or almox.get("descricao") or "Almoxarifado"
    elif destino_tipo == "sub_almoxarifado":
        sub = await db.db.sub_almoxarifados.find_one(_build_id_query(destino_id))
        if not sub:
            raise HTTPException(status_code=404, detail="Sub-Almoxarifado não encontrado")
        sub_id_out = _public_id(sub) or destino_id
        destino_out = sub_id_out
        destino_nome = sub.get("nome") or "Sub-Almoxarifado"
        almox_id_out = _norm_id(sub.get("almoxarifado_id"))
        if not almox_id_out:
            raise HTTPException(status_code=400, detail="Sub-Almoxarifado sem Almoxarifado pai")
        almox = await db.db.almoxarifados.find_one(_build_id_query(almox_id_out))
        almox_id_out = _public_id(almox) or almox_id_out if almox else almox_id_out
    else:
        raise HTTPException(status_code=400, detail="Tipo de destino inválido")

    now = _now_utc()

    # 3. Atualizar Estoque (Upsert)
    estoque_filter = {
        'produto_id': pid_out, 
        'local_tipo': destino_tipo, 
        'local_id': destino_out
    }
    
    estoque_update = {
        '$inc': {
            'quantidade': req.quantidade,
            'quantidade_disponivel': req.quantidade
        },
        '$set': {
            'produto_id': pid_out,
            'local_tipo': destino_tipo,
            'local_id': destino_out,
            'almoxarifado_id': almox_id_out,
            'sub_almoxarifado_id': sub_id_out,
            'nome_local': destino_nome,
            'updated_at': now
        },
        '$setOnInsert': {
            'created_at': now
        }
    }
    
    await db.db.estoques.find_one_and_update(
        estoque_filter,
        estoque_update,
        upsert=True,
        return_document=ReturnDocument.AFTER
    )

    # 4. Registrar Movimentação
    mov_doc = {
        'produto_id': pid_out,
        'tipo': 'entrada',
        'quantidade': req.quantidade,
        'data_movimentacao': now,
        'origem_nome': req.fornecedor or 'Fornecedor',
        'destino_nome': destino_nome,
        'usuario_responsavel': user.get("id"),
        'observacoes': req.observacoes,
        'nota_fiscal': req.nota_fiscal,
        'lote': req.lote,
        'local_tipo': destino_tipo,
        'local_id': destino_out,
        'created_at': now
    }
    
    await db.db.movimentacoes.insert_one(mov_doc)

    # 5. Registrar Lote (se informado)
    if req.lote:
        lote_filter = {'produto_id': pid_out, 'numero_lote': req.lote}
        lote_set = {
            'produto_id': pid_out,
            'numero_lote': req.lote,
            'lote': req.lote,
            'data_validade': req.data_validade,
            'almoxarifado_id': almox_id_out,
            'updated_at': now
        }
        if req.preco_unitario is not None:
            lote_set['preco_unitario'] = float(req.preco_unitario)
        lote_update = {
            '$inc': {'quantidade_atual': req.quantidade},
            '$set': {
                **lote_set
            },
            '$setOnInsert': {'created_at': now}
        }
        await db.db.lotes.find_one_and_update(lote_filter, lote_update, upsert=True)

    return {"status": "success", "message": "Entrada registrada com sucesso"}

class MovimentacaoRequest(BaseModel):
    produto_id: str
    quantidade: float
    origem_tipo: Optional[str] = "almoxarifado"  # almoxarifado | sub_almoxarifado
    origem_id: str
    destino_id: str
    destino_tipo: str # almoxarifado | sub_almoxarifado | setor
    observacoes: Optional[str] = None

class SetorConsumoRequest(BaseModel):
    produto_id: str
    quantidade: float
    observacoes: Optional[str] = None

class DemandaItemRequest(BaseModel):
    produto_id: str
    quantidade: float
    observacao: Optional[str] = None

class DemandaCreateRequest(BaseModel):
    destino_tipo: Optional[str] = "almoxarifado"
    observacoes: Optional[str] = None
    items: List[DemandaItemRequest]

class DemandaAtenderItemRequest(BaseModel):
    produto_id: str
    quantidade: float

class DemandaAtenderRequest(BaseModel):
    origem_tipo: str
    origem_id: str
    observacoes: Optional[str] = None
    items: List[DemandaAtenderItemRequest]

class CategoriaItem(BaseModel):
    id: Optional[str] = None
    nome: str
    descricao: Optional[str] = None

class SetorItem(BaseModel):
    id: Optional[str] = None
    nome: str
    responsavel: Optional[str] = None
    email: Optional[str] = None
    parent_id: Optional[str] = None # ID do Almoxarifado ou Sub-Almoxarifado pai
    almoxarifado_id: Optional[str] = None # Vínculo com Almoxarifado
    sub_almoxarifado_id: Optional[str] = None # Vínculo com Sub-Almoxarifado
    sub_almoxarifado_ids: Optional[List[str]] = None # Vínculo múltiplo com Sub-Almoxarifados
    central_id: Optional[str] = None
    can_receive_inter_central: Optional[bool] = None

class CentralItem(BaseModel):
    id: Optional[str] = None
    nome: str
    descricao: Optional[str] = None
    endereco: Optional[str] = None

class AlmoxarifadoItem(BaseModel):
    id: Optional[str] = None
    nome: str
    endereco: Optional[str] = None
    tipo: Optional[str] = "almoxarifado"
    parent_id: Optional[str] = None
    central_id: Optional[str] = None # Vínculo com Central
    can_receive_inter_central: Optional[bool] = None

class SubAlmoxarifadoItem(BaseModel):
    id: Optional[str] = None
    nome: str
    descricao: Optional[str] = None
    almoxarifado_id: Optional[str] = None
    can_receive_inter_central: Optional[bool] = None

# --- Rotas de Cadastros Básicos ---

@app.get("/api/sub_almoxarifados", response_model=List[SubAlmoxarifadoItem])
async def get_sub_almoxarifados(
    include_all: bool = Query(False),
    include_inter_central: bool = Query(False),
    user: Dict[str, Any] = Depends(get_current_user),
):
    subs = await db.db.sub_almoxarifados.find().to_list(length=100)
    role = user.get("role")
    scope_id = user.get("scope_id")

    if include_inter_central and role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    allowed_almox_ids: Optional[set[str]] = None
    allowed_sub_ids: Optional[set[str]] = None

    if include_all:
        if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
            raise HTTPException(status_code=403, detail="Acesso negado")
    else:
        if role == "admin_central" and scope_id:
            alms = await db.db.almoxarifados.find().to_list(length=200)
            allowed_almox_ids = {_public_id(a) for a in alms if _norm_id(a.get("central_id")) == scope_id}
        elif role == "gerente_almox" and scope_id:
            allowed_almox_ids = {scope_id}
        elif role == "resp_sub_almox" and scope_id:
            allowed_sub_ids = {scope_id}
        elif role == "operador_setor" and scope_id:
            setor = await _find_one_by_id("setores", scope_id)
            if setor:
                chain = await _resolve_parent_chain_from_setor(setor)
                if chain.get("sub_almoxarifado_id"):
                    allowed_sub_ids = {chain["sub_almoxarifado_id"]}
                elif chain.get("almoxarifado_id"):
                    allowed_almox_ids = {chain["almoxarifado_id"]}
    results = []
    for s in subs:
        sub_id = _public_id(s) or str(s.get("_id"))
        almox_id = _norm_id(s.get("almoxarifado_id"))
        bypass_scope = bool(s.get("can_receive_inter_central", False)) and role != "operador_setor" and include_inter_central
        if not bypass_scope:
            if allowed_sub_ids is not None and sub_id not in allowed_sub_ids:
                continue
            if allowed_almox_ids is not None and almox_id not in allowed_almox_ids:
                continue
        results.append({
            "id": sub_id,
            "nome": s.get("nome"),
            "descricao": s.get("descricao"),
            "almoxarifado_id": _norm_id(s.get("almoxarifado_id")),
            "can_receive_inter_central": bool(s.get("can_receive_inter_central", False)),
        })
    return results

@app.post("/api/sub_almoxarifados")
async def create_sub_almoxarifado(item: SubAlmoxarifadoItem, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox"]))):
    doc = item.dict(exclude={"id"})
    if doc.get("can_receive_inter_central") is None:
        doc["can_receive_inter_central"] = False
    doc["created_at"] = _now_utc()
    doc["ativo"] = True
    
    # Validar almoxarifado pai
    if item.almoxarifado_id:
        q = {}
        if ObjectId.is_valid(item.almoxarifado_id): q = {"_id": ObjectId(item.almoxarifado_id)}
        elif item.almoxarifado_id.isdigit(): q = {"id": int(item.almoxarifado_id)}
        else: q = {"id": item.almoxarifado_id}
        
        almox = await db.db.almoxarifados.find_one(q)
        if not almox:
             raise HTTPException(status_code=400, detail="Almoxarifado pai não encontrado")

        role = user.get("role")
        scope_id = user.get("scope_id")
        if role == "admin_central" and scope_id:
            if _norm_id(almox.get("central_id")) != scope_id:
                raise HTTPException(status_code=403, detail="Acesso negado")
        if role == "gerente_almox" and scope_id:
            if str(almox.get("_id")) != scope_id and _norm_id(almox.get("id")) != scope_id:
                raise HTTPException(status_code=403, detail="Acesso negado")
             
    res = await db.db.sub_almoxarifados.insert_one(doc)
    return {"id": str(res.inserted_id), **doc}

@app.put("/api/sub_almoxarifados/{sub_id}")
async def update_sub_almoxarifado(sub_id: str, item: SubAlmoxarifadoItem, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox", "resp_sub_almox"]))):
    q = {}
    if ObjectId.is_valid(sub_id): q = {"_id": ObjectId(sub_id)}
    else: q = {"id": sub_id} if sub_id.isdigit() else {"id": sub_id}

    existing = await db.db.sub_almoxarifados.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Sub-Almoxarifado não encontrado")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "resp_sub_almox" and scope_id:
        if str(existing.get("_id")) != scope_id and _norm_id(existing.get("id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "gerente_almox" and scope_id:
        if _norm_id(existing.get("almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "admin_central" and scope_id:
        almox = await _find_one_by_id("almoxarifados", str(existing.get("almoxarifado_id")))
        if not almox or _norm_id(almox.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    update_data = {k: v for k, v in item.dict(exclude={"id"}).items() if v is not None}
    
    res = await db.db.sub_almoxarifados.update_one(q, {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sub-Almoxarifado não encontrado")
    return {"status": "success", "message": "Sub-Almoxarifado atualizado"}

@app.delete("/api/sub_almoxarifados/{sub_id}")
async def delete_sub_almoxarifado(sub_id: str, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox", "resp_sub_almox"]))):
    q = {}
    if ObjectId.is_valid(sub_id): q = {"_id": ObjectId(sub_id)}
    else: q = {"id": sub_id} if sub_id.isdigit() else {"id": sub_id}

    existing = await db.db.sub_almoxarifados.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Sub-Almoxarifado não encontrado")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "resp_sub_almox" and scope_id:
        if str(existing.get("_id")) != scope_id and _norm_id(existing.get("id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "gerente_almox" and scope_id:
        if _norm_id(existing.get("almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "admin_central" and scope_id:
        almox = await _find_one_by_id("almoxarifados", str(existing.get("almoxarifado_id")))
        if not almox or _norm_id(almox.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    res = await db.db.sub_almoxarifados.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sub-Almoxarifado não encontrado")
    return {"status": "success", "message": "Sub-Almoxarifado removido"}

@app.get("/api/categorias", response_model=List[CategoriaItem])
async def get_categorias():
    cats = await db.db.categorias.find().to_list(length=100)
    results = []
    for c in cats:
        results.append({
            "id": str(c.get("_id")),
            "nome": c.get("nome"),
            "descricao": c.get("descricao")
        })
    return results

@app.post("/api/categorias")
async def create_categoria(cat: CategoriaItem):
    doc = cat.dict(exclude={"id"})
    doc["created_at"] = _now_utc()
    res = await db.db.categorias.insert_one(doc)
    return {"id": str(res.inserted_id), **doc}

@app.put("/api/categorias/{cat_id}")
async def update_categoria(cat_id: str, cat: CategoriaItem):
    q = {}
    if ObjectId.is_valid(cat_id): q = {"_id": ObjectId(cat_id)}
    else: q = {"id": cat_id} if cat_id.isdigit() else {"id": cat_id}

    update_data = {k: v for k, v in cat.dict(exclude={"id"}).items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Nada para atualizar")

    res = await db.db.categorias.update_one(q, {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return {"status": "success", "message": "Categoria atualizada"}

@app.delete("/api/categorias/{cat_id}")
async def delete_categoria(cat_id: str):
    q = {}
    if ObjectId.is_valid(cat_id): q = {"_id": ObjectId(cat_id)}
    else: q = {"id": cat_id} if cat_id.isdigit() else {"id": cat_id}

    res = await db.db.categorias.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return {"status": "success", "message": "Categoria removida"}

@app.get("/api/setores", response_model=List[SetorItem])
async def get_setores(
    include_all: bool = Query(False),
    include_inter_central: bool = Query(False),
    user: Dict[str, Any] = Depends(get_current_user),
):
    sets = await db.db.setores.find().to_list(length=100)
    role = user.get("role")
    scope_id = user.get("scope_id")

    if include_inter_central and role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    allowed_setor_ids: Optional[set[str]] = None
    allowed_almox_ids: Optional[set[str]] = None
    allowed_sub_ids: Optional[set[str]] = None

    if include_all:
        if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
            raise HTTPException(status_code=403, detail="Acesso negado")
    else:
        if role == "admin_central" and scope_id:
            alms = await db.db.almoxarifados.find().to_list(length=200)
            allowed_almox_ids = {_public_id(a) for a in alms if _norm_id(a.get("central_id")) == scope_id}
            subs = await db.db.sub_almoxarifados.find().to_list(length=200)
            allowed_sub_ids = {_public_id(s) for s in subs if _norm_id(s.get("almoxarifado_id")) in allowed_almox_ids}
        elif role == "gerente_almox" and scope_id:
            allowed_almox_ids = {scope_id}
            subs = await db.db.sub_almoxarifados.find().to_list(length=200)
            allowed_sub_ids = {_public_id(s) for s in subs if _norm_id(s.get("almoxarifado_id")) == scope_id}
        elif role == "resp_sub_almox" and scope_id:
            allowed_sub_ids = {scope_id}
        elif role == "operador_setor" and scope_id:
            allowed_setor_ids = {scope_id}
    results = []
    for s in sets:
        setor_id = _public_id(s) or str(s.get("_id"))
        chain = await _resolve_parent_chain_from_setor(s)
        setor_subs = [str(x) for x in (s.get("sub_almoxarifado_ids") or []) if x]
        if not setor_subs:
            single_sub = _norm_id(s.get("sub_almoxarifado_id"))
            setor_subs = [single_sub] if single_sub else []
        bypass_scope = bool(s.get("can_receive_inter_central", False)) and role != "operador_setor" and include_inter_central
        if not bypass_scope:
            if allowed_setor_ids is not None and setor_id not in allowed_setor_ids:
                continue
            if allowed_sub_ids is not None and not any(_norm_id(x) in allowed_sub_ids for x in setor_subs):
                if allowed_almox_ids is None:
                    continue
            if allowed_almox_ids is not None and _norm_id(s.get("almoxarifado_id")) not in allowed_almox_ids:
                if allowed_sub_ids is None or not any(_norm_id(x) in allowed_sub_ids for x in setor_subs):
                    continue
        results.append({
            "id": setor_id,
            "nome": s.get("nome"),
            "responsavel": s.get("responsavel"),
            "email": s.get("email"),
            "parent_id": s.get("parent_id"),
            "almoxarifado_id": _norm_id(s.get("almoxarifado_id")),
            "sub_almoxarifado_id": _norm_id(s.get("sub_almoxarifado_id")),
            "sub_almoxarifado_ids": [str(x) for x in (s.get("sub_almoxarifado_ids") or []) if x] or None,
            "central_id": chain.get("central_id"),
            "can_receive_inter_central": bool(s.get("can_receive_inter_central", False)),
        })
    return results

@app.get("/api/setores/{setor_id}")
async def get_setor(setor_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    setor = await _find_one_by_id("setores", setor_id)
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    chain = await _resolve_parent_chain_from_setor(setor)
    role = user.get("role")
    scope_id = user.get("scope_id")
    if role != "super_admin":
        user_central_id = await _compute_user_central_id(role, scope_id, None, strict=False)
        if user_central_id and chain.get("central_id") and _norm_id(user_central_id) != _norm_id(chain.get("central_id")):
            raise HTTPException(status_code=403, detail="Acesso negado")
    return {
        "id": _public_id(setor) or str(setor.get("_id")),
        "nome": setor.get("nome"),
        "responsavel": setor.get("responsavel"),
        "email": setor.get("email"),
        "parent_id": _norm_id(setor.get("parent_id")),
        "almoxarifado_id": chain.get("almoxarifado_id") or _norm_id(setor.get("almoxarifado_id")),
        "sub_almoxarifado_id": chain.get("sub_almoxarifado_id") or _norm_id(setor.get("sub_almoxarifado_id")),
        "sub_almoxarifado_ids": [str(x) for x in (setor.get("sub_almoxarifado_ids") or []) if x] or None,
        "central_id": chain.get("central_id"),
        "can_receive_inter_central": bool(setor.get("can_receive_inter_central", False)),
    }

@app.post("/api/setores")
async def create_setor(item: SetorItem, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox", "resp_sub_almox"]))):
    links = await _infer_setor_links(item)
    doc = item.dict(exclude={"id", "central_id"})
    if doc.get("can_receive_inter_central") is None:
        doc["can_receive_inter_central"] = False
    doc["almoxarifado_id"] = links.get("almoxarifado_id")
    doc["sub_almoxarifado_id"] = links.get("sub_almoxarifado_id")
    doc["sub_almoxarifado_ids"] = links.get("sub_almoxarifado_ids")
    if links.get("parent_id"):
        doc["parent_id"] = links.get("parent_id")
    doc["created_at"] = _now_utc()

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "resp_sub_almox" and scope_id:
        allowed = links.get("sub_almoxarifado_ids") or ([links.get("sub_almoxarifado_id")] if links.get("sub_almoxarifado_id") else [])
        if not allowed or any(_norm_id(x) != scope_id for x in allowed):
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "gerente_almox" and scope_id:
        if links.get("almoxarifado_id") != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "admin_central" and scope_id:
        almox = await _find_one_by_id("almoxarifados", links.get("almoxarifado_id") or "")
        if not almox or _norm_id(almox.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    res = await db.db.setores.insert_one(doc)
    return {"id": str(res.inserted_id), **doc}

@app.put("/api/setores/{setor_id}")
async def update_setor(setor_id: str, item: SetorItem, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox", "resp_sub_almox"]))):
    q = _build_id_query(setor_id)

    existing = await db.db.setores.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Setor não encontrado")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "resp_sub_almox" and scope_id:
        existing_subs = [str(x) for x in (existing.get("sub_almoxarifado_ids") or []) if x]
        if not existing_subs:
            existing_single = _norm_id(existing.get("sub_almoxarifado_id"))
            existing_subs = [existing_single] if existing_single else []
        if scope_id not in existing_subs:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "gerente_almox" and scope_id:
        if _norm_id(existing.get("almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "admin_central" and scope_id:
        almox = await _find_one_by_id("almoxarifados", str(existing.get("almoxarifado_id")))
        if not almox or _norm_id(almox.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    update_data = {k: v for k, v in item.dict(exclude={"id", "central_id"}).items() if v is not None}
    if any(k in update_data for k in ("parent_id", "almoxarifado_id", "sub_almoxarifado_id", "sub_almoxarifado_ids")):
        merged_data: Dict[str, Any] = {**existing, **update_data}
        for k in ("parent_id", "almoxarifado_id", "sub_almoxarifado_id"):
            if k in merged_data:
                merged_data[k] = _norm_id(merged_data.get(k))
        if "sub_almoxarifado_ids" in merged_data:
            merged_data["sub_almoxarifado_ids"] = [
                _norm_id(x) for x in (merged_data.get("sub_almoxarifado_ids") or []) if _norm_id(x)
            ] or None
        merged = SetorItem(**{**merged_data, "id": None})
        links = await _infer_setor_links(merged)
        update_data["almoxarifado_id"] = links.get("almoxarifado_id")
        update_data["sub_almoxarifado_id"] = links.get("sub_almoxarifado_id")
        update_data["sub_almoxarifado_ids"] = links.get("sub_almoxarifado_ids")
    
    res = await db.db.setores.update_one(q, {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    return {"status": "success", "message": "Setor atualizado"}

@app.delete("/api/setores/{setor_id}")
async def delete_setor(setor_id: str, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox", "resp_sub_almox"]))):
    q = _build_id_query(setor_id)

    existing = await db.db.setores.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Setor não encontrado")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "resp_sub_almox" and scope_id:
        existing_subs = [str(x) for x in (existing.get("sub_almoxarifado_ids") or []) if x]
        if not existing_subs:
            existing_single = _norm_id(existing.get("sub_almoxarifado_id"))
            existing_subs = [existing_single] if existing_single else []
        if scope_id not in existing_subs:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "gerente_almox" and scope_id:
        if _norm_id(existing.get("almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "admin_central" and scope_id:
        almox = await _find_one_by_id("almoxarifados", str(existing.get("almoxarifado_id")))
        if not almox or _norm_id(almox.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    res = await db.db.setores.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    return {"status": "success", "message": "Setor removido"}

@app.get("/api/centrais", response_model=List[CentralItem])
async def get_centrais(
    include_all: bool = Query(False),
    user: Dict[str, Any] = Depends(get_current_user),
):
    centrais = await db.db.centrais.find().to_list(length=100)
    role = user.get("role")
    scope_id = user.get("scope_id")

    allowed_central_ids: Optional[set[str]] = None
    if include_all:
        if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
            raise HTTPException(status_code=403, detail="Acesso negado")
    else:
        if role == "admin_central" and scope_id:
            allowed_central_ids = {scope_id}
        elif role == "gerente_almox" and scope_id:
            almox = await _find_one_by_id("almoxarifados", scope_id)
            central_id = _norm_id(almox.get("central_id")) if almox else None
            allowed_central_ids = {central_id} if central_id else set()
        elif role == "resp_sub_almox" and scope_id:
            sub = await _find_one_by_id("sub_almoxarifados", scope_id)
            almox_id = _norm_id(sub.get("almoxarifado_id")) if sub else None
            almox = await _find_one_by_id("almoxarifados", almox_id) if almox_id else None
            central_id = _norm_id(almox.get("central_id")) if almox else None
            allowed_central_ids = {central_id} if central_id else set()
        elif role == "operador_setor" and scope_id:
            setor = await _find_one_by_id("setores", scope_id)
            if setor:
                chain = await _resolve_parent_chain_from_setor(setor)
                central_id = chain.get("central_id")
                allowed_central_ids = {central_id} if central_id else set()
            else:
                allowed_central_ids = set()
    results = []
    allowed_norm: Optional[set[str]] = None
    if allowed_central_ids is not None:
        allowed_norm = {_norm_id(x) for x in allowed_central_ids if _norm_id(x)}
    for c in centrais:
        cid = _public_id(c) or str(c.get("_id"))
        if allowed_norm is not None and _norm_id(cid) not in allowed_norm:
            continue
        results.append({
            "id": cid,
            "nome": c.get("nome"),
            "descricao": c.get("descricao"),
            "endereco": c.get("endereco")
        })
    return results

@app.post("/api/centrais")
async def create_central(item: CentralItem, user: Dict[str, Any] = Depends(_require_roles(["super_admin"]))):
    doc = item.dict(exclude={"id"})
    doc["created_at"] = _now_utc()
    res = await db.db.centrais.insert_one(doc)
    return {"id": str(res.inserted_id), **doc}

@app.put("/api/centrais/{central_id}")
async def update_central(central_id: str, item: CentralItem, user: Dict[str, Any] = Depends(_require_roles(["admin_central"]))):
    q = {}
    if ObjectId.is_valid(central_id): q = {"_id": ObjectId(central_id)}
    else: q = {"id": central_id} if central_id.isdigit() else {"id": central_id}

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "admin_central" and scope_id:
        existing = await db.db.centrais.find_one(q)
        if not existing or (str(existing.get("_id")) != scope_id and _norm_id(existing.get("id")) != scope_id):
            raise HTTPException(status_code=403, detail="Acesso negado")

    update_data = {k: v for k, v in item.dict(exclude={"id"}).items() if v is not None}
    res = await db.db.centrais.update_one(q, {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Central não encontrada")
    return {"status": "success", "message": "Central atualizada"}

@app.delete("/api/centrais/{central_id}")
async def delete_central(central_id: str, user: Dict[str, Any] = Depends(_require_roles(["super_admin"]))):
    q = {}
    if ObjectId.is_valid(central_id): q = {"_id": ObjectId(central_id)}
    else: q = {"id": central_id} if central_id.isdigit() else {"id": central_id}

    res = await db.db.centrais.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Central não encontrada")
    return {"status": "success", "message": "Central removida"}

@app.get("/api/almoxarifados", response_model=List[AlmoxarifadoItem])
async def get_almoxarifados(
    include_all: bool = Query(False),
    include_inter_central: bool = Query(False),
    user: Dict[str, Any] = Depends(get_current_user),
):
    alms = await db.db.almoxarifados.find().to_list(length=100)
    role = user.get("role")
    scope_id = user.get("scope_id")

    if include_inter_central and role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    allowed_almox_ids: Optional[set[str]] = None
    allowed_central_ids: Optional[set[str]] = None

    if include_all:
        if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
            raise HTTPException(status_code=403, detail="Acesso negado")
    else:
        if role == "admin_central" and scope_id:
            allowed_central_ids = {scope_id}
        elif role == "gerente_almox" and scope_id:
            allowed_almox_ids = {scope_id}
        elif role == "resp_sub_almox" and scope_id:
            sub = await _find_one_by_id("sub_almoxarifados", scope_id)
            almox_id = _norm_id(sub.get("almoxarifado_id")) if sub else None
            allowed_almox_ids = {almox_id} if almox_id else set()
        elif role == "operador_setor" and scope_id:
            setor = await _find_one_by_id("setores", scope_id)
            if setor:
                chain = await _resolve_parent_chain_from_setor(setor)
                allowed_almox_ids = {chain["almoxarifado_id"]} if chain.get("almoxarifado_id") else set()
            else:
                allowed_almox_ids = set()
    results = []
    for a in alms:
        almox_id = _public_id(a) or str(a.get("_id"))
        bypass_scope = bool(a.get("can_receive_inter_central", False)) and role != "operador_setor" and include_inter_central
        if not bypass_scope:
            if allowed_almox_ids is not None and almox_id not in allowed_almox_ids:
                continue
            if allowed_central_ids is not None and _norm_id(a.get("central_id")) not in allowed_central_ids:
                continue
        results.append({
            "id": almox_id,
            "nome": a.get("nome"),
            "endereco": a.get("endereco"),
            "tipo": a.get("tipo", "almoxarifado"),
            "parent_id": a.get("parent_id"),
            "central_id": _norm_id(a.get("central_id")),
            "can_receive_inter_central": bool(a.get("can_receive_inter_central", False)),
        })
    return results

@app.post("/api/almoxarifados")
async def create_almoxarifado(item: AlmoxarifadoItem, user: Dict[str, Any] = Depends(_require_roles(["admin_central"]))):
    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "admin_central" and scope_id:
        if not item.central_id or _norm_id(item.central_id) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    doc = item.dict(exclude={"id"})
    if doc.get("can_receive_inter_central") is None:
        doc["can_receive_inter_central"] = False
    doc["created_at"] = _now_utc()
    res = await db.db.almoxarifados.insert_one(doc)
    return {"id": str(res.inserted_id), **doc}

@app.put("/api/almoxarifados/{almox_id}")
async def update_almoxarifado(almox_id: str, item: AlmoxarifadoItem, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox"]))):
    q = {}
    if ObjectId.is_valid(almox_id): q = {"_id": ObjectId(almox_id)}
    else: q = {"id": almox_id} if almox_id.isdigit() else {"id": almox_id}

    existing = await db.db.almoxarifados.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Almoxarifado não encontrado")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "gerente_almox" and scope_id:
        if str(existing.get("_id")) != scope_id and _norm_id(existing.get("id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "admin_central" and scope_id:
        if _norm_id(existing.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    update_data = {k: v for k, v in item.dict(exclude={"id"}).items() if v is not None}
    
    res = await db.db.almoxarifados.update_one(q, {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Almoxarifado não encontrado")
    return {"status": "success", "message": "Almoxarifado atualizado"}

@app.delete("/api/almoxarifados/{almox_id}")
async def delete_almoxarifado(almox_id: str, user: Dict[str, Any] = Depends(_require_roles(["admin_central", "gerente_almox"]))):
    q = {}
    if ObjectId.is_valid(almox_id): q = {"_id": ObjectId(almox_id)}
    else: q = {"id": almox_id} if almox_id.isdigit() else {"id": almox_id}

    existing = await db.db.almoxarifados.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Almoxarifado não encontrado")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "gerente_almox" and scope_id:
        if str(existing.get("_id")) != scope_id and _norm_id(existing.get("id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "admin_central" and scope_id:
        if _norm_id(existing.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    res = await db.db.almoxarifados.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Almoxarifado não encontrado")
    return {"status": "success", "message": "Almoxarifado removido"}

# --- Rotas de Usuários ---

@app.get("/api/usuarios", response_model=List[UserItem])
async def get_usuarios():
    users = await db.db.usuarios.find().to_list(length=100)
    results = []
    for u in users:
        # Garantir que campos obrigatórios existam
        if not u.get("nome") or not u.get("email"):
            continue
            
        computed_central_id = await _compute_user_central_id(u.get("role") or "operador", u.get("scope_id"), u.get("central_id"), strict=False)
        results.append({
            "id": _public_id(u) or str(u.get("_id")),
            "nome": u.get("nome"),
            "email": u.get("email"),
            "cargo": u.get("cargo"),
            "role": u.get("role") or "operador",
            "scope_id": _norm_id(u.get("scope_id")),
            "central_id": computed_central_id,
            "categoria_ids": [str(c) for c in (u.get("categoria_ids") or []) if c],
            "ativo": u.get("ativo", True)
        })
    return results

@app.post("/api/auth/login")
async def login_auth(payload: LoginRequest):
    email_norm = (payload.email or "").strip().lower()
    if not email_norm or not payload.password:
        raise HTTPException(status_code=400, detail="Credenciais inválidas")

    u = await db.db.usuarios.find_one({"$or": [{"username": email_norm}, {"email": payload.email}, {"email": email_norm}]})
    if not u or not u.get("ativo", True):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")

    password_hash = u.get("password_hash")
    if not password_hash or not check_password_hash(password_hash, payload.password):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")

    computed_central_id = await _compute_user_central_id(u.get("role") or "operador", u.get("scope_id"), u.get("central_id"), strict=False)
    return {
        "id": _public_id(u) or str(u.get("_id")),
        "nome": u.get("nome"),
        "email": u.get("email"),
        "role": u.get("role") or "operador",
        "scope_id": _norm_id(u.get("scope_id")),
        "central_id": computed_central_id,
        "categoria_ids": [str(c) for c in (u.get("categoria_ids") or []) if c],
        "ativo": u.get("ativo", True),
    }

async def _normalize_categoria_ids(values: Optional[List[str]]) -> Optional[List[str]]:
    if not values:
        return None
    normalized: List[str] = []
    for raw in values:
        cid = _norm_id(raw)
        if not cid:
            continue
        cat = await _find_one_by_id("categorias", cid)
        if not cat:
            raise HTTPException(status_code=400, detail="Categoria inválida")
        normalized.append(_public_id(cat) or cid)
    normalized = list(dict.fromkeys([_norm_id(x) for x in normalized if x]))
    return normalized or None

async def _compute_user_central_id(role: str, scope_id: Optional[str], provided_central_id: Optional[str], strict: bool) -> Optional[str]:
    role = (role or "operador").strip()
    scope_id = _norm_id(scope_id)
    provided_central_id = _norm_id(provided_central_id)

    if role == "super_admin":
        return None

    if role == "admin_central":
        if not scope_id:
            if strict:
                raise HTTPException(status_code=400, detail="scope_id é obrigatório para admin_central")
            return provided_central_id
        central = await _find_one_by_id("centrais", scope_id)
        if not central:
            if strict:
                raise HTTPException(status_code=400, detail="Central inválida")
            return provided_central_id
        derived = _public_id(central) or scope_id
        if provided_central_id and provided_central_id != derived and strict:
            raise HTTPException(status_code=400, detail="central_id não confere com a central do escopo")
        return derived

    if role == "gerente_almox":
        if not scope_id:
            if strict:
                raise HTTPException(status_code=400, detail="scope_id é obrigatório para gerente_almox")
            return provided_central_id
        almox = await _find_one_by_id("almoxarifados", scope_id)
        central_id = _norm_id(almox.get("central_id")) if almox else None
        if not central_id:
            if strict:
                raise HTTPException(status_code=400, detail="Almoxarifado inválido ou sem central vinculada")
            return provided_central_id
        if provided_central_id and provided_central_id != central_id and strict:
            raise HTTPException(status_code=400, detail="central_id não confere com o almoxarifado do escopo")
        return central_id

    if role == "resp_sub_almox":
        if not scope_id:
            if strict:
                raise HTTPException(status_code=400, detail="scope_id é obrigatório para resp_sub_almox")
            return provided_central_id
        sub = await _find_one_by_id("sub_almoxarifados", scope_id)
        almox_id = _norm_id(sub.get("almoxarifado_id")) if sub else None
        almox = await _find_one_by_id("almoxarifados", almox_id) if almox_id else None
        central_id = _norm_id(almox.get("central_id")) if almox else None
        if not central_id:
            if strict:
                raise HTTPException(status_code=400, detail="Sub-almoxarifado inválido ou sem central vinculada")
            return provided_central_id
        if provided_central_id and provided_central_id != central_id and strict:
            raise HTTPException(status_code=400, detail="central_id não confere com o sub-almoxarifado do escopo")
        return central_id

    if role == "operador_setor":
        if not scope_id:
            if strict:
                raise HTTPException(status_code=400, detail="scope_id é obrigatório para operador_setor")
            return provided_central_id
        setor = await _find_one_by_id("setores", scope_id)
        if not setor:
            if strict:
                raise HTTPException(status_code=400, detail="Setor inválido")
            return provided_central_id
        chain = await _resolve_parent_chain_from_setor(setor)
        central_id = _norm_id(chain.get("central_id"))
        if not central_id:
            if strict:
                raise HTTPException(status_code=400, detail="Setor sem central vinculada")
            return provided_central_id
        if provided_central_id and provided_central_id != central_id and strict:
            raise HTTPException(status_code=400, detail="central_id não confere com o setor do escopo")
        return central_id

    if not provided_central_id:
        if strict:
            raise HTTPException(status_code=400, detail="central_id é obrigatório para este perfil")
        return None

    central = await _find_one_by_id("centrais", provided_central_id)
    if not central:
        if strict:
            raise HTTPException(status_code=400, detail="Central inválida")
        return None
    return _public_id(central) or provided_central_id

@app.post("/api/usuarios")
async def create_usuario(user: UserCreate):
    # Validar email
    existing = await db.db.usuarios.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    doc = user.dict()
    doc["categoria_ids"] = await _normalize_categoria_ids(user.categoria_ids)
    doc["username"] = (user.email or "").strip().lower()
    doc["password_hash"] = generate_password_hash(user.password)
    del doc["password"]
    doc["created_at"] = _now_utc()
    doc["ativo"] = True
    doc["central_id"] = await _compute_user_central_id(doc.get("role") or "operador", doc.get("scope_id"), doc.get("central_id"), strict=True)
    
    try:
        res = await db.db.usuarios.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Usuário já existe (username/email duplicado)")
    return {"id": str(res.inserted_id), "message": "Usuário criado com sucesso"}

@app.put("/api/usuarios/{user_id}")
async def update_usuario(user_id: str, user: UserUpdate):
    q = {}
    if ObjectId.is_valid(user_id): q = {"_id": ObjectId(user_id)}
    else: q = {"id": user_id}

    existing = await db.db.usuarios.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    update_data = {k: v for k, v in user.dict().items() if v is not None}
    if "categoria_ids" in update_data:
        update_data["categoria_ids"] = await _normalize_categoria_ids(update_data.get("categoria_ids"))
    if "email" in update_data and "username" not in update_data:
        update_data["username"] = str(update_data.get("email") or "").strip().lower()
    
    if "password" in update_data:
        update_data["password_hash"] = generate_password_hash(update_data.pop("password"))

    if "role" in update_data or "scope_id" in update_data or "central_id" in update_data:
        merged_role = update_data.get("role") or (existing.get("role") or "operador")
        merged_scope_id = update_data.get("scope_id") if "scope_id" in update_data else existing.get("scope_id")
        merged_central_id = update_data.get("central_id") if "central_id" in update_data else existing.get("central_id")
        update_data["central_id"] = await _compute_user_central_id(merged_role, merged_scope_id, merged_central_id, strict=True)
        
    if not update_data:
         raise HTTPException(status_code=400, detail="Nada para atualizar")

    await db.db.usuarios.update_one(q, {"$set": update_data})
    return {"status": "success", "message": "Usuário atualizado"}

@app.delete("/api/usuarios/{user_id}")
async def delete_usuario(user_id: str):
    q = {}
    if ObjectId.is_valid(user_id): q = {"_id": ObjectId(user_id)}
    else: q = {"id": user_id}

    res = await db.db.usuarios.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"status": "success", "message": "Usuário removido"}

class ProdutoCreate(BaseModel):
    central_id: str
    nome: str
    codigo: str
    unidade: Optional[str] = None
    descricao: Optional[str] = None
    categoria_id: Optional[str] = None
    categoria_nome: Optional[str] = None
    observacao: Optional[str] = None
    ativo: bool = True

class ProdutoUpdate(BaseModel):
    central_id: Optional[str] = None
    nome: str
    codigo: str
    unidade: Optional[str] = None
    descricao: Optional[str] = None
    categoria_id: Optional[str] = None
    categoria_nome: Optional[str] = None
    observacao: Optional[str] = None
    ativo: bool = True

class CodigoRequest(BaseModel):
    categoria_id: Optional[str] = None

@app.post("/api/produtos")
async def create_produto(prod: ProdutoCreate, user: Dict[str, Any] = Depends(get_current_user)):
    role = user.get("role")
    scope_id = user.get("scope_id")
    if role not in ("super_admin", "admin_central", "gerente_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")
    if role != "super_admin" and not scope_id:
        raise HTTPException(status_code=400, detail="Usuário sem escopo associado")

    # Validar duplicidade de código
    existing = await db.db.produtos.find_one({"codigo": prod.codigo})
    if existing:
         pid = existing.get('id') if existing.get('id') is not None else str(existing.get('_id'))
         return {"id": pid, "message": "Produto já existe", "exists": True}
    
    central_id = prod.central_id
    if role != "super_admin":
        central_id = await _compute_user_central_id(role, scope_id, prod.central_id, strict=True)

    central = await _find_one_by_id("centrais", central_id)
    if not central:
        raise HTTPException(status_code=400, detail="Central inválida")

    doc = prod.dict(exclude={"categoria_nome"})
    doc["central_id"] = _public_id(central) or _norm_id(central_id)
    doc["created_at"] = _now_utc()
    doc["observacoes"] = doc.pop("observacao", None) # Padronizar
    
    # Resolver categoria
    if prod.categoria_id:
         cat_q = {}
         if ObjectId.is_valid(prod.categoria_id): cat_q = {"_id": ObjectId(prod.categoria_id)}
         elif prod.categoria_id.isdigit(): cat_q = {"id": int(prod.categoria_id)}
         else: cat_q = {"id": prod.categoria_id}
         
         cat = await db.db.categorias.find_one(cat_q)
         if cat:
             doc["categoria_id"] = cat.get("id") if cat.get("id") else str(cat.get("_id"))
             doc["categoria"] = cat.get("nome")
    elif prod.categoria_nome:
        doc["categoria"] = prod.categoria_nome

    res = await db.db.produtos.insert_one(doc)
    return {"id": str(res.inserted_id), "message": "Produto criado com sucesso"}

@app.post("/api/produtos/gerar-codigo")
async def gerar_codigo_produto(req: CodigoRequest):
    # Lógica Simplificada: PROD-<TIMESTAMP>
    # TODO: Implementar lógica sequencial por categoria
    import time
    timestamp = int(time.time())
    suffix = str(timestamp)[-6:]
    return {"codigo": f"P-{suffix}"}

@app.put("/api/produtos/{produto_id}")
async def update_produto(produto_id: str, prod: ProdutoUpdate):
    q = {}
    if ObjectId.is_valid(produto_id): q = {"_id": ObjectId(produto_id)}
    elif produto_id.isdigit(): q = {"id": int(produto_id)}
    else: q = {"$or": [{"id": produto_id}, {"codigo": produto_id}]}

    # Encontrar documento primeiro para ter certeza do ID
    existing = await db.db.produtos.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    update_data = prod.dict(exclude_unset=True, exclude={"categoria_nome", "codigo"}) # Não permitir mudar código facilmente
    update_data["observacoes"] = update_data.pop("observacao", None)

    if "central_id" in update_data and update_data.get("central_id"):
        central = await _find_one_by_id("centrais", str(update_data.get("central_id")))
        if not central:
            raise HTTPException(status_code=400, detail="Central inválida")
        update_data["central_id"] = _public_id(central) or _norm_id(update_data.get("central_id"))
    
    # Atualizar categoria se mudou
    if prod.categoria_id:
         cat_q = {}
         if ObjectId.is_valid(prod.categoria_id): cat_q = {"_id": ObjectId(prod.categoria_id)}
         elif prod.categoria_id.isdigit(): cat_q = {"id": int(prod.categoria_id)}
         else: cat_q = {"id": prod.categoria_id}
         
         cat = await db.db.categorias.find_one(cat_q)
         if cat:
             update_data["categoria_id"] = cat.get("id") if cat.get("id") else str(cat.get("_id"))
             update_data["categoria"] = cat.get("nome")

    await db.db.produtos.update_one({"_id": existing["_id"]}, {"$set": update_data})
    return {"status": "success", "message": "Produto atualizado"}

@app.delete("/api/produtos/{produto_id}")
async def delete_produto(produto_id: str):
    q = {}
    if ObjectId.is_valid(produto_id): q = {"_id": ObjectId(produto_id)}
    elif produto_id.isdigit(): q = {"id": int(produto_id)}
    else: q = {"$or": [{"id": produto_id}, {"codigo": produto_id}]}

    # Verificar se tem movimentações ou estoque antes de deletar
    # Por segurança, apenas deleta logicamente (ativo=False) ou se não tiver histórico
    
    res = await db.db.produtos.delete_one(q)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return {"status": "success", "message": "Produto removido"}

# --- Rota de Distribuição (Saída/Transferência) ---
@app.post("/api/movimentacoes/distribuicao")
async def post_distribuicao(req: MovimentacaoRequest, user: Dict[str, Any] = Depends(get_current_user)):
    if req.quantidade <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox"):
        raise HTTPException(status_code=403, detail="Acesso negado")
    if role != "super_admin" and not scope_id:
        raise HTTPException(status_code=400, detail="Usuário sem escopo associado")

    # 1. Validar Produto e Resolver ID
    prod_query = {"$or": [{"_id": req.produto_id}, {"id": req.produto_id}, {"codigo": req.produto_id}]}
    if ObjectId.is_valid(req.produto_id):
        prod_query["$or"].append({"_id": ObjectId(req.produto_id)})
    elif req.produto_id.isdigit():
        prod_query["$or"].append({"id": int(req.produto_id)})
        
    produto = await db.db.produtos.find_one(prod_query)
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    pid_out = produto.get('id') if produto.get('id') is not None else str(produto.get('_id'))

    # 2. Validar Origem (Almox/Sub)
    origem_tipo = (req.origem_tipo or "almoxarifado").strip()
    origem_nome = "Origem"
    oid_out = None
    origem_almox_id = None

    if origem_tipo == "almoxarifado":
        origem = await db.db.almoxarifados.find_one(_build_id_query(req.origem_id))
        if not origem:
            raise HTTPException(status_code=404, detail="Local de origem não encontrado")
        oid_out = _public_id(origem) or req.origem_id
        origem_nome = origem.get("nome") or "Almoxarifado"
        origem_almox_id = oid_out
    elif origem_tipo == "sub_almoxarifado":
        origem = await db.db.sub_almoxarifados.find_one(_build_id_query(req.origem_id))
        if not origem:
            raise HTTPException(status_code=404, detail="Local de origem não encontrado")
        oid_out = _public_id(origem) or req.origem_id
        origem_nome = origem.get("nome") or "Sub-Almoxarifado"
        origem_almox_id = _norm_id(origem.get("almoxarifado_id"))
        if not origem_almox_id:
            raise HTTPException(status_code=400, detail="Sub-Almoxarifado de origem sem Almoxarifado pai")
        almox = await db.db.almoxarifados.find_one(_build_id_query(origem_almox_id))
        origem_almox_id = _public_id(almox) or origem_almox_id if almox else origem_almox_id
    else:
        raise HTTPException(status_code=400, detail="Tipo de origem inválido")

    if role == "resp_sub_almox":
        if origem_tipo != "sub_almoxarifado":
            raise HTTPException(status_code=403, detail="Acesso negado")
        if _norm_id(oid_out) != _norm_id(scope_id):
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "gerente_almox":
        if origem_tipo == "almoxarifado":
            if _norm_id(oid_out) != _norm_id(scope_id):
                raise HTTPException(status_code=403, detail="Acesso negado")
        else:
            if _norm_id(origem_almox_id) != _norm_id(scope_id):
                raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "admin_central":
        central_id = _norm_id(scope_id)
        if origem_tipo == "almoxarifado":
            if _norm_id(origem.get("central_id")) != central_id:
                raise HTTPException(status_code=403, detail="Acesso negado")
        else:
            almox_doc = await db.db.almoxarifados.find_one(_build_id_query(origem_almox_id or ""))
            if not almox_doc or _norm_id(almox_doc.get("central_id")) != central_id:
                raise HTTPException(status_code=403, detail="Acesso negado")

    # 3. Validar Destino (Setor ou Almoxarifado)
    destino_tipo = req.destino_tipo.strip()
    dest_coll = "setores" if destino_tipo == "setor" else "sub_almoxarifados" if destino_tipo == "sub_almoxarifado" else "almoxarifados"
    destino = await db.db[dest_coll].find_one(_build_id_query(req.destino_id))
    if not destino:
        raise HTTPException(status_code=404, detail="Local de destino não encontrado")
    did_out = _public_id(destino) or req.destino_id
    destino_nome = destino.get('nome') or 'Destino'

    if role != "super_admin":
        origem_central_id: Optional[str] = None
        if origem_tipo == "almoxarifado":
            origem_central_id = _norm_id(origem.get("central_id"))
        else:
            almox_doc = almox if "almox" in locals() else None
            if not almox_doc:
                almox_doc = await db.db.almoxarifados.find_one(_build_id_query(origem_almox_id or ""))
            origem_central_id = _norm_id(almox_doc.get("central_id")) if almox_doc else None

        destino_central_id: Optional[str] = None
        if destino_tipo == "almoxarifado":
            destino_central_id = _norm_id(destino.get("central_id"))
        elif destino_tipo == "sub_almoxarifado":
            dest_almox_id = _norm_id(destino.get("almoxarifado_id"))
            dest_almox = await db.db.almoxarifados.find_one(_build_id_query(dest_almox_id or ""))
            destino_central_id = _norm_id(dest_almox.get("central_id")) if dest_almox else None
        else:
            chain = await _resolve_parent_chain_from_setor(destino)
            destino_central_id = _norm_id(chain.get("central_id"))

        if origem_central_id and destino_central_id and origem_central_id != destino_central_id:
            if not bool(destino.get("can_receive_inter_central", False)):
                raise HTTPException(status_code=403, detail="Destino não autorizado para recebimento de outra central")

    # 4. Verificar Saldo na Origem
    estoque_origem = await db.db.estoques.find_one({
        "produto_id": pid_out,
        "local_tipo": origem_tipo,
        "local_id": oid_out
    })
    
    saldo_atual = float(estoque_origem.get("quantidade_disponivel", 0)) if estoque_origem else 0
    if saldo_atual < req.quantidade:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente na origem. Disponível: {saldo_atual}")

    now = _now_utc()

    # 5. Decrementar Origem
    await db.db.estoques.update_one(
        {"_id": estoque_origem["_id"]},
        {
            "$inc": {
                "quantidade": -req.quantidade,
                "quantidade_disponivel": -req.quantidade
            },
            "$set": {"updated_at": now}
        }
    )

    # 6. Incrementar Destino (Upsert)
    estoque_dest_filter = {
        'produto_id': pid_out, 
        'local_tipo': destino_tipo, 
        'local_id': did_out
    }
    
    estoque_dest_update = {
        '$inc': {
            'quantidade': req.quantidade,
            'quantidade_disponivel': req.quantidade
        },
        '$set': {
            'produto_id': pid_out,
            'local_tipo': destino_tipo,
            'local_id': did_out,
            'nome_local': destino_nome,
            'updated_at': now
        },
        '$setOnInsert': {
            'created_at': now
        }
    }
    
    # Adicionar campos de relacionamento específicos
    if destino_tipo == 'setor':
        estoque_dest_update['$set']['setor_id'] = did_out
        estoque_dest_update['$set']['almoxarifado_id'] = _norm_id(destino.get("almoxarifado_id"))
        sub_ids = [str(x) for x in (destino.get("sub_almoxarifado_ids") or []) if x]
        if not sub_ids:
            single_sub = _norm_id(destino.get("sub_almoxarifado_id"))
            sub_ids = [single_sub] if single_sub else []
        estoque_dest_update['$set']['sub_almoxarifado_id'] = sub_ids[0] if sub_ids else None
    elif destino_tipo == 'sub_almoxarifado':
        estoque_dest_update['$set']['sub_almoxarifado_id'] = did_out
        almox_id = _norm_id(destino.get("almoxarifado_id"))
        if almox_id:
            almox = await db.db.almoxarifados.find_one(_build_id_query(almox_id))
            estoque_dest_update['$set']['almoxarifado_id'] = _public_id(almox) or almox_id if almox else almox_id
    else:
        estoque_dest_update['$set']['almoxarifado_id'] = did_out

    await db.db.estoques.find_one_and_update(
        estoque_dest_filter,
        estoque_dest_update,
        upsert=True
    )

    # 7. Registrar Movimentação
    mov_tipo = 'distribuicao' if destino_tipo == 'setor' else 'transferencia'
    mov_doc = {
        'produto_id': pid_out,
        'tipo': mov_tipo,
        'quantidade': req.quantidade,
        'data_movimentacao': now,
        'origem_nome': origem_nome,
        'destino_nome': destino_nome,
        'usuario_responsavel': user.get("id"),
        'observacoes': req.observacoes,
        'local_origem_id': oid_out,
        'local_destino_id': did_out,
        'local_origem_tipo': origem_tipo,
        'local_destino_tipo': destino_tipo,
        'created_at': now
    }
    
    await db.db.movimentacoes.insert_one(mov_doc)
    
    return {"status": "success", "message": "Distribuição realizada com sucesso"}

@app.post("/api/movimentacoes/consumo")
async def post_consumo_setor(req: SetorConsumoRequest, user: Dict[str, Any] = Depends(_require_roles(["operador_setor"]))):
    if req.quantidade <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")
    scope_id = user.get("scope_id")
    if not scope_id:
        raise HTTPException(status_code=400, detail="Usuário sem setor associado")
    setor = await _find_one_by_id("setores", scope_id)
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    setor_id = _public_id(setor) or scope_id

    prod_query = {"$or": [{"_id": req.produto_id}, {"id": req.produto_id}, {"codigo": req.produto_id}]}
    if ObjectId.is_valid(req.produto_id):
        prod_query["$or"].append({"_id": ObjectId(req.produto_id)})
    elif req.produto_id.isdigit():
        prod_query["$or"].append({"id": int(req.produto_id)})
    produto = await db.db.produtos.find_one(prod_query)
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    pid_out = produto.get("id") if produto.get("id") is not None else str(produto.get("_id"))

    sid_values: List[Any] = [setor_id]
    if str(setor_id).isdigit():
        sid_values.append(int(str(setor_id)))
    estoque = await db.db.estoques.find_one({
        "produto_id": pid_out,
        "$or": [
            {"setor_id": {"$in": sid_values}},
            {"local_tipo": "setor", "local_id": {"$in": sid_values}},
        ],
    })
    saldo_atual = float(estoque.get("quantidade_disponivel", 0)) if estoque else 0.0
    if saldo_atual < req.quantidade:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente no setor. Disponível: {saldo_atual}")

    now = _now_utc()
    await db.db.estoques.update_one(
        {"_id": estoque["_id"]},
        {"$inc": {"quantidade": -req.quantidade, "quantidade_disponivel": -req.quantidade}, "$set": {"updated_at": now}},
    )
    mov_doc = {
        "produto_id": pid_out,
        "tipo": "saida",
        "quantidade": req.quantidade,
        "data_movimentacao": now,
        "origem_nome": setor.get("nome") or "Setor",
        "destino_nome": "Consumo",
        "usuario_responsavel": user.get("id"),
        "observacoes": req.observacoes,
        "local_origem_id": setor_id,
        "local_origem_tipo": "setor",
        "local_destino_id": None,
        "local_destino_tipo": "consumo",
        "created_at": now,
    }
    await db.db.movimentacoes.insert_one(mov_doc)
    return {"status": "success", "message": "Consumo registrado com sucesso"}

@app.get("/api/demandas")
async def get_demandas(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    mine: Optional[bool] = False,
    user: Dict[str, Any] = Depends(get_current_user),
):
    role = user.get("role")
    scope_id = user.get("scope_id")
    query: Dict[str, Any] = {}
    if status:
        query["status"] = (status or "").strip().lower()
    if mine or role == "operador_setor":
        if not scope_id:
            return {"items": [], "pagination": {"total": 0, "page": 1, "pages": 1}}
        setor = await _find_one_by_id("setores", scope_id)
        if not setor:
            return {"items": [], "pagination": {"total": 0, "page": 1, "pages": 1}}
        sid = _public_id(setor) or scope_id
        query["setor_id"] = sid
    else:
        if role == "admin_central" and scope_id:
            query["central_id"] = scope_id
        elif role == "gerente_almox" and scope_id:
            query["almoxarifado_id"] = scope_id
        elif role == "resp_sub_almox" and scope_id:
            query["sub_almoxarifado_id"] = scope_id

    total = await db.db.demandas.count_documents(query)
    pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, pages))
    skip = max(0, (page - 1) * per_page)
    docs = await db.db.demandas.find(query).sort([("updated_at", -1), ("created_at", -1)]).skip(skip).limit(per_page).to_list(length=per_page)

    prod_ids: List[str] = []
    setor_ids: List[str] = []
    for d in docs:
        if d.get("setor_id") is not None:
            setor_ids.append(str(d.get("setor_id")))
        for it in (d.get("items") or []):
            if it and it.get("produto_id") is not None:
                prod_ids.append(str(it.get("produto_id")))
    prod_ids = list(dict.fromkeys(prod_ids))
    setor_ids = list(dict.fromkeys(setor_ids))

    prod_oid = [ObjectId(x) for x in prod_ids if ObjectId.is_valid(x)]
    prod_int = [int(x) for x in prod_ids if str(x).isdigit()]
    prod_docs = await db.db.produtos.find({"$or": [{"_id": {"$in": prod_oid}}, {"id": {"$in": prod_ids + prod_int}}]}, {"nome": 1, "codigo": 1, "id": 1}).to_list(length=5000)
    prod_lookup: Dict[str, Dict[str, Any]] = {}
    for p in prod_docs:
        pid = _public_id(p) or str(p.get("_id"))
        prod_lookup[str(pid)] = p
        prod_lookup[str(p.get("_id"))] = p
        if p.get("id") is not None:
            prod_lookup[str(p.get("id"))] = p

    setor_oid = [ObjectId(x) for x in setor_ids if ObjectId.is_valid(x)]
    setor_int = [int(x) for x in setor_ids if str(x).isdigit()]
    setor_docs = await db.db.setores.find({"$or": [{"_id": {"$in": setor_oid}}, {"id": {"$in": setor_ids + setor_int}}]}, {"nome": 1, "id": 1}).to_list(length=5000)
    setor_lookup: Dict[str, Dict[str, Any]] = {}
    for s in setor_docs:
        sid = _public_id(s) or str(s.get("_id"))
        setor_lookup[str(sid)] = s
        setor_lookup[str(s.get("_id"))] = s
        if s.get("id") is not None:
            setor_lookup[str(s.get("id"))] = s

    items_out = []
    for d in docs:
        created_at = d.get("created_at")
        updated_at = d.get("updated_at")
        sdoc = setor_lookup.get(str(d.get("setor_id")), {})
        its = []
        for it in (d.get("items") or []):
            pid = str(it.get("produto_id")) if it and it.get("produto_id") is not None else None
            pdoc = prod_lookup.get(pid or "", {})
            its.append({
                "produto_id": pid,
                "produto_nome": pdoc.get("nome") or "-",
                "produto_codigo": pdoc.get("codigo") or "-",
                "quantidade": float(it.get("quantidade") or 0),
                "atendido": float(it.get("atendido") or 0),
                "observacao": it.get("observacao") or "",
            })
        items_out.append({
            "id": str(d.get("_id")),
            "setor_id": str(d.get("setor_id")) if d.get("setor_id") is not None else None,
            "setor_nome": sdoc.get("nome") if sdoc else None,
            "destino_tipo": d.get("destino_tipo"),
            "status": d.get("status") or "pendente",
            "observacoes": d.get("observacoes"),
            "items": its,
            "created_at": _dt_to_utc_iso(created_at),
            "updated_at": _dt_to_utc_iso(updated_at),
        })

    return {"items": items_out, "pagination": {"total": total, "page": page, "pages": pages, "per_page": per_page}}

@app.post("/api/demandas")
async def create_demanda(req: DemandaCreateRequest, user: Dict[str, Any] = Depends(_require_roles(["operador_setor"]))):
    scope_id = user.get("scope_id")
    if not scope_id:
        raise HTTPException(status_code=400, detail="Usuário sem setor associado")
    setor = await _find_one_by_id("setores", scope_id)
    if not setor:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    sid = _public_id(setor) or scope_id
    chain = await _resolve_parent_chain_from_setor(setor)

    if not req.items:
        raise HTTPException(status_code=400, detail="Informe pelo menos um item")

    items_out = []
    for it in req.items:
        if it.quantidade <= 0:
            raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")
        prod_query = {"$or": [{"_id": it.produto_id}, {"id": it.produto_id}, {"codigo": it.produto_id}]}
        if ObjectId.is_valid(it.produto_id):
            prod_query["$or"].append({"_id": ObjectId(it.produto_id)})
        elif it.produto_id.isdigit():
            prod_query["$or"].append({"id": int(it.produto_id)})
        produto = await db.db.produtos.find_one(prod_query, {"id": 1, "_id": 1})
        if not produto:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        pid_out = produto.get("id") if produto.get("id") is not None else str(produto.get("_id"))
        items_out.append({"produto_id": str(pid_out), "quantidade": float(it.quantidade), "atendido": 0.0, "observacao": it.observacao})

    now = _now_utc()
    doc = {
        "setor_id": sid,
        "central_id": chain.get("central_id"),
        "almoxarifado_id": chain.get("almoxarifado_id"),
        "sub_almoxarifado_id": chain.get("sub_almoxarifado_id"),
        "usuario_id": user.get("id"),
        "destino_tipo": (req.destino_tipo or "almoxarifado").strip().lower(),
        "status": "pendente",
        "observacoes": req.observacoes,
        "items": items_out,
        "atendimento": [],
        "created_at": now,
        "updated_at": now,
    }
    res = await db.db.demandas.insert_one(doc)
    return {"id": str(res.inserted_id), "status": "success"}

@app.get("/api/demandas/{demanda_id}")
async def get_demanda(demanda_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    role = user.get("role")
    scope_id = user.get("scope_id")
    q = {"_id": ObjectId(demanda_id)} if ObjectId.is_valid(demanda_id) else _build_id_query(demanda_id)
    doc = await db.db.demandas.find_one(q)
    if not doc:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")

    if role == "operador_setor":
        if not scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
        setor = await _find_one_by_id("setores", scope_id)
        sid = _public_id(setor) or scope_id if setor else scope_id
        if _norm_id(doc.get("setor_id")) != _norm_id(sid):
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "admin_central" and scope_id:
        if _norm_id(doc.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "gerente_almox" and scope_id:
        if _norm_id(doc.get("almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "resp_sub_almox" and scope_id:
        if _norm_id(doc.get("sub_almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    created_at = doc.get("created_at")
    updated_at = doc.get("updated_at")
    atendimento_in = doc.get("atendimento") or []
    atendimento_out = []
    for a in atendimento_in:
        if not isinstance(a, dict):
            continue
        atendimento_out.append({
            **a,
            "created_at": _dt_to_utc_iso(a.get("created_at")),
        })
    return {
        "id": str(doc.get("_id")),
        "setor_id": str(doc.get("setor_id")) if doc.get("setor_id") is not None else None,
        "destino_tipo": doc.get("destino_tipo"),
        "status": doc.get("status") or "pendente",
        "observacoes": doc.get("observacoes"),
        "items": doc.get("items") or [],
        "atendimento": atendimento_out,
        "created_at": _dt_to_utc_iso(created_at),
        "updated_at": _dt_to_utc_iso(updated_at),
    }

@app.delete("/api/demandas/{demanda_id}")
async def delete_demanda(demanda_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    q = {"_id": ObjectId(demanda_id)} if ObjectId.is_valid(demanda_id) else _build_id_query(demanda_id)
    doc = await db.db.demandas.find_one(q)
    if not doc:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")

    role = user.get("role")
    scope_id = user.get("scope_id")

    if role == "operador_setor":
        if not scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
        setor = await _find_one_by_id("setores", scope_id)
        sid = (_public_id(setor) or scope_id) if setor else scope_id
        if _norm_id(doc.get("setor_id")) != _norm_id(sid):
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "admin_central" and scope_id:
        if _norm_id(doc.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "gerente_almox" and scope_id:
        if _norm_id(doc.get("almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    elif role == "resp_sub_almox" and scope_id:
        if _norm_id(doc.get("sub_almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    if role not in ("super_admin", "admin_central", "gerente_almox", "resp_sub_almox", "operador_setor"):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if (doc.get("status") or "").strip().lower() == "atendido":
        raise HTTPException(status_code=400, detail="Demanda atendida não pode ser excluída")
    if doc.get("atendimento"):
        raise HTTPException(status_code=400, detail="Demanda com atendimento não pode ser excluída")

    res = await db.db.demandas.delete_one({"_id": doc["_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    return {"status": "success"}

@app.put("/api/demandas/{demanda_id}/atender")
async def atender_demanda(demanda_id: str, req: DemandaAtenderRequest, user: Dict[str, Any] = Depends(_require_roles(["super_admin", "admin_central", "gerente_almox", "resp_sub_almox"]))):
    if not req.items:
        raise HTTPException(status_code=400, detail="Informe pelo menos um item")
    origem_tipo = (req.origem_tipo or "").strip()
    if origem_tipo not in ("almoxarifado", "sub_almoxarifado"):
        raise HTTPException(status_code=400, detail="Tipo de origem inválido")

    q = {"_id": ObjectId(demanda_id)} if ObjectId.is_valid(demanda_id) else _build_id_query(demanda_id)
    demanda = await db.db.demandas.find_one(q)
    if not demanda:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")

    role = user.get("role")
    scope_id = user.get("scope_id")
    if role == "admin_central" and scope_id:
        if _norm_id(demanda.get("central_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "gerente_almox" and scope_id:
        if _norm_id(demanda.get("almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")
    if role == "resp_sub_almox" and scope_id:
        if _norm_id(demanda.get("sub_almoxarifado_id")) != scope_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

    setor_doc = await _find_one_by_id("setores", str(demanda.get("setor_id")))
    if not setor_doc:
        raise HTTPException(status_code=404, detail="Setor da demanda não encontrado")
    setor_id = _public_id(setor_doc) or str(demanda.get("setor_id"))

    origem_doc = await db.db[("almoxarifados" if origem_tipo == "almoxarifado" else "sub_almoxarifados")].find_one(_build_id_query(req.origem_id))
    if not origem_doc:
        raise HTTPException(status_code=404, detail="Local de origem não encontrado")
    origem_id_out = _public_id(origem_doc) or req.origem_id
    origem_nome = origem_doc.get("nome") or "Origem"

    now = _now_utc()

    async def move_item(pid_out: str, quantidade: float, obs: Optional[str]):
        estoque_origem = await db.db.estoques.find_one({"produto_id": pid_out, "local_tipo": origem_tipo, "local_id": origem_id_out})
        saldo_atual = float(estoque_origem.get("quantidade_disponivel", 0)) if estoque_origem else 0.0
        if saldo_atual < quantidade:
            raise HTTPException(status_code=400, detail=f"Saldo insuficiente na origem para produto {pid_out}. Disponível: {saldo_atual}")
        await db.db.estoques.update_one(
            {"_id": estoque_origem["_id"]},
            {"$inc": {"quantidade": -quantidade, "quantidade_disponivel": -quantidade}, "$set": {"updated_at": now}},
        )

        estoque_dest_filter = {"produto_id": pid_out, "local_tipo": "setor", "local_id": setor_id}
        estoque_dest_update: Dict[str, Any] = {
            "$inc": {"quantidade": quantidade, "quantidade_disponivel": quantidade},
            "$set": {"produto_id": pid_out, "local_tipo": "setor", "local_id": setor_id, "nome_local": setor_doc.get("nome") or "Setor", "updated_at": now},
            "$setOnInsert": {"created_at": now},
        }
        chain2 = await _resolve_parent_chain_from_setor(setor_doc)
        estoque_dest_update["$set"]["setor_id"] = setor_id
        estoque_dest_update["$set"]["almoxarifado_id"] = chain2.get("almoxarifado_id")
        estoque_dest_update["$set"]["sub_almoxarifado_id"] = chain2.get("sub_almoxarifado_id")

        await db.db.estoques.find_one_and_update(estoque_dest_filter, estoque_dest_update, upsert=True)

        mov_doc = {
            "produto_id": pid_out,
            "tipo": "distribuicao",
            "quantidade": quantidade,
            "data_movimentacao": now,
            "origem_nome": origem_nome,
            "destino_nome": setor_doc.get("nome") or "Setor",
            "usuario_responsavel": user.get("id"),
            "observacoes": obs,
            "local_origem_id": origem_id_out,
            "local_destino_id": setor_id,
            "local_origem_tipo": origem_tipo,
            "local_destino_tipo": "setor",
            "created_at": now,
        }
        await db.db.movimentacoes.insert_one(mov_doc)

    items = demanda.get("items") or []
    by_pid = {str(it.get("produto_id")): it for it in items if it and it.get("produto_id") is not None}
    atendimento_items = []
    for it in req.items:
        pid = str(it.produto_id)
        qv = float(it.quantidade or 0)
        if qv <= 0:
            continue
        existing = by_pid.get(pid)
        if not existing:
            raise HTTPException(status_code=400, detail="Item não pertence à demanda")
        solicitado = float(existing.get("quantidade") or 0)
        atendido = float(existing.get("atendido") or 0)
        restante = max(0.0, solicitado - atendido)
        if qv > restante:
            raise HTTPException(status_code=400, detail="Quantidade atende maior que o restante")
        await move_item(pid, qv, req.observacoes)
        existing["atendido"] = atendido + qv
        atendimento_items.append({"produto_id": pid, "quantidade": qv})

    if not atendimento_items:
        raise HTTPException(status_code=400, detail="Nada para atender")

    status_out = "pendente"
    any_atendido = any(float((it or {}).get("atendido") or 0) > 0 for it in items)
    all_full = all(float((it or {}).get("atendido") or 0) >= float((it or {}).get("quantidade") or 0) for it in items) if items else False
    if all_full:
        status_out = "atendido"
    elif any_atendido:
        status_out = "parcial"

    atendimento_entry = {"atendido_por": user.get("id"), "origem_tipo": origem_tipo, "origem_id": origem_id_out, "items": atendimento_items, "created_at": now}
    await db.db.demandas.update_one(
        q,
        {"$set": {"items": items, "status": status_out, "updated_at": now}, "$push": {"atendimento": atendimento_entry}},
    )
    return {"status": "success", "demanda_status": status_out}

@app.get("/api/dashboard/charts/consumo")
async def get_chart_consumo():
    # Agrupar saídas por destino (Setor)
    pipeline = [
        {"$match": {"tipo": "distribuicao"}},
        {"$group": {"_id": "$destino_nome", "total": {"$sum": "$quantidade"}}},
        {"$sort": {"total": -1}},
        {"$limit": 5}
    ]
    data = await db.db.movimentacoes.aggregate(pipeline).to_list(length=5)
    return [{"name": d["_id"], "value": d["total"]} for d in data]

@app.get("/api/dashboard/charts/movimentacoes")
async def get_chart_movimentacoes():
    # Agrupar por data (últimos 7 dias)
    # Nota: Em produção, usar range de datas adequado
    pipeline = [
        {"$match": {"data_movimentacao": {"$exists": True}}},
        {"$project": {
            "tipo": 1, 
            "quantidade": 1,
            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$data_movimentacao"}}
        }},
        {"$group": {
            "_id": {"date": "$date", "tipo": "$tipo"},
            "total": {"$sum": "$quantidade"}
        }},
        {"$sort": {"_id.date": 1}}
    ]
    raw = await db.db.movimentacoes.aggregate(pipeline).to_list(length=100)
    
    # Processar para formato do gráfico (Data, Entrada, Saida)
    processed = {}
    for r in raw:
        dt = r["_id"]["date"]
        if dt not in processed: processed[dt] = {"date": dt, "entrada": 0, "saida": 0}
        
        tipo = r["_id"]["tipo"]
        if tipo == "entrada": processed[dt]["entrada"] += r["total"]
        elif tipo in ["saida", "distribuicao"]: processed[dt]["saida"] += r["total"]
        
    # Retornar lista ordenada
    return sorted(list(processed.values()), key=lambda x: x["date"])[-7:]

# Adaptador para Vercel Serverless
from mangum import Mangum
handler = Mangum(app)
