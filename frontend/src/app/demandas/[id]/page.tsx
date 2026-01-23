'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Loading, Page } from '@/components/ui/Page';
import { apiUrl } from '@/lib/api';

type DemandaItemRaw = { produto_id: string; quantidade: number; atendido: number; observacao?: string };
type AtendimentoEntry = {
  atendido_por?: string;
  origem_tipo?: string;
  origem_id?: string;
  items?: { produto_id: string; quantidade: number }[];
  created_at?: string;
};

type DemandaDetalhe = {
  id: string;
  setor_id?: string | null;
  destino_tipo?: string | null;
  status: string;
  observacoes?: string | null;
  items: DemandaItemRaw[];
  atendimento: AtendimentoEntry[];
  created_at?: string | null;
  updated_at?: string | null;
};

type ProdutoInfo = { id: string; nome?: string; codigo?: string };
type LocalInfo = { id: string; nome?: string };
type OrigemDisp = { origem_tipo: 'almoxarifado' | 'sub_almoxarifado'; origem_id: string; origem_nome: string; quantidade_disponivel: number };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const parseOrigemTipo = (value: unknown): OrigemDisp['origem_tipo'] | null =>
  value === 'almoxarifado' || value === 'sub_almoxarifado' ? value : null;

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
  return new Date(normalized).toLocaleString('pt-BR');
};

export default function DemandaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: demandaId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading, canAccess } = useAuth();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [demanda, setDemanda] = useState<DemandaDetalhe | null>(null);
  const [setor, setSetor] = useState<LocalInfo | null>(null);
  const [produtos, setProdutos] = useState<Record<string, ProdutoInfo>>({});

  const [origemTipo, setOrigemTipo] = useState<'almoxarifado' | 'sub_almoxarifado'>('almoxarifado');
  const [origemId, setOrigemId] = useState('');
  const [origemOptions, setOrigemOptions] = useState<{ tipo: 'almoxarifado' | 'sub_almoxarifado'; id: string; nome: string; endereco?: string; descricao?: string }[]>([]);
  const [estoqueOrigemByProdutoId, setEstoqueOrigemByProdutoId] = useState<Record<string, number>>({});
  const [estoqueSetorByProdutoId, setEstoqueSetorByProdutoId] = useState<Record<string, number>>({});
  const [origensByProdutoId, setOrigensByProdutoId] = useState<Record<string, OrigemDisp[]>>({});
  const [originTouched, setOriginTouched] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [qtyByProdutoId, setQtyByProdutoId] = useState<Record<string, string>>({});

  const mergeProdutos = useCallback((incoming: Record<string, ProdutoInfo>) => {
    setProdutos(prev => {
      const next: Record<string, ProdutoInfo> = { ...prev };
      for (const [pid, info] of Object.entries(incoming)) {
        const prevInfo = next[pid];
        const prevNome = prevInfo?.nome;
        const prevCodigo = prevInfo?.codigo;
        const nextNome = info?.nome;
        const nextCodigo = info?.codigo;

        const prevNomeIsPlaceholder = !prevNome || prevNome === pid;
        const nextNomeIsReal = !!nextNome && nextNome !== pid;
        const nextCodigoIsReal = !!nextCodigo && nextCodigo !== '-';

        if (!prevInfo) {
          next[pid] = { id: pid, nome: nextNome || pid, codigo: nextCodigo || '-' };
          continue;
        }

        const nome = nextNomeIsReal ? nextNome : prevInfo.nome;
        const codigo = nextCodigoIsReal ? nextCodigo : prevCodigo;
        if (nextNomeIsReal || prevNomeIsPlaceholder) next[pid] = { ...prevInfo, id: pid, nome, codigo };
        else if (nextCodigoIsReal && codigo !== prevCodigo) next[pid] = { ...prevInfo, id: pid, nome, codigo };
      }
      return next;
    });
  }, []);

  const canPickOrigem = useMemo(() => {
    if (!user) return false;
    return user.role === 'super_admin' || user.role === 'admin_central';
  }, [user]);

  const loadOrigens = useCallback(async (uid: string) => {
    const headers = { 'X-User-Id': uid };
    const [almsRes, subsRes] = await Promise.all([
      fetch(apiUrl('/api/almoxarifados'), { headers }),
      fetch(apiUrl('/api/sub_almoxarifados'), { headers }),
    ]);
    const almsJson: unknown = await almsRes.json().catch(() => []);
    const subsJson: unknown = await subsRes.json().catch(() => []);
    const alms = Array.isArray(almsJson) ? almsJson : [];
    const subs = Array.isArray(subsJson) ? subsJson : [];
    const options = [
      ...(Array.isArray(alms)
        ? alms.map(raw => {
            const a = isRecord(raw) ? raw : {};
            const id = a.id != null ? String(a.id) : '';
            const nome = a.nome != null ? String(a.nome) : id;
            const endereco = a.endereco != null ? String(a.endereco) : undefined;
            return {
              tipo: 'almoxarifado' as const,
              id,
              nome,
              endereco,
            };
          })
        : []),
      ...(Array.isArray(subs)
        ? subs.map(raw => {
            const s = isRecord(raw) ? raw : {};
            const id = s.id != null ? String(s.id) : '';
            const nome = s.nome != null ? String(s.nome) : id;
            const descricao = s.descricao != null ? String(s.descricao) : undefined;
            return {
              tipo: 'sub_almoxarifado' as const,
              id,
              nome,
              descricao,
            };
          })
        : []),
    ];
    setOrigemOptions(options);
  }, []);

  const loadEstoqueOrigem = useCallback(async (uid: string, lt: 'almoxarifado' | 'sub_almoxarifado', lid: string) => {
    const headers = { 'X-User-Id': uid };
    const qs = new URLSearchParams({ local_tipo: lt, local_id: lid });
    const res = await fetch(apiUrl(`/api/estoque/local?${qs.toString()}`), { headers });
    const data: unknown = await res.json().catch(() => ({ items: [] }));
    const detail = isRecord(data) && typeof data.detail === "string" ? data.detail : undefined;
    if (!res.ok) throw new Error(detail || 'Erro ao carregar estoque da origem');
    const map: Record<string, number> = {};
    const infoMap: Record<string, ProdutoInfo> = {};
    const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
    for (const raw of items) {
      if (!isRecord(raw)) continue;
      const pid = raw.produto_id != null ? String(raw.produto_id) : '';
      if (!pid) continue;
      const disp = Number(raw.quantidade_disponivel ?? 0);
      map[pid] = Number.isFinite(disp) ? disp : 0;
      const nome = raw.produto_nome != null ? String(raw.produto_nome) : '';
      const codigo = raw.produto_codigo != null ? String(raw.produto_codigo) : '';
      if (nome.trim()) infoMap[pid] = { id: pid, nome: nome.trim(), codigo: codigo.trim() || '-' };
    }
    setEstoqueOrigemByProdutoId(map);
    mergeProdutos(infoMap);
  }, [mergeProdutos]);

  const loadProdutoInfo = useCallback(async (uid: string, produtoId: string) => {
    const headers = { 'X-User-Id': uid };
    const res = await fetch(apiUrl(`/api/produtos/${encodeURIComponent(produtoId)}`), { headers });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) return { id: produtoId, nome: produtoId, codigo: '-' };
    if (!isRecord(data)) return { id: produtoId, nome: produtoId, codigo: '-' };
    const nome = typeof data.nome === 'string' ? data.nome : produtoId;
    const codigo = typeof data.codigo === 'string' ? data.codigo : '-';
    return { id: produtoId, nome, codigo };
  }, []);

  const loadEstoqueSetor = useCallback(async (uid: string, sid: string) => {
    const headers = { 'X-User-Id': uid };
    const res = await fetch(apiUrl(`/api/estoque/setor/${encodeURIComponent(sid)}`), { headers });
    const data: unknown = await res.json().catch(() => ({ items: [] }));
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : undefined;
    if (!res.ok) throw new Error(detail || 'Erro ao carregar estoque do setor');
    const map: Record<string, number> = {};
    const infoMap: Record<string, ProdutoInfo> = {};
    const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
    for (const raw of items) {
      if (!isRecord(raw)) continue;
      const pid = raw.produto_id != null ? String(raw.produto_id) : '';
      if (!pid) continue;
      const disp = Number(raw.quantidade_disponivel ?? 0);
      map[pid] = Number.isFinite(disp) ? disp : 0;
      const nome = raw.produto_nome != null ? String(raw.produto_nome) : '';
      const codigo = raw.produto_codigo != null ? String(raw.produto_codigo) : '';
      if (nome.trim()) infoMap[pid] = { id: pid, nome: nome.trim(), codigo: codigo.trim() || '-' };
    }
    setEstoqueSetorByProdutoId(map);
    mergeProdutos(infoMap);
  }, [mergeProdutos]);

  const loadEstoqueOrigens = useCallback(async (uid: string, produtoIds: string[]) => {
    const headers = { 'X-User-Id': uid };
    if (!produtoIds.length) {
      setOrigensByProdutoId({});
      return;
    }
    const qs = new URLSearchParams({ produto_ids: produtoIds.join(',') });
    const res = await fetch(apiUrl(`/api/estoque/origens?${qs.toString()}`), { headers });
    const data: unknown = await res.json().catch(() => ({ items: [] }));
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : undefined;
    if (!res.ok) throw new Error(detail || 'Erro ao carregar estoque nas origens');
    const grouped: Record<string, OrigemDisp[]> = {};
    const infoMap: Record<string, ProdutoInfo> = {};
    const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
    for (const raw of items) {
      if (!isRecord(raw)) continue;
      const pid = raw.produto_id != null ? String(raw.produto_id) : '';
      if (!pid) continue;
      const origem_tipo = parseOrigemTipo(raw.origem_tipo);
      if (!origem_tipo) continue;
      const origem_id = raw.origem_id != null ? String(raw.origem_id) : '';
      if (!origem_id) continue;
      const origem_nome = raw.origem_nome != null ? String(raw.origem_nome) : origem_id;
      const quantidade_disponivel = Number(raw.quantidade_disponivel ?? 0);
      const entry: OrigemDisp = { origem_tipo, origem_id, origem_nome, quantidade_disponivel: Number.isFinite(quantidade_disponivel) ? quantidade_disponivel : 0 };
      const list = grouped[pid] || [];
      list.push(entry);
      grouped[pid] = list;
      const nome = raw.produto_nome != null ? String(raw.produto_nome) : '';
      const codigo = raw.produto_codigo != null ? String(raw.produto_codigo) : '';
      if (nome.trim()) infoMap[pid] = { id: pid, nome: nome.trim(), codigo: codigo.trim() || '-' };
    }
    for (const pid of Object.keys(grouped)) {
      grouped[pid].sort((a, b) => (b.quantidade_disponivel || 0) - (a.quantidade_disponivel || 0));
    }
    setOrigensByProdutoId(grouped);
    mergeProdutos(infoMap);
  }, [mergeProdutos]);

  const refresh = useCallback(async (uid: string) => {
    const headers = { 'X-User-Id': uid };
    const res = await fetch(apiUrl(`/api/demandas/${encodeURIComponent(demandaId)}`), { headers });
    const data: unknown = await res.json().catch(() => ({}));
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : undefined;
    if (!res.ok) throw new Error(detail || 'Erro ao carregar demanda');
    setDemanda(data as DemandaDetalhe);

    const sid = isRecord(data) && data.setor_id != null ? String(data.setor_id) : '';
    if (sid) {
      const sr = await fetch(apiUrl(`/api/setores/${encodeURIComponent(sid)}`), { headers });
      const sd: unknown = await sr.json().catch(() => ({}));
      if (sr.ok && isRecord(sd)) {
        const id = sd.id != null ? String(sd.id) : sid;
        const nome = sd.nome != null ? String(sd.nome) : sid;
        setSetor({ id, nome });
      }
      await loadEstoqueSetor(uid, sid);
    }

    const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
    const pids = Array.from(
      new Set(
        items
          .map(raw => (isRecord(raw) && raw.produto_id != null ? String(raw.produto_id) : ''))
          .filter(Boolean)
      )
    );
    const next: Record<string, ProdutoInfo> = {};
    const concurrency = 6;
    for (let i = 0; i < pids.length; i += concurrency) {
      const chunk = pids.slice(i, i + concurrency);
      const infos = await Promise.all(chunk.map(pid => loadProdutoInfo(uid, pid)));
      for (const info of infos) next[info.id] = info;
    }
    mergeProdutos(next);
    await loadEstoqueOrigens(uid, pids);

    setQtyByProdutoId(prev => {
      const init: Record<string, string> = { ...prev };
      for (const raw of items) {
        if (!isRecord(raw) || raw.produto_id == null) continue;
        const pid = String(raw.produto_id);
        if (init[pid] === undefined) init[pid] = '';
      }
      return init;
    });
  }, [demandaId, loadEstoqueOrigens, loadEstoqueSetor, loadProdutoInfo, mergeProdutos]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!canAccess(['super_admin', 'admin_central', 'gerente_almox', 'resp_sub_almox'])) {
      router.replace('/');
      return;
    }

    if (user.role === 'gerente_almox') {
      setOrigemTipo('almoxarifado');
      setOrigemId(user.scope_id || '');
    } else if (user.role === 'resp_sub_almox') {
      setOrigemTipo('sub_almoxarifado');
      setOrigemId(user.scope_id || '');
    } else if (user.role === 'admin_central' || user.role === 'super_admin') {
      setOrigemTipo('almoxarifado');
    }

    setLoading(true);
    setError('');
    Promise.resolve()
      .then(async () => {
        await loadOrigens(user.id);
        await refresh(user.id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro ao carregar demanda'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router, canAccess, demandaId, canPickOrigem, loadOrigens, refresh]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!origemId.trim()) {
      setEstoqueOrigemByProdutoId({});
      return;
    }
    loadEstoqueOrigem(user.id, origemTipo, origemId.trim()).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar estoque da origem');
      setEstoqueOrigemByProdutoId({});
    });
  }, [authLoading, user, origemTipo, origemId, loadEstoqueOrigem]);

  const origemSelecionada = useMemo(() => {
    const match = origemOptions.find(o => o.tipo === origemTipo && o.id === origemId);
    if (!match) return null;
    return match;
  }, [origemOptions, origemTipo, origemId]);

  const origensCandidatas = useMemo(() => {
    const agg: Record<
      string,
      { origem_tipo: 'almoxarifado' | 'sub_almoxarifado'; origem_id: string; origem_nome: string; totalCobertura: number; itensIntegrais: number; itensComSaldo: number }
    > = {};
    const its = demanda?.items || [];
    for (const it of its) {
      const pid = String(it.produto_id || '');
      if (!pid) continue;
      const solicitado = Number(it.quantidade || 0);
      const atendido = Number(it.atendido || 0);
      const restante = Math.max(0, solicitado - atendido);
      if (restante <= 0) continue;
      const origens = (origensByProdutoId[pid] || []).filter(o => Number(o.quantidade_disponivel || 0) > 0);
      for (const o of origens) {
        const key = `${o.origem_tipo}:${o.origem_id}`;
        const disp = Number(o.quantidade_disponivel || 0);
        const cob = Math.max(0, Math.min(restante, disp));
        const entry =
          agg[key] || {
            origem_tipo: o.origem_tipo,
            origem_id: o.origem_id,
            origem_nome: o.origem_nome || o.origem_id,
            totalCobertura: 0,
            itensIntegrais: 0,
            itensComSaldo: 0,
          };
        if (disp > 0) entry.itensComSaldo += 1;
        if (disp >= restante) entry.itensIntegrais += 1;
        entry.totalCobertura += cob;
        agg[key] = entry;
      }
    }
    const list = Object.values(agg);
    list.sort((a, b) => b.totalCobertura - a.totalCobertura);
    return list;
  }, [demanda, origensByProdutoId]);

  useEffect(() => {
    if (!canPickOrigem) return;
    if (originTouched) return;
    if (origemId) return;
    if (!origensCandidatas.length) return;
    const best = origensCandidatas[0];
    setOrigemTipo(best.origem_tipo);
    setOrigemId(best.origem_id);
  }, [canPickOrigem, originTouched, origemId, origensCandidatas]);

  const fillRestante = () => {
    if (!demanda) return;
    const next: Record<string, string> = { ...qtyByProdutoId };
    for (const it of demanda.items || []) {
      const restante = Math.max(0, Math.round(Number(it.quantidade || 0) - Number(it.atendido || 0)));
      next[String(it.produto_id)] = restante > 0 ? String(restante) : '';
    }
    setQtyByProdutoId(next);
  };

  const clearAll = () => {
    if (!demanda) return;
    const next: Record<string, string> = {};
    for (const it of demanda.items || []) next[String(it.produto_id)] = '';
    setQtyByProdutoId(next);
  };

  const atender = async () => {
    setError('');
    setSuccess('');
    if (!user) return;
    if (!demanda) return;
    if (!origemId.trim()) {
      setError('Informe a origem');
      return;
    }
    const items: { produto_id: string; quantidade: number }[] = [];
    for (const it of demanda.items || []) {
      const pid = String(it.produto_id);
      const q = Number(qtyByProdutoId[pid] || 0);
      if (q > 0 && !Number.isInteger(q)) {
        setError('Informe quantidades inteiras');
        return;
      }
      if (q > 0) items.push({ produto_id: pid, quantidade: q });
    }
    if (items.length === 0) {
      setError('Informe pelo menos um item para atender');
      return;
    }
    for (const it of items) {
      const original = demanda.items.find(x => String(x.produto_id) === it.produto_id);
      const restante = original ? Math.max(0, Number(original.quantidade || 0) - Number(original.atendido || 0)) : 0;
      if (it.quantidade > restante) {
        setError('Há itens com quantidade maior que o restante');
        return;
      }
      const dispOrigem = Number(estoqueOrigemByProdutoId[it.produto_id] ?? 0);
      if (it.quantidade > dispOrigem) {
        setError('Saldo insuficiente na origem para um ou mais itens');
        return;
      }
    }
    setSending(true);
    try {
      const res = await fetch(apiUrl(`/api/demandas/${encodeURIComponent(demandaId)}/atender`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify({
          origem_tipo: origemTipo,
          origem_id: origemId.trim(),
          observacoes: observacoes || undefined,
          items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao atender demanda');
      setSuccess(`Atendimento registrado (${String(data.demanda_status || '')})`);
      setObservacoes('');
      clearAll();
      await refresh(user.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atender demanda');
    } finally {
      setSending(false);
    }
  };

  const itemsView = useMemo(() => {
    const list = (demanda?.items || []).map(it => {
      const pid = String(it.produto_id);
      const info = produtos[pid];
      const solicitado = Number(it.quantidade || 0);
      const atendido = Number(it.atendido || 0);
      const restante = Math.max(0, solicitado - atendido);
      const dispOrigem = Number(estoqueOrigemByProdutoId[pid] ?? 0);
      const dispSetor = Number(estoqueSetorByProdutoId[pid] ?? 0);
      const origens = (origensByProdutoId[pid] || []).filter(o => Number(o.quantidade_disponivel || 0) > 0);
      const totalOrigens = origens.reduce((acc, o) => acc + Number(o.quantidade_disponivel || 0), 0);
      return {
        produto_id: pid,
        produto_nome: info?.nome || pid,
        produto_codigo: info?.codigo || '-',
        solicitado,
        atendido,
        restante,
        dispOrigem,
        dispSetor,
        origens,
        totalOrigens,
        observacao: it.observacao || '',
      };
    });
    list.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
    return list;
  }, [demanda, produtos, estoqueOrigemByProdutoId, estoqueSetorByProdutoId, origensByProdutoId]);

  const resumoItens = useMemo(() => {
    let solicitado = 0;
    let atendido = 0;
    let restante = 0;
    let maxNestaOrigem = 0;
    let totalNasOrigens = 0;
    let itensRestantes = 0;
    let itensCobertosNestaOrigem = 0;
    for (const it of itemsView) {
      solicitado += Number(it.solicitado || 0);
      atendido += Number(it.atendido || 0);
      restante += Number(it.restante || 0);
      totalNasOrigens += Number(it.totalOrigens || 0);
      if (it.restante > 0) {
        itensRestantes += 1;
        if (it.dispOrigem >= it.restante) itensCobertosNestaOrigem += 1;
      }
      maxNestaOrigem += Math.floor(Math.max(0, Math.min(it.restante, it.dispOrigem)));
    }
    return { solicitado, atendido, restante, maxNestaOrigem, totalNasOrigens, itensRestantes, itensCobertosNestaOrigem };
  }, [itemsView]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Page width="lg">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => router.push('/demandas')} className="flex items-center gap-2 text-gray-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          <ShoppingCart className="h-5 w-5 text-blue-600" /> Demanda #{demandaId.slice(0, 10)}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4" /> {success}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="soft-ui-card p-6">
          <div className="font-semibold text-gray-900 mb-4">Resumo</div>

          {loading ? (
            <Loading size="sm" className="items-start text-left" />
          ) : !demanda ? (
            <div className="text-gray-500">Demanda não encontrada.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className="font-semibold text-gray-900 capitalize">{demanda.status}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Setor</div>
                  <div className="font-semibold text-gray-900">{setor?.nome || demanda.setor_id || '-'}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Criado em</div>
                  <div className="font-semibold text-gray-900">{formatDateTime(demanda.created_at)}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Atualizado em</div>
                  <div className="font-semibold text-gray-900">{formatDateTime(demanda.updated_at)}</div>
                </div>
              </div>

              {demanda.observacoes && (
                <div className="mt-4 text-sm">
                  <div className="text-xs text-gray-500">Observações</div>
                  <div className="text-gray-800 mt-1">{demanda.observacoes}</div>
                </div>
              )}

              <div className="mt-6 border-t border-gray-100 pt-5">
                <div className="font-semibold text-gray-900 mb-3">Atender</div>

                <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <div className="text-xs font-medium text-blue-800">Origem do atendimento (mesma origem para todos os itens)</div>
                  <div className="mt-1 text-sm text-gray-800">
                    <span className="font-semibold">
                      {origemSelecionada?.nome ||
                        origensCandidatas.find(o => o.origem_tipo === origemTipo && o.origem_id === origemId)?.origem_nome ||
                        origemId ||
                        '-'}
                    </span>
                    <span className="text-gray-600"> · {origemTipo === 'almoxarifado' ? 'Almoxarifado' : 'Sub-Almoxarifado'}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">ID: {origemId || '-'}</div>
                  {(origemSelecionada?.endereco || origemSelecionada?.descricao) && (
                    <div className="mt-1 text-xs text-gray-600">
                      {origemSelecionada?.endereco ? `Endereço: ${origemSelecionada.endereco}` : `Descrição: ${origemSelecionada?.descricao}`}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg bg-white/60 border border-blue-100 p-2">
                      <div className="text-blue-700">Itens restantes</div>
                      <div className="font-semibold text-blue-900">{resumoItens.itensRestantes}</div>
                    </div>
                    <div className="rounded-lg bg-white/60 border border-blue-100 p-2">
                      <div className="text-blue-700">Cobertos nesta origem</div>
                      <div className="font-semibold text-blue-900">{resumoItens.itensCobertosNestaOrigem}</div>
                    </div>
                    <div className="rounded-lg bg-white/60 border border-blue-100 p-2">
                      <div className="text-blue-700">Máx enviável aqui</div>
                      <div className="font-semibold text-blue-900">{Math.round(resumoItens.maxNestaOrigem)}</div>
                    </div>
                    <div className="rounded-lg bg-white/60 border border-blue-100 p-2">
                      <div className="text-blue-700">Restante total</div>
                      <div className="font-semibold text-blue-900">{Math.round(resumoItens.restante)}</div>
                    </div>
                  </div>
                </div>

                {canPickOrigem && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Locais com saldo (evidências)</div>
                    {origensCandidatas.length === 0 ? (
                      <div className="text-sm text-gray-500">Nenhum local com saldo encontrado para os itens restantes.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {origensCandidatas.slice(0, 8).map(o => {
                          const selected = o.origem_tipo === origemTipo && o.origem_id === origemId;
                          return (
                            <button
                              key={`${o.origem_tipo}:${o.origem_id}`}
                              type="button"
                              onClick={() => {
                                setError('');
                                setOriginTouched(true);
                                setOrigemTipo(o.origem_tipo);
                                setOrigemId(o.origem_id);
                              }}
                              className={`text-left rounded-xl border p-4 transition-colors ${
                                selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-gray-900 truncate">{o.origem_nome}</div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {o.origem_tipo === 'almoxarifado' ? 'Almoxarifado' : 'Sub-Almoxarifado'} · ID: {o.origem_id}
                                  </div>
                                </div>
                                <div className={`text-xs px-2 py-1 rounded-full ${selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                  {selected ? 'Selecionado' : 'Selecionar'}
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div className="rounded-lg bg-white/60 border border-gray-200 p-2">
                                  <div className="text-gray-500">Cobertura</div>
                                  <div className="font-semibold text-gray-900">{Math.round(o.totalCobertura)}</div>
                                </div>
                                <div className="rounded-lg bg-white/60 border border-gray-200 p-2">
                                  <div className="text-gray-500">Itens integrais</div>
                                  <div className="font-semibold text-gray-900">{o.itensIntegrais}</div>
                                </div>
                                <div className="rounded-lg bg-white/60 border border-gray-200 p-2">
                                  <div className="text-gray-500">Itens com saldo</div>
                                  <div className="font-semibold text-gray-900">{o.itensComSaldo}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações do atendimento</label>
                  <input
                    value={observacoes}
                    onChange={e => setObservacoes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Opcional"
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={fillRestante}
                    className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Preencher restante
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    onClick={atender}
                    disabled={sending || loading}
                    className="ml-auto px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sending ? 'Enviando...' : 'Registrar Atendimento'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="soft-ui-card p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="font-semibold text-gray-900">Itens</div>
            <div className="text-xs text-gray-500 text-right">
              <div>Restante = solicitado − atendido</div>
              <div>Máx aqui = min(restante, disponível na origem)</div>
            </div>
          </div>

          {loading ? (
            <Loading size="sm" className="items-start text-left" />
          ) : itemsView.length === 0 ? (
            <div className="text-gray-500">Sem itens.</div>
          ) : (
            <div className="space-y-4">
              {itemsView.map(it => {
                const qNow = Number(qtyByProdutoId[it.produto_id] || 0);
                const maxNow = Math.floor(Math.max(0, Math.min(it.restante, it.dispOrigem)));
                const invalid = qNow > 0 && qNow > maxNow;
                const displayNome =
                  it.produto_nome && it.produto_nome !== it.produto_id ? it.produto_nome : `Produto ${it.produto_id.slice(0, 8)}…`;
                const statusTag =
                  it.restante <= 0
                    ? { label: 'Atendido', cls: 'bg-gray-100 text-gray-700' }
                    : it.dispOrigem >= it.restante
                      ? { label: 'Cobre nesta origem', cls: 'bg-green-50 text-green-700' }
                      : it.totalOrigens >= it.restante
                        ? { label: 'Cobre no total', cls: 'bg-blue-50 text-blue-700' }
                        : { label: 'Saldo insuficiente', cls: 'bg-orange-50 text-orange-700' };
                return (
                  <div key={it.produto_id} className="rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{displayNome}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {it.produto_codigo && it.produto_codigo !== '-' ? `Cód: ${it.produto_codigo}` : `ID: ${it.produto_id}`}
                        </div>
                        {it.observacao && <div className="text-xs text-gray-500 mt-2">Obs: {it.observacao}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className={`text-xs px-2 py-1 rounded-full ${statusTag.cls}`}>{statusTag.label}</div>
                        <div className="text-xs text-gray-600">Restante: {Math.round(it.restante)}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <div className="text-gray-500">Solicitado</div>
                        <div className="font-semibold text-gray-900">{Math.round(it.solicitado)}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <div className="text-gray-500">Atendido</div>
                        <div className="font-semibold text-gray-900">{Math.round(it.atendido)}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <div className="text-gray-500">Disp. no setor</div>
                        <div className="font-semibold text-gray-900">{Math.round(it.dispSetor)}</div>
                      </div>
                      <div className="rounded-lg bg-white border border-gray-200 p-3">
                        <div className="text-gray-500">Disp. na origem</div>
                        <div className={`font-semibold ${it.dispOrigem > 0 ? 'text-gray-900' : 'text-red-800'}`}>{Math.round(it.dispOrigem)}</div>
                      </div>
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                        <div className="text-blue-700">Máx enviável aqui</div>
                        <div className="font-semibold text-blue-900">{maxNow}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Atender agora</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={maxNow}
                            step="1"
                            value={qtyByProdutoId[it.produto_id] ?? ''}
                            onChange={e => setQtyByProdutoId(prev => ({ ...prev, [it.produto_id]: e.target.value }))}
                            className={`w-40 px-3 py-2 border rounded-lg focus:ring-2 outline-none text-right ${
                              invalid ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                            }`}
                            placeholder="0"
                          />
                          <button
                            type="button"
                            onClick={() => setQtyByProdutoId(prev => ({ ...prev, [it.produto_id]: String(maxNow || '') }))}
                            className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
                          >
                            Usar máx
                          </button>
                          <button
                            type="button"
                            onClick={() => setQtyByProdutoId(prev => ({ ...prev, [it.produto_id]: '' }))}
                            className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
                          >
                            Zerar
                          </button>
                        </div>
                        {invalid && <div className="mt-1 text-xs text-red-700">Valor acima do máximo disponível nesta origem.</div>}
                        <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span>Total nas origens: {Math.round(it.totalOrigens)}</span>
                        </div>
                      </div>

                      <div>
                        <details className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                          <summary className="cursor-pointer text-sm font-medium text-gray-800">Locais com saldo ({it.origens.length})</summary>
                          {it.origens.length === 0 ? (
                            <div className="mt-3 text-sm text-gray-500">Nenhum local com saldo para este produto.</div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {it.origens.slice(0, 12).map(o => {
                                const selectedOrigin = o.origem_tipo === origemTipo && o.origem_id === origemId;
                                return (
                                  <div
                                    key={`${it.produto_id}:${o.origem_tipo}:${o.origem_id}`}
                                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                                      selectedOrigin ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-gray-900 truncate">{o.origem_nome || o.origem_id}</div>
                                      <div className="text-xs text-gray-600">
                                        {o.origem_tipo === 'almoxarifado' ? 'Almoxarifado' : 'Sub-Almoxarifado'} · ID: {o.origem_id}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm font-semibold text-gray-900">{Math.round(Number(o.quantidade_disponivel || 0))}</div>
                                      {canPickOrigem && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setError('');
                                            setOriginTouched(true);
                                            setOrigemTipo(o.origem_tipo);
                                            setOrigemId(o.origem_id);
                                          }}
                                          className={`px-3 py-2 rounded-lg text-sm font-medium ${
                                            selectedOrigin ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                          }`}
                                        >
                                          {selectedOrigin ? 'Usando' : 'Usar'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              {it.origens.length > 12 && <div className="text-xs text-gray-600">+{it.origens.length - 12} locais...</div>}
                            </div>
                          )}
                        </details>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 border-t border-gray-100 pt-5">
            <div className="font-semibold text-gray-900 mb-3">Histórico de Atendimento</div>
            {loading ? (
              <Loading size="sm" className="items-start text-left" />
            ) : !demanda || (demanda.atendimento || []).length === 0 ? (
              <div className="text-gray-500">Sem atendimentos ainda.</div>
            ) : (
              <div className="space-y-3">
                {(demanda.atendimento || [])
                  .slice()
                  .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
                  .map((a, idx) => (
                    <div key={`${idx}:${a.created_at || ''}`} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {a.created_at ? formatDateTime(a.created_at) : 'Atendimento'}
                        </div>
                        <div className="text-xs text-gray-600">
                          Origem: {a.origem_tipo || '-'} {a.origem_id ? `(${a.origem_id})` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Por: {a.atendido_por || '-'}</div>
                      <div className="mt-3 space-y-1">
                        {(a.items || []).map((it, j) => {
                          const pid = String(it.produto_id);
                          const info = produtos[pid];
                          const nome = info?.nome && info.nome !== pid ? info.nome : `Produto ${pid.slice(0, 8)}…`;
                          return (
                            <div key={`${idx}:${j}:${pid}`} className="text-sm text-gray-800 flex items-center justify-between gap-2">
                              <span className="truncate">{nome}</span>
                              <span className="text-xs text-gray-600">{Math.round(Number(it.quantidade || 0))}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

