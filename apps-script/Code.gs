/**
 * Backend da Lista de Presentes (amigo secreto).
 *
 * Como usar: abra sua Planilha Google > Extensões > Apps Script,
 * apague o conteúdo do arquivo Code.gs e cole este arquivo inteiro.
 * Depois: Implantar > Nova implantação > App da Web
 *   - Executar como: Eu
 *   - Quem pode acessar: Qualquer pessoa
 * Copie a URL gerada e cole no arquivo config.js do site.
 *
 * As abas Grupos, Participantes e Presentes são criadas automaticamente.
 */

const ABAS = {
  Grupos: ['id', 'nome', 'criadoEm'],
  Participantes: ['grupoId', 'nome', 'criadoEm'],
  Presentes: ['id', 'grupoId', 'participante', 'titulo', 'imagem', 'preco', 'precoOriginal', 'link', 'loja', 'observacao', 'criadoEm'],
};

const ACOES_DE_ESCRITA = ['createGroup', 'joinGroup', 'addGift', 'updateGift', 'deleteGift'];

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
// Entrada HTTP
// ---------------------------------------------------------------------------

function doGet(e) {
  return responder_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  let corpo = {};
  try {
    corpo = JSON.parse(e.postData.contents);
  } catch (err) {}
  return responder_(corpo);
}

function responder_(p) {
  const escreve = ACOES_DE_ESCRITA.indexOf(p.action) >= 0;
  const lock = LockService.getScriptLock();
  let saida;
  try {
    if (escreve) lock.waitLock(20000);
    saida = { ok: true, data: executar_(p) };
  } catch (err) {
    saida = { ok: false, error: String((err && err.message) || err) };
  } finally {
    if (escreve) lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}

function executar_(p) {
  switch (p.action) {
    case 'listGroups':
      return linhas_('Grupos').map(g => ({ id: String(g.id), nome: String(g.nome) })).reverse();

    case 'createGroup': {
      const nome = texto_(p.nome, 60);
      if (!nome) throw new Error('Informe o nome do amigo secreto');
      const id = slug_(nome) + '-' + Math.random().toString(36).slice(2, 6);
      adicionar_('Grupos', { id: id, nome: nome, criadoEm: new Date() });
      return { id: id, nome: nome };
    }

    case 'getGroup': {
      const grupo = grupo_(p.grupoId);
      const participantes = linhas_('Participantes')
        .filter(r => String(r.grupoId) === grupo.id)
        .map(r => String(r.nome));
      const presentes = linhas_('Presentes')
        .filter(r => String(r.grupoId) === grupo.id)
        .map(presenteParaJson_);
      return { grupo: grupo, participantes: participantes, presentes: presentes };
    }

    case 'joinGroup': {
      const grupo = grupo_(p.grupoId);
      const nome = texto_(p.nome, 40);
      if (!nome) throw new Error('Informe seu nome');
      const existente = linhas_('Participantes').find(
        r => String(r.grupoId) === grupo.id && String(r.nome).toLowerCase() === nome.toLowerCase()
      );
      if (existente) return String(existente.nome);
      adicionar_('Participantes', { grupoId: grupo.id, nome: nome, criadoEm: new Date() });
      return nome;
    }

    case 'addGift': {
      const grupo = grupo_(p.grupoId);
      const participante = texto_(p.participante, 40);
      const participa = linhas_('Participantes').some(
        r => String(r.grupoId) === grupo.id && String(r.nome) === participante
      );
      if (!participa) throw new Error('Participante não encontrado neste amigo secreto');
      const presente = camposPresente_(p);
      if (!presente.titulo) throw new Error('Informe o nome do produto');
      presente.id = Utilities.getUuid();
      presente.grupoId = grupo.id;
      presente.participante = participante;
      presente.criadoEm = new Date();
      adicionar_('Presentes', presente);
      return presenteParaJson_(presente);
    }

    case 'updateGift': {
      const linha = linhas_('Presentes').find(r => String(r.id) === String(p.id));
      if (!linha) throw new Error('Presente não encontrado');
      const campos = camposPresente_(p);
      if (!campos.titulo) throw new Error('Informe o nome do produto');
      const sh = aba_('Presentes');
      Object.keys(campos).forEach(c => {
        sh.getRange(linha._linha, ABAS.Presentes.indexOf(c) + 1).setValue(celula_(campos[c]));
      });
      return true;
    }

    case 'deleteGift': {
      const linha = linhas_('Presentes').find(r => String(r.id) === String(p.id));
      if (!linha) throw new Error('Presente não encontrado');
      aba_('Presentes').deleteRow(linha._linha);
      return true;
    }

    case 'preview':
      return previa_(p.url);

    default:
      throw new Error('Ação desconhecida');
  }
}

// ---------------------------------------------------------------------------
// Planilha
// ---------------------------------------------------------------------------

function aba_(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(ABAS[nome]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ABAS[nome].length).setFontWeight('bold');
  }
  return sh;
}

function linhas_(nome) {
  const sh = aba_(nome);
  const colunas = ABAS[nome];
  const n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  return sh.getRange(2, 1, n, colunas.length).getValues().map((valores, i) => {
    const obj = { _linha: i + 2 };
    colunas.forEach((c, j) => (obj[c] = valores[j]));
    return obj;
  });
}

function adicionar_(nome, obj) {
  aba_(nome).appendRow(ABAS[nome].map(c => celula_(obj[c])));
}

// O apóstrofo força a célula a ser texto (evita fórmulas e conversões automáticas).
function celula_(v) {
  if (v == null || v === '') return '';
  return typeof v === 'string' ? "'" + v : v;
}

function grupo_(id) {
  const g = linhas_('Grupos').find(r => String(r.id) === String(id || ''));
  if (!g) throw new Error('Amigo secreto não encontrado');
  return { id: String(g.id), nome: String(g.nome) };
}

function camposPresente_(p) {
  const link = urlSegura_(p.link);
  return {
    titulo: texto_(p.titulo, 200),
    imagem: urlSegura_(p.imagem),
    preco: numero_(p.preco),
    precoOriginal: numero_(p.precoOriginal),
    link: link,
    loja: texto_(p.loja, 40) || lojaDe_(link),
    observacao: texto_(p.observacao, 200),
  };
}

function presenteParaJson_(r) {
  return {
    id: String(r.id),
    participante: String(r.participante),
    titulo: String(r.titulo),
    imagem: String(r.imagem),
    preco: typeof r.preco === 'number' ? r.preco : null,
    precoOriginal: typeof r.precoOriginal === 'number' ? r.precoOriginal : null,
    link: String(r.link),
    loja: String(r.loja),
    observacao: String(r.observacao),
    criadoEm: r.criadoEm,
  };
}

// ---------------------------------------------------------------------------
// Prévia do produto (foto, nome, preço) a partir do link
// ---------------------------------------------------------------------------

const AGENTES = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'WhatsApp/2.24.1 A',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
];

function previa_(url) {
  url = urlSegura_(url);
  if (!url) throw new Error('Link inválido');

  const r = { titulo: '', imagem: '', preco: '', precoOriginal: '', loja: lojaDe_(url), urlFinal: url };
  for (let i = 0; i < AGENTES.length; i++) {
    let pagina;
    try {
      pagina = baixar_(url, AGENTES[i]);
    } catch (err) {
      continue;
    }
    if (!pagina.html) continue;
    r.urlFinal = pagina.url;
    r.loja = lojaDe_(pagina.url) || r.loja;
    const dados = extrair_(pagina.html, pagina.url);
    Object.keys(dados).forEach(k => {
      if (!r[k] && dados[k]) r[k] = dados[k];
    });
    if (r.titulo && r.imagem && r.preco) break;
  }

  if (r.precoOriginal && (!r.preco || r.precoOriginal <= r.preco)) r.precoOriginal = '';
  return r;
}

function baixar_(url, agente) {
  let atual = url;
  for (let i = 0; i < 6; i++) {
    const resp = UrlFetchApp.fetch(atual, {
      followRedirects: false,
      muteHttpExceptions: true,
      headers: { 'User-Agent': agente, 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    const codigo = resp.getResponseCode();
    if (codigo >= 300 && codigo < 400) {
      const h = resp.getAllHeaders();
      let destino = h.Location || h.location;
      if (Array.isArray(destino)) destino = destino[0];
      if (!destino) break;
      atual = absoluta_(destino, atual);
      continue;
    }
    return { url: atual, html: codigo < 400 ? resp.getContentText() : '' };
  }
  return { url: atual, html: '' };
}

function extrair_(html, base) {
  const m = metas_(html);
  const ld = produtoJsonLd_(html) || {};

  let titulo = m['og:title'] || m['twitter:title'] || ld.name || '';
  if (!titulo) {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (t) titulo = decodificar_(t[1]);
  }
  titulo = titulo
    .replace(/\s*[|\-–]\s*(Shopee|Mercado ?Li[bv]re|Amazon|Magalu|AliExpress)[^|]*$/i, '')
    .replace(/\s*[|\-–]\s*R\$\s*[\d.,]+\s*$/, '') // "Produto - R$ 266,36"
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(shopee|mercado ?li[bv]re|amazon)\b/i.test(titulo)) titulo = ''; // título genérico da loja

  let imagem = m['og:image'] || m['og:image:secure_url'] || m['twitter:image'] || imagemLd_(ld.image) || '';
  imagem = imagem ? absoluta_(imagem, base) : '';

  const ofertas = [].concat(ld.offers || []);
  const precoLd = ofertas.length ? ofertas[0].price || ofertas[0].lowPrice : '';
  const preco = numero_(
    m['product:price:amount'] || m['og:price:amount'] || m['price'] || m['twitter:data1'] || precoLd
  );

  let precoOriginal = numero_(m['product:original_price:amount'] || m['og:original_price:amount']);
  if (!precoOriginal) {
    // Mercado Livre: preço riscado ("de R$ X por R$ Y")
    const riscado = html.match(/<s[^>]*andes-money-amount--previous[\s\S]*?<\/s>/i);
    if (riscado) {
      const reais = riscado[0].match(/andes-money-amount__fraction[^>]*>([\d.]+)</);
      const centavos = riscado[0].match(/andes-money-amount__cents[^>]*>(\d{1,2})</);
      if (reais) precoOriginal = numero_(reais[1].replace(/\./g, '') + '.' + (centavos ? centavos[1] : '00'));
    }
  }

  return { titulo: titulo.slice(0, 200), imagem: imagem, preco: preco, precoOriginal: precoOriginal };
}

function metas_(html) {
  const saida = {};
  (html.match(/<meta\b[^>]*>/gi) || []).forEach(tag => {
    const a = {};
    const re = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(tag))) a[m[1].toLowerCase()] = m[2] != null ? m[2] : m[3];
    const chave = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (chave && a.content != null && saida[chave] == null) saida[chave] = decodificar_(a.content);
  });
  return saida;
}

function produtoJsonLd_(html) {
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const p = acharProduto_(JSON.parse(m[1].trim()));
      if (p) return p;
    } catch (err) {}
  }
  return null;
}

function acharProduto_(no) {
  if (!no || typeof no !== 'object') return null;
  if (Array.isArray(no)) {
    for (let i = 0; i < no.length; i++) {
      const r = acharProduto_(no[i]);
      if (r) return r;
    }
    return null;
  }
  const tipo = [].concat(no['@type'] || []);
  if (tipo.indexOf('Product') >= 0) return no;
  return no['@graph'] ? acharProduto_(no['@graph']) : null;
}

function imagemLd_(img) {
  if (!img) return '';
  if (Array.isArray(img)) return imagemLd_(img[0]);
  if (typeof img === 'object') return img.url || img.contentUrl || '';
  return String(img);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function texto_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function urlSegura_(v) {
  const u = String(v || '').trim();
  return /^https?:\/\/\S+$/i.test(u) ? u.slice(0, 2000) : '';
}

function numero_(v) {
  if (v === '' || v == null) return '';
  const n = typeof v === 'number' ? v : lerPreco_(String(v));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : '';
}

// Aceita "1.299,90", "1299.90", "R$ 29,90", "1,299.90"...
function lerPreco_(s) {
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const virgula = s.lastIndexOf(',');
  const ponto = s.lastIndexOf('.');
  if (virgula >= 0 && ponto >= 0) {
    const decimal = virgula > ponto ? ',' : '.';
    const milhar = decimal === ',' ? /\./g : /,/g;
    return parseFloat(s.replace(milhar, '').replace(decimal, '.'));
  }
  if (virgula >= 0) return parseFloat(s.replace(/,/g, '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, '')); // "1.299" = mil e duzentos
  return parseFloat(s);
}

function lojaDe_(url) {
  const host = (String(url).match(/^https?:\/\/([^/?#]+)/i) || [])[1] || '';
  if (!host) return '';
  for (let i = 0; i < LOJAS.length; i++) if (LOJAS[i][0].test(host)) return LOJAS[i][1];
  return host.replace(/^www\./, '');
}

function absoluta_(url, base) {
  url = String(url).trim();
  if (/^https?:\/\//i.test(url)) return url;
  const m = String(base).match(/^(https?:)\/\/([^/?#]+)([^?#]*)/i);
  if (!m) return url;
  if (url.indexOf('//') === 0) return m[1] + url;
  if (url.charAt(0) === '/') return m[1] + '//' + m[2] + url;
  return m[1] + '//' + m[2] + m[3].replace(/[^/]*$/, '') + url;
}

function slug_(s) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'grupo'
  );
}

function decodificar_(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
