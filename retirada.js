// Modelo de venda "pré-reserva com retirada" (ex: geladinho, bolo, camiseta sob encomenda).
//
// Um produto vira pré-reserva no admin (Produtos → Modelo de venda). No documento de `estoque` ficam:
//   modelo:   'pre-reserva'            (ausente = venda normal)
//   retirada: {
//     locais:  ['Paizódromo', 'Portaria do Infantil'],
//     janelas: [{ data: '2026-11-18', inicio: '17:20', fim: '18:30' }],
//     aviso:   'texto opcional mostrado no checkout',
//     reservaInicio: '2026-11-16T08:00',   (opcional) quando as pré-reservas passam a ser aceitas
//     reservaFim:    '2026-11-17T20:00'    (opcional) quando deixam de ser aceitas
//   }
// O checkout só mostra a escolha de local e horário quando há produto assim no carrinho, e produtos com as
// mesmas opções compartilham uma única escolha.

export const MODELO_PRE_RESERVA = 'pre-reserva';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// '17:20' → '17h20', '18:00' → '18h'
const hora = h => h.replace(/^0/, '').replace(':00', 'h').replace(':', 'h');

// Remove espaços e descarta o que está vazio ou malformado
export function normalizarRetirada(r) {
  const locais = (r?.locais || []).map(l => String(l).trim()).filter(Boolean);
  const janelas = (r?.janelas || [])
    .filter(j => /^\d{4}-\d{2}-\d{2}$/.test(j?.data) && /^\d{2}:\d{2}$/.test(j?.inicio) && /^\d{2}:\d{2}$/.test(j?.fim))
    .map(j => ({ data: j.data, inicio: j.inicio, fim: j.fim }));
  const aviso = String(r?.aviso || '').trim();
  const dh = v => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : '');
  const reservaInicio = dh(r?.reservaInicio), reservaFim = dh(r?.reservaFim);
  return { locais, janelas, ...(aviso ? { aviso } : {}), ...(reservaInicio ? { reservaInicio } : {}), ...(reservaFim ? { reservaFim } : {}) };
}

export const ehPreReserva = p => p?.modelo === MODELO_PRE_RESERVA && !!p.retirada;

// Datas que já passaram deixam de ser oferecidas
export const janelasAbertas = r => normalizarRetirada(r).janelas.filter(j => j.data >= hoje());

const agora = () => {
  const d = new Date();
  return `${hoje()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 'antes' (ainda não abriu), 'aberta' ou 'encerrada' (período acabou, sem local ou sem data de retirada futura)
export function statusReserva(p) {
  if (!ehPreReserva(p)) return 'aberta';
  const r = normalizarRetirada(p.retirada);
  if (!r.locais.length || !janelasAbertas(r).length) return 'encerrada';
  const t = agora();
  if (r.reservaFim && t >= r.reservaFim) return 'encerrada';
  if (r.reservaInicio && t < r.reservaInicio) return 'antes';
  return 'aberta';
}

// Pré-reserva só pode ser feita dentro do período e com local e data de retirada futura
export const reservaAberta = p => statusReserva(p) === 'aberta';

// '16/11 às 8h' (aceita '2026-11-16T08:00')
export function rotuloDataHora(v) {
  const [d, h] = v.split('T');
  const [, m, dia] = d.split('-');
  return `${dia}/${m} às ${hora(h)}`;
}

// Texto curto para vitrine e página do produto quando a reserva não está aberta
export function avisoReserva(p) {
  const st = statusReserva(p);
  if (st === 'antes') return `pré-reservas abrem em ${rotuloDataHora(normalizarRetirada(p.retirada).reservaInicio)}`;
  if (st === 'encerrada') return 'pré-reservas encerradas';
  const fim = normalizarRetirada(p.retirada).reservaFim;
  return fim ? `pré-reservas até ${rotuloDataHora(fim)}` : '';
}

// 'quarta, 18/11 · 17h20 às 18h30'
export function rotuloJanela(j) {
  const [a, m, d] = j.data.split('-');
  const dia = DIAS[new Date(+a, +m - 1, +d).getDay()];
  return `${dia}, ${d}/${m} · ${hora(j.inicio)} às ${hora(j.fim)}`;
}

export const chaveRetirada = r => {
  const n = normalizarRetirada(r);
  return JSON.stringify([n.locais, n.janelas]);
};

// Junta os itens de pré-reserva do carrinho que têm exatamente as mesmas opções de retirada
export function agruparRetiradas(itens) {
  const grupos = new Map();
  for (const i of itens.filter(ehPreReserva)) {
    const chave = chaveRetirada(i.retirada);
    if (!grupos.has(chave)) grupos.set(chave, { chave, retirada: normalizarRetirada(i.retirada), itens: [] });
    grupos.get(chave).itens.push(i);
  }
  return [...grupos.values()];
}

export const resumoJanelas = r => janelasAbertas(r).map(rotuloJanela).join(' / ');

// Resumo de uma linha para vitrine e página do produto
export const resumoRetirada = r => `${normalizarRetirada(r).locais.join(' ou ')} · ${resumoJanelas(r)}`;
