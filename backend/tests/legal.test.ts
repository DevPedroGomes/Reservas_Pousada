/**
 * Coerência entre o que o sistema grava e o que as páginas públicas dizem. Lê o
 * código do frontend porque é o texto que vai ao ar.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSAO_POLITICA } from '../utils/politica.js';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend');
const ler = (caminho: string) => readFileSync(join(FRONTEND, caminho), 'utf8');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

describe('páginas legais', () => {
  it('a versão gravada no aceite é a vigência publicada', () => {
    const vigencia = ler('lib/empresa.ts').match(/VIGENCIA_DOCUMENTOS = "(\d+) de (\S+) de (\d{4})"/);
    assert.ok(vigencia, 'VIGENCIA_DOCUMENTOS não encontrada');
    const [, dia, mes, ano] = vigencia;
    const iso = `${ano}-${String(MESES.indexOf(mes) + 1).padStart(2, '0')}-${dia.padStart(2, '0')}`;
    assert.equal(iso, VERSAO_POLITICA);
  });

  it('pré-check-in e motor de reservas levam à política, sem passar o link com token como referrer', () => {
    for (const arquivo of ['app/checkin/[token]/page.tsx', 'components/publico/MotorDeReservas.tsx']) {
      assert.match(ler(arquivo), /href="\/privacidade" target="_blank" rel="noopener noreferrer"/, arquivo);
    }
  });

  it('não promete o que o código não garante', () => {
    const privacidade = ler('app/privacidade/page.tsx');
    assert.doesNotMatch(privacidade, /sem uso para treinar/, 'lib/llm.ts aceita qualquer API compatível');
    assert.doesNotMatch(ler('app/checkin/[token]/page.tsx'), /só a pousada tem acesso/);
    assert.doesNotMatch(ler('app/termos/page.tsx'), /cópias de segurança/);
  });

  it('a política lista os campos da ficha e os terceiros que recebem dados', () => {
    const privacidade = ler('app/privacidade/page.tsx').toLowerCase();
    for (const termo of ['nascimento', 'gênero', 'profissão', 'residência', 'acompanhantes', 'crianças', 'Google Analytics', 'Meta Ads', 'API de Conversões', 'Anthropic', 'transferência internacional', 'controladora', 'operador']) {
      assert.ok(privacidade.includes(termo.toLowerCase()), `falta na política: ${termo}`);
    }
  });

  it('os termos trazem o arrependimento e o plano anual', () => {
    const termos = ler('app/termos/page.tsx');
    assert.match(termos, /art\. 49/);
    assert.match(termos, /plano anual/i);
  });
});
