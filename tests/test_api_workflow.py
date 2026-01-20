from flask import session
import extensions


def _get_csrf_token(client):
    # Trigger CSRF provisioning via non-API GET
    client.get('/')
    with client.session_transaction() as sess:
        return sess.get('csrf_token')


def _json_headers(token):
    return {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
    }


def test_csrf_login_and_transfer_workflow(app, client):
    # 1) Login as seeded admin (super_admin)
    resp = client.post('/auth/login', json={'username': 'admin', 'password': 'admin'})
    assert resp.status_code == 200
    assert resp.get_json().get('message') == 'Login realizado com sucesso'

    # 2) Acquire CSRF token from session
    csrf = _get_csrf_token(client)
    assert csrf, 'CSRF token should be present in session after GET to /'

    # 3) Create a Central
    resp = client.post('/api/centrais', json={'nome': 'Central Teste', 'descricao': 'Central E2E', 'ativo': True}, headers=_json_headers(csrf))
    assert resp.status_code == 200
    central_id = resp.get_json().get('id')
    assert central_id is not None

    # 4) Create an Almoxarifado linked to central
    resp = client.post('/api/almoxarifados', json={'nome': 'Almox Principal', 'descricao': 'Almox E2E', 'ativo': True, 'central_id': central_id}, headers=_json_headers(csrf))
    assert resp.status_code == 200
    almox_id = resp.get_json().get('id')
    assert almox_id is not None

    # 5) Create a Sub-Almoxarifado under the almoxarifado
    resp = client.post('/api/sub-almoxarifados', json={'nome': 'Sub 1', 'descricao': 'Sub E2E', 'ativo': True, 'almoxarifado_id': almox_id}, headers=_json_headers(csrf))
    assert resp.status_code == 200
    sub_id = resp.get_json().get('id')
    assert sub_id is not None

    # 6) Create a Setor linked to the sub-almoxarifado
    resp = client.post('/api/setores', json={'nome': 'Enfermaria', 'descricao': 'Setor E2E', 'ativo': True, 'sub_almoxarifado_ids': [sub_id]}, headers=_json_headers(csrf))
    assert resp.status_code == 200
    setor_id = resp.get_json().get('id')
    assert setor_id is not None

    # 7) Create a Produto (free-text categoria optional)
    produto_payload = {
        'central_id': central_id,
        'codigo': 'TEST-E2E-0001',
        'nome': 'Seringa 10ml',
        'descricao': 'Produto de teste',
        'ativo': True,
        'categoria': 'Insumos',
    }
    resp = client.post('/api/produtos', json=produto_payload, headers=_json_headers(csrf))
    assert resp.status_code == 200
    produto_id = resp.get_json().get('id')
    assert produto_id is not None

    # 8) Register a recebimento into the almoxarifado
    rec_payload = {
        'almoxarifado_id': almox_id,
        'quantidade': 10,
        'fornecedor': 'Fornecedor X',
        'lote': 'L001',
        'data_fabricacao': '2025-10-01T00:00:00',
        'data_vencimento': '2026-10-01T00:00:00',
        'observacoes': 'Recebimento inicial E2E',
    }
    resp = client.post(f'/api/produtos/{produto_id}/recebimento', json=rec_payload, headers=_json_headers(csrf))
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get('success') is True
    estoque = data.get('estoque') or {}
    assert float(estoque.get('quantidade', 0)) == 10

    # 9) Transfer 4 units from almoxarifado to sub-almoxarifado
    transf_payload = {
        'produto_id': produto_id,
        'quantidade': 4,
        'motivo': 'Teste de transferência',
        'origem': {'tipo': 'almoxarifado', 'id': almox_id},
        'destino': {'tipo': 'sub_almoxarifado', 'id': sub_id},
    }
    resp = client.post('/api/movimentacoes/transferencia', json=transf_payload, headers=_json_headers(csrf))
    assert resp.status_code == 200
    tdata = resp.get_json()
    assert tdata.get('success') is True
    dest = tdata.get('estoque_destino') or {}
    assert dest.get('local_tipo') == 'sub_almoxarifado'
    assert str(dest.get('local_id')) == str(sub_id)
    assert float(dest.get('quantidade', 0)) == 4

    # 10) Validate movimentacoes include 'entrada' and 'transferencia'
    resp = client.get(f'/api/produtos/{produto_id}/movimentacoes')
    assert resp.status_code == 200
    movs = resp.get_json().get('items') or resp.get_json().get('movimentacoes') or []
    tipos = {m.get('tipo') for m in movs}
    assert 'entrada' in tipos
    assert 'transferencia' in tipos

    # 11) Validate origem estoque decreased to 6 and destino has 4 via Mongo
    with app.app_context():
        estoques = extensions.mongo_db['estoques']
        pid_out = produto_id  # produto_id stored as string _id in mov/estoque per code
        origem_doc = estoques.find_one({'produto_id': pid_out, 'local_tipo': 'almoxarifado', 'local_id': almox_id})
        destino_doc = estoques.find_one({'produto_id': pid_out, 'local_tipo': 'sub_almoxarifado', 'local_id': sub_id})
        assert origem_doc is not None
        assert destino_doc is not None
        assert float(origem_doc.get('quantidade', 0)) == 6
        assert float(destino_doc.get('quantidade', 0)) == 4


def test_fastapi_update_lote_updates_estoque():
    import asyncio
    from datetime import datetime, timezone

    from bson import ObjectId
    import mongomock

    from fastapi_app.main import MONGO_DB
    from fastapi_app.main import LoteUpdate
    from fastapi_app.main import _AsyncMockDatabase
    from fastapi_app.main import db as fastapi_db
    from fastapi_app.main import get_produto_detalhes
    from fastapi_app.main import update_lote

    fastapi_db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
    fastapi_db.client = None
    fastapi_db.is_mock = True

    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    produto_oid = ObjectId()
    lote_oid = ObjectId()

    async def _seed():
        await fastapi_db.db.usuarios.insert_one({"_id": user_id, "role": "super_admin", "ativo": True})
        await fastapi_db.db.produtos.insert_one({"_id": produto_oid, "nome": "Produto Teste", "codigo": "P-TESTE"})
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": str(produto_oid),
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "quantidade": 100.0,
                "quantidade_disponivel": 100.0,
                "created_at": now,
                "updated_at": now,
            }
        )
        await fastapi_db.db.lotes.insert_one(
            {
                "_id": lote_oid,
                "produto_id": str(produto_oid),
                "numero_lote": "L001",
                "quantidade_atual": 100.0,
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "created_at": now,
                "updated_at": now,
            }
        )

    asyncio.run(_seed())

    user_ctx = {"id": str(user_id), "role": "super_admin", "scope_id": None}
    asyncio.run(update_lote(str(lote_oid), LoteUpdate(quantidade_atual=30), user=user_ctx))

    async def _read_estoque():
        return await fastapi_db.db.estoques.find_one({"produto_id": str(produto_oid), "local_tipo": "almoxarifado", "local_id": "ALMOX1"})

    estoque_doc = asyncio.run(_read_estoque()) or {}
    assert float(estoque_doc.get("quantidade", 0)) == 30.0
    assert float(estoque_doc.get("quantidade_disponivel", 0)) == 30.0

    prod = asyncio.run(get_produto_detalhes(str(produto_oid), user=user_ctx))
    assert float(prod.get("estoque_total", 0)) == 30.0


def test_fastapi_delete_lote_updates_estoque():
    import asyncio
    from datetime import datetime, timezone

    from bson import ObjectId
    import mongomock

    from fastapi_app.main import MONGO_DB
    from fastapi_app.main import _AsyncMockDatabase
    from fastapi_app.main import db as fastapi_db
    from fastapi_app.main import delete_lote
    from fastapi_app.main import get_produto_detalhes

    fastapi_db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
    fastapi_db.client = None
    fastapi_db.is_mock = True

    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    produto_oid = ObjectId()
    lote_oid = ObjectId()

    async def _seed():
        await fastapi_db.db.usuarios.insert_one({"_id": user_id, "role": "super_admin", "ativo": True})
        await fastapi_db.db.produtos.insert_one({"_id": produto_oid, "nome": "Produto Teste", "codigo": "P-TESTE"})
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": str(produto_oid),
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "quantidade": 30.0,
                "quantidade_atual": 30.0,
                "quantidade_disponivel": 30.0,
                "created_at": now,
                "updated_at": now,
            }
        )
        await fastapi_db.db.lotes.insert_one(
            {
                "_id": lote_oid,
                "produto_id": str(produto_oid),
                "numero_lote": "L001",
                "quantidade_atual": 30.0,
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "created_at": now,
                "updated_at": now,
            }
        )

    asyncio.run(_seed())

    user_ctx = {"id": str(user_id), "role": "super_admin", "scope_id": None}
    asyncio.run(delete_lote(str(lote_oid), user=user_ctx))

    async def _read_estoque():
        return await fastapi_db.db.estoques.find_one({"produto_id": str(produto_oid), "local_tipo": "almoxarifado", "local_id": "ALMOX1"})

    estoque_doc = asyncio.run(_read_estoque()) or {}
    assert float(estoque_doc.get("quantidade", 0)) == 0.0
    assert float(estoque_doc.get("quantidade_atual", 0)) == 0.0
    assert float(estoque_doc.get("quantidade_disponivel", 0)) == 0.0

    prod = asyncio.run(get_produto_detalhes(str(produto_oid), user=user_ctx))
    assert float(prod.get("estoque_total", 0)) == 0.0
    assert (prod.get("lotes") or []) == []


def test_fastapi_super_admin_can_force_delete_lote_even_if_mismatch():
    import asyncio
    from datetime import datetime, timezone

    from bson import ObjectId
    import mongomock

    from fastapi_app.main import MONGO_DB
    from fastapi_app.main import _AsyncMockDatabase
    from fastapi_app.main import db as fastapi_db
    from fastapi_app.main import delete_lote

    fastapi_db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
    fastapi_db.client = None
    fastapi_db.is_mock = True

    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    produto_oid = ObjectId()
    lote_oid = ObjectId()

    async def _seed():
        await fastapi_db.db.usuarios.insert_one({"_id": user_id, "role": "super_admin", "ativo": True})
        await fastapi_db.db.produtos.insert_one({"_id": produto_oid, "nome": "Produto Teste", "codigo": "P-TESTE"})
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": str(produto_oid),
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "quantidade": 0.0,
                "quantidade_atual": 0.0,
                "quantidade_disponivel": 0.0,
                "created_at": now,
                "updated_at": now,
            }
        )
        await fastapi_db.db.lotes.insert_one(
            {
                "_id": lote_oid,
                "produto_id": str(produto_oid),
                "numero_lote": "L001",
                "quantidade_atual": 30.0,
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "created_at": now,
                "updated_at": now,
            }
        )

    asyncio.run(_seed())

    user_ctx = {"id": str(user_id), "role": "super_admin", "scope_id": None}
    asyncio.run(delete_lote(str(lote_oid), user=user_ctx))

    async def _read_estoque():
        return await fastapi_db.db.estoques.find_one({"produto_id": str(produto_oid), "local_tipo": "almoxarifado", "local_id": "ALMOX1"})

    estoque_doc = asyncio.run(_read_estoque()) or {}
    assert float(estoque_doc.get("quantidade", 0)) == 0.0
    assert float(estoque_doc.get("quantidade_atual", 0)) == 0.0
    assert float(estoque_doc.get("quantidade_disponivel", 0)) == 0.0


def test_fastapi_super_admin_can_purge_produto_data_on_delete_lote():
    import asyncio
    from datetime import datetime, timezone

    from bson import ObjectId
    import mongomock

    from fastapi_app.main import MONGO_DB
    from fastapi_app.main import _AsyncMockDatabase
    from fastapi_app.main import db as fastapi_db
    from fastapi_app.main import delete_lote
    from fastapi_app.main import get_produto_detalhes

    fastapi_db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
    fastapi_db.client = None
    fastapi_db.is_mock = True

    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    produto_oid = ObjectId()
    lote_oid = ObjectId()

    async def _seed():
        await fastapi_db.db.usuarios.insert_one({"_id": user_id, "role": "super_admin", "ativo": True})
        await fastapi_db.db.produtos.insert_one({"_id": produto_oid, "nome": "Produto Teste", "codigo": "P-TESTE", "observacoes": ""})
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": str(produto_oid),
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "quantidade": 10.0,
                "quantidade_atual": 10.0,
                "quantidade_disponivel": 10.0,
                "created_at": now,
                "updated_at": now,
            }
        )
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": "P-TESTE",
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "quantidade": 5.0,
                "quantidade_atual": 5.0,
                "quantidade_disponivel": 5.0,
                "created_at": now,
                "updated_at": now,
            }
        )
        await fastapi_db.db.movimentacoes.insert_one(
            {
                "_id": ObjectId(),
                "produto_id": str(produto_oid),
                "tipo": "entrada",
                "quantidade": 10.0,
                "created_at": now,
                "data_movimentacao": now,
                "origem_nome": "Almox",
                "destino_nome": "Almox",
            }
        )
        await fastapi_db.db.movimentacoes.insert_one(
            {
                "_id": ObjectId(),
                "produto_id": "P-TESTE",
                "tipo": "entrada",
                "quantidade": 5.0,
                "created_at": now,
                "data_movimentacao": now,
                "origem_nome": "Almox",
                "destino_nome": "Almox",
            }
        )
        await fastapi_db.db.lotes.insert_one(
            {
                "_id": lote_oid,
                "produto_id": str(produto_oid),
                "numero_lote": "L001",
                "quantidade_atual": 10.0,
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "created_at": now,
                "updated_at": now,
            }
        )

    asyncio.run(_seed())

    user_ctx = {"id": str(user_id), "role": "super_admin", "scope_id": None}
    asyncio.run(delete_lote(str(lote_oid), purge_produto=True, user=user_ctx))

    async def _count():
        c_estoque = await fastapi_db.db.estoques.count_documents({"produto_id": {"$in": [str(produto_oid), "P-TESTE"]}})
        c_mov = await fastapi_db.db.movimentacoes.count_documents({"produto_id": {"$in": [str(produto_oid), "P-TESTE"]}})
        return c_estoque, c_mov

    c_estoque, c_mov = asyncio.run(_count())
    assert c_estoque == 0
    assert c_mov == 0

    prod = asyncio.run(get_produto_detalhes(str(produto_oid), user=user_ctx))
    assert float(prod.get("estoque_total", 0)) == 0.0
    assert (prod.get("lotes") or []) == []
    assert "[LIMPEZA]" in (prod.get("observacao") or "")


def test_fastapi_produto_detalhes_agrupa_locais_com_ids_diferentes():
    import asyncio
    from datetime import datetime, timezone

    from bson import ObjectId
    import mongomock

    from fastapi_app.main import MONGO_DB
    from fastapi_app.main import _AsyncMockDatabase
    from fastapi_app.main import db as fastapi_db
    from fastapi_app.main import get_produto_detalhes

    fastapi_db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
    fastapi_db.client = None
    fastapi_db.is_mock = True

    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    produto_oid = ObjectId()
    almox_oid = ObjectId()

    async def _seed():
        await fastapi_db.db.usuarios.insert_one({"_id": user_id, "role": "super_admin", "ativo": True})
        await fastapi_db.db.produtos.insert_one({"_id": produto_oid, "nome": "Produto Teste", "codigo": "P-TESTE"})
        await fastapi_db.db.almoxarifados.insert_one({"_id": almox_oid, "id": "ALMOX1", "nome": "Almox Teste"})
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": str(produto_oid),
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "quantidade": 90.0,
                "quantidade_disponivel": 90.0,
                "created_at": now,
                "updated_at": now,
            }
        )
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": str(produto_oid),
                "local_tipo": "almoxarifado",
                "local_id": str(almox_oid),
                "quantidade": 0.0,
                "quantidade_disponivel": 0.0,
                "created_at": now,
                "updated_at": now,
            }
        )

    asyncio.run(_seed())
    user_ctx = {"id": str(user_id), "role": "super_admin", "scope_id": None}
    prod = asyncio.run(get_produto_detalhes(str(produto_oid), user=user_ctx))

    locais = prod.get("estoque_locais") or []
    assert len(locais) == 1


def test_fastapi_movimentacoes_filtra_por_central():
    import asyncio
    from datetime import datetime, timezone

    from bson import ObjectId
    import mongomock

    from fastapi_app.main import MONGO_DB
    from fastapi_app.main import _AsyncMockDatabase
    from fastapi_app.main import db as fastapi_db
    from fastapi_app.main import get_movimentacoes

    fastapi_db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
    fastapi_db.client = None
    fastapi_db.is_mock = True

    now = datetime.now(timezone.utc)
    user_id = ObjectId()

    async def _seed():
        await fastapi_db.db.centrais.insert_one({"id": "CENT1", "nome": "Central 1"})
        await fastapi_db.db.usuarios.insert_one({"_id": user_id, "role": "admin_central", "scope_id": "CENT1", "ativo": True})
        p1 = await fastapi_db.db.produtos.insert_one({"id": "P1", "nome": "Produto 1", "codigo": "P1", "central_id": "CENT1"})
        p2 = await fastapi_db.db.produtos.insert_one({"id": "P2", "nome": "Produto 2", "codigo": "P2", "central_id": "CENT2"})
        await fastapi_db.db.movimentacoes.insert_one({"produto_id": "P1", "tipo": "entrada", "quantidade": 1, "data_movimentacao": now, "created_at": now})
        await fastapi_db.db.movimentacoes.insert_one({"produto_id": "P2", "tipo": "entrada", "quantidade": 1, "data_movimentacao": now, "created_at": now})
        assert p1.inserted_id is not None
        assert p2.inserted_id is not None

    asyncio.run(_seed())

    user_ctx = {"id": str(user_id), "role": "admin_central", "scope_id": "CENT1"}
    resp = asyncio.run(get_movimentacoes(page=1, per_page=20, tipo=None, produto=None, user=user_ctx))
    items = resp.get("items") or []
    assert len(items) == 1
    assert items[0].get("produto_nome") == "Produto 1"


def test_fastapi_update_lote_grava_observacao_quando_usuario_central_altera_quantidade():
    import asyncio
    from datetime import datetime, timezone

    from bson import ObjectId
    import mongomock

    from fastapi_app.main import MONGO_DB
    from fastapi_app.main import LoteUpdate
    from fastapi_app.main import _AsyncMockDatabase
    from fastapi_app.main import db as fastapi_db
    from fastapi_app.main import update_lote

    fastapi_db.db = _AsyncMockDatabase(mongomock.MongoClient()[MONGO_DB])
    fastapi_db.client = None
    fastapi_db.is_mock = True

    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    produto_oid = ObjectId()
    lote_oid = ObjectId()

    async def _seed():
        await fastapi_db.db.centrais.insert_one({"id": "CENT1", "nome": "Central 1"})
        await fastapi_db.db.usuarios.insert_one({"_id": user_id, "role": "admin_central", "scope_id": "CENT1", "ativo": True})
        await fastapi_db.db.produtos.insert_one({"_id": produto_oid, "nome": "Produto Teste", "codigo": "P-TESTE", "central_id": "CENT1", "observacoes": ""})
        await fastapi_db.db.estoques.insert_one(
            {
                "produto_id": str(produto_oid),
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "quantidade": 100.0,
                "quantidade_disponivel": 100.0,
                "created_at": now,
                "updated_at": now,
            }
        )
        await fastapi_db.db.lotes.insert_one(
            {
                "_id": lote_oid,
                "produto_id": str(produto_oid),
                "numero_lote": "L001",
                "quantidade_atual": 100.0,
                "local_tipo": "almoxarifado",
                "local_id": "ALMOX1",
                "created_at": now,
                "updated_at": now,
            }
        )

    asyncio.run(_seed())

    user_ctx = {"id": str(user_id), "role": "admin_central", "scope_id": "CENT1"}
    asyncio.run(update_lote(str(lote_oid), LoteUpdate(quantidade_atual=30), user=user_ctx))

    async def _read_prod():
        return await fastapi_db.db.produtos.find_one({"_id": produto_oid})

    prod = asyncio.run(_read_prod()) or {}
    obs = prod.get("observacoes") or ""
    assert "[LOTE]" in obs
    assert "L001" in obs
