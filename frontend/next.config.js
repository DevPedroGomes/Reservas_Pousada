const { PHASE_PRODUCTION_BUILD } = require('next/constants');

// Dados da empresa nas páginas públicas: vazios viram "[a definir]" em
// /privacidade e /termos (lib/empresa.ts). O build não falha, porque uma imagem
// de teste não precisa deles, mas avisa alto: ir ao ar assim é irregular.
const DADOS_DA_EMPRESA = [
  'NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL',
  'NEXT_PUBLIC_EMPRESA_CNPJ',
  'NEXT_PUBLIC_EMPRESA_ENDERECO',
  'NEXT_PUBLIC_EMPRESA_FORO',
  'NEXT_PUBLIC_CONTATO_EMAIL',
  'NEXT_PUBLIC_ENCARREGADO_NOME',
];

function avisarDadosDaEmpresa() {
  const vazias = DADOS_DA_EMPRESA.filter((nome) => !process.env[nome]?.trim());
  if (vazias.length === 0) return;
  const barra = '!'.repeat(72);
  console.warn(`\n${barra}`);
  console.warn('ATENÇÃO: /privacidade e /termos vão publicar "[a definir]" neste build.');
  console.warn('Preencha nas Variables do repositório e rode o build de novo:');
  for (const nome of vazias) console.warn(`  - ${nome}`);
  console.warn(`${barra}\n`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
};

module.exports = (fase) => {
  if (fase === PHASE_PRODUCTION_BUILD) avisarDadosDaEmpresa();
  return nextConfig;
};
