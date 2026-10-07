'use strict';

const API_URL = ((window.CONFIG && window.CONFIG.API_URL) || '').trim();

const $ = (sel, el = document) => el.querySelector(sel);
const $app = $('#app');
const $modal = $('#modal');
const $modalCorpo = $('#modalCorpo');

const LOJAS = [
  [/shopee|shope\.ee/, 'Shopee'],
  [/mercadoli[bv]re|meli\.la/, 'Mercado Livre'],
  [/amazon|amzn/, 'Amazon'],
  [/magazineluiza|magalu/, 'Magalu'],
  [/aliexpress/, 'AliExpress'],
  [/shein/, 'Shein'],
  [/temu/, 'Temu'],
  [/americanas/, 'Americanas'],
  [/casasbahia/, 'Casas Bahia'],
  [/kabum/, 'KaBuM!'],
  [/netshoes/, 'Netshoes'],
  [/centauro/, 'Centauro'],
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function armazenamento(tipo) {
  return {
    get(k, padrao) {
      try {
        const v = window[tipo].getItem(k);
        return v == null ? padrao : JSON.parse(v);
      } catch (e) {
        return padrao;
      }
    },
    set(k, v) {
      try { window[tipo].setItem(k, JSON.stringify(v)); } catch (e) {}
    },
    del(k) {
      try { window[tipo].removeItem(k); } catch (e) {}
    },
  };
}
const local = armazenamento('localStorage');
const sessao = armazenamento('sessionStorage');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const urlSegura = u => (/^https?:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const paraCampo = n => (n ? Number(n).toFixed(2).replace('.', ',') : '');

// Aceita "1.299,90", "1299.90", "R$ 29,90"...
function lerPreco(s) {
  s = String(s == null ? '' : s).replace(/[^\d.,]/g, '');
  if (!s) return null;
  const virgula = s.lastIndexOf(',');
  const ponto = s.lastIndexOf('.');
  let n;
  if (virgula >= 0 && ponto >= 0) {
    const decimal = virgula > ponto ? ',' : '.';
    n = parseFloat(s.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.'));
  } else if (virgula >= 0) {
    n = parseFloat(s.replace(/,/g, '.'));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    n = parseFloat(s.replace(/\./g, ''));
  } else {
    n = parseFloat(s);
  }
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function lojaDe(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return ''; }
  const loja = LOJAS.find(([re]) => re.test(host));
  return loja ? loja[1] : host.replace(/^www\./, '');
}

// Extrai link, nome e preço de um texto compartilhado/colado, ex:
// "Confira Fone Bluetooth por R$49,90. Encontre na Shopee agora! https://s.shopee.com.br/abc"
function analisarTexto(texto) {
  texto = String(texto || '');
  const link = urlSegura((texto.match(/https?:\/\/[^\s"'<>]+/) || [])[0]);
  const preco = lerPreco((texto.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/) || [])[1]);
  const titulo = texto
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s*(?:por\s+)?R\$\s*[\d.,]*\d/gi, '')
    .replace(/(encontre|compre|veja)\s+(isso\s+)?na\s+shopee[^.!]*[.!]?/gi, '')
    .replace(/\s+na\s+shopee\s*[!.]?/gi, '')
    .replace(/^\s*(confira|olha|veja)\s*(isso|só)?\s*[:!-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.!,:-]+$/, '')
    .trim()
    .slice(0, 200);
  return { link, preco, titulo };
}

// A Shopee bloqueia a leitura pelos servidores do Google: nem vale a pena tentar
// (só gastaria ~8s). Usamos o nome e o preço que vêm no texto compartilhado.
const ehShopee = link => lojaDe(link) === 'Shopee';

let timerToast;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('visivel');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove('visivel'), 3200);
}

async function ocupado(botao, fn) {
  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Aguarde…';
  try {
    return await fn();
  } catch (e) {
    toast(e.message || 'Algo deu errado');
  } finally {
    botao.disabled = false;
    botao.textContent = texto;
  }
}

// ---------------------------------------------------------------------------
// API: listas no Firebase (Firestore) quando configurado; a busca de foto/preço
// dos produtos ("preview") continua no Google Apps Script.
// ---------------------------------------------------------------------------

const FIREBASE = (window.CONFIG && window.CONFIG.FIREBASE) || null;
const usaFirebase = !!(FIREBASE && FIREBASE.projectId && FIREBASE.apiKey);

async function api(action, dados = {}) {
  if (usaFirebase && action !== 'preview') return firestore[action](dados);
  return appsScript(action, dados);
}

async function appsScript(action, dados) {
  if (!API_URL) throw new Error('Configure a API_URL no arquivo config.js');
  let resp;
  try {
    // Corpo como texto simples para evitar a checagem CORS extra (preflight).
    resp = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, ...dados }) });
  } catch (e) {
    throw new Error('Sem conexão com a planilha. Verifique sua internet.');
  }
  const json = await resp.json().catch(() => ({ ok: false, error: 'Resposta inválida da planilha' }));
  if (!json.ok) throw new Error(json.error || 'Erro na planilha');
  return json.data;
}

// Firestore pela API REST (sem precisar carregar a biblioteca do Firebase).
// Estrutura: grupos/{id}, grupos/{id}/participantes/{nome em minúsculas}, grupos/{id}/presentes/{auto}
const firestore = (() => {
  const base = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;

  async function req(metodo, caminho, corpo, params = []) {
    const q = new URLSearchParams([['key', FIREBASE.apiKey], ...params]);
    let resp;
    try {
      resp = await fetch(`${base()}/${caminho}?${q}`, {
        method: metodo,
        headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      throw new Error('Sem conexão. Verifique sua internet.');
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const erro = new Error((json.error && json.error.message) || 'Erro no banco de dados');
      erro.status = resp.status;
      throw erro;
    }
    return json;
  }

  const valor = v =>
    v == null ? { nullValue: null }
    : v instanceof Date ? { timestampValue: v.toISOString() }
    : typeof v === 'number' ? { doubleValue: v }
    : { stringValue: String(v) };

  const documento = obj => ({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, valor(v)])) });

  function ler(doc) {
    const o = { id: doc.name.split('/').pop() };
    for (const [k, v] of Object.entries(doc.fields || {})) {
      o[k] = 'stringValue' in v ? v.stringValue
        : 'doubleValue' in v ? v.doubleValue
        : 'integerValue' in v ? Number(v.integerValue)
        : 'timestampValue' in v ? v.timestampValue
        : null;
    }
    return o;
  }

  async function listar(caminho) {
    const docs = [];
    let pagina = '';
    do {
      const params = [['pageSize', '300']];
      if (pagina) params.push(['pageToken', pagina]);
      const r = await req('GET', caminho, null, params);
      docs.push(...(r.documents || []).map(ler));
      pagina = r.nextPageToken;
    } while (pagina);
    return docs.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  }

  const texto = (v, max) => String(v == null ? '' : v).replace(/\//g, '-').replace(/\s+/g, ' ').trim().slice(0, max);
  const slug = s =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'grupo';

  function camposPresente(d) {
    return {
      titulo: texto(d.titulo, 200),
      imagem: urlSegura(d.imagem).slice(0, 2000),
      preco: Number(d.preco) || null,
      precoOriginal: Number(d.precoOriginal) || null,
      link: urlSegura(d.link).slice(0, 2000),
      loja: texto(d.loja, 40),
      observacao: texto(d.observacao, 200),
    };
  }

  const g = id => 'grupos/' + encodeURIComponent(id);

  return {
    async listGroups() {
      return (await listar('grupos')).reverse().map(x => ({ id: x.id, nome: x.nome }));
    },

    async createGroup({ nome }) {
      nome = texto(nome, 60);
      if (!nome) throw new Error('Informe o nome do amigo secreto');
      const id = slug(nome) + '-' + Math.random().toString(36).slice(2, 6);
      await req('POST', 'grupos', documento({ nome, criadoEm: new Date() }), [['documentId', id]]);
      return { id, nome };
    },

    async getGroup({ grupoId }) {
      let grupo;
      try {
        grupo = ler(await req('GET', g(grupoId)));
      } catch (e) {
        throw e.status === 404 ? new Error('Amigo secreto não encontrado') : e;
      }
      const [participantes, presentes] = await Promise.all([
        listar(g(grupoId) + '/participantes'),
        listar(g(grupoId) + '/presentes'),
      ]);
      return {
        grupo: { id: grupo.id, nome: grupo.nome },
        participantes: participantes.map(p => p.nome),
        presentes,
      };
    },

    async joinGroup({ grupoId, nome }) {
      nome = texto(nome, 40);
      if (!nome) throw new Error('Informe seu nome');
      const id = nome.toLowerCase();
      try {
        await req('POST', g(grupoId) + '/participantes', documento({ nome, criadoEm: new Date() }), [['documentId', id]]);
        return nome;
      } catch (e) {
        if (e.status !== 409) throw e; // 409 = já existe alguém com esse nome
        return ler(await req('GET', g(grupoId) + '/participantes/' + encodeURIComponent(id))).nome;
      }
    },

    async addGift(d) {
      const campos = camposPresente(d);
      if (!campos.titulo) throw new Error('Informe o nome do produto');
      const doc = documento({ ...campos, participante: d.participante, criadoEm: new Date() });
      return ler(await req('POST', g(d.grupoId) + '/presentes', doc));
    },

    async updateGift(d) {
      const campos = camposPresente(d);
      if (!campos.titulo) throw new Error('Informe o nome do produto');
      const mascara = Object.keys(campos).map(k => ['updateMask.fieldPaths', k]);
      mascara.push(['currentDocument.exists', 'true']);
      await req('PATCH', g(d.grupoId) + '/presentes/' + encodeURIComponent(d.id), documento(campos), mascara);
      return true;
    },

    async deleteGift(d) {
      await req('DELETE', g(d.grupoId) + '/presentes/' + encodeURIComponent(d.id));
      return true;
    },
  };
})();

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

let cache = { id: null, dados: null };
let pessoaDaRota = null;

const getEu = gid => (local.get('lp.eu', {}) || {})[gid] || '';
function setEu(gid, nome) {
  const eu = local.get('lp.eu', {}) || {};
  eu[gid] = nome;
  local.set('lp.eu', eu);
}
function euNoGrupo() {
  if (!cache.dados) return '';
  const eu = getEu(cache.id);
  return cache.dados.participantes.includes(eu) ? eu : '';
}

// Cópia das listas no celular: a tela abre na hora com o que já foi visto
// e a planilha (que leva ~2s para responder) atualiza por trás.
function guardarGrupo() {
  if (cache.id && cache.dados) local.set('lp.grupo.' + cache.id, cache.dados);
}

const linkGrupo = (gid, pessoa) =>
  '#/g/' + encodeURIComponent(gid) + (pessoa ? '/' + encodeURIComponent(pessoa) : '');

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

function rotear() {
  const m = location.hash.match(/^#\/g\/([^/]+)(?:\/(.+))?$/);
  if (m) return telaGrupo(decodeURIComponent(m[1]), m[2] ? decodeURIComponent(m[2]) : null);
  telaInicio();
}

function cabecalho(titulo, emGrupo) {
  $('#titulo').textContent = titulo;
  $('#btnVoltar').hidden = !emGrupo;
  $('#btnConvidar').hidden = !emGrupo;
  document.title = emGrupo ? titulo + ' · Presentes' : 'Lista de Presentes';
}

// ---------------------------------------------------------------------------
// Tela inicial
// ---------------------------------------------------------------------------

async function telaInicio() {
  cache = { id: null, dados: null };
  cabecalho('🎁 Lista de Presentes', false);

  if (!API_URL) {
    $app.innerHTML = `<section class="cartao aviso">
      <h2>Quase lá!</h2>
      <p>Falta conectar o site à Planilha Google. Siga o passo a passo do arquivo <b>README.md</b>
      e cole a URL do Apps Script no arquivo <b>config.js</b>.</p></section>`;
    return;
  }

  const pendente = sessao.get('lp.pendente');
  const salvos = local.get('lp.grupos');
  $app.innerHTML = `
    ${pendente ? `<div class="faixa">Escolha o amigo secreto onde quer adicionar o presente 👇</div>` : ''}
    <section>
      <h2 class="secao">Amigos secretos</h2>
      <div id="grupos" class="lista">${salvos ? htmlGrupos(salvos) : '<div class="carregando">Carregando…</div>'}</div>
    </section>
    <section class="cartao">
      <h2>Criar novo amigo secreto</h2>
      <form id="fCriar" class="linha">
        <input name="nome" required maxlength="60" placeholder="Ex: Natal Família 2026" aria-label="Nome do amigo secreto">
        <button class="btn primario">Criar</button>
      </form>
    </section>`;

  $('#fCriar').addEventListener('submit', e => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    ocupado(e.submitter || $('button', e.target), async () => {
      const g = await api('createGroup', { nome });
      location.hash = linkGrupo(g.id);
    });
  });

  try {
    const grupos = await api('listGroups');
    local.set('lp.grupos', grupos);
    const $g = $('#grupos');
    if ($g) $g.innerHTML = htmlGrupos(grupos);
  } catch (e) {
    const $g = $('#grupos');
    if ($g && !salvos) $g.innerHTML = `<div class="vazio erro">${esc(e.message)}</div>`;
  }
}

function htmlGrupos(grupos) {
  return grupos.length
    ? grupos.map(g => `<a class="item" href="${linkGrupo(g.id)}"><span>🎄 ${esc(g.nome)}</span><span class="seta">›</span></a>`).join('')
    : `<div class="vazio">Nenhum amigo secreto ainda. Crie o primeiro abaixo!</div>`;
}

// ---------------------------------------------------------------------------
// Tela do amigo secreto
// ---------------------------------------------------------------------------

async function telaGrupo(gid, pessoa) {
  pessoaDaRota = pessoa;
  local.set('lp.ultimoGrupo', gid);
  if (cache.id === gid) return renderGrupo();

  const salvo = local.get('lp.grupo.' + gid);
  cache = { id: gid, dados: salvo || null };
  if (salvo) {
    renderGrupo();
    tratarCompartilhamento();
  } else {
    cabecalho('Carregando…', true);
    $app.innerHTML = `<div class="carregando">Carregando listas…</div>`;
  }

  try {
    const dados = await api('getGroup', { grupoId: gid });
    if (cache.id !== gid) return; // a pessoa já saiu desta tela
    cache.dados = dados;
    guardarGrupo();
    renderGrupo();
    if (!salvo) tratarCompartilhamento();
  } catch (e) {
    if (cache.id !== gid) return;
    if (salvo) return toast('Sem conexão: mostrando a última versão salva');
    cache = { id: null, dados: null };
    cabecalho('🎁 Lista de Presentes', true);
    $app.innerHTML = `<div class="vazio erro">${esc(e.message)}<br><br><a class="btn" href="#/">Voltar ao início</a></div>`;
  }
}

async function recarregar() {
  const gid = cache.id;
  const dados = await api('getGroup', { grupoId: gid });
  if (cache.id !== gid) return;
  cache.dados = dados;
  guardarGrupo();
  renderGrupo();
}

function renderGrupo() {
  const { grupo, participantes, presentes } = cache.dados;
  const eu = euNoGrupo();
  const sel = participantes.includes(pessoaDaRota) ? pessoaDaRota : eu || participantes[0];
  cabecalho(grupo.nome, true);

  let html = eu
    ? `<p class="quem">Você é <strong>${esc(eu)}</strong> · <button class="link" data-acao="entrar">não é você?</button></p>`
    : `<div class="faixa acao">
         <div><strong>Você ainda não tem uma lista aqui.</strong><br>Crie a sua para a família saber o que te dar!</div>
         <button class="btn primario" data-acao="entrar">Criar minha lista</button>
       </div>`;

  if (!participantes.length) {
    $app.innerHTML = html + `<div class="vazio">Ninguém entrou ainda. Seja o primeiro! 🎄</div>`;
    return;
  }

  const qtd = nome => presentes.filter(p => p.participante === nome).length;
  const ordem = eu ? [eu, ...participantes.filter(n => n !== eu)] : participantes;
  html += `<p class="rotulo">👇 Toque num nome para ver a lista da pessoa</p>
    <nav class="chips">${ordem
    .map(n => `<a class="chip${n === sel ? ' ativo' : ''}" href="${linkGrupo(grupo.id, n)}">${esc(n)}${n === eu ? ' (você)' : ''}<span class="qtd">${qtd(n)}</span></a>`)
    .join('')}</nav>`;

  const minha = sel === eu;
  const itens = presentes.filter(p => p.participante === sel);
  html += `<div class="lista-topo">
      <h2>${minha ? 'Minha lista' : 'Lista de ' + esc(sel)}</h2>
      <div class="linha">
        <button class="btn pequeno" data-acao="atualizar" aria-label="Atualizar">↻</button>
        ${minha ? '<button class="btn primario" data-acao="adicionar">+ Adicionar</button>' : ''}
      </div>
    </div>`;

  html += itens.length
    ? `<div class="presentes">${itens.map(p => cartaoPresente(p, minha)).join('')}</div>`
    : `<div class="vazio">${minha
        ? 'Sua lista está vazia.<br>Toque em <b>+ Adicionar</b> ou compartilhe um produto da loja direto para este app.'
        : esc(sel) + ' ainda não adicionou presentes.'}</div>`;

  $app.innerHTML = html;
}

function cartaoPresente(p, minha) {
  const img = urlSegura(p.imagem);
  const link = urlSegura(p.link);
  const preco = Number(p.preco) || 0;
  const original = Number(p.precoOriginal) || 0;
  const desconto = preco && original > preco ? Math.round((1 - preco / original) * 100) : 0;
  const abrir = link ? `href="${esc(link)}" target="_blank" rel="noopener"` : '';

  return `<article class="presente">
    <a class="miniatura" ${abrir}>${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span>🎁</span>'}</a>
    <div class="info">
      <h3>${esc(p.titulo || 'Presente')}</h3>
      <div class="precos">
        ${preco ? `<strong>${brl(preco)}</strong>` : '<span class="mudo">Sem preço</span>'}
        ${desconto ? `<s>${brl(original)}</s><span class="selo desconto">-${desconto}%</span>` : ''}
      </div>
      ${p.loja ? `<span class="selo loja">${esc(p.loja)}</span>` : ''}
      ${p.observacao ? `<p class="obs">${esc(p.observacao)}</p>` : ''}
      <div class="acoes">
        ${link ? `<a class="btn pequeno primario" ${abrir}>Ver na loja</a>` : ''}
        ${minha ? `<button class="btn pequeno" data-acao="editar" data-id="${esc(p.id)}">Editar</button>
                   <button class="btn pequeno perigo" data-acao="excluir" data-id="${esc(p.id)}">Excluir</button>` : ''}
      </div>
    </div>
  </article>`;
}

// Cliques na tela do grupo
$app.addEventListener('click', e => {
  const alvo = e.target.closest('[data-acao]');
  if (!alvo || !cache.dados) return;
  const acao = alvo.dataset.acao;
  if (acao === 'entrar') modalEntrar();
  else if (acao === 'adicionar') modalAdicionar();
  else if (acao === 'atualizar') ocupado(alvo, recarregar);
  else if (acao === 'editar') {
    const p = cache.dados.presentes.find(x => x.id === alvo.dataset.id);
    if (p) modalPresente(p, p.id);
  } else if (acao === 'excluir') {
    const p = cache.dados.presentes.find(x => x.id === alvo.dataset.id);
    if (p && confirm(`Excluir "${p.titulo}" da sua lista?`)) {
      ocupado(alvo, async () => {
        await api('deleteGift', { grupoId: cache.id, id: p.id });
        cache.dados.presentes = cache.dados.presentes.filter(x => x.id !== p.id);
        guardarGrupo();
        renderGrupo();
        toast('Presente excluído');
      });
    }
  }
});

// Imagem quebrada vira um 🎁
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.closest('.miniatura, .previa')) {
    const s = document.createElement('span');
    s.textContent = '🎁';
    img.replaceWith(s);
  }
}, true);

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------

function abrirModal(html) {
  $modalCorpo.innerHTML = html;
  if (!$modal.open) $modal.showModal();
}
function fecharModal() {
  if ($modal.open) $modal.close();
}
$modal.addEventListener('click', e => {
  if (e.target === $modal || e.target.closest('[data-fechar]')) fecharModal();
});

function modalEntrar() {
  const { grupo, participantes } = cache.dados;
  abrirModal(`
    <h2>Quem é você?</h2>
    <form id="fEntrar">
      <label>Seu nome
        <input name="nome" required maxlength="40" placeholder="Ex: Maria" autocomplete="given-name">
      </label>
      <div class="botoes">
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button class="btn primario">Criar minha lista</button>
      </div>
    </form>
    ${participantes.length ? `
      <p class="mudo">Já criou sua lista em outro aparelho? Toque no seu nome:</p>
      <div class="chips quebra">${participantes.map(n => `<button type="button" class="chip" data-sou="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}`);

  const virar = nome => {
    setEu(grupo.id, nome);
    fecharModal();
    location.hash = linkGrupo(grupo.id, nome);
    renderGrupo();
    tratarCompartilhamento();
  };

  $('#fEntrar').addEventListener('submit', e => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    ocupado($('button.primario', e.target), async () => {
      const salvo = await api('joinGroup', { grupoId: grupo.id, nome });
      if (!cache.dados.participantes.includes(salvo)) cache.dados.participantes.push(salvo);
      guardarGrupo();
      pessoaDaRota = salvo;
      virar(salvo);
    });
  });
  $modalCorpo.querySelectorAll('[data-sou]').forEach(b =>
    b.addEventListener('click', () => {
      pessoaDaRota = b.dataset.sou;
      virar(b.dataset.sou);
    })
  );
}

// Passo 1: link do produto
function modalAdicionar(dica = {}) {
  abrirModal(`
    <h2>Adicionar presente</h2>
    <form id="fLink">
      <label>Link do produto
        <input name="link" required inputmode="url" autocomplete="off" placeholder="Cole aqui o link da loja">
      </label>
      <div class="botoes">
        <button type="button" class="btn" id="btnColar">📋 Colar</button>
        <button class="btn primario">Buscar produto</button>
      </div>
    </form>
    <details class="dica">
      <summary>Como pegar o link do produto?</summary>
      <p><b>Android:</b> no app da Shopee, Mercado Livre etc., abra o produto, toque em
      <b>Compartilhar</b> e escolha <b>Presentes</b>. Ele cai direto aqui!</p>
      <p><b>iPhone:</b> no app da loja, toque em <b>Compartilhar → Copiar link</b>, volte aqui e toque em <b>📋 Colar</b>.</p>
      <p class="mudo">Se “Presentes” não aparecer no Android, instale o app pelo menu do Chrome (⋮ → Instalar app).</p>
    </details>
    <p class="centro"><button type="button" class="link" id="btnManual">Adicionar sem link</button></p>`);

  const form = $('#fLink');
  const campo = form.link;
  campo.value = dica.link || '';

  const buscar = async () => {
    const info = analisarTexto(campo.value);
    const link = info.link || urlSegura(campo.value);
    if (!link) return toast('Esse link não parece válido');
    const pistas = {
      titulo: dica.titulo || info.titulo,
      preco: dica.preco || info.preco,
    };
    $modalCorpo.innerHTML = `<div class="carregando grande">🔎 Buscando foto e preço…</div>`;
    modalPresente(await buscarPrevia(link, pistas));
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    buscar();
  });
  $('#btnColar').addEventListener('click', async () => {
    try {
      campo.value = await navigator.clipboard.readText();
      if (campo.value) buscar();
    } catch (e) {
      campo.focus();
      toast('Toque no campo e cole o link');
    }
  });
  $('#btnManual').addEventListener('click', () => modalPresente({}));

  if (dica.link) buscar();
}

async function buscarPrevia(link, pistas) {
  if (ehShopee(link)) {
    return { link, titulo: pistas.titulo || '', preco: pistas.preco || '', loja: 'Shopee', incompleto: !pistas.titulo || !pistas.preco };
  }
  try {
    const d = await api('preview', { url: link });
    return {
      link,
      titulo: d.titulo || pistas.titulo || '',
      imagem: d.imagem || '',
      preco: d.preco || pistas.preco || '',
      precoOriginal: d.precoOriginal || '',
      loja: d.loja || lojaDe(link),
      incompleto: !d.titulo || !d.preco,
    };
  } catch (e) {
    return { link, titulo: pistas.titulo || '', preco: pistas.preco || '', loja: lojaDe(link), incompleto: true };
  }
}

// Passo 2: confirmar/editar os dados
function modalPresente(d, id) {
  abrirModal(`
    <h2>${id ? 'Editar presente' : 'Confirme o presente'}</h2>
    <form id="fPresente">
      <div class="previa"></div>
      ${!id && d.incompleto ? '<p class="faixa">Não consegui ler tudo dessa loja automaticamente. Complete abaixo 🙂</p>' : ''}
      <label>Nome do produto
        <input name="titulo" required maxlength="200">
      </label>
      <div class="dois">
        <label>Preço (R$)
          <input name="preco" inputmode="decimal" placeholder="0,00">
        </label>
        <label>Preço sem desconto
          <input name="precoOriginal" inputmode="decimal" placeholder="opcional">
        </label>
      </div>
      <label>Observação
        <input name="observacao" maxlength="200" placeholder="Ex: tamanho M, cor azul">
      </label>
      <details${d.link ? '' : ' open'}>
        <summary>Link e imagem</summary>
        <label>Link da loja <input name="link" inputmode="url" placeholder="https://…"></label>
        <label>Imagem (endereço) <input name="imagem" inputmode="url" placeholder="https://…"></label>
      </details>
      <div class="botoes">
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button class="btn primario">${id ? 'Salvar' : 'Adicionar à lista'}</button>
      </div>
    </form>`);

  const f = $('#fPresente');
  f.titulo.value = d.titulo || '';
  f.preco.value = paraCampo(d.preco);
  f.precoOriginal.value = paraCampo(d.precoOriginal);
  f.observacao.value = d.observacao || '';
  f.link.value = d.link || '';
  f.imagem.value = d.imagem || '';

  const mostrarImagem = () => {
    const src = urlSegura(f.imagem.value);
    $('.previa', f).innerHTML = src ? `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer">` : '<span>🎁</span>';
  };
  mostrarImagem();
  f.imagem.addEventListener('change', mostrarImagem);

  f.addEventListener('submit', e => {
    e.preventDefault();
    const link = urlSegura(f.link.value);
    const dados = {
      titulo: f.titulo.value.trim(),
      preco: lerPreco(f.preco.value) || '',
      precoOriginal: lerPreco(f.precoOriginal.value) || '',
      observacao: f.observacao.value.trim(),
      link,
      imagem: urlSegura(f.imagem.value),
      loja: link === d.link && d.loja ? d.loja : lojaDe(link),
    };
    ocupado($('button.primario', f), async () => {
      if (id) {
        await api('updateGift', { grupoId: cache.id, id, ...dados });
        const p = cache.dados.presentes.find(x => x.id === id);
        if (p) Object.assign(p, dados, { preco: dados.preco || null, precoOriginal: dados.precoOriginal || null });
      } else {
        cache.dados.presentes.push(await api('addGift', { grupoId: cache.id, participante: euNoGrupo(), ...dados }));
      }
      guardarGrupo();
      fecharModal();
      renderGrupo();
      toast(id ? 'Presente atualizado' : 'Presente adicionado! 🎁');
    });
  });
}

// ---------------------------------------------------------------------------
// Produto compartilhado de outro app (Android) → entra pela URL ?url=&text=
// ---------------------------------------------------------------------------

function lerCompartilhamento() {
  const p = new URLSearchParams(location.search);
  if (!p.has('url') && !p.has('text') && !p.has('title')) return;
  const texto = [p.get('title'), p.get('text'), p.get('url')].filter(Boolean).join(' ');
  const info = analisarTexto(texto);
  if (info.link) sessao.set('lp.pendente', info);

  // Limpa a URL e, se possível, já vai para o último amigo secreto aberto.
  const ultimo = local.get('lp.ultimoGrupo');
  const hash = location.hash || (info.link && ultimo ? linkGrupo(ultimo) : '');
  history.replaceState(null, '', location.pathname + hash);
}

function tratarCompartilhamento() {
  const pendente = sessao.get('lp.pendente');
  if (!pendente || !cache.dados) return;
  const eu = euNoGrupo();
  if (!eu) {
    toast('Primeiro diga quem é você 🙂');
    modalEntrar();
    return;
  }
  sessao.del('lp.pendente');
  if (pessoaDaRota !== eu) location.hash = linkGrupo(cache.id, eu);
  modalAdicionar(pendente);
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

$('#btnVoltar').addEventListener('click', () => (location.hash = '#/'));
$('#btnConvidar').addEventListener('click', async () => {
  if (!cache.dados) return;
  const url = location.origin + location.pathname + linkGrupo(cache.id);
  const texto = `Entra no nosso amigo secreto "${cache.dados.grupo.nome}" e monta sua lista de presentes 🎁`;
  if (navigator.share) {
    try { await navigator.share({ title: cache.dados.grupo.nome, text: texto, url }); } catch (e) {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copiado! Mande no grupo da família.');
  } catch (e) {
    prompt('Copie o link:', url);
  }
});

window.addEventListener('hashchange', rotear);
lerCompartilhamento();
rotear();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
