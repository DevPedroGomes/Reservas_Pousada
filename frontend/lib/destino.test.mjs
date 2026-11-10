// Redirecionamento aberto no login (?proximo=). O frontend não tem suíte:
// rode com `node --test lib/destino.test.mjs` (Node 23.6+ carrega o .ts).
import { test } from "node:test"
import assert from "node:assert/strict"
import { caminhoInterno } from "./destino.ts"

const ORIGEM = "https://app.diaria.test"

// Como a tela lê: valor cru da query string, decodificado pelo URLSearchParams.
const pelaQuery = (bruto) => caminhoInterno(new URLSearchParams(`proximo=${bruto}`).get("proximo"), ORIGEM)

const ATAQUES = ["/%5Cevil.example", "/%09/evil.example", "//evil.example", "https://evil.example"]

test("ataques pela query vão para o destino padrão", () => {
  for (const bruto of ATAQUES) assert.equal(pelaQuery(bruto), null, bruto)
})

test("os mesmos valores passados direto também são recusados", () => {
  for (const valor of ATAQUES) assert.equal(caminhoInterno(valor, ORIGEM), null, valor)
  assert.equal(caminhoInterno("/\\evil.example", ORIGEM), null)
  assert.equal(caminhoInterno("/\t/evil.example", ORIGEM), null)
  assert.equal(caminhoInterno("javascript:alert(1)", ORIGEM), null)
})

test("caminho interno passa, com query e hash", () => {
  assert.equal(pelaQuery("/reservas?x=1"), "/reservas?x=1")
  assert.equal(caminhoInterno("/reservas?x=1", ORIGEM), "/reservas?x=1")
  assert.equal(caminhoInterno("/painel#hoje", ORIGEM), "/painel#hoje")
  assert.equal(caminhoInterno(null, ORIGEM), null)
})
