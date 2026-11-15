# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lojinha Capibots is a static e-commerce site for a Brazilian school robotics team (TBR 2026 / ODS 4). It sells physical merchandise (keychains, pins, bracelets, pencils) and runs a fundraising campaign ("vaquinha"). There is no build system, no package manager, and no server-side code — everything is vanilla HTML/CSS/JS with Firebase as the sole backend.

## Running the Project

Open any `.html` file directly in a browser, or serve with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

The Firebase ESM imports (`https://www.gstatic.com/firebasejs/11.0.1/...`) require serving over HTTP — opening `file://` will cause CORS errors.

## File Layout

| File | Purpose |
|---|---|
| `index.html` | Main storefront — product grid, cart drawer, vaquinha banner |
| `produto.html` | Product detail page with image gallery |
| `checkout.html` | Checkout flow: customer form → PIX display → order confirmation |
| `admin.html` | Admin panel: orders, inventory, stock entries, report, config |
| `retirada.js` | Módulo compartilhado do modelo de pré-reserva com retirada (datas, agrupamento, validação) |
| `firebase-config.js` | Firebase project config and (legacy) PIX key fallback |
| `imagens/` | Product photos referenced in Firestore `imagens[]` field |

## Firebase / Firestore Data Model

All runtime data lives in Firestore (project `capibots-loja`). The SDK is loaded via CDN ESM imports.

**Collections:**

- **`estoque`** — one document per product, keyed by product ID (e.g. `chaveiro`, `pin-crocs`, `pulseira`, `lapis`). Fields: `nome`, `desc`, `preco`, `quantidade`, `emoji`, `imagens[]`. The special document `vaquinha` also lives here with an extra field `exibicao` (`'destaque'` | `'vitrine'` | `'ambos'`).

- **`pedidos`** — one document per order. Status machine: `novo` → `pagamento_confirmado` → `entregue` | `cancelado`. Fields: `id`, `nome`, `turma`, `whatsapp`, `email`, `obs`, `itens[]`, `total`, `status`, `pix_chave`, `criadoEm`.

- **`entradas`** — inventory log entries (product ID, quantity added, observation, timestamp).

- **`usuarios`** — admin accounts. Keyed by username. Fields: `senha` (plaintext), `nome`, `ativo`. Authentication is done client-side by reading this document.

- **`config/loja`** — single document holding `pix_chave` (PIX key string) and `pix_tipo` (`email` | `telefone` | `cpf` | `cnpj` | `aleatoria`).

## Pré-reserva com retirada

Qualquer produto pode ser vendido como pré-reserva (geladinho, bolo, encomendas), configurado no admin em Produtos → Modelo de venda. Em `estoque/{id}`: `modelo: 'pre-reserva'` e `retirada: { locais[], janelas[{data:'AAAA-MM-DD', inicio:'HH:MM', fim:'HH:MM'}], aviso? }`. Cada produto tem seus próprios locais e datas.

- `index.html` lista esses produtos na seção "Pré-reservas"; datas passadas somem e, sem data futura, o produto aparece como encerrado.
- `checkout.html` só mostra o cartão "Retirada" quando há pré-reserva no carrinho. Produtos com opções idênticas dividem uma única escolha de local e horário. No envio, as escolhas são revalidadas contra o `estoque` atual.
- O pedido guarda `retiradas: [{ produtos[], local, data, inicio, fim, rotulo }]`; o admin mostra isso na lista de pedidos e no modal de entrega.
- Estoque funciona como nas demais vendas (o "estoque inicial" é o limite de reservas).

## Key Architecture Decisions

**Cart state**: In-memory JS object on `index.html`. On checkout, the entire cart is serialized to `sessionStorage` under `capibots_cart` and read by `checkout.html`. It is cleared after a successful order.

**Inventory is never decremented on order creation.** Available stock is computed at checkout time by querying all `pedidos` with status `novo` or `pagamento_confirmado`, summing committed quantities, and subtracting from the physical `estoque` value. The admin panel replicates this logic via `calcComprometido()`.

**Product visual metadata** (card background color variant, tag text, tag color) is defined client-side in the `VISUAL` map in `index.html`, not stored in Firestore. The `imagens[]` array in Firestore points to paths inside `imagens/`.

**PIX QR code** is generated entirely client-side in `checkout.html` using the BACEN BRCode/EMV standard. The payload is built by `pixPayload()` and the checksum by `crc16()` (CRC16-CCITT, polynomial 0x1021). The QRCode.js library renders it.

**Admin auth** is not Firebase Authentication — it is a manual plaintext password check against the `usuarios` Firestore collection. Session is stored in `sessionStorage` as `admin_usuario`.

**Vaquinha (fundraiser)**: Treated as a product with ID `vaquinha`. Progress is derived from `VAQUINHA_META - vaquinhaRT.quantidade`. The `exibicao` field controls whether the top banner, the product grid card, or both are shown.

## Firestore Security Rules Note

The store currently relies on Firestore rules allowing customer writes to `pedidos` and reads from `estoque` and `config`. Admin writes (stock updates, order status changes) happen from the browser using the same Firebase config — there is no server-side admin SDK.
